import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverDb } from '@/lib/supabase';
import { yen, daysLeft, scoreTone, NG_LABELS, CATEGORY_LABELS, BREAKDOWN_LABELS } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface NgHit { id: string; label: string; pattern: string; excerpt: string }

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = serverDb();
  const { data: j } = await db.from('job_board').select('*').eq('id', id).single();
  if (!j) notFound();

  const bd = (j.breakdown ?? {}) as Record<string, any>;
  const hits: NgHit[] = bd.ng_hits ?? [];
  const meta = bd._meta as { provisional?: boolean; coveredWeight?: number; budgetMidpoint?: number | null } | undefined;
  const left = daysLeft(j.deadline);

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-neutral-500 hover:underline dark:text-neutral-400">← 一覧に戻る</Link>

      <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start gap-4">
          <div className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl text-lg font-bold ${scoreTone(j.total_score)}`}>
            {j.total_score ?? '—'}
            {meta?.provisional && <span className="text-[10px] font-normal leading-none opacity-80">暫定</span>}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold leading-snug">{j.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400">
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs dark:bg-neutral-800">
                {CATEGORY_LABELS[j.category] ?? j.category}
              </span>
              {j.raw_category && <span className="text-xs">{j.raw_category}</span>}
              <a href={j.url} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline dark:text-sky-400">
                クラウドワークスで開く ↗
              </a>
            </div>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-neutral-200 pt-4 text-sm sm:grid-cols-4 dark:border-neutral-800">
          <Field label="報酬">{yen(j.budget_min, j.budget_max)}</Field>
          <Field label="想定時給">{j.hourly_rate ? `${j.hourly_rate.toLocaleString()}円` : <Pending>LLM判定待ち</Pending>}</Field>
          <Field label="応募数">{j.applicant_count ?? '—'}人</Field>
          <Field label="応募期限">
            {j.deadline ?? '—'}
            {left != null && <span className={`ml-1.5 text-xs ${left <= 3 ? 'text-orange-600 dark:text-orange-400' : 'text-neutral-500'}`}>（あと{left}日）</span>}
          </Field>
        </dl>

        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-neutral-200 pt-4 text-sm sm:grid-cols-4 dark:border-neutral-800">
          <Field label="クライアント">{j.client_name ?? '—'}</Field>
          <Field label="総合評価">{j.client_rating ?? '—'}</Field>
          <Field label="募集実績">{j.client_order_count ?? '—'}件</Field>
          <Field label="本人確認">{j.client_verified ? '済' : '未'}</Field>
        </dl>
      </div>

      {j.ng_flags?.length > 0 && (
        <section className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
          <h2 className="text-sm font-semibold text-red-800 dark:text-red-300">除外理由</h2>
          <ul className="mt-2 space-y-2">
            {hits.filter((h) => j.ng_flags.includes(h.id)).map((h, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium text-red-800 dark:text-red-300">{h.label}</span>
                <p className="mt-0.5 rounded bg-white/70 px-2 py-1 font-mono text-xs text-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-300">
                  …{h.excerpt}…
                </p>
              </li>
            ))}
            {j.ng_flags.filter((f: string) => !hits.some((h) => h.id === f)).map((f: string) => (
              <li key={f} className="text-sm font-medium text-red-800 dark:text-red-300">{NG_LABELS[f] ?? f}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold">スコア内訳</h2>
        {meta?.provisional && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            LLM判定が未実施のため暫定値です（有効な重み {meta.coveredWeight}/100）。* は機械的な代理指標。
          </p>
        )}
        <div className="mt-3 space-y-2">
          {['hourly_rate', 'client_quality', 'low_competition', 'specificity', 'genre_match', 'deadline_margin'].map((k) => {
            const v = bd[k] as { points?: number | null; max?: number; proxy?: boolean; value?: unknown } | undefined;
            if (!v) return null;
            const pct = v.points != null && v.max ? (v.points / v.max) * 100 : 0;
            return (
              <div key={k} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-neutral-600 dark:text-neutral-400">
                  {BREAKDOWN_LABELS[k]}{v.proxy && <span className="text-neutral-400">*</span>}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div
                    className={`h-full rounded-full ${pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-neutral-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                  {v.points ?? '—'} / {v.max}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold">案件文</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          {j.description ?? '（未取得）'}
        </p>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}
function Pending({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-normal text-neutral-400">{children}</span>;
}
