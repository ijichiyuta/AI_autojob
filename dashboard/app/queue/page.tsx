import { serverDb } from '@/lib/supabase';
import { QueueCard } from './queue-card';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  const db = serverDb();

  const [{ data: rows }, { data: reasonRow }, { data: guardRow }, { data: usedToday }] = await Promise.all([
    db.from('approval_queue').select('*')
      .in('application_status', ['pending_apply', 'approved'])
      .order('total_score', { ascending: false, nullsFirst: false }),
    db.from('settings').select('value').eq('key', 'reject_reasons').single(),
    db.from('settings').select('value').eq('key', 'apply_guardrails').single(),
    db.rpc('applied_count_today'),
  ]);

  const reasons = (reasonRow?.value as Array<{ id: string; label: string }>) ?? [];
  const limit = (guardRow?.value as { daily_limit?: number })?.daily_limit ?? 10;
  const sent = (usedToday as number) ?? 0;
  const queued = (rows ?? []).filter((r) => r.application_status === 'approved').length;
  const slotsLeft = Math.max(0, limit - sent - queued);
  const pending = (rows ?? []).filter((r) => r.application_status === 'pending_apply');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">承認キュー</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          本日 <strong className="text-neutral-900 dark:text-neutral-100">{sent} / {limit}</strong> 件送信済み
          {queued > 0 && <> ・送信待ち {queued}件</>}
          ・残り <strong className={slotsLeft > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'}>{slotsLeft}</strong> 枠
        </p>
      </div>

      <p className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
        ここで承認したものだけがワーカーの送信対象になります。承認しない限り送信されません。
        送信は5〜30分の間隔を空けて順次行われ、深夜1〜7時は止まります。
      </p>

      {(rows?.length ?? 0) === 0 && (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
          承認待ちの応募はありません。<br />
          <code className="mt-2 inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-xs dark:bg-neutral-800">
            npm run proposal:export
          </code>
          {' '}で応募文の作成対象を書き出してください。
        </p>
      )}

      {pending.length > 0 && (
        <ul className="space-y-4">
          {pending.map((r) => (
            <QueueCard key={r.application_id} row={r} rejectReasons={reasons} slotsLeft={slotsLeft} />
          ))}
        </ul>
      )}

      {queued > 0 && (
        <>
          <h2 className="pt-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            承認済み・送信待ち（{queued}件）
          </h2>
          <ul className="space-y-4">
            {(rows ?? []).filter((r) => r.application_status === 'approved').map((r) => (
              <QueueCard key={r.application_id} row={r} rejectReasons={reasons} slotsLeft={slotsLeft} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
