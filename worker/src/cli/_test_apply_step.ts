import { openContext, firstPage } from '../browser/context.js';
import { checkLogin } from '../browser/session.js';
const ctx = await openContext({ headless: false });
const page = await firstPage(ctx);
try {
  if (!(await checkLogin(page)).loggedIn) process.exit(1);
  
  const url = 'https://crowdworks.jp/proposals/new?job_offer_id=13448091';
  console.log(`\n${url}\n`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  
  const steps = [
    { name: '支払い方法（固定報酬制）', sel: 'input[value="fixed_price"]', action: (loc: any) => loc.check({ force: true }) },
    { name: '金額フィールド', sel: 'input[name="amount_dummy[]"]', action: (loc: any) => loc.fill('450000', { timeout: 10000 }) },
    { name: '年の選択', sel: 'select[name*="deadline(1i)"]', action: (loc: any) => loc.selectOption('2026') },
    { name: '月の選択', sel: 'select[name*="deadline(2i)"]', action: (loc: any) => loc.selectOption('9') },
    { name: '日の選択', sel: 'select[name*="deadline(3i)"]', action: (loc: any) => loc.selectOption('22') },
    { name: 'メッセージフィールド', sel: 'textarea[name*="message_attributes"][name*="body"]', action: (loc: any) => loc.fill('テスト応募文です。', { timeout: 10000 }) },
  ];
  
  for (const step of steps) {
    console.log(`[実行] ${step.name} (${step.sel})`);
    const loc = page.locator(step.sel);
    const count = await loc.count();
    console.log(`  → 見つかった: ${count}件`);
    if (count > 0) {
      try {
        await step.action(loc);
        console.log(`  ✓ 成功\n`);
      } catch (e) {
        console.error(`  ✗ 失敗: ${(e as Error).message}\n`);
        break;
      }
    } else {
      console.log(`  ✗ selector が見つかりません\n`);
    }
    await page.waitForTimeout(1000);
  }
} finally { await ctx.close(); }
