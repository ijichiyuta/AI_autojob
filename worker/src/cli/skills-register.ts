/**
 * スキルをまとめて登録する。
 *   npm run skills           確認のみ
 *   npm run skills -- --apply  実際に登録
 */
import { openContext, firstPage } from '../browser/context.js';
import { checkLogin } from '../browser/session.js';
import { SKILLS, validateSkills } from '../profile/skills.js';
import { sleep } from '../util/sleep.js';

const apply = process.argv.includes('--apply');
const lenErr = validateSkills();
if (lenErr.length) { lenErr.forEach((e) => console.error(`  - ${e}`)); process.exit(1); }
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
      // スキル名はマスタから選ぶ方式。候補が出るまで打ち込んで、完全一致の候補をクリックする
      const input = page.locator('input[name="user_skill[name]"]');
      await input.click();
      await input.type(s.name, { delay: 60 });
      await page.waitForTimeout(1800);
      const options = await page.evaluate(() =>
        Array.from(document.querySelectorAll('ul.ui-autocomplete li'))
          .map((e) => (e.textContent || '').trim()).filter(Boolean));
      const exact = options.find((o) => o === s.name);
      if (!exact) {
        console.warn(`      ⚠ 候補に無いためスキップ（候補: ${options.slice(0, 4).join(' | ') || 'なし'}）`);
        continue;
      }
      await page.locator('ul.ui-autocomplete li').filter({ hasText: new RegExp(`^${s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first().click();
      await page.waitForTimeout(600);
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
