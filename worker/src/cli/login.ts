/**
 * クラウドワークスへのログイン。
 *   npm run login
 *
 * ブラウザを開くだけで、ID・パスワードの入力はしない（本人が画面で入力する）。
 * 認証情報はコードにもDBにも保存されず、専用Chromeプロファイルの中に閉じる。
 * 2段階認証が要る場合も、同じ画面でそのまま進めればよい。
 */
import { openContext, firstPage } from '../browser/context.js';
import { checkLogin, saveLoginState, LOGIN_URL } from '../browser/session.js';
import { sleep } from '../util/sleep.js';

const TIMEOUT_MIN = 15;

const ctx = await openContext({ headless: false });  // 手で操作するので必ず表示する
const page = await firstPage(ctx);

try {
  // すでに入っていないか先に確認する
  const before = await checkLogin(page);
  if (before.loggedIn) {
    await saveLoginState(before);
    console.log(`すでにログイン済みです${before.userName ? `（${before.userName}）` : ''}。`);
    console.log('入り直したい場合は、開いたブラウザでログアウトしてから再実行してください。');
    await sleep(2500);
    process.exit(0);
  }

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });

  console.log('');
  console.log('  ブラウザを開きました。画面でログインしてください。');
  console.log('');
  console.log('  ・ID / パスワードはこちらでは入力しません。ご自身で入力してください');
  console.log('  ・「ログイン状態を保持する」に必ずチェックを入れてください（セッションが長持ちします）');
  console.log('  ・2段階認証がある場合も、そのまま画面で進めてください');
  console.log('  ・Google / Yahoo! のログインでも構いません');
  console.log('');
  console.log(`  完了を検知するまで最大${TIMEOUT_MIN}分待ちます。中断は Ctrl+C。`);
  console.log('');

  const deadline = Date.now() + TIMEOUT_MIN * 60_000;
  let done = false;

  while (Date.now() < deadline) {
    await sleep(3000);

    let url = '';
    try { url = page.url(); } catch { /* ページが差し替わった直後 */ }

    // 外部の認証画面（Google等）にいる間は待つ
    if (!url.includes('crowdworks.jp')) continue;
    // ログインページから離れたら、認証が通った可能性がある
    if (/\/login/.test(url)) continue;

    await sleep(1500);
    const state = await checkLogin(page);
    if (state.loggedIn) {
      await saveLoginState(state);
      console.log(`ログインを確認しました${state.userName ? `（${state.userName}）` : ''}。`);
      console.log('セッションは専用Chromeプロファイルに保存されました。以降の収集では自動で使われます。');
      done = true;
      break;
    }
  }

  if (!done) {
    console.error(`${TIMEOUT_MIN}分以内にログインを確認できませんでした。もう一度 npm run login を実行してください。`);
    process.exitCode = 1;
  }
} finally {
  await sleep(1500);
  await ctx.close().catch(() => {});
}
