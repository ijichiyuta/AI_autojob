/**
 * 応募対象を広げた分析
 * 条件: 時給1500円以上 × 工数30時間以下 × (dev/web/other/design)
 */
import { db, getSetting } from '../db/client.js';
import type { Thresholds } from '../scoring/score.js';

const th = await getSetting<Thresholds>('thresholds');
const { data } = await db.from('job_board').select('*').eq('status', 'scored').eq('llm_status', 'done');

const minRate = th.min_hourly_rate ?? 3000;
const jobs = data ?? [];

// 拡張条件で絞る
const gates = [
  [`時給 ${minRate.toLocaleString()}円以上`, (j: typeof data[number]) => (j.hourly_rate ?? 0) >= minRate],
  [`想定工数が週30時間に収まる（拡張）`, (j: typeof data[number]) => (j.estimated_hours ?? 999) <= 30],
  ['カテゴリ dev/web/other/design（拡張）', (j: typeof data[number]) => ['dev','web','other','design'].includes(j.category)],
];

console.log(`=== 拡張条件での応募対象 ===\n`);
let survivors = jobs;
for (const [label, gate] of gates) {
  survivors = survivors.filter(gate);
  console.log(`${label}: ${survivors.length}件`);
}

console.log(`\n対象 ${survivors.length}件 の上位15件:\n`);
for (const j of survivors.sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0)).slice(0, 15)) {
  const w = (j.warn_flags?.length ?? 0) ? `  ⚠${(j.warn_flags as string[]).slice(0, 2).join(',')}` : '';
  console.log(`  [${j.total_score}点] 時給${(j.hourly_rate ?? 0).toLocaleString()} / ${j.estimated_hours}h / 応募${j.applicant_count}  ${j.category}  ${j.title.slice(0, 40)}${w}`);
}

// カテゴリ別
console.log(`\n=== カテゴリ別 ===`);
for (const cat of ['dev','web','design','other']) {
  const n = survivors.filter(j => j.category === cat).length;
  if (n > 0) console.log(`  ${cat}: ${n}件`);
}
