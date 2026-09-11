import { chromium, type BrowserContext, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { env } from '../env.js';

export interface OpenOptions {
  /** 目視確認したいときは false（既定）。収集だけなら true でもよい */
  headless?: boolean;
}

/**
 * 専用プロファイルで Chrome を開く。
 * 普段使いのプロファイルは Chrome が排他ロックするため使わない。
 * 初回だけ `npm run login` で手動ログインすれば、以降はCookieが永続化される。
 */
export async function openContext(opts: OpenOptions = {}): Promise<BrowserContext> {
  mkdirSync(env.chromeUserDataDir, { recursive: true });

  try {
    return await chromium.launchPersistentContext(env.chromeUserDataDir, {
      channel: 'chrome',
      headless: opts.headless ?? false,
      viewport: null,
      locale: 'ja-JP',
      timezoneId: env.tz,
      args: ['--disable-blink-features=AutomationControlled'],
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('ProcessSingleton') || msg.includes('already in use')) {
      throw new Error(
        `Chromeプロファイルが他のプロセスに使われています。\n` +
        `  プロファイル: ${env.chromeUserDataDir}\n` +
        `  収集バッチが動いていないか確認してください（同時に2つは動かせません）。\n` +
        `  確認: ps aux | grep -i "chrome.*${env.chromeUserDataDir.split('/').pop()}"`,
      );
    }
    throw e;
  }
}

/** コンテキストの最初のページを取り出す（なければ新規に開く） */
export async function firstPage(ctx: BrowserContext): Promise<Page> {
  const pages = ctx.pages();
  return pages[0] ?? (await ctx.newPage());
}
