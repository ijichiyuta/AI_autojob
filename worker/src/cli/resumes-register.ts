/**
 * ポートフォリオ・経歴を登録する。
 *   npm run resumes            確認のみ
 *   npm run resumes -- --apply 実際に登録
 */
import { openContext, firstPage } from '../browser/context.js';
import { checkLogin } from '../browser/session.js';
import { RESUMES, validateResumes } from '../profile/resumes.js';
import { sleep } from '../util/sleep.js';

const apply = process.argv.includes('--apply');
const errs = validateResumes();
if (errs.length) { errs.forEach((e) => console.error(`  - ${e}`)); process.exit(1); }

const ctx = await openContext({ headless: true });
const page = await firstPage(ctx);

try {
  const login = await checkLogin(page);
  if (!login.loggedIn) { console.error('未ログインです。npm run login を先に。'); process.exitCode = 1; }
  else {
    // 既存の登録を拾って重複を避ける
    await page.goto('https://crowdworks.jp/public/employees/5061847/resumes', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1500);
    const existingText = await page.evaluate(() => document.body.innerText);

    console.log(`ポートフォリオ ${RESUMES.length}件 ${apply ? '' : '※確認のみ'}\n`);

    for (const r of RESUMES) {
      const already = existingText.includes(r.title);
      const period = `${r.startedYear}/${r.startedMonth}〜${r.endedYear ?? ''}/${r.endedMonth ?? ''}`;
      console.log(`  ${already ? '[登録済]' : '[新規]  '} ${r.title}  (${period})`);
      if (already || !apply) continue;

      await page.goto('https://crowdworks.jp/resumes/new', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      await page.fill('input[name="resume[title]"]', r.title);
      await page.fill('textarea[name="resume[summary]"]', r.summary);
      await page.selectOption('select[name="resume[started_on(1i)]"]', r.startedYear);
      await page.selectOption('select[name="resume[started_on(2i)]"]', r.startedMonth);
      if (r.endedYear) await page.selectOption('select[name="resume[ended_on(1i)]"]', r.endedYear);
      if (r.endedMonth) await page.selectOption('select[name="resume[ended_on(2i)]"]', r.endedMonth);
      if (r.refUrl) await page.fill('input[name="resume[ref_url]"]', r.refUrl);
      await page.fill('textarea[name="resume[details]"]', r.details);
      await page.fill('input[name="resume[company]"]', r.company);
      await page.fill('input[name="resume[role]"]', r.role);
      await page.fill('textarea[name="resume[skills]"]', r.skills);
      await page.fill('input[name="resume[num_members]"]', r.numMembers);

      await page.click('input[name="commit"], button[type="submit"]');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      const err = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.error, [class*="error"], .alert'))
          .map((e) => (e.textContent || '').trim()).filter((t) => t && t.length < 160).slice(0, 3));
      if (err.length) console.warn(`      ⚠ ${err.join(' / ')}`);
      else console.log(`      → 登録しました`);
      await sleep(1000);
    }

    if (apply) {
      await page.goto('https://crowdworks.jp/public/employees/5061847/resumes', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      const after = await page.evaluate(() => document.body.innerText);
      const ok = RESUMES.filter((r) => after.includes(r.title)).length;
      console.log(`\n登録済み: ${ok} / ${RESUMES.length}件`);
    } else {
      console.log('\n問題なければ  npm run resumes -- --apply');
    }
  }
} finally { await ctx.close().catch(() => {}); }
