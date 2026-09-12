/**
 * Phase 1 の判断材料を出す。
 *   npm run analyze
 *
 * 見たいのは「応募する価値のある案件が、実際に何件あるか」の一点。
 * スコアの高低より、実務条件（時給・競合・工数）で絞ったときに何件残るかで判断する。
 */
import { db, getSetting } from '../db/client.js';
import type { Thresholds } from '../scoring/score.js';

const NG_LABELS: Record<string, string> = {
  ai_prohibited: 'AI使用不可', ai_prohibited_llm: 'AI使用不可(LLM判定)',
  video_noncompete: '動画・切り抜き(契約違反)', onsite: '常駐・出社',
  capacity_excess: '稼働量オーバー', external_application: '外部サイトへの応募誘導',
  unpaid_test: '無償テスト課題', suspicious: '規約外・高リスク',
  budget_below_min: '予算が下限未満', side_job_prohibited: '副業不可',
  business_hours: '平日日中の稼働が前提', location_restricted: '地域限定',
  chat_funnel: '報酬未提示のチャット誘導', competition: 'コンペ形式',
};

const th = await getSetting<Thresholds>('thresholds');
const boot = await getSetting<{ enabled: boolean; min_hourly_rate: number }>('bootstrap_mode');
const minRate = boot.enabled ? boot.min_hourly_rate : th.min_hourly_rate;

const { data: rows } = await db.from('job_board')
  .select('id,title,url,status,category,total_score,hourly_rate,estimated_hours,applicant_count,budget_min,budget_max,ng_flags,warn_flags,llm_status,llm_notes,discovered_at');
const all = rows ?? [];
const scored = all.filter((j) => j.status === 'scored');
const judged = scored.filter((j) => j.llm_status === 'done');

console.log(`収集 ${all.length}件 / 候補 ${scored.length}件 / NG除外 ${all.length - scored.length}件`
  + ` （除外率 ${Math.round((1 - scored.length / Math.max(1, all.length)) * 100)}%）`);
console.log(`うちLLM判定済み ${judged.length}件 / 未判定 ${scored.length - judged.length}件\n`);

// ---- スコア分布 ----
console.log('=== スコア分布（候補のみ）===');
const buckets = [[80,100],[70,79],[60,69],[50,59],[40,49],[0,39]] as const;
for (const [lo, hi] of buckets) {
  const n = scored.filter((j) => (j.total_score ?? 0) >= lo && (j.total_score ?? 0) <= hi).length;
  const nj = judged.filter((j) => (j.total_score ?? 0) >= lo && (j.total_score ?? 0) <= hi).length;
  console.log(`  ${String(lo).padStart(3)}〜${String(hi).padStart(3)}点  ${'█'.repeat(Math.min(40, n))}${n === 0 ? '' : ' '}${n}件  (判定済 ${nj})`);
}

// ---- 実務条件での絞り込み ----
console.log('\n=== 実務条件で絞ると（LLM判定済みのみ）===');
const gates: Array<[string, (j: typeof judged[number]) => boolean]> = [
  [`時給 ${minRate.toLocaleString()}円以上`, (j) => (j.hourly_rate ?? 0) >= minRate],
  ['応募10人以下', (j) => (j.applicant_count ?? 999) <= 10],
  [`想定工数が週${th.weekly_capacity_hours}時間に収まる`, (j) => (j.estimated_hours ?? 999) <= th.weekly_capacity_hours],
  ['開発系（dev/web）', (j) => j.category === 'dev' || j.category === 'web'],
  ['警告フラグなし', (j) => (j.warn_flags?.length ?? 0) === 0],
];
let survivors = judged;
for (const [label, f] of gates) {
  const before = survivors.length;
  survivors = survivors.filter(f);
  console.log(`  ${label.padEnd(30)} ${String(before).padStart(3)} → ${String(survivors.length).padStart(3)}件`);
}

console.log(`\n=== すべて満たす案件: ${survivors.length}件 ===`);
for (const j of survivors.sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0)).slice(0, 10)) {
  console.log(`  [${j.total_score}点] 時給${(j.hourly_rate ?? 0).toLocaleString()}円 応募${j.applicant_count}人  ${j.title.slice(0, 44)}`);
  console.log(`         ${j.url}`);
}
if (!survivors.length) console.log('  （0件）');

// ---- NG理由 ----
console.log('\n=== NG除外の内訳 ===');
const ng = new Map<string, number>();
for (const j of all) for (const f of (j.ng_flags as string[] ?? [])) ng.set(f, (ng.get(f) ?? 0) + 1);
[...ng.entries()].sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`  ${(NG_LABELS[k] ?? k).padEnd(28)} ${String(v).padStart(4)}件`));

// ---- カテゴリ別 ----
console.log('\n=== カテゴリ別の候補数 ===');
const cat = new Map<string, number>();
for (const j of scored) cat.set(j.category, (cat.get(j.category) ?? 0) + 1);
[...cat.entries()].sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`  ${k.padEnd(10)} ${String(v).padStart(4)}件`));
