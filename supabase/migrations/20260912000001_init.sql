-- ============================================================
-- 案件応募・納品エージェント / 初期スキーマ
-- ============================================================

create extension if not exists "pgcrypto";

-- 更新時刻の自動更新
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================
-- jobs : 収集した案件
-- ============================================================
create table public.jobs (
  id                 uuid primary key default gen_random_uuid(),
  platform           text not null check (platform in ('crowdworks','lancers')),
  external_id        text not null,
  url                text not null,
  title              text not null,
  description        text,
  -- 自前の正規化カテゴリ。video は競業避止の絶対NG（bs-contract 第8条）
  category           text not null default 'other'
                       check (category in ('web','dev','writing','design','video','other')),
  raw_category       text,
  payment_type       text check (payment_type in ('fixed','hourly','competition','task')),
  budget_min         integer,
  budget_max         integer,
  deadline           date,
  applicant_count    integer,
  client_name        text,
  client_rating      numeric(3,2),
  client_order_count integer,
  client_verified    boolean,
  posted_at          timestamptz,
  discovered_at      timestamptz not null default now(),
  detail_fetched_at  timestamptz,
  -- discovered → scored → ng_filtered / promoted(applicationsへ)
  status             text not null default 'discovered'
                       check (status in ('discovered','scored','ng_filtered','promoted')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (platform, external_id)
);

create index jobs_status_idx        on public.jobs (status);
create index jobs_discovered_at_idx on public.jobs (discovered_at desc);
create index jobs_platform_idx      on public.jobs (platform);
create index jobs_category_idx      on public.jobs (category);

create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

-- ============================================================
-- job_scores : スコアリング結果
-- ============================================================
create table public.job_scores (
  job_id            uuid primary key references public.jobs(id) on delete cascade,
  total_score       integer,
  breakdown         jsonb   not null default '{}'::jsonb,
  -- 即時除外の理由
  ng_flags          text[]  not null default '{}',
  -- Phase 1 では除外せず警告に留めるもの（時給下限など）
  warn_flags        text[]  not null default '{}',
  estimated_hours   numeric(6,2),
  hourly_rate       integer,
  -- LLM判定（Claude Code 側でまとめて処理する）
  llm_status        text    not null default 'pending'
                      check (llm_status in ('pending','done','skipped','failed')),
  llm_specificity   integer check (llm_specificity between 0 and 100),
  llm_genre_match   integer check (llm_genre_match between 0 and 100),
  llm_ai_prohibited boolean,
  llm_hours         numeric(6,2),
  llm_notes         text,
  scored_at         timestamptz not null default now(),
  llm_scored_at     timestamptz
);

create index job_scores_total_idx      on public.job_scores (total_score desc nulls last);
create index job_scores_llm_status_idx on public.job_scores (llm_status);

-- ============================================================
-- applications : 応募（Phase 2 で使う）
-- ============================================================
create table public.applications (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null unique references public.jobs(id) on delete cascade,
  status          text not null default 'pending_apply'
                    check (status in ('pending_apply','rejected','applied','lost',
                                      'contracted','drafting','pending_delivery',
                                      'delivered','closed')),
  proposal_text   text,
  proposed_price  integer,
  proposed_days   integer,
  approved_at     timestamptz,
  applied_at      timestamptz,
  -- 却下理由は学習用。低単価／要件不明瞭／ジャンル不一致／クライアント不安／その他
  rejected_reason text,
  rejected_note   text,
  screenshot_path text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index applications_status_idx on public.applications (status);

create trigger applications_touch before update on public.applications
  for each row execute function public.touch_updated_at();

-- ============================================================
-- deliverables : 成果物（Phase 3 で使う）
-- ============================================================
create table public.deliverables (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null references public.applications(id) on delete cascade,
  status           text not null default 'drafting'
                     check (status in ('drafting','pending_delivery','delivered','closed')),
  storage_path     text,
  review_checklist jsonb not null default '{}'::jsonb,
  revision_count   integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger deliverables_touch before update on public.deliverables
  for each row execute function public.touch_updated_at();

-- ============================================================
-- search_queries : 検索条件（ダッシュボードから編集）
-- ============================================================
create table public.search_queries (
  id         uuid primary key default gen_random_uuid(),
  platform   text not null check (platform in ('crowdworks','lancers')),
  label      text not null,
  enabled    boolean not null default true,
  params     jsonb not null default '{}'::jsonb,
  max_pages  integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger search_queries_touch before update on public.search_queries
  for each row execute function public.touch_updated_at();

-- ============================================================
-- settings : スコア重み・上限値・NGワード
-- ============================================================
create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ============================================================
-- crawl_runs : バッチ実行ログ
-- ============================================================
create table public.crawl_runs (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null,
  query_label   text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running'
                  check (status in ('running','success','failed','aborted')),
  pages_crawled integer not null default 0,
  jobs_found    integer not null default 0,
  jobs_new      integer not null default 0,
  error_message text,
  meta          jsonb not null default '{}'::jsonb
);

create index crawl_runs_started_idx on public.crawl_runs (started_at desc);

-- ============================================================
-- alerts : セレクタ破損・CAPTCHA・ログイン失敗
-- ============================================================
create table public.alerts (
  id          uuid primary key default gen_random_uuid(),
  level       text not null check (level in ('info','warn','error')),
  kind        text not null,
  message     text not null,
  meta        jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index alerts_unresolved_idx on public.alerts (created_at desc) where resolved_at is null;

-- ============================================================
-- ビュー : 案件一覧（jobs + scores）
-- ============================================================
create view public.job_board as
select
  j.id, j.platform, j.external_id, j.url, j.title, j.description,
  j.category, j.raw_category, j.payment_type,
  j.budget_min, j.budget_max, j.deadline, j.applicant_count,
  j.client_name, j.client_rating, j.client_order_count, j.client_verified,
  j.posted_at, j.discovered_at, j.status,
  s.total_score, s.breakdown, s.ng_flags, s.warn_flags,
  s.estimated_hours, s.hourly_rate,
  s.llm_status, s.llm_specificity, s.llm_genre_match, s.llm_ai_prohibited, s.llm_notes,
  a.status as application_status
from public.jobs j
left join public.job_scores  s on s.job_id = j.id
left join public.applications a on a.job_id = j.id;

-- ============================================================
-- RLS : 単一ユーザー運用。ワーカーは service_role で bypass
-- ============================================================
alter table public.jobs           enable row level security;
alter table public.job_scores     enable row level security;
alter table public.applications   enable row level security;
alter table public.deliverables   enable row level security;
alter table public.search_queries enable row level security;
alter table public.settings       enable row level security;
alter table public.crawl_runs     enable row level security;
alter table public.alerts         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['jobs','job_scores','applications','deliverables',
                           'search_queries','settings','crawl_runs','alerts']
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t);
  end loop;
end $$;
