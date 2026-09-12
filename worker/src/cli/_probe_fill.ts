import { openContext, firstPage } from '../browser/context.js';
import { checkLogin } from '../browser/session.js';
const ctx = await openContext({ headless: false });
const page = await firstPage(ctx);
try {
  if (!(await checkLogin(page)).loggedIn) process.exit(1);
  await page.goto('https://crowdworks.jp/proposals/new?job_offer_id=13448091', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  
  const selector = 'textarea[name="proposal[conditions_attributes][0][message_attributes][body]"]';
  const loc = page.locator(selector);
  const count = await loc.count();
  console.log(`selector count: ${count}`);
  
  if (count > 0) {
    console.log('\n→ fill() を試みます（タイムアウト30秒）...');
    try {
      await loc.fill('テスト応募文です。', { timeout: 30000 });
      console.log('✓ fill() 成功');
      const value = await loc.inputValue();
      console.log(`値: "${value}"`);
    } catch (e) {
      console.error('✗ fill() 失敗:', (e as Error).message);
      console.log('\n→ 別の方法：clear() → type() を試みます');
      await loc.clear({ timeout: 10000 });
      console.log('  clear() OK');
      await loc.type('テスト応募文です。', { delay: 50 });
      console.log('  type() OK');
    }
  }
} finally { await ctx.close(); }
