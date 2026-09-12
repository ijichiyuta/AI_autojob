-- 送信中の状態を足す。approved → applying → applied と進め、
-- applying への遷移を条件付きUPDATEで行うことで二重送信を防ぐ（非機能要件の冪等性）
alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check check (status in (
  'pending_apply','approved','applying','rejected','applied','lost',
  'contracted','drafting','pending_delivery','delivered','closed'
));

-- 送信ログ。何をいつ送ったかを後から追えるようにする
create table if not exists public.apply_runs (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) on delete set null,
  job_id         uuid references public.jobs(id) on delete set null,
  dry_run        boolean not null default true,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running' check (status in ('running','success','failed','aborted','skipped')),
  error_message  text,
  meta           jsonb not null default '{}'::jsonb
);
create index if not exists apply_runs_started_idx on public.apply_runs (started_at desc);

alter table public.apply_runs enable row level security;
create policy apply_runs_authenticated_all on public.apply_runs
  for all to authenticated using (true) with check (true);
