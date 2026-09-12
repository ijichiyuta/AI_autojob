/** 実際の応募フォームで selector を確認（送信ボタンは押さない） */
import { openContext, firstPage } from '../browser/context.js';
import { checkLogin } from '../browser/session.js';
const ctx = await openContext({ headless: false });
const page = await firstPage(ctx);
try {
  const login = await checkLogin(page);
  console.log('ログイン:', login.loggedIn);
  if (!login.loggedIn) process.exit(1);
  
  // 案件[1] のフォームを開く
  const jobId = '13448091';
  const url = `https://crowdworks.jp/proposals/new?job_offer_id=${jobId}`;
  console.log(`\n→ ${url}\n`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);
  
  console.log('=== フォーム読み込み確認 ===');
  console.log(await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('textarea, input[type="text"]').forEach((el) => {
      const e = el as HTMLInputElement;
      const label = e.closest('label,dt,p,div')?.textContent?.trim().slice(0, 30) || '?';
      out.push(`  <${e.tagName.toLowerCase()} name="${e.name}" ${e.disabled ? 'disabled' : ''}/> "${label}"`);
    });
    return out.length > 0 ? out.join('\n') : '（入力要素が見つかりません）';
  }));
  
  console.log('\n=== 応募メッセージフィールドの確認 ===');
  const msgFieldCount = await page.locator('textarea[name="proposal[conditions_attributes][0][message_attributes][body]"]').count();
  console.log(`  count: ${msgFieldCount}`);
  
  if (msgFieldCount === 0) {
    console.log('\n  → セレクタが見つかりません。代わりに textarea をすべて列挙します：');
    console.log(await page.evaluate(() => {
      const areas = document.querySelectorAll('textarea');
      return Array.from(areas).map((a, i) => 
        `[${i}] name="${a.getAttribute('name')}" visible=${a.offsetHeight > 0}`
      ).join('\n');
    }));
  }
} finally { await ctx.close(); }
