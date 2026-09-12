/**
 * 応募文をまだ作っていない候補を書き出す。
 *   npm run proposal:export [-- --limit 10]
 * 出力を Claude Code が読み、llm/proposal-results.json に書き戻して proposal:import。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, getSetting } from '../db/client.js';
import { env } from '../env.js';
import { PROPOSAL_GUIDE, PROPOSAL_SCHEMA } from '../profile/proposal-guide.js';
import type { Thresholds } from '../scoring/score.js';

function arg(n: string) { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; }
const limit = Number(arg('limit') ?? 10);
const minScore = Number(arg('min-score') ?? 0);

const th = await getSetting<Thresholds>('thresholds');

// すでに applications がある案件は除く
const { data: existing } = await db.from('applications').select('job_id');
const taken = new Set((existing ?? []).map((a) => a.job_id as string));

const { data: rows, error } = await db.from('job_board')
  .select('*').eq('status', 'scored').eq('llm_status', 'done')
  .gte('total_score', minScore)
  .order('total_score', { ascending: false }).limit(limit + taken.size);
if (error) throw new Error(error.message);

const jobs = (rows ?? []).filter((j) => !taken.has(j.id)).slice(0, limit).map((j) => ({
  job_id: j.id,
  title: j.title,
  url: j.url,
  category: j.category,
  raw_category: j.raw_category,
  budget_min: j.budget_min,
  budget_max: j.budget_max,
  deadline: j.deadline,
  applicant_count: j.applicant_count,
  client: {
    name: j.client_name, rating: j.client_rating,
    orders: j.client_order_count, verified: j.client_verified,
  },
  score: {
    total: j.total_score, hourly_rate: j.hourly_rate,
    estimated_hours: j.estimated_hours, warn_flags: j.warn_flags,
    llm_notes: j.llm_notes,
  },
  description: j.description,
}));

const out = {
  _instructions: [
    '各案件について応募文・提示価格・納期を作り、llm/proposal-results.json に',
    '{"proposals": [...]} の形で書き戻すこと。',
    '応募すべきでないと判断したものは skip: true と skip_reason を書く（無理に書かない）。',
    '書いたものは人間がダッシュボードでレビューし、承認して初めて送信される。',
  ],
  _guide: PROPOSAL_GUIDE,
  _constraints: {
    週の可処分時間: th.weekly_capacity_hours,
    目標時給: th.target_hourly_rate,
    最低時給: th.min_hourly_rate,
    同時進行の上限: th.max_concurrent_jobs,
  },
  _result_schema: PROPOSAL_SCHEMA,
  count: jobs.length,
  jobs,
};

mkdirSync(resolve(env.logDir, '..', 'llm'), { recursive: true });
const path = resolve(env.logDir, '..', 'llm', 'proposal-queue.json');
writeFileSync(path, JSON.stringify(out, null, 2), 'utf8');
console.log(`応募文の作成対象 ${jobs.length}件 を書き出しました:`);
console.log(`  ${path}`);
if (!jobs.length) console.log('（LLM判定済みの候補がありません。先に npm run llm:export / llm:import）');
