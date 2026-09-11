/**
 * サイト構造の調査用。DOMセレクタを確定させるために使う。
 *   npm run inspect -- <URL> [--headed]
 */
import { openContext, firstPage } from '../browser/context.js';

const url = process.argv[2];
const headed = process.argv.includes('--headed');
if (!url) { console.error('使い方: npm run inspect -- <URL> [--headed]'); process.exit(1); }

const ctx = await openContext({ headless: !headed });
const page = await firstPage(ctx);

try {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(2500);

  console.log('== 基本 ==');
  console.log('status :', res?.status());
  console.log('url    :', page.url());
  console.log('title  :', await page.title());

  const report = await page.evaluate(() => {
    const out: string[] = [];

    // 繰り返し出現する構造＝一覧アイテムの候補を探す
    const counts = new Map<string, number>();
    document.querySelectorAll('*[class]').forEach((el) => {
      const cls = (el.getAttribute('class') || '').trim().split(/\s+/).slice(0, 3).join('.');
      if (!cls) return;
      const key = `${el.tagName.toLowerCase()}.${cls}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    out.push('== 繰り返し要素 top20 (出現5回以上) ==');
    [...counts.entries()]
      .filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]).slice(0, 20)
      .forEach(([k, n]) => out.push(`  ${String(n).padStart(3)}  ${k}`));

    // 案件詳細へのリンク
    const jobLinks = [...document.querySelectorAll('a[href*="/public/jobs/"]')]
      .map((a) => (a as HTMLAnchorElement).getAttribute('href') || '')
      .filter((h) => /\/public\/jobs\/\d+/.test(h));
    out.push('', `== 案件リンク: ${jobLinks.length}件 ==`);
    [...new Set(jobLinks)].slice(0, 5).forEach((h) => out.push(`  ${h}`));

    // data-* 属性（安定しやすいので優先的に使いたい）
    const dataAttrs = new Set<string>();
    document.querySelectorAll('*').forEach((el) => {
      for (const a of el.attributes) if (a.name.startsWith('data-')) dataAttrs.add(a.name);
    });
    out.push('', '== data-* 属性 ==', '  ' + [...dataAttrs].slice(0, 40).join(', '));

    // ログイン状態
    const body = document.body.innerText;
    out.push('', '== ログイン判定 ==');
    out.push(`  "ログイン"の出現: ${(body.match(/ログイン/g) || []).length}`);
    out.push(`  "ログアウト"の出現: ${(body.match(/ログアウト/g) || []).length}`);
    return out.join('\n');
  });
  console.log('\n' + report);

  const text = await page.evaluate(() => document.body.innerText.slice(0, 1200));
  console.log('\n== 本文冒頭 ==\n' + text);
} catch (e) {
  console.error('失敗:', (e as Error).message);
} finally {
  await ctx.close();
}
