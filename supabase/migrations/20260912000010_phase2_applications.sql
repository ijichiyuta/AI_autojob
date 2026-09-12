-- ============================================================
-- Phase 2: 応募文生成 → 人間の承認 → 応募送信
--
-- 要件定義の設計原則1「応募の確定は必ず人間の承認を経る。自動送信はしない」を
-- スキーマの側でも担保する。
--   pending_apply … 応募文を生成した。人間のレビュー待ち
--   approved      … 人間が承認した。送信待ち（送信はワーカーが間隔を空けて行う）
--   applied       … 送信済み
-- 要件定義のステートマシンでは承認と送信が1段だったが、送信はレート制限を挟んで
-- 非同期に行うため approved を分けた。承認していないものは送信対象に入らない。
-- ============================================================

alter table public.applications
  drop constraint if exists applications_status_check;

alter table public.applications
  add constraint applications_status_check check (status in (
    'pending_apply',   -- 応募文生成済み。人間のレビュー待ち
    'approved',        -- 人間が承認済み。送信待ち
    'rejected',        -- 人間が却下（終了）
    'applied',         -- 送信済み
    'lost',            -- 不採用（終了）
    'contracted',      -- 契約成立
    'drafting',        -- 成果物の制作中
    'pending_delivery',-- 納品レビュー待ち
    'delivered',       -- 納品済み
    'closed'           -- 終了
  ));

alter table public.applications
  add column if not exists proposal_generated_at timestamptz,
  add column if not exists edited_by_human   boolean not null default false,
  -- 送信の試行記録。二重送信の防止と、失敗時の調査に使う
  add column if not exists submit_attempts   integer not null default 0,
  add column if not exists submit_error      text,
  add column if not exists submitted_at      timestamptz,
  -- 送信直前のスクリーンショット（非機能要件）
  add column if not exists screenshot_before text,
  add column if not exists screenshot_after  text,
  -- 生成時の根拠。人間がレビューするときに読む
  add column if not exists proposal_notes    text;

create index if not exists applications_applied_at_idx on public.applications (applied_at desc);
create index if not exists applications_approved_idx
  on public.applications (approved_at) where status = 'approved';

-- ------------------------------------------------------------
-- 当日の応募数（JST）。1日の上限判定に使う
-- ------------------------------------------------------------
create or replace function public.applied_count_today()
returns integer language sql stable as $$
  select count(*)::int
  from public.applications
  where applied_at >= (date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo');
$$;

-- ------------------------------------------------------------
-- 承認キュー用のビュー
-- ------------------------------------------------------------
create or replace view public.approval_queue as
select
  a.id            as application_id,
  a.status        as application_status,
  a.proposal_text, a.proposed_price, a.proposed_days, a.proposal_notes,
  a.edited_by_human, a.approved_at, a.applied_at, a.submit_error, a.submit_attempts,
  j.id            as job_id,
  j.platform, j.external_id, j.url, j.title, j.description,
  j.category, j.raw_category, j.budget_min, j.budget_max, j.deadline,
  j.applicant_count, j.client_name, j.client_rating, j.client_order_count, j.client_verified,
  j.posted_at, j.discovered_at,
  s.total_score, s.breakdown, s.warn_flags, s.hourly_rate, s.estimated_hours, s.llm_notes
from public.applications a
join public.jobs j        on j.id = a.job_id
left join public.job_scores s on s.job_id = a.job_id;

-- ------------------------------------------------------------
-- 却下理由の選択肢（要件定義 5.5）
-- ------------------------------------------------------------
insert into public.settings (key, value) values
('reject_reasons', '[
  {"id":"low_rate",      "label":"低単価"},
  {"id":"vague",         "label":"要件不明瞭"},
  {"id":"genre_mismatch","label":"ジャンル不一致"},
  {"id":"client_risk",   "label":"クライアント不安"},
  {"id":"capacity",      "label":"工数が合わない"},
  {"id":"other",         "label":"その他"}
]'::jsonb)
on conflict (key) do update set value = excluded.value;

-- 応募まわりのガードレール（要件定義 3.3）
insert into public.settings (key, value) values
('apply_guardrails', '{
  "daily_limit": 10,
  "interval_ms": [300000, 1800000],
  "quiet_hours": {"from": 1, "to": 7},
  "_note": "送信間隔は5〜30分のランダム。深夜1〜7時は送信しない。上限は1日10件"
}'::jsonb)
on conflict (key) do update set value = excluded.value;
