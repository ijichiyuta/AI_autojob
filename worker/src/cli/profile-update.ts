/**
 * クラウドワークスのプロフィールを更新する。
 *   npm run profile          変更内容を確認するだけ（送信しない）
 *   npm run profile -- --apply   実際に送信する
 *
 * 内容は src/profile/content.ts。ここでは入力と送信だけを行う。
 */
import { openContext, firstPage } from '../browser/context.js';
import { checkLogin } from '../browser/session.js';
import { saveScreenshot } from '../browser/guard.js';
import { sleep } from '../util/sleep.js';
import {
  DISPLAY_NAME, SIMPLE_INTRODUCTION, INTRODUCTION, OCCUPATION_PRESETS, CLEAR_FIELDS, validate,
} from '../profile/content.js';

// 文字数を超えるとサイト側でフォームごと弾かれ、何も保存されない。先に止める
const lengthErrors = validate();
if (lengthErrors.length) {
  console.error('文字数の制限を超えています:');
  lengthErrors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

const apply = process.argv.includes('--apply');
const occIdx = process.argv.indexOf('--occupation');
const occCategory = occIdx >= 0 ? process.argv[occIdx + 1] : undefined;
const ctx = await openContext({ headless: true });
const page = await firstPage(ctx);

try {
  const login = await checkLogin(page);
  if (!login.loggedIn) {
    console.error('未ログインです。先に npm run login を実行してください。');
    process.exitCode = 1;
  } else {
    console.log(`ログイン済み（${login.userName ?? '—'}）${apply ? '' : '  ※確認のみ。送信しません'}\n`);

    // ---------- 1. 基本情報: 表示名 ----------
    await page.goto('https://crowdworks.jp/profile/edit', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(1800);

    const beforeName = await page.inputValue('input[name="profile[display_name]"]').catch(() => '(取得できず)');
    console.log('【基本情報】');
    console.log(`  表示名: "${beforeName}" → "${DISPLAY_NAME}"`);

    await page.fill('input[name="profile[display_name]"]', DISPLAY_NAME);
    if (apply) {
      await page.click('input[name="commit"], button[type="submit"]');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2500);
      console.log(`  → 送信しました（${page.url()}）`);
    } else {
      await saveScreenshot(page, 'profile-basic-preview');
    }

    // ---------- 2. ワーカー情報 ----------
    await page.goto('https://crowdworks.jp/employee/edit', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(2000);

    const before = await page.evaluate(() => ({
      simple: (document.querySelector('[name="employee[simple_introduction]"]') as HTMLInputElement)?.value ?? '',
      intro: (document.querySelector('[name="employee[introduction]"]') as HTMLTextAreaElement)?.value ?? '',
      github: (document.querySelector('[name="employee[github]"]') as HTMLInputElement)?.value ?? '',
      occ: Array.from(document.querySelectorAll('input[name="user[occupation_ids][]"]:checked'))
        .map((e) => (e as HTMLInputElement).value),
    }));

    console.log('\n【ワーカー情報】');
    console.log(`  ひとことアピール: "${before.simple || '(空)'}"`);
    console.log(`                  → "${SIMPLE_INTRODUCTION}"`);
    console.log(`  自己PR: ${before.intro.length}文字 → ${INTRODUCTION.length}文字`);
    console.log(`  GitHub: "${before.github}" → "${CLEAR_FIELDS.github || '(空にする)'}"`);
    if (occCategory) {
      console.log(`  職種カテゴリ: → ${occCategory}（${(OCCUPATION_PRESETS[occCategory] ?? []).join(', ')}）`);
    } else {
      console.log(`  職種: [${before.occ.join(', ')}] のまま（変更するには --occupation <category>）`);
    }

    await page.fill('[name="employee[simple_introduction]"]', SIMPLE_INTRODUCTION);
    await page.fill('[name="employee[introduction]"]', INTRODUCTION);
    await page.fill('[name="employee[github]"]', CLEAR_FIELDS.github);

    if (occCategory) {
      const ids = OCCUPATION_PRESETS[occCategory];
      if (!ids) throw new Error(`未定義の職種カテゴリ: ${occCategory}`);
      // カテゴリを切り替えると、そのカテゴリの職種だけが表示される
      await page.selectOption('select[name="occupation[]"]', occCategory);
      await page.waitForTimeout(1200);
      // 旧カテゴリのチェックを外し、新カテゴリの職種を入れる
      await page.evaluate((keep) => {
        document.querySelectorAll('input[name="user[occupation_ids][]"]').forEach((e) => {
          const el = e as HTMLInputElement;
          el.checked = keep.includes(el.value);
        });
      }, ids);
      for (const id of ids) {
        const box = page.locator(`input[name="user[occupation_ids][]"][value="${id}"]`);
        if (await box.count() === 0) console.warn(`    職種id=${id} が見つかりません`);
      }
    }

    const after = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input[name="user[occupation_ids][]"]:checked'))
        .map((e) => {
          const el = e as HTMLInputElement;
          return `${el.value}:${(el.closest('li,div,label')?.textContent || '').trim().slice(0, 22)}`;
        }));
    console.log(`  職種（適用後）:\n${after.map((s) => `    ${s}`).join('\n')}`);

    if (apply) {
      await page.click('input[type="submit"], button[type="submit"]');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(3000);
      console.log(`  → 送信しました（${page.url()}）`);

      const err = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.error, .alert, [class*="error"]'))
          .map((e) => (e.textContent || '').trim()).filter((t) => t && t.length < 200).slice(0, 3));
      if (err.length) console.warn('  ⚠ エラー表示:', err.join(' / '));
    } else {
      const shot = await saveScreenshot(page, 'profile-worker-preview');
      console.log(`\n  プレビュー: ${shot}`);
      console.log('  問題なければ  npm run profile -- --apply  で送信します');
    }

    // ---------- 3. 反映確認 ----------
    if (apply) {
      await sleep(1500);
      await page.goto('https://crowdworks.jp/public/users/5061847', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      const shown = await page.evaluate(() => {
        const h1 = document.querySelector('h1')?.textContent?.trim() ?? '';
        const body = document.body.innerText;
        return { h1, hasSmcn: body.includes('smcn-jp.com'), hasGithub: body.includes('ijichiyuta') };
      });
      console.log('\n【公開プロフィールの反映確認】');
      console.log(`  表示名: ${shown.h1}`);
      console.log(`  smcn-jp.com のリンク: ${shown.hasSmcn ? 'あり' : 'なし'}`);
      console.log(`  ijichiyuta の露出: ${shown.hasGithub ? '⚠ まだ残っている' : 'なし'}`);
      await saveScreenshot(page, 'profile-public-after');
    }
  }
} finally {
  await ctx.close().catch(() => {});
}
