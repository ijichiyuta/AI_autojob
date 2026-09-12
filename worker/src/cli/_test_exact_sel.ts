import { openContext, firstPage } from '../browser/context.js';
import { checkLogin } from '../browser/session.js';
const ctx = await openContext({ headless: false });
const page = await firstPage(ctx);
try {
  if (!(await checkLogin(page)).loggedIn) process.exit(1);
  await page.goto('https://crowdworks.jp/proposals/new?job_offer_id=13448091', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  
  const base = 'proposal[conditions_attributes][0][milestones_attributes][0]';
  const exactSel = `textarea[name="${base}[message_attributes][body]"]`;
  
  console.log(`テスト: ${exactSel}\n`);
  const loc = page.locator(exactSel);
  const count = await loc.count();
  console.log(`count: ${count}`);
  
  if (count > 0) {
    console.log('\n→ fill() を試みます...');
    await loc.fill('テスト応募メッセージです。', { timeout: 10000 });
    console.log('✓ 成功');
  } else {
    console.log('\n✗ selector が見つかりません');
    console.log('\n→ すべての textarea の name 属性を列挙します：');
    console.log(await page.evaluate(() => {
      return Array.from(document.querySelectorAll('textarea')).map((t, i) => 
        `[${i}] name="${t.getAttribute('name')}" visible=${t.offsetHeight > 0}`
      ).join('\n');
    }));
  }
} finally { await ctx.close(); }
