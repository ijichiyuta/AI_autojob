/**
 * ポートフォリオ用に、公開デモサイトのスクリーンショットを撮る。
 *   npm run capture-demos
 * 撮った画像は assets/portfolio/ に入り、経歴の添付に使う（/resumes/{id}/edit）。
 */
import { chromium } from 'playwright';
const sites: Array<[string, string]> = [
  ['https://demo-cafe.smcn-jp.com', 'demo-cafe'],
  ['https://demo-salon.smcn-jp.com', 'demo-salon'],
  ['https://demo-cooking.smcn-jp.com', 'demo-cooking'],
  ['https://demo-tax.smcn-jp.com', 'demo-tax'],
];
const b = await chromium.launch({ headless: true });
for (const [url, name] of sites) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  try {
    const r = await p.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `../assets/portfolio/${name}.png` });
    console.log(`  ${name}: ${r?.status()} OK`);
  } catch (e) { console.log(`  ${name}: 失敗 ${(e as Error).message.split('\n')[0]}`); }
  await p.close();
}
await b.close();
