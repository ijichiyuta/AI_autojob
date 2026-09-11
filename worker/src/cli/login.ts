/**
 * クラウドワークスへのログイン。
 *   npm run login
 *
 * ブラウザを開くだけで、ID・パスワードの入力はしない（本人が画面で入力する）。
 * 認証情報はコードにもDBにも保存されず、専用Chromeプロファイルの中に閉じる。
 * 2段階認証が要る場合も、同じ画面でそのまま進めればよい。
 *
 * ログインが済むか、ブラウザを閉じるまで待つ。急かされないように打ち切り時間は長めにしてある。
 */
import { openContext, firstPage } from '../browser/context.js';
import { checkLogin, saveLoginState, LOGIN_URL } from '../browser/session.js';
import { sleep } from '../util/sleep.js';

const TIMEOUT_MIN = 60;

const ctx = await openContext({ headless: false });  // 手で操作するので必ず表示する
const page = await firstPage(ctx);

let closed = false;
ctx.on('close', () => { closed = true; });
page.on('close', () => { closed = true; });

try {
  const before = await checkLogin(page);
  if (before.loggedIn) {
    await saveLoginState(before);
    console.log(`すでにログイン済みです${before.userName ? `（${before.userName}）` : ''}。`);
    console.log('入り直したい場合は、開いたブラウザでログアウトしてから再実行してください。');
    await sleep(2000);
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
  console.log('  ログインが済むまで待ちます。やめるときはブラウザを閉じるか Ctrl+C。');
  console.log('');

  const deadline = Date.now() + TIMEOUT_MIN * 60_000;
  let done = false;
  let ticks = 0;

  while (Date.now() < deadline) {
    await sleep(3000);
    if (closed) { console.log('ブラウザが閉じられました。ログインは完了していません。'); break; }

    // 1分ごとに待っていることを知らせる
    if (++ticks % 20 === 0) {
      console.log(`  待機中…（${Math.round((deadline - Date.now()) / 60_000)}分まで待ちます）`);
    }

    let url = '';
    try { url = page.url(); } catch { continue; }

    if (!url.includes('crowdworks.jp')) continue;   // 外部の認証画面にいる間は待つ
    if (/\/login/.test(url)) continue;              // まだログインページ

    await sleep(1500);
    if (closed) break;

    let state;
    try { state = await checkLogin(page); } catch { continue; }

    if (state.loggedIn) {
      await saveLoginState(state);
      console.log('');
      console.log(`  ログインを確認しました${state.userName ? `（${state.userName}）` : ''}。`);
      console.log('  セッションは専用Chromeプロファイルに保存されました。以降の収集で自動的に使われます。');
      console.log('');
      console.log('  次: npm run refetch で会員限定公開の案件を取り直せます。');
      done = true;
      break;
    }
  }

  if (!done && !closed) {
    console.error(`${TIMEOUT_MIN}分待ちましたがログインを確認できませんでした。もう一度 npm run login を実行してください。`);
    process.exitCode = 1;
  }
} finally {
  await sleep(1200);
  await ctx.close().catch(() => {});
}
