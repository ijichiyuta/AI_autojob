'use client';

import { useState, useTransition } from 'react';
import { approveApplication, rejectApplication, unapproveApplication } from './actions';
import { yen, daysLeft, scoreTone, NG_LABELS, CATEGORY_LABELS, BREAKDOWN_LABELS } from '@/lib/format';

interface Props {
  row: Record<string, any>;
  rejectReasons: Array<{ id: string; label: string }>;
  slotsLeft: number;
}

export function QueueCard({ row, rejectReasons, slotsLeft }: Props) {
  const [text, setText] = useState<string>(row.proposal_text ?? '');
  const [price, setPrice] = useState<string>(String(row.proposed_price ?? ''));
  const [days, setDays] = useState<string>(String(row.proposed_days ?? ''));
  const [showJob, setShowJob] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(rejectReasons[0]?.id ?? 'other');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const approved = row.application_status === 'approved';
  const edited = text !== (row.proposal_text ?? '');
  const bd = (row.breakdown ?? {}) as Record<string, any>;
  const left = daysLeft(row.deadline);
  const hourly = Number(price) > 0 && row.estimated_hours > 0
    ? Math.round(Number(price) / row.estimated_hours) : null;

  function run(action: (fd: FormData) => Promise<{ ok: boolean; message: string }>, fd: FormData) {
    start(async () => {
      const r = await action(fd);
      setMsg({ ok: r.ok, text: r.message });
    });
  }

  return (
    <li className={`rounded-xl border bg-white p-5 dark:bg-neutral-900 ${
      approved ? 'border-emerald-400 dark:border-emerald-800' : 'border-neutral-200 dark:border-neutral-800'}`}>
      {/* ヘッダー */}
      <div className="flex items-start gap-3.5">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${scoreTone(row.total_score)}`}>
          {row.total_score ?? '—'}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-medium leading-snug">{row.title}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
              {CATEGORY_LABELS[row.category] ?? row.category}
            </span>
            <span className="font-medium text-neutral-800 dark:text-neutral-200">{yen(row.budget_min, row.budget_max)}</span>
            <span>応募 {row.applicant_count ?? '—'}人</span>
            <span>評価 {row.client_rating ?? '—'} / 実績 {row.client_order_count ?? '—'}件</span>
            {left != null && <span className={left <= 3 ? 'font-medium text-orange-600' : ''}>あと{left}日</span>}
            <a href={row.url} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline dark:text-sky-400">
              案件ページ ↗
            </a>
          </div>
          {row.warn_flags?.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(row.warn_flags as string[]).map((f) => (
                <span key={f} className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  ⚠ {NG_LABELS[f] ?? f}
                </span>
              ))}
            </div>
          )}
        </div>
        {approved && (
          <span className="shrink-0 rounded-md bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            承認済み・送信待ち
          </span>
        )}
      </div>

      {/* スコア内訳 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {['hourly_rate','client_quality','low_competition','specificity','genre_match','deadline_margin'].map((k) => {
          const v = bd[k] as { points?: number | null; max?: number } | undefined;
          if (!v) return null;
          return (
            <span key={k} className="rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
              {BREAKDOWN_LABELS[k]} <span className="font-semibold">{v.points ?? '—'}</span>/{v.max}
            </span>
          );
        })}
      </div>

      {/* 案件文（折りたたみ） */}
      <button
        type="button"
        onClick={() => setShowJob((s) => !s)}
        className="mt-3 text-xs text-neutral-500 underline-offset-2 hover:underline dark:text-neutral-400"
      >
        {showJob ? '案件文を閉じる' : '案件文を読む'}
      </button>
      {showJob && (
        <div className="mt-2 max-h-80 overflow-y-auto rounded-lg bg-neutral-50 p-3 text-xs leading-relaxed whitespace-pre-wrap dark:bg-neutral-950">
          {row.description ?? '（未取得）'}
        </div>
      )}

      {row.llm_notes && (
        <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          <strong>スコアの根拠:</strong> {row.llm_notes}
        </p>
      )}
      {row.proposal_notes && (
        <p className="mt-1.5 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
          <strong>価格・納期の根拠:</strong> {row.proposal_notes}
        </p>
      )}

      {/* 応募文 */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">応募文（編集できます）</label>
          <span className="text-[10px] text-neutral-400">{text.length}文字{edited && ' ・編集済み'}</span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={approved || pending}
          rows={12}
          className="w-full rounded-lg border border-neutral-300 bg-white p-3 font-mono text-xs leading-relaxed disabled:bg-neutral-50 disabled:text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:disabled:bg-neutral-900"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-4">
        <label className="text-xs">
          <span className="mb-1 block text-neutral-600 dark:text-neutral-400">提示価格（円）</span>
          <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} disabled={approved || pending}
            className="w-32 rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950" />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-neutral-600 dark:text-neutral-400">納期（日）</span>
          <input type="number" value={days} onChange={(e) => setDays(e.target.value)} disabled={approved || pending}
            className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950" />
        </label>
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          想定工数 {row.estimated_hours ?? '—'}h
          {hourly != null && <> ・ <strong className={hourly >= 3000 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
            時給 {hourly.toLocaleString()}円
          </strong></>}
        </div>
      </div>

      {msg && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${msg.ok
          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
          : 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300'}`}>{msg.text}</p>
      )}

      {/* 操作 */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        {!approved ? (
          <>
            <button
              type="button"
              disabled={pending || slotsLeft <= 0}
              onClick={() => {
                const fd = new FormData();
                fd.set('applicationId', row.application_id);
                fd.set('proposalText', text);
                fd.set('proposedPrice', price);
                fd.set('proposedDays', days);
                fd.set('originalText', row.proposal_text ?? '');
                run(approveApplication, fd);
              }}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-neutral-300 dark:disabled:bg-neutral-700"
            >
              {edited ? '編集して承認' : '承認'}
              <span className="ml-1.5 text-xs font-normal opacity-90">本日 残り{slotsLeft}枠</span>
            </button>
            <button type="button" disabled={pending} onClick={() => setRejecting((s) => !s)}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800">
              却下
            </button>
            {slotsLeft <= 0 && <span className="text-xs text-amber-700 dark:text-amber-400">本日の応募枠が埋まっています</span>}
          </>
        ) : (
          <button type="button" disabled={pending} onClick={() => {
            const fd = new FormData(); fd.set('applicationId', row.application_id);
            run(unapproveApplication, fd);
          }} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800">
            承認を取り消す（まだ送信されていません）
          </button>
        )}
      </div>

      {rejecting && !approved && (
        <div className="mt-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
          <p className="mb-2 text-xs font-medium">却下の理由（学習に使います）</p>
          <div className="flex flex-wrap gap-1.5">
            {rejectReasons.map((r) => (
              <button key={r.id} type="button" onClick={() => setReason(r.id)}
                className={`rounded-md px-2.5 py-1 text-xs ${reason === r.id
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'bg-white ring-1 ring-neutral-200 hover:bg-neutral-50 dark:bg-neutral-900 dark:ring-neutral-700'}`}>
                {r.label}
              </button>
            ))}
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="補足（任意）"
            className="mt-2 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-950" />
          <button type="button" disabled={pending} onClick={() => {
            const fd = new FormData();
            fd.set('applicationId', row.application_id); fd.set('reason', reason); fd.set('note', note);
            run(rejectApplication, fd);
          }} className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">
            却下する
          </button>
        </div>
      )}
    </li>
  );
}
