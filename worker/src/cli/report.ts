/** 現在のDBの状態を見る。 npm run report */
import { db } from '../db/client.js';

const { count: total } = await db.from('jobs').select('*', { count: 'exact', head: true });
console.log(`=== jobs: ${total}件 ===\n`);

for (const s of ['discovered', 'scored', 'ng_filtered', 'promoted']) {
  const { count } = await db.from('jobs').select('*', { count: 'exact', head: true }).eq('status', s);
  if (count) console.log(`  ${s.padEnd(12)} ${count}件`);
}

console.log('\n=== スコア上位10件 ===');
const { data: top } = await db.from('job_board')
  .select('title,total_score,budget_min,budget_max,applicant_count,client_rating,client_order_count,client_verified,category,llm_status,warn_flags,breakdown,url')
  .eq('status', 'scored').order('total_score', { ascending: false }).limit(10);

for (const j of top ?? []) {
  const b = j.budget_min == null && j.budget_max == null
    ? '予算未提示'
    : j.budget_min === j.budget_max
      ? `${(j.budget_min ?? 0).toLocaleString()}円`
      : `${(j.budget_min ?? 0).toLocaleString()}〜${(j.budget_max ?? 0).toLocaleString()}円`;
  console.log(`\n[${j.total_score}点] ${j.title.slice(0, 46)}`);
  console.log(`  ${j.category} / ${b} / 応募${j.applicant_count}人`);
  console.log(`  クライアント: 評価${j.client_rating ?? '-'} 実績${j.client_order_count ?? '-'}件 ${j.client_verified ? '本人確認済' : '未確認'}`);
  const bd = j.breakdown as Record<string, { points?: number | null; max?: number; value?: unknown; proxy?: boolean }>;
  const parts = ['hourly_rate','client_quality','low_competition','specificity','genre_match','deadline_margin']
    .map((k) => { const v = bd?.[k]; return v ? `${k}:${v.points ?? '—'}/${v.max}${v.proxy ? '*' : ''}` : ''; })
    .filter(Boolean).join('  ');
  console.log(`  内訳: ${parts}`);
  if (j.warn_flags?.length) console.log(`  ⚠ ${j.warn_flags.join(', ')}`);
  console.log(`  ${j.url}`);
}

console.log('\n=== NG除外の内訳 ===');
const { data: ng } = await db.from('job_scores').select('ng_flags').not('ng_flags', 'eq', '{}');
const counts = new Map<string, number>();
for (const r of ng ?? []) for (const f of (r.ng_flags as string[]) ?? []) counts.set(f, (counts.get(f) ?? 0) + 1);
[...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(24)} ${v}件`));
if (!counts.size) console.log('  （なし）');

const { data: alerts } = await db.from('alerts').select('*').is('resolved_at', null).order('created_at', { ascending: false }).limit(5);
if (alerts?.length) {
  console.log('\n=== 未解決アラート ===');
  for (const a of alerts) console.log(`  [${a.level}] ${a.kind}: ${a.message}`);
}
