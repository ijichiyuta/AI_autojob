import Link from 'next/link';
import { serverDb } from '@/lib/supabase';
import {
  yen, daysLeft, scoreTone, relTime,
  NG_LABELS, CATEGORY_LABELS, BREAKDOWN_LABELS,
} from '@/lib/format';

export const dynamic = 'force-dynamic';

type Search = { status?: string; category?: string; min?: string; sort?: string };

interface Breakdown {
  [k: string]: { points?: number | null; max?: number; value?: unknown; proxy?: boolean } | unknown;
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const status = sp.status ?? 'scored';
  const category = sp.category ?? 'all';
  const minScore = Number(sp.min ?? 0);
  const sort = sp.sort ?? 'score';

  const db = serverDb();

  let q = db.from('job_board').select('*');
  if (status !== 'all') q = q.eq('status', status);
  if (category !== 'all') q = q.eq('category', category);
  if (minScore > 0) q = q.gte('total_score', minScore);
  q = sort === 'new'
    ? q.order('discovered_at', { ascending: false })
    : q.order('total_score', { ascending: false, nullsFirst: false });

  const { data: jobs, error } = await q.limit(100);

  const counts: Record<string, number> = {};
  for (const s of ['scored', 'ng_filtered', 'discovered']) {
    const { count } = await db.from('jobs').select('*', { count: 'exact', head: true }).eq('status', s);
    counts[s] = count ?? 0;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">案件一覧</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          候補 <strong className="text-neutral-900 dark:text-neutral-100">{counts.scored}</strong>件
          ・NG除外 {counts.ng_filtered}件
        </p>
      </div>

      <Filters current={{ status, category, min: String(minScore), sort }} />

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          読み込みに失敗しました: {error.message}
        </p>
      )}

      {!error && (jobs?.length ?? 0) === 0 && (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
          該当する案件がありません。<code className="mx-1 rounded bg-neutral-100 px-1.5 py-0.5 text-xs dark:bg-neutral-800">npm run crawl</code>
          で収集してください。
        </p>
      )}

      <ul className="space-y-2.5">
        {(jobs ?? []).map((j) => {
          const bd = (j.breakdown ?? {}) as Breakdown;
          const meta = bd._meta as { provisional?: boolean } | undefined;
          const left = daysLeft(j.deadline);
          return (
            <li
              key={j.id}
              className="rounded-xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex items-start gap-3.5">
                <div className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg text-sm font-bold ${scoreTone(j.total_score)}`}>
                  {j.total_score ?? '—'}
                  {meta?.provisional && <span className="text-[9px] font-normal leading-none opacity-80">暫定</span>}
                </div>

                <div className="min-w-0 flex-1">
                  <Link href={`/jobs/${j.id}`} className="block font-medium leading-snug hover:underline">
                    {j.title}
                  </Link>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
                      {CATEGORY_LABELS[j.category] ?? j.category}
                    </span>
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">
                      {yen(j.budget_min, j.budget_max)}
                    </span>
                    <span>応募 {j.applicant_count ?? '—'}人</span>
                    <span>
                      評価 {j.client_rating ?? '—'} / 実績 {j.client_order_count ?? '—'}件
                      {j.client_verified ? ' ・本人確認済' : ''}
                    </span>
                    {left != null && (
                      <span className={left <= 3 ? 'font-medium text-orange-600 dark:text-orange-400' : ''}>
                        あと{left}日
                      </span>
                    )}
                    {j.members_only && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        会員限定（詳細未取得）
                      </span>
                    )}
                    <span className="text-neutral-400">{relTime(j.discovered_at)}</span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {['hourly_rate', 'client_quality', 'low_competition', 'specificity', 'genre_match', 'deadline_margin'].map((k) => {
                      const v = bd[k] as { points?: number | null; max?: number; proxy?: boolean } | undefined;
                      if (!v) return null;
                      const pct = v.points != null && v.max ? (v.points / v.max) * 100 : null;
                      return (
                        <span
                          key={k}
                          title={`${BREAKDOWN_LABELS[k]}: ${v.points ?? 'LLM判定待ち'} / ${v.max}${v.proxy ? '（暫定）' : ''}`}
                          className="inline-flex items-center gap-1 rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
                        >
                          {BREAKDOWN_LABELS[k]}
                          <span className={pct == null ? 'text-neutral-400' : pct >= 70 ? 'font-semibold text-emerald-600 dark:text-emerald-400' : pct >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-400'}>
                            {v.points ?? '—'}
                          </span>
                          {v.proxy && <span className="text-neutral-400">*</span>}
                        </span>
                      );
                    })}
                  </div>

                  {(j.ng_flags?.length > 0 || j.warn_flags?.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(j.ng_flags ?? []).map((f: string) => (
                        <span key={f} className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                          {NG_LABELS[f] ?? f}
                        </span>
                      ))}
                      {(j.warn_flags ?? []).map((f: string) => (
                        <span key={f} className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          ⚠ {NG_LABELS[f] ?? f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Filters({ current }: { current: Record<string, string> }) {
  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...current, ...patch });
    return `/?${p.toString()}`;
  };
  const Group = ({ label, param, options }: { label: string; param: string; options: [string, string][] }) => (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-neutral-500 dark:text-neutral-400">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map(([v, l]) => (
          <Link
            key={v}
            href={link({ [param]: v })}
            className={`rounded-md px-2 py-1 text-xs transition-colors ${
              current[param] === v
                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-400 dark:ring-neutral-700 dark:hover:bg-neutral-800'
            }`}
          >
            {l}
          </Link>
        ))}
      </div>
    </div>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
      <Group label="状態" param="status" options={[['scored', '候補'], ['ng_filtered', 'NG除外'], ['all', 'すべて']]} />
      <Group label="種別" param="category" options={[['all', '全部'], ['dev', '開発'], ['web', 'Web'], ['writing', 'ライティング']]} />
      <Group label="下限" param="min" options={[['0', 'なし'], ['50', '50+'], ['65', '65+'], ['75', '75+']]} />
      <Group label="並び" param="sort" options={[['score', 'スコア順'], ['new', '新着順']]} />
    </div>
  );
}
