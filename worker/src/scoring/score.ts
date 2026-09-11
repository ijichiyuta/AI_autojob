import type { Category } from '../adapters/types.js';

export interface Weights {
  hourly_rate: number;
  client_quality: number;
  low_competition: number;
  specificity: number;
  genre_match: number;
  deadline_margin: number;
}

export interface Thresholds {
  min_budget: number;
  min_hourly_rate: number;
  target_hourly_rate: number;
  daily_apply_limit: number;
  weekly_capacity_hours: number;
  max_concurrent_jobs: number;
}

export interface GenreProfile {
  strong: string[];
  moderate: string[];
  avoid: string[];
}

export interface ScoreInput {
  title: string;
  description: string | null;
  category: Category;
  rawCategory: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  applicantCount: number | null;
  clientRating: number | null;
  clientOrderCount: number | null;
  clientVerified: boolean | null;
  completionRate: number | null;
  deadline: string | null;
  /** LLMが埋める。未判定なら null */
  estimatedHours: number | null;
  llmSpecificity: number | null;
  llmGenreMatch: number | null;
}

export interface ScoreResult {
  totalScore: number;
  breakdown: Record<string, unknown>;
  hourlyRate: number | null;
  /** LLM未判定の項目を除いた重みの合計。100未満なら暫定スコア */
  coveredWeight: number;
}

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/** 予算の代表値。上限だけ大きい案件に引っ張られないよう中央寄りに取る */
export function budgetMidpoint(min: number | null, max: number | null): number | null {
  if (min == null && max == null) return null;
  if (min == null) return max;
  if (max == null) return min;
  return Math.round(min + (max - min) * 0.4);
}

/** 案件文の具体性の機械的な代理指標（LLM判定が入るまでの暫定値 0〜100） */
export function proxySpecificity(description: string | null): number {
  if (!description) return 0;
  const len = description.length;
  let s = clamp(len / 1200) * 50;
  if (/[・●■◆\-*]\s*\S/.test(description)) s += 12;          // 箇条書き
  if (/\d+\s*(円|万円)/.test(description)) s += 8;             // 金額の明記
  if (/(納期|締切|希望日|スケジュール)/.test(description)) s += 10;
  if (/(React|Next|Vue|PHP|Laravel|Python|WordPress|Supabase|AWS|TypeScript|Figma|Shopify)/i.test(description)) s += 12;
  if (/(要件|仕様|機能一覧|画面数|ページ数)/.test(description)) s += 8;
  return Math.round(clamp(s / 100) * 100);
}

/** 得意ジャンルとの一致度の機械的な代理指標（0〜100） */
export function proxyGenreMatch(input: ScoreInput, profile: GenreProfile): number {
  const text = `${input.title}\n${input.rawCategory ?? ''}\n${(input.description ?? '').slice(0, 2000)}`;
  const kw = {
    strong: /Next\.?js|React|TypeScript|Supabase|PostgreSQL|Stripe|SaaS|管理画面|業務効率化|LINE|スクレイピング|Playwright|API連携|Webアプリ|MVP/gi,
    moderate: /Flutter|WordPress|LP制作|ランディングページ|HTML|CSS|記事作成|ライティング|Vercel|Node\.?js/gi,
    avoid: /動画|切り抜き|Premiere|イラスト|ロゴ|Figmaデザインのみ|常駐|Swift|Kotlin|Unity|C\+\+/gi,
  };
  const s = (text.match(kw.strong) ?? []).length;
  const m = (text.match(kw.moderate) ?? []).length;
  const a = (text.match(kw.avoid) ?? []).length;
  const base = { dev: 55, web: 50, writing: 35, design: 15, other: 25, video: 0 }[input.category];
  return Math.round(clamp((base + s * 9 + m * 4 - a * 15) / 100) * 100);
}

