import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { Page } from 'playwright';
import { db, getSetting, raiseAlert } from '../db/client.js';
import { env } from '../env.js';
import { CrowdWorksApplyAdapter } from '../adapters/crowdworks-apply.js';
import { AbortRun } from '../browser/guard.js';
import { randomDelay } from '../util/sleep.js';
import { checkLogin } from '../browser/session.js';

export interface ApplyGuardrails {
  daily_limit: number;
  interval_ms: [number, number];
  quiet_hours: { from: number; to: number };
}

export interface ApplyOptions {
  /** 既定は false（＝送信しない）。true のときだけ実際に送る */
  send?: boolean;
  limit?: number;
  force?: boolean;
}

export interface ApplyResult {
  candidates: number;
  filled: number;
  sent: number;
  failed: number;
  skipped: number;
  dryRun: boolean;
}

function hourJst(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: env.tz, hour: 'numeric', hour12: false }).format(now));
}

/** 提示納期（日数）から納品予定日を出す */
export function deadlineFromDays(days: number, from = new Date()): string {
  const d = new Date(from.getTime() + days * 86_400_000);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: env.tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return p.format(d);
}

async function uploadShot(path: string, key: string): Promise<string | null> {
  try {
    const bytes = readFileSync(path);
    const { error } = await db.storage.from('apply-screenshots')
      .upload(key, bytes, { contentType: 'image/png', upsert: true });
    if (error) { console.warn(`    スクショのアップロード失敗: ${error.message}`); return null; }
    return key;
  } catch (e) {
    console.warn(`    スクショの読み込み失敗: ${(e as Error).message}`);
    return null;
  }
}

export async function runApply(page: Page, opts: ApplyOptions = {}): Promise<ApplyResult> {
  const send = opts.send === true;
  const guard = await getSetting<ApplyGuardrails>('apply_guardrails');
  const result: ApplyResult = { candidates: 0, filled: 0, sent: 0, failed: 0, skipped: 0, dryRun: !send };

  // ---- ガードレール ----
  const h = hourJst();
  const quiet = guard.quiet_hours.from <= guard.quiet_hours.to
    ? h >= guard.quiet_hours.from && h < guard.quiet_hours.to
    : h >= guard.quiet_hours.from || h < guard.quiet_hours.to;
  if (quiet && send && !opts.force) {
    throw new AbortRun(`深夜帯（${guard.quiet_hours.from}時〜${guard.quiet_hours.to}時）は送信しません`);
  }

  const login = await checkLogin(page);
  if (!login.loggedIn) throw new AbortRun('未ログインです。npm run login を先に実行してください');

  const { data: usedToday } = await db.rpc('applied_count_today');
  const used = (usedToday as number) ?? 0;
  const remaining = Math.max(0, guard.daily_limit - used);
  console.log(`  本日の送信済み ${used} / 上限 ${guard.daily_limit}（残り ${remaining}枠）`);
  if (send && remaining === 0) throw new AbortRun('本日の応募枠が埋まっています');

  // ---- 承認済みのものだけを対象にする ----
  const max = Math.min(opts.limit ?? remaining, send ? remaining : (opts.limit ?? 5));
  const { data: approved } = await db.from('approval_queue')
    .select('*').eq('application_status', 'approved')
    .order('total_score', { ascending: false, nullsFirst: false }).limit(max);

  result.candidates = approved?.length ?? 0;
  if (!result.candidates) { console.log('  承認済みの応募がありません'); return result; }
  console.log(`  対象 ${result.candidates}件${send ? '' : '（ドライラン: 入力するだけで送信しません）'}\n`);

  const adapter = new CrowdWorksApplyAdapter(page);

  for (const [i, row] of (approved ?? []).entries()) {
    const title = String(row.title).slice(0, 40);
    const { data: run } = await db.from('apply_runs').insert({
      application_id: row.application_id, job_id: row.job_id, dry_run: !send,
    }).select('id').single();

    try {
      // ---- 二重送信の防止: approved のものだけを applying に遷移させる ----
      if (send) {
        const { data: claimed } = await db.from('applications')
          .update({ status: 'applying', submit_attempts: (row.submit_attempts ?? 0) + 1 })
          .eq('id', row.application_id).eq('status', 'approved')
          .select('id');
        if (!claimed?.length) {
          result.skipped++;
          console.log(`  [スキップ] 状態が変わっています: ${title}`);
          await db.from('apply_runs').update({ status: 'skipped', finished_at: new Date().toISOString() }).eq('id', run!.id);
          continue;
        }
      }

      const deadline = deadlineFromDays(Number(row.proposed_days));
      const filled = await adapter.fill({
        externalId: String(row.external_id),
        price: Number(row.proposed_price),
        deadline,
        message: String(row.proposal_text),
      });
      result.filled++;

      console.log(`  [${i + 1}/${result.candidates}] ${title}`);
      console.log(`      金額 ${filled.amount}円 / 納品 ${filled.deadline} / 本文 ${filled.messageLength}文字 / ${filled.paymentType}`);
      console.log(`      送信前スクショ: ${basename(filled.screenshot)}`);

      const beforeKey = await uploadShot(filled.screenshot, `${row.job_id}/before-${Date.now()}.png`);

      if (!send) {
        console.log('      → ドライランのため送信しません');
        await db.from('apply_runs').update({
          status: 'success', finished_at: new Date().toISOString(),
          meta: { filled, dry_run: true },
        }).eq('id', run!.id);
        continue;
      }

      const res = await adapter.submit(String(row.external_id));
      const afterKey = await uploadShot(res.screenshot, `${row.job_id}/after-${Date.now()}.png`);

      if (res.ok) {
        await db.from('applications').update({
          status: 'applied',
          applied_at: new Date().toISOString(),
          submitted_at: new Date().toISOString(),
          screenshot_before: beforeKey, screenshot_after: afterKey,
          submit_error: null,
        }).eq('id', row.application_id);
        result.sent++;
        console.log(`      ✓ 送信しました（${res.message}）`);
      } else {
        // 送れていない可能性があるので approved に戻さず、失敗として残す
        await db.from('applications').update({
          status: 'approved', submit_error: res.message,
          screenshot_before: beforeKey, screenshot_after: afterKey,
        }).eq('id', row.application_id);
        result.failed++;
        console.warn(`      ✗ ${res.message}`);
        await raiseAlert('warn', 'apply_failed', `応募の送信に失敗しました: ${title} — ${res.message}`,
          { application_id: row.application_id, url: res.url });
      }

      await db.from('apply_runs').update({
        status: res.ok ? 'success' : 'failed', finished_at: new Date().toISOString(),
        error_message: res.ok ? null : res.message, meta: { filled, result: res },
      }).eq('id', run!.id);

      // 次があるなら間隔を空ける
      if (i < result.candidates - 1) {
        const [lo, hi] = guard.interval_ms;
        console.log(`      次まで ${Math.round(lo / 60000)}〜${Math.round(hi / 60000)}分待機`);
        await randomDelay(guard.interval_ms);
      }
    } catch (e) {
      const msg = (e as Error).message;
      result.failed++;
      // applying のまま残さない
      await db.from('applications').update({ status: 'approved', submit_error: msg })
        .eq('id', row.application_id).eq('status', 'applying');
      await db.from('apply_runs').update({
        status: e instanceof AbortRun ? 'aborted' : 'failed',
        finished_at: new Date().toISOString(), error_message: msg,
      }).eq('id', run!.id);
      console.error(`      失敗: ${msg}`);
      if (e instanceof AbortRun) throw e;
    }
  }

  return result;
}
