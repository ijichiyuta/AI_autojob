import { serverDb } from '@/lib/supabase';
import { relTime, NG_LABELS } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function StatusPage() {
  const db = serverDb();
  const [{ data: runs }, { data: alerts }, { data: ngRows }, { data: queries }, { data: loginRow }, { count: membersOnly }] = await Promise.all([
    db.from('crawl_runs').select('*').order('started_at', { ascending: false }).limit(12),
    db.from('alerts').select('*').is('resolved_at', null).order('created_at', { ascending: false }).limit(10),
    db.from('job_scores').select('ng_flags').neq('ng_flags', '{}'),
    db.from('search_queries').select('*').order('label'),
    db.from('settings').select('value').eq('key', 'login_state').maybeSingle(),
    db.from('jobs').select('*', { count: 'exact', head: true }).eq('members_only', true),
  ]);

  const login = loginRow?.value as
    { logged_in?: boolean; user_name?: string | null; checked_at?: string } | undefined;

  const counts: Record<string, number> = {};
  for (const s of ['scored', 'ng_filtered', 'discovered', 'promoted']) {
    const { count } = await db.from('jobs').select('*', { count: 'exact', head: true }).eq('status', s);
    counts[s] = count ?? 0;
  }
  const { count: today } = await db.from('jobs')
    .select('*', { count: 'exact', head: true })
    .gte('discovered_at', new Date(Date.now() - 86_400_000).toISOString());

  const ngCounts = new Map<string, number>();
  for (const r of ngRows ?? []) for (const f of (r.ng_flags as string[]) ?? []) ngCounts.set(f, (ngCounts.get(f) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">稼働状況</h1>

      <section className={`rounded-xl border p-4 ${
        login?.logged_in
          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40'
          : 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className={`text-sm font-semibold ${
              login?.logged_in ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-900 dark:text-amber-300'}`}>
              クラウドワークス: {login?.logged_in ? 'ログイン済み' : '未ログイン'}
              {login?.user_name ? `（${login.user_name}）` : ''}
            </h2>
            <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
              {login?.logged_in
                ? '会員限定公開の案件も詳細を取得できます'
                : '会員限定公開の案件は詳細が読めません。worker で npm run login を実行してください'}
              {login?.checked_at && `　最終確認 ${relTime(login.checked_at)}`}
            </p>
          </div>
          {(membersOnly ?? 0) > 0 && (
            <span className="rounded-md bg-white/70 px-2.5 py-1 text-xs text-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-300">
              会員限定で未取得 <strong>{membersOnly}</strong>件
              {login?.logged_in && <span className="ml-1 text-neutral-500">→ npm run refetch</span>}
            </span>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="候補" value={counts.scored} tone="emerald" />
        <Stat label="NG除外" value={counts.ng_filtered} />
        <Stat label="24時間の収集" value={today ?? 0} />
        <Stat label="応募へ進行" value={counts.promoted} />
      </div>

      {(alerts?.length ?? 0) > 0 && (
        <section className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
          <h2 className="text-sm font-semibold text-red-800 dark:text-red-300">未解決アラート</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {alerts!.map((a) => (
              <li key={a.id} className="text-red-800 dark:text-red-300">
                <span className="font-mono text-xs">[{a.level}]</span> {a.kind} — {a.message}
                <span className="ml-2 text-xs text-red-600/70 dark:text-red-400/70">{relTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Section title="NG除外の内訳">
        {ngCounts.size === 0 ? <Empty /> : (
          <ul className="space-y-1.5 text-sm">
            {[...ngCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between">
                <span className="text-neutral-700 dark:text-neutral-300">{NG_LABELS[k] ?? k}</span>
                <span className="tabular-nums text-neutral-500">{v}件</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="収集の履歴">
        {(runs?.length ?? 0) === 0 ? <Empty /> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500 dark:text-neutral-400">
              <tr><th className="pb-2 font-normal">条件</th><th className="pb-2 font-normal">状態</th>
                <th className="pb-2 text-right font-normal">発見</th><th className="pb-2 text-right font-normal">新規</th>
                <th className="pb-2 text-right font-normal">開始</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {runs!.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5">{r.query_label ?? r.platform}</td>
                  <td className="py-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${
                      r.status === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : r.status === 'running' ? 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                      : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'}`}>
                      {r.status}
                    </span>
                    {r.error_message && <span className="ml-2 text-xs text-red-600">{r.error_message.slice(0, 60)}</span>}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{r.jobs_found}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.jobs_new}</td>
                  <td className="py-1.5 text-right text-xs text-neutral-500">{relTime(r.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="検索条件">
        <ul className="space-y-1.5 text-sm">
          {(queries ?? []).map((q) => (
            <li key={q.id} className="flex items-center justify-between">
              <span className={q.enabled ? '' : 'text-neutral-400 line-through'}>{q.label}</span>
              <span className="font-mono text-xs text-neutral-500">
                {(q.params as { group?: string }).group} / {q.max_pages}ページ
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
        {value}
      </p>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function Empty() {
  return <p className="text-sm text-neutral-400">（まだありません）</p>;
}
