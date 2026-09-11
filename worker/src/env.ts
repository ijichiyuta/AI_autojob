import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '../..');

config({ path: resolve(ROOT, '.env.local'), quiet: true });

function need(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`環境変数 ${key} が未設定です（${ROOT}/.env.local を確認）`);
  return v;
}

export const env = {
  supabaseUrl: need('SUPABASE_URL'),
  serviceRoleKey: need('SUPABASE_SERVICE_ROLE_KEY'),
  chromeUserDataDir: resolve(ROOT, process.env.CHROME_USER_DATA_DIR ?? './.chrome-profile'),
  tz: process.env.TZ ?? 'Asia/Tokyo',
  screenshotDir: resolve(ROOT, 'screenshots'),
  logDir: resolve(ROOT, 'logs'),
};
