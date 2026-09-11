/**
 * LLM判定待ちの案件を書き出す。
 *   npm run llm:export [-- --limit 40]
 * 出力された JSON を Claude Code が読み、判定を llm-results.json に書き戻す。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, getSetting } from '../db/client.js';
import { env } from '../env.js';
import type { LlmJobInput } from '../llm/provider.js';

function arg(n: string) { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; }
const limit = Number(arg('limit') ?? 50);

const { data, error } = await db
  .from('job_board')
  .select('id,title,category,raw_category,budget_min,budget_max,applicant_count,deadline,description')
  .eq('status', 'scored')
  .eq('llm_status', 'pending')
  .order('total_score', { ascending: false })
  .limit(limit);
if (error) throw new Error(error.message);

const genre = await getSetting<{ strong: string[]; moderate: string[]; avoid: string[] }>('genre_profile');
const th = await getSetting<{ weekly_capacity_hours: number }>('thresholds');

const jobs: LlmJobInput[] = (data ?? []).map((j) => ({
  id: j.id,
  title: j.title,
  category: j.category,
  raw_category: j.raw_category,
  budget_min: j.budget_min,
  budget_max: j.budget_max,
  applicant_count: j.applicant_count,
  deadline: j.deadline,
  // 判定に足りる長さに切る。全文は詳細ページで見られる
  description: (j.description ?? '').slice(0, 1800) || null,
}));

const out = {
  _instructions: [
    '各案件について次を判定し、llm-results.json に {"judgments": [...]} の形で書き戻すこと。',
    '- ai_prohibited: 案件文が「AI使用不可・AI生成物不可」を意味しているか（true/false）。',
    '  正規表現判定と併せた二重化なので、表現が婉曲でも実質AI禁止ならtrueにする。',
    '- specificity: 要件の具体性 0〜100。機能・画面数・技術・納期が明記されているほど高い。',
    '  「詳細は相談」「おまかせ」中心ならヒアリング工数が膨らむので低くする。',
    '- genre_match: 下記 genre_profile との一致度 0〜100。avoid に当たるものは20以下。',
    '- estimated_hours: 想定工数（時間）。実装だけでなく要件確認・修正対応・納品作業を含む実工数。',
    `  受注者の可処分時間は週${th.weekly_capacity_hours}時間。これを大きく超える案件は工数を正直に見積もること。`,
    '- notes: 判断の根拠を1〜2文。人間がレビューして納得できる粒度で。',
  ],
  _genre_profile: genre,
  _result_schema: {
    judgments: [{ id: 'uuid', ai_prohibited: false, specificity: 0, genre_match: 0, estimated_hours: 0, notes: '' }],
  },
  count: jobs.length,
  jobs,
};

mkdirSync(resolve(env.logDir, '..', 'llm'), { recursive: true });
const path = resolve(env.logDir, '..', 'llm', 'llm-queue.json');
writeFileSync(path, JSON.stringify(out, null, 2), 'utf8');
console.log(`判定待ち ${jobs.length}件 を書き出しました:`);
console.log(`  ${path}`);
console.log(`判定後は llm/llm-results.json に書き、 npm run llm:import を実行してください。`);
