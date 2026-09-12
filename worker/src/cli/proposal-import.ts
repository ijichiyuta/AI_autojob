/**
 * 応募文を取り込み、承認待ち（pending_apply）として登録する。
 *   npm run proposal:import
 *
 * ここで作られるのは「人間のレビュー待ち」の状態。送信はされない。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from '../db/client.js';
import { env } from '../env.js';

interface Proposal {
  job_id: string;
  proposal_text?: string;
  proposed_price?: number;
  proposed_days?: number;
  notes?: string;
  skip?: boolean;
  skip_reason?: string;
}

const path = resolve(env.logDir, '..', 'llm', 'proposal-results.json');
const { proposals } = JSON.parse(readFileSync(path, 'utf8')) as { proposals: Proposal[] };
console.log(`応募文 ${proposals.length}件 を取り込みます\n`);

let created = 0, skipped = 0;

for (const p of proposals) {
  const { data: job } = await db.from('jobs').select('id,title,status').eq('id', p.job_id).single();
  if (!job) { console.warn(`  見つからない: ${p.job_id}`); continue; }

  if (p.skip) {
    // 応募しないと判断したものは候補から外す。理由を残す
    await db.from('jobs').update({ status: 'ng_filtered' }).eq('id', p.job_id);
    const { data: cur } = await db.from('job_scores').select('ng_flags').eq('job_id', p.job_id).single();
    await db.from('job_scores').update({
      ng_flags: Array.from(new Set([...((cur?.ng_flags as string[]) ?? []), 'skipped_at_proposal'])),
      llm_notes: p.skip_reason ?? '応募文の作成時に見送りと判断',
    }).eq('job_id', p.job_id);
    skipped++;
    console.log(`  [見送り] ${job.title.slice(0, 42)}  — ${p.skip_reason ?? ''}`);
    continue;
  }

  if (!p.proposal_text || !p.proposed_price || !p.proposed_days) {
    console.warn(`  [不備] ${job.title.slice(0, 42)}  応募文・価格・納期のいずれかが空`);
    continue;
  }

  const { error } = await db.from('applications').upsert({
    job_id: p.job_id,
    status: 'pending_apply',
    proposal_text: p.proposal_text,
    proposed_price: p.proposed_price,
    proposed_days: p.proposed_days,
    proposal_notes: p.notes ?? null,
    proposal_generated_at: new Date().toISOString(),
  }, { onConflict: 'job_id' });

  if (error) { console.error(`  [失敗] ${job.title.slice(0, 40)}: ${error.message}`); continue; }

  await db.from('jobs').update({ status: 'promoted' }).eq('id', p.job_id);
  created++;
  console.log(`  [承認待ち] ${p.proposed_price.toLocaleString()}円 / ${p.proposed_days}日  ${job.title.slice(0, 40)}`);
}

console.log(`\n承認待ちに登録: ${created}件 / 見送り: ${skipped}件`);
if (created) console.log('ダッシュボードの「承認キュー」でレビューしてください。承認するまで送信されません。');
