import { createClient } from '@supabase/supabase-js';

/**
 * サーバー専用のSupabaseクライアント。
 * service_role キーを使うのでクライアントコンポーネントからは絶対に呼ばないこと。
 */
export function serverDb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
