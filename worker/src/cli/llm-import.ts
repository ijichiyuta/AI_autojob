/**
 * LLMの判定結果を取り込み、スコアを再計算する。
 *   npm run llm:import
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, getSetting } from '../db/client.js';
import { env } from '../env.js';
import type { LlmJudgment } from '../llm/provider.js';
import { scoreJob, type Weights, type Thresholds, type GenreProfile } from '../scoring/score.js';
import type { Category } from '../adapters/types.js';

const path = resolve(env.logDir, '..', 'llm', 'llm-results.json');
const raw = JSON.parse(readFileSync(path, 'utf8')) as { judgments: LlmJudgment[] };
const judgments = raw.judgments ?? [];
console.log(`判定 ${judgments.length}件 を取り込みます\n`);

const [weights, thresholds, genre] = await Promise.all([
  getSetting<Weights>('scoring_weights'),
  getSetting<Thresholds>('thresholds'),
  getSetting<GenreProfile>('genre_profile'),
]);

let aiBlocked = 0;
let updated = 0;

for (const j of judgments) {
  const { data: job } = await db.from('jobs').select('*').eq('id', j.id).single();
  if (!job) { console.warn(`  見つからない: ${j.id}`); continue; }

  // LLMがAI不可と判断したら、正規表現が拾えていなくても除外する（二重化）
  if (j.ai_prohibited) {
    const { data: cur } = await db.from('job_scores').select('ng_flags').eq('job_id', j.id).single();
    const flags = Array.from(new Set([...((cur?.ng_flags as string[]) ?? []), 'ai_prohibited_llm']));
    await db.from('jobs').update({ status: 'ng_filtered' }).eq('id', j.id);
    await db.from('job_scores').update({
      ng_flags: flags, llm_status: 'done', llm_ai_prohibited: true,
      llm_notes: j.notes, llm_scored_at: new Date().toISOString(),
    }).eq('job_id', j.id);
    aiBlocked++;
    console.log(`  [AI不可] ${job.title.slice(0, 44)}`);
    continue;
  }

  const sc = scoreJob({
    title: job.title, description: job.description,
    category: job.category as Category, rawCategory: job.raw_category,
    budgetMin: job.budget_min, budgetMax: job.budget_max,
    applicantCount: job.applicant_count,
    clientRating: job.client_rating, clientOrderCount: job.client_order_count,
    clientVerified: job.client_verified, completionRate: null,
    deadline: job.deadline,
    estimatedHours: j.estimated_hours,
    llmSpecificity: j.specificity,
    llmGenreMatch: j.genre_match,
  }, weights, thresholds, genre);

  const { data: cur } = await db.from('job_scores').select('breakdown').eq('job_id', j.id).single();
  await db.from('job_scores').update({
    total_score: sc.totalScore,
    breakdown: { ...sc.breakdown, ng_hits: (cur?.breakdown as any)?.ng_hits ?? [] },
    hourly_rate: sc.hourlyRate,
    estimated_hours: j.estimated_hours,
    llm_status: 'done',
    llm_specificity: j.specificity,
    llm_genre_match: j.genre_match,
    llm_ai_prohibited: false,
    llm_hours: j.estimated_hours,
    llm_notes: j.notes,
    llm_scored_at: new Date().toISOString(),
  }).eq('job_id', j.id);
  updated++;
}

console.log(`\n完了: ${updated}件を更新 / ${aiBlocked}件をAI不可で除外`);
