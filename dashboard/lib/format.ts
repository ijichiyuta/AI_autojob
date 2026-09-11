export const NG_LABELS: Record<string, string> = {
  ai_prohibited: 'AI使用不可',
  video_noncompete: '動画・切り抜き（契約違反）',
  onsite: '常駐・出社',
  capacity_excess: '稼働量オーバー',
  external_application: '外部サイトへの応募誘導',
  unpaid_test: '無償テスト課題',
  suspicious: '規約外・高リスク',
  budget_below_min: '予算が下限未満',
  vague_requirements: '要件が曖昧',
  revision_unlimited: '修正回数の上限なし',
  monthly_retainer: '月額・継続契約の可能性',
  high_competition: '応募多数',
  design_only: 'デザイン単体',
  low_value_high_competition: '低単価×応募多数',
  duplicate_posting: '同一クライアントの連投',
  cluster_representative: '連投の代表',
  ai_prohibited_llm: 'AI使用不可（LLM判定）',
  side_job_prohibited: '副業不可・専業限定',
  business_hours: '平日日中の稼働が前提',
  location_restricted: '地域限定',
  chat_funnel: '報酬未提示のチャット誘導',
  face_required: '顔出し必須',
  budget_mismatch: '掲載予算と実報酬が乖離',
  price_unstated: '予算未提示',
  login_required: '会員限定（要ログイン）',
};

export const CATEGORY_LABELS: Record<string, string> = {
  dev: 'システム開発', web: 'Web制作', writing: 'ライティング',
  design: 'デザイン', video: '動画', other: 'その他',
};

export const BREAKDOWN_LABELS: Record<string, string> = {
  hourly_rate: '時給換算',
  client_quality: 'クライアント',
  low_competition: '応募の少なさ',
  specificity: '具体性',
  genre_match: 'ジャンル一致',
  deadline_margin: '納期の余裕',
};

export function yen(min: number | null, max: number | null): string {
  if (min == null && max == null) return '—';
  const f = (n: number) => `${n.toLocaleString('ja-JP')}円`;
  if (min != null && max != null && min !== max) return `${f(min)} 〜 ${f(max)}`;
  return f((min ?? max)!);
}

export function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
}

export function scoreTone(score: number | null): string {
  if (score == null) return 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300';
  if (score >= 75) return 'bg-emerald-600 text-white';
  if (score >= 60) return 'bg-sky-600 text-white';
  if (score >= 45) return 'bg-amber-500 text-white';
  return 'bg-neutral-400 text-white dark:bg-neutral-600';
}

export function relTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60_000))}分前`;
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}
