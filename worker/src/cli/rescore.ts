/**
 * 収集済みの案件を、現在のNGルール・スコア重みで再評価する（再クロールしない）。
 *   npm run rescore              全件
 *   npm run rescore -- --dry-run 変化だけ表示して書き込まない
 */
import { db, getSetting } from '../db/client.js';
import { detectNg, type NgRule } from '../scoring/ng.js';
import { scoreJob, budgetMidpoint, type Weights, type Thresholds, type GenreProfile } from '../scoring/score.js';
import { normalizeCategory } from '../adapters/crowdworks.js';
import { findDuplicates } from '../scoring/dedupe.js';
import { extraWarnFlags } from '../scoring/flags.js';
import type { Category } from '../adapters/types.js';

const dryRun = process.argv.includes('--dry-run');

const [rules, weights, thresholds, bootstrap, genre] = await Promise.all([
  getSetting<NgRule[]>('ng_rules'),
  getSetting<Weights>('scoring_weights'),
  getSetting<Thresholds>('thresholds'),
  getSetting<{ enabled: boolean; min_budget: number }>('bootstrap_mode'),
  getSetting<GenreProfile>('genre_profile'),
]);
const minBudget = bootstrap.enabled ? bootstrap.min_budget : thresholds.min_budget;

const { data: jobs, error } = await db.from('jobs').select('*').neq('status', 'promoted');
if (error) throw new Error(error.message);
console.log(`対象 ${jobs?.length ?? 0}件 ${dryRun ? '(dry-run)' : ''}\n`);

const { data: scores } = await db.from('job_scores').select('job_id,llm_specificity,llm_genre_match,llm_hours');
const llm = new Map((scores ?? []).map((s) => [s.job_id as string, s]));

let changed = 0;
const transitions: string[] = [];
const staged: Array<{ job: any; status: string; ngFlags: string[]; warnFlags: string[]; hits: any; sc: ReturnType<typeof scoreJob>; llmDone: boolean }> = [];

for (const j of jobs ?? []) {
  // カテゴリはタイトルも見て再判定する（サイト側カテゴリと実態がずれることがある）
  const category = normalizeCategory(j.raw_category, j.title);
  const ng = detectNg(rules, {
    title: j.title, description: j.description,
    rawCategory: j.raw_category, category, paymentType: j.payment_type,
  });
  const mid = budgetMidpoint(j.budget_min, j.budget_max);
  const budgetNg = mid != null && mid < minBudget;
  const ngFlags = [...ng.ngFlags, ...(budgetNg ? ['budget_below_min'] : [])];
  const newStatus = ngFlags.length > 0 ? 'ng_filtered' : 'scored';

  const l = llm.get(j.id as string);
  const sc = scoreJob({
    title: j.title, description: j.description,
    category, rawCategory: j.raw_category,
    budgetMin: j.budget_min, budgetMax: j.budget_max,
    applicantCount: j.applicant_count,
    clientRating: j.client_rating, clientOrderCount: j.client_order_count,
    clientVerified: j.client_verified, completionRate: null,
    deadline: j.deadline,
    estimatedHours: (l?.llm_hours as number | null) ?? null,
    llmSpecificity: (l?.llm_specificity as number | null) ?? null,
    llmGenreMatch: (l?.llm_genre_match as number | null) ?? null,
  }, weights, thresholds, genre);

  const warnFlags = Array.from(new Set([
    ...ng.warnFlags,
    ...extraWarnFlags({ applicantCount: j.applicant_count, budgetMin: j.budget_min, budgetMax: j.budget_max, category }),
  ]));

  if (j.status !== newStatus || j.category !== category) {
    changed++;
    const catNote = j.category !== category ? ` cat:${j.category}→${category}` : '';
    transitions.push(`  ${j.status} → ${newStatus}${catNote}  [${ngFlags.join(',') || '-'}]  ${j.title.slice(0, 40)}`);
  }

  staged.push({ job: { ...j, category }, status: newStatus, ngFlags, warnFlags, hits: ng.hits, sc, llmDone: l?.llm_specificity != null });
}

// --- 同一クライアントの連投を検出し、代表以外にペナルティを与える ---
const dup = findDuplicates(
  staged.filter((s) => s.status === 'scored').map((s) => ({
    id: s.job.id, title: s.job.title, clientName: s.job.client_name, totalScore: s.sc.totalScore,
  })),
);
console.log(`同一クライアントの連投: ${dup.duplicateIds.size}件を代表以外として減点\n`);

for (const st of staged) {
  const isDup = dup.duplicateIds.has(st.job.id);
  const size = dup.clusterSize.get(st.job.id);
  let total = st.sc.totalScore;
  const warnFlags = [...st.warnFlags];
  if (isDup) {
    total = Math.round(total * 0.6);
    warnFlags.push('duplicate_posting');
  } else if (size && size > 1) {
    warnFlags.push('cluster_representative');
  }

  if (!dryRun) {
    await db.from('jobs').update({ status: st.status, category: st.job.category }).eq('id', st.job.id);
    await db.from('job_scores').upsert({
      job_id: st.job.id,
      total_score: total,
      breakdown: {
        ...st.sc.breakdown,
        ng_hits: st.hits,
        ...(size ? { duplicate_cluster: { size, representative: !isDup } } : {}),
      },
      ng_flags: st.ngFlags,
      warn_flags: Array.from(new Set(warnFlags)),
      hourly_rate: st.sc.hourlyRate,
      llm_status: st.ngFlags.length > 0 ? 'skipped' : (st.llmDone ? 'done' : 'pending'),
      scored_at: new Date().toISOString(),
    }, { onConflict: 'job_id' });
  }
}

console.log(`ステータス／カテゴリが変わった案件: ${changed}件`);
transitions.slice(0, 40).forEach((t) => console.log(t));
if (transitions.length > 40) console.log(`  …ほか ${transitions.length - 40}件`);
