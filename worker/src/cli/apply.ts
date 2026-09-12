/**
 * 承認済みの応募を送信する。
 *
 *   npm run apply                 ドライラン（フォームに入力してスクショを撮るだけ。送信しない）
 *   npm run apply -- --send       実際に送信する
 *   npm run apply -- --send --limit 1   1件だけ送る
 *   npm run apply -- --headed     ブラウザを表示して目視する
 *
 * 対象は status='approved' のものだけ。ダッシュボードで承認していないものは送られない。
 */
import { openContext, firstPage } from '../browser/context.js';
import { runApply } from '../pipeline/apply.js';
import { AbortRun } from '../browser/guard.js';

function arg(n: string) { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; }
const send = process.argv.includes('--send');
const headed = process.argv.includes('--headed');
const opts = { send, limit: arg('limit') ? Number(arg('limit')) : undefined, force: process.argv.includes('--force') };

console.log(`=== 応募送信 ${new Date().toLocaleString('ja-JP')} ===`);
if (send) {
  console.log('  ⚠ --send が指定されています。実際にクライアントへ応募が送られます');
} else {
  console.log('  ドライラン: フォームに入力して確認するだけで、送信はしません');
  console.log('  実際に送るには --send を付けてください');
}
console.log('');

const ctx = await openContext({ headless: !headed });
const page = await firstPage(ctx);

try {
  const r = await runApply(page, opts);
  console.log('\n=== 結果 ===');
  console.log(`  対象      : ${r.candidates}件`);
  console.log(`  入力完了  : ${r.filled}件`);
  console.log(`  送信      : ${r.sent}件${r.dryRun ? '（ドライランのため0）' : ''}`);
  console.log(`  失敗      : ${r.failed}件`);
  console.log(`  スキップ  : ${r.skipped}件`);
  if (r.dryRun && r.filled > 0) {
    console.log('\n  screenshots/ の apply-before-*.png で入力内容を確認できます');
  }
} catch (e) {
  if (e instanceof AbortRun) console.error('中断:', e.message);
  else { console.error('失敗:', (e as Error).message); process.exitCode = 1; }
} finally {
  await ctx.close().catch(() => {});
}
