import { createClient } from '@supabase/supabase-js';
import { env } from '../env.js';

/** ワーカーは service_role で接続する（RLSをbypassする） */
export const db = createClient(env.supabaseUrl, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** settings テーブルから1件読む */
export async function getSetting<T>(key: string): Promise<T> {
  const { data, error } = await db.from('settings').select('value').eq('key', key).single();
  if (error) throw new Error(`settings.${key} の読み込みに失敗: ${error.message}`);
  return data.value as T;
}

export async function raiseAlert(
  level: 'info' | 'warn' | 'error',
  kind: string,
  message: string,
  meta: Record<string, unknown> = {},
) {
  await db.from('alerts').insert({ level, kind, message, meta });
  console.error(`[alert:${level}] ${kind} — ${message}`);
}
