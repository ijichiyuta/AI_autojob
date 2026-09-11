/**
 * 常駐ワーカー。node-cron で収集バッチを回す。
 *   npm run dev
 *
 * ブラウザは常駐させない。バッチのたびに起動して終了する。
 * Macのスリープで止まらないよう caffeinate 越しに起動すること（README参照）。
 */
import cron from 'node-cron';
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from './env.js';
import { openContext, firstPage } from './browser/context.js';
import { runCrawl } from './pipeline/crawl.js';
import { AbortRun } from './browser/guard.js';
import { getSetting, raiseAlert } from './db/client.js';
import type { Guardrails } from './browser/guard.js';

mkdirSync(env.logDir, { recursive: true });
const logFile = resolve(env.logDir, 'worker.log');

function log(msg: string) {
  const line = `[${new Date().toLocaleString('ja-JP', { timeZone: env.tz })}] ${msg}`;
  console.log(line);
  appendFileSync(logFile, line + '\n', 'utf8');
}

let running = false;

async function batch(trigger: string) {
  if (running) { log(`前のバッチが終わっていないため ${trigger} をスキップ`); return; }
  running = true;
  const started = Date.now();
  log(`収集開始（${trigger}）`);

  let ctx: Awaited<ReturnType<typeof openContext>> | undefined;
  try {
    ctx = await openContext({ headless: true });
    const page = await firstPage(ctx);
    const r = await runCrawl(page);
    log(
      `収集完了（${((Date.now() - started) / 60000).toFixed(1)}分）: ` +
      `発見${r.found} 新規${r.isNew} NG${r.ngFiltered} 詳細${r.detailFetched} 採点${r.scored}`,
    );
    if (r.scored > 0) log(`  → LLM判定待ちがあります: npm run llm:export`);
  } catch (e) {
    if (e instanceof AbortRun) {
      log(`中断: ${(e as Error).message}`);
    } else {
      const msg = (e as Error).message;
      log(`失敗: ${msg}`);
      await raiseAlert('error', 'batch_failed', `収集バッチが失敗しました（${trigger}）: ${msg}`).catch(() => {});
    }
  } finally {
    await ctx?.close().catch(() => {});
    running = false;
  }
}

const guard = await getSetting<Guardrails>('guardrails');
const hours = guard.crawl_hours.join(',');
const expr = `0 ${hours} * * *`;

log(`ワーカー起動。スケジュール: 毎日 ${guard.crawl_hours.map((h) => `${h}時`).join(' / ')}（${env.tz}）`);
log(`  深夜 ${guard.quiet_hours.from}時〜${guard.quiet_hours.to}時 は停止`);
log(`  ログ: ${logFile}`);

cron.schedule(expr, () => { void batch('定期'); }, { timezone: env.tz });

if (process.argv.includes('--now')) {
  log('--now 指定のため即時実行します');
  void batch('起動直後');
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { log(`${sig} を受信。終了します`); process.exit(0); });
}
