/**
 * LLM判定のインターフェース。
 *
 * 本人の方針で Claude API は当面使わない。判定は Claude Code（対話）側で行うため、
 * 現在の実装は「JSONに書き出して → 判定を書き戻す」手動プロバイダのみ。
 * 将来 API に切り替えるときは ApiProvider を足して差し替える。
 */

export interface LlmJudgment {
  id: string;
  /** 案件文が「AI使用不可」を意味しているか。正規表現と併せて二重化する */
  ai_prohibited: boolean;
  /** 要件の具体性 0〜100。曖昧なほどヒアリング工数が膨らむので低くする */
  specificity: number;
  /** 得意ジャンルとの一致度 0〜100 */
  genre_match: number;
  /** 想定工数（時間）。レビュー・やり取り込みの実工数 */
  estimated_hours: number;
  /** 判断の根拠。人間が見て納得できる粒度で */
  notes: string;
}

export interface LlmJobInput {
  id: string;
  title: string;
  category: string;
  raw_category: string | null;
  budget_min: number | null;
  budget_max: number | null;
  applicant_count: number | null;
  deadline: string | null;
  description: string | null;
}

export interface LlmProvider {
  name: string;
  judge(jobs: LlmJobInput[]): Promise<LlmJudgment[]>;
}