export function scoreJob(
  input: ScoreInput,
  weights: Weights,
  th: Thresholds,
  profile: GenreProfile,
): ScoreResult {
  const breakdown: Record<string, unknown> = {};
  let earned = 0;
  let covered = 0;

  // ---- 時給換算（重み30）。想定工数はLLM判定が要るため、未判定なら対象外にする ----
  const mid = budgetMidpoint(input.budgetMin, input.budgetMax);
  let hourlyRate: number | null = null;
  if (mid != null && input.estimatedHours != null && input.estimatedHours > 0) {
    hourlyRate = Math.round(mid / input.estimatedHours);
    const lo = th.min_hourly_rate;
    const hi = th.target_hourly_rate * 2;
    const pts = clamp((hourlyRate - lo) / (hi - lo)) * weights.hourly_rate;
    earned += pts; covered += weights.hourly_rate;
    breakdown.hourly_rate = { value: hourlyRate, points: Math.round(pts * 10) / 10, max: weights.hourly_rate };
  } else if (input.estimatedHours != null && input.estimatedHours > 0 && mid == null) {
    // 予算が未提示（見積もり提示型）。時給を計算できないからといって分母から外すと、
    // 予算を明示した低単価案件より高いスコアになってしまう。
    // スコープも価格も未定であること自体がリスクなので、中立より低い値で採点する。
    const pts = 0.3 * weights.hourly_rate;
    earned += pts; covered += weights.hourly_rate;
    breakdown.hourly_rate = {
      value: null, points: Math.round(pts * 10) / 10, max: weights.hourly_rate,
      reason: '予算未提示（見積もり提示型）',
    };
  } else {
    breakdown.hourly_rate = { value: null, points: null, max: weights.hourly_rate, reason: 'LLMの工数推定待ち' };
  }

  // ---- クライアントの質（重み20）----
  {
    const w = weights.client_quality;
    // 評価: レビューなしは0点ではなく中立寄り（新規クライアント＝悪ではない）
    const rating = input.clientRating == null ? 0.5 : clamp(input.clientRating / 5);
    const orders = input.clientOrderCount ?? 0;
    const orderPt = orders === 0 ? 0 : orders < 5 ? 0.33 : orders < 20 ? 0.66 : 1;
    const verified = input.clientVerified ? 1 : 0;
    const completion = input.completionRate == null ? 0.5 : clamp(input.completionRate / 100);
    const pts = (rating * 0.4 + orderPt * 0.3 + verified * 0.15 + completion * 0.15) * w;
    earned += pts; covered += w;
    breakdown.client_quality = {
      rating: input.clientRating, orders, verified: input.clientVerified,
      completion: input.completionRate, points: Math.round(pts * 10) / 10, max: w,
    };
  }

  // ---- 応募数の少なさ（重み15）----
  {
    const w = weights.low_competition;
    const n = input.applicantCount ?? 999;
    const ratio = n === 0 ? 1 : n <= 2 ? 0.87 : n <= 5 ? 0.67 : n <= 10 ? 0.4 : n <= 20 ? 0.2 : 0;
    const pts = ratio * w;
    earned += pts; covered += w;
    breakdown.low_competition = { applicants: input.applicantCount, points: Math.round(pts * 10) / 10, max: w };
  }

  // ---- 案件文の具体性（重み15）。LLM未判定なら代理指標を使い、暫定であることを残す ----
  {
    const w = weights.specificity;
    const isProxy = input.llmSpecificity == null;
    const v = input.llmSpecificity ?? proxySpecificity(input.description);
    const pts = clamp(v / 100) * w;
    earned += pts; covered += w;
    breakdown.specificity = { value: v, proxy: isProxy, points: Math.round(pts * 10) / 10, max: w };
  }

  // ---- 得意ジャンルとの一致（重み10）----
  {
    const w = weights.genre_match;
    const isProxy = input.llmGenreMatch == null;
    const v = input.llmGenreMatch ?? proxyGenreMatch(input, profile);
    const pts = clamp(v / 100) * w;
    earned += pts; covered += w;
    breakdown.genre_match = { value: v, proxy: isProxy, points: Math.round(pts * 10) / 10, max: w };
  }

  // ---- 納期の余裕（重み10）----
  {
    const w = weights.deadline_margin;
    let ratio = 0.5;
    let days: number | null = null;
    if (input.deadline) {
      days = Math.ceil((new Date(input.deadline).getTime() - Date.now()) / 86_400_000);
      ratio = days < 0 ? 0 : days < 3 ? 0.1 : days < 8 ? 0.45 : days <= 14 ? 0.75 : days <= 30 ? 1 : 0.8;
    }
    const pts = ratio * w;
    earned += pts; covered += w;
    breakdown.deadline_margin = { daysLeft: days, points: Math.round(pts * 10) / 10, max: w };
  }

  // 未判定の項目がある間は、取得できた重みで割り戻して0〜100に正規化する
  const total = covered === 0 ? 0 : Math.round((earned / covered) * 100);
  breakdown._meta = {
    earned: Math.round(earned * 10) / 10,
    coveredWeight: covered,
    provisional: covered < 100,
    budgetMidpoint: mid,
  };

  return { totalScore: total, breakdown, hourlyRate, coveredWeight: covered };
}
