/**
 * 収集バッチ
 *   npm run crawl                          全件
 *   npm run crawl -- --only システム開発     特定の条件だけ
 *   npm run crawl -- --pages 1 --max-details 10   様子見
 *   npm run crawl -- --headed              目視確認
 */
import { openContext, firstPage } from '../browser/context.js';
import { runCrawl } from '../pipeline/crawl.js';
import { AbortRun } from '../browser/guard.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const opts = {
  dryRun: process.argv.includes('--dry-run'),
  onlyLabel: arg('only'),
  maxPages: arg('pages') ? Number(arg('pages')) : undefined,
  maxDetails: arg('max-details') ? Number(arg('max-details')) : undefined,
  force: process.argv.includes('--force'),
};
const headed = process.argv.includes('--headed');

console.log(`=== 収集開始 ${new Date().toLocaleString('ja-JP')} ${opts.dryRun ? '(dry-run)' : ''} ===`);
const started = Date.now();
const ctx = await openContext({ headless: !headed });
const page = await firstPage(ctx);

try {
  const r = await runCrawl(page, opts);
  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log('\n=== 結果 ===');
  console.log(`  検索条件   : ${r.queries}件`);
  console.log(`  一覧で発見 : ${r.found}件`);
  console.log(`  うち新規   : ${r.isNew}件`);
  console.log(`  NG除外     : ${r.ngFiltered}件`);
  console.log(`  詳細取得   : ${r.detailFetched}件`);
  console.log(`  スコア付与 : ${r.scored}件`);
  console.log(`  所要       : ${mins}分`);
} catch (e) {
  if (e instanceof AbortRun) console.error('中断:', e.message);
  else { console.error('失敗:', (e as Error).message); process.exitCode = 1; }
} finally {
  await ctx.close();
}
