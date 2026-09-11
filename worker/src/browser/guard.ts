import type { Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from '../env.js';
import { raiseAlert } from '../db/client.js';

export class AbortRun extends Error {}

export interface Guardrails {
  page_delay_ms: [number, number];
  apply_interval_ms: [number, number];
  crawl_hours: number[];
  quiet_hours: { from: number; to: number };
  max_pages_per_query: number;
  abort_on_captcha: boolean;
  abort_on_login_fail: boolean;
}

/** 深夜1時〜7時は全処理を停止する */
export function isQuietHour(g: Guardrails, now = new Date()): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: env.tz, hour: 'numeric', hour12: false,
    }).format(now),
  );
  const { from, to } = g.quiet_hours;
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

const CAPTCHA_MARKERS = [
  'recaptcha', 'g-recaptcha', 'hcaptcha', 'cf-challenge', 'turnstile',
  'ロボットではありません', 'アクセスが制限', '認証が必要',
];

/**
 * CAPTCHA・アクセス制限を検知したら即座に停止する。
 * 自動突破は試みない（要件定義 3.3）。
 */
export async function assertNotBlocked(page: Page, context: string): Promise<void> {
  const html = (await page.content()).toLowerCase();
  const hit = CAPTCHA_MARKERS.find((m) => html.includes(m.toLowerCase()));
  if (!hit) return;

  const shot = await saveScreenshot(page, 'blocked');
  await raiseAlert('error', 'captcha_detected',
    `CAPTCHA/アクセス制限を検知したため停止しました（${context}）`,
    { marker: hit, url: page.url(), screenshot: shot });
  throw new AbortRun(`CAPTCHA検知: ${hit}`);
}

export async function saveScreenshot(page: Page, tag: string): Promise<string> {
  mkdirSync(env.screenshotDir, { recursive: true });
  const name = `${tag}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  const path = resolve(env.screenshotDir, name);
  await page.screenshot({ path, fullPage: false }).catch(() => {});
  return path;
}
