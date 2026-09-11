-- 会員限定公開の案件を記録する。
-- 未ログインでは詳細が読めないため、ログイン後に取り直す対象として印をつける。
alter table public.jobs
  add column if not exists members_only boolean not null default false;

create index if not exists jobs_members_only_idx
  on public.jobs (members_only) where members_only;

-- 案件一覧ビューにも通す
drop view if exists public.job_board;
create view public.job_board as
select
  j.id, j.platform, j.external_id, j.url, j.title, j.description,
  j.category, j.raw_category, j.payment_type,
  j.budget_min, j.budget_max, j.deadline, j.applicant_count,
  j.client_name, j.client_rating, j.client_order_count, j.client_verified,
  j.posted_at, j.discovered_at, j.detail_fetched_at, j.status, j.members_only,
  s.total_score, s.breakdown, s.ng_flags, s.warn_flags,
  s.estimated_hours, s.hourly_rate,
  s.llm_status, s.llm_specificity, s.llm_genre_match, s.llm_ai_prohibited, s.llm_notes,
  a.status as application_status
from public.jobs j
left join public.job_scores  s on s.job_id = j.id
left join public.applications a on a.job_id = j.id;
