import type { Page } from 'playwright';
import { db, raiseAlert } from '../db/client.js';
import { saveScreenshot } from './guard.js';

/** ログイン状態の判定に使う、認証が必要なページ */
const AUTH_PROBE_URL = 'https://crowdworks.jp/dashboard';
export const LOGIN_URL = 'https://crowdworks.jp/login';

export interface LoginState {
  loggedIn: boolean;
  userName: string | null;
  checkedAt: string;
}

/**
 * ログイン状態を確認する。
 * 未ログインだと /dashboard が /login にリダイレクトされる性質を使う。
 * 認証情報はコードにもDBにも持たない（Chromeプロファイル内に閉じる）。
 */
export async function checkLogin(page: Page): Promise<LoginState> {
  await page.goto(AUTH_PROBE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(1200);

  const url = page.url();
  const loggedIn = !/\/login/.test(url);

  let userName: string | null = null;
  if (loggedIn) {
    userName = await page.evaluate(() => {
      // ユーザー名が出ていそうな場所を順に当たる。取れなくても致命的ではない
      for (const sel of ['[class*="userName"]', '[class*="user_name"]', 'a[href*="/public/employees/"]', 'header [class*="name"]']) {
        const el = document.querySelector(sel);
        const t = (el?.textContent || '').trim();
        if (t && t.length < 40) return t;
      }
      return null;
    }).catch(() => null);
  }

  return { loggedIn, userName, checkedAt: new Date().toISOString() };
}

/** ログイン状態を settings に記録する（画面に出すため。認証情報そのものは保存しない） */
export async function saveLoginState(state: LoginState): Promise<void> {
  await db.from('settings').upsert({
    key: 'login_state',
    value: {
      platform: 'crowdworks',
      logged_in: state.loggedIn,
      user_name: state.userName,
      checked_at: state.checkedAt,
    },
  }, { onConflict: 'key' });
}

/**
 * 収集の前にログイン状態を確認する。
 * 落ちていたらアラートを出すが、公開案件の収集自体は続行できるので停止はしない。
 * 自動でログインし直すことはしない（要件定義 3.3: 自動突破は試みない）。
 */
export async function ensureLoginChecked(page: Page): Promise<LoginState> {
  const state = await checkLogin(page);
  await saveLoginState(state);

  if (!state.loggedIn) {
    const { data: prev } = await db.from('settings').select('value').eq('key', 'login_state_last_ok').maybeSingle();
    if (prev) {
      const shot = await saveScreenshot(page, 'login-lost');
      await raiseAlert('warn', 'login_lost',
        'クラウドワークスのログインが切れています。会員限定公開の案件が取得できません。`npm run login` で入り直してください',
        { screenshot: shot });
    }
  } else {
    await db.from('settings').upsert({
      key: 'login_state_last_ok',
      value: { checked_at: state.checkedAt, user_name: state.userName },
    }, { onConflict: 'key' });
  }

  return state;
}

/** 案件詳細が「会員限定公開」で読めなかったかどうか */
export function isMembersOnly(description: string | null): boolean {
  if (!description) return false;
  return /会員限定公開|詳細をご覧いただくには[^。]{0,10}ログイン/.test(description);
}
