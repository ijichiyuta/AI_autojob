'use server';

import { revalidatePath } from 'next/cache';
import { serverDb } from '@/lib/supabase';

/**
 * 承認。ここで status を approved にすると、ワーカーの送信対象になる。
 * 送信そのものはワーカーが間隔を空けて行う（要件定義 3.3）。
 */
export async function approveApplication(formData: FormData) {
  const id = String(formData.get('applicationId'));
  const text = String(formData.get('proposalText') ?? '').trim();
  const price = Number(formData.get('proposedPrice'));
  const days = Number(formData.get('proposedDays'));
  const original = String(formData.get('originalText') ?? '');

  if (!text) return { ok: false, message: '応募文が空です' };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, message: '提示価格が不正です' };
  if (!Number.isFinite(days) || days <= 0) return { ok: false, message: '納期が不正です' };

  const db = serverDb();

  // 当日の上限を超えていないか（承認の時点でも見る。送信時にも再確認する）
  const { data: limitRow } = await db.from('settings').select('value').eq('key', 'apply_guardrails').single();
  const limit = (limitRow?.value as { daily_limit?: number })?.daily_limit ?? 10;
  const { data: usedToday } = await db.rpc('applied_count_today');
  const { count: queued } = await db.from('applications')
    .select('*', { count: 'exact', head: true }).eq('status', 'approved');
  if ((usedToday ?? 0) + (queued ?? 0) >= limit) {
    return { ok: false, message: `本日の応募枠が埋まっています（送信済み${usedToday} + 送信待ち${queued} / 上限${limit}）` };
  }

  const { error } = await db.from('applications').update({
    status: 'approved',
    proposal_text: text,
    proposed_price: price,
    proposed_days: days,
    edited_by_human: text !== original,
    approved_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'pending_apply');

  if (error) return { ok: false, message: error.message };
  revalidatePath('/queue');
  return { ok: true, message: '承認しました。ワーカーが順次送信します' };
}

/** 却下。理由は学習用に残す（要件定義 4.3） */
export async function rejectApplication(formData: FormData) {
  const id = String(formData.get('applicationId'));
  const reason = String(formData.get('reason') ?? 'other');
  const note = String(formData.get('note') ?? '').trim() || null;

  const db = serverDb();
  const { data: app, error } = await db.from('applications').update({
    status: 'rejected',
    rejected_reason: reason,
    rejected_note: note,
  }).eq('id', id).eq('status', 'pending_apply').select('job_id').single();

  if (error) return { ok: false, message: error.message };
  if (app) await db.from('jobs').update({ status: 'ng_filtered' }).eq('id', app.job_id);
  revalidatePath('/queue');
  return { ok: true, message: '却下しました' };
}

/** 承認を取り消して承認待ちに戻す（まだ送信されていないものだけ） */
export async function unapproveApplication(formData: FormData) {
  const id = String(formData.get('applicationId'));
  const db = serverDb();
  const { error } = await db.from('applications')
    .update({ status: 'pending_apply', approved_at: null })
    .eq('id', id).eq('status', 'approved');
  if (error) return { ok: false, message: error.message };
  revalidatePath('/queue');
  return { ok: true, message: '承認を取り消しました' };
}
