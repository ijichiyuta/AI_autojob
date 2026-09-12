import type { Category, PaymentType } from '../adapters/types.js';

export interface NgRule {
  id: string;
  type: 'ng' | 'warn';
  label: string;
  note?: string;
  patterns: string[];
}

export interface NgResult {
  ngFlags: string[];
  warnFlags: string[];
  /** どのルールのどのパターンに当たったか（デバッグ・説明用） */
  hits: Array<{ id: string; label: string; pattern: string; excerpt: string }>;
}

/** 正規表現をコンパイルしてキャッシュする */
const cache = new Map<string, RegExp>();
function compile(p: string): RegExp {
  let re = cache.get(p);
  if (!re) {
    re = new RegExp(p, 'i');
    cache.set(p, re);
  }
  return re;
}

/**
 * 正規表現によるNG判定。
 * LLM判定と併せて二重化し、どちらか一方でも該当したら除外する（要件定義 8章）。
 */
export function detectNg(
  rules: NgRule[],
  input: {
    title: string;
    description: string | null;
    rawCategory: string | null;
    category: Category;
    paymentType?: PaymentType | null;
  },
): NgResult {
  const text = [input.title, input.rawCategory ?? '', input.description ?? ''].join('\n');
  const ngFlags: string[] = [];
  const warnFlags: string[] = [];
  const hits: NgResult['hits'] = [];

  // カテゴリ単位の絶対NG。BACKSTAGE競業避止（違約金246万）
  if (input.category === 'video') {
    ngFlags.push('video_noncompete');
    hits.push({
      id: 'video_noncompete',
      label: '動画・切り抜き（BS競業避止 / 違約金246万）',
      pattern: 'category=video',
      excerpt: input.rawCategory ?? '',
    });
  }

  // コンペ・タスクはサイト側の報酬形態で判定できる。正規表現より確実なのでこちらを使う
  if (input.paymentType === 'competition') {
    ngFlags.push('competition');
    hits.push({
      id: 'competition',
      label: 'コンペ形式（落選すると報酬ゼロ）',
      pattern: 'payment_type=competition',
      excerpt: '報酬形態がコンペ',
    });
  }

  for (const rule of rules) {
    for (const p of rule.patterns) {
      const m = text.match(compile(p));
      if (!m) continue;
      const at = m.index ?? 0;
      hits.push({
        id: rule.id,
        label: rule.label,
        pattern: p,
        excerpt: text.slice(Math.max(0, at - 30), at + m[0].length + 30).replace(/\s+/g, ' '),
      });
      if (rule.type === 'ng') { if (!ngFlags.includes(rule.id)) ngFlags.push(rule.id); }
      else { if (!warnFlags.includes(rule.id)) warnFlags.push(rule.id); }
      break; // 同じルール内で複数当たっても1回にまとめる
    }
  }

  return { ngFlags, warnFlags, hits };
}
