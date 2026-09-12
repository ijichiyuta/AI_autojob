/**
 * スキルをまとめて登録する。
 *   npm run skills           確認のみ
 *   npm run skills -- --apply  実際に登録
 */
import { openContext, firstPage } from '../browser/context.js';
import { checkLogin } from '../browser/session.js';
import { SKILLS } from '../profile/skills.js';
import { sleep } from '../util/sleep.js';

const apply = process.argv.includes('--apply');
const ctx = await openContext({ headless: true });
const page = await firstPage(ctx);

try {
  const login = await checkLogin(page);
  if (!login.loggedIn) { console.error('未ログインです。npm run login を先に。'); process.exitCode = 1; }
  else {
    await page.goto('https://crowdworks.jp/user_skills', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const existing = await page.evaluate(() => document.body.innerText);

    console.log(`登録するスキル ${SKILLS.length}件 ${apply ? '' : '※確認のみ'}\n`);
    for (const s of SKILLS) {
      const already = existing.includes(s.name);
      console.log(`  ${already ? '[登録済]' : '[新規]  '} ${s.name.padEnd(20)} ${s.level}  ${s.years}`);
      if (already || !apply) continue;

      await page.goto('https://crowdworks.jp/user_skills', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      await page.fill('input[name="user_skill[name]"]', s.name);
      await page.selectOption('select[name="user_skill[level]"]', { label: s.level });
      await page.selectOption('select[name="user_skill[years]"]', { label: s.years });
      if (s.note) await page.fill('textarea[name="user_skill[note]"]', s.note);
      await page.click('input[name="commit"], button[type="submit"]');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);

      const err = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.error, [class*="error"]'))
          .map((e) => (e.textContent || '').trim()).filter((t) => t && t.length < 120).slice(0, 2));
      if (err.length) console.warn(`      ⚠ ${err.join(' / ')}`);
      await sleep(800);
    }

    if (apply) {
      await page.goto('https://crowdworks.jp/user_skills', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      const after = await page.evaluate(() => document.body.innerText);
      const ok = SKILLS.filter((s) => after.includes(s.name)).length;
      console.log(`\n登録済み: ${ok} / ${SKILLS.length}件`);
    } else {
      console.log('\n問題なければ  npm run skills -- --apply');
    }
  }
} finally { await ctx.close().catch(() => {}); }
