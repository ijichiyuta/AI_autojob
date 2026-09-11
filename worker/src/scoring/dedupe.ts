/**
 * 同一クライアントが似た案件を大量出稿しているケースを検出する。
 * 放置すると一覧の上位が1社の連投で埋まり、レビューする意味がなくなる。
 */

export interface DedupeItem {
  id: string;
  title: string;
  clientName: string | null;
  totalScore: number | null;
}

export interface DedupeResult {
  /** 各クラスタの代表（最高スコア）以外のID */
  duplicateIds: Set<string>;
  /** id → 同じクラスタの件数 */
  clusterSize: Map<string, number>;
}

/** 記号・絵文字・装飾を落として比較用の文字列にする */
export function normalizeTitle(t: string): string {
  return t
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/[｜|【】\[\]（）()「」『』〜~・:：/／\-—_,.、。!！?？★☆◆■●]/g, ' ')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** 文字bigramのJaccard係数 */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const grams = (s: string) => {
    const g = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
    return g;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  for (const x of ga) if (gb.has(x)) inter++;
  return inter / (ga.size + gb.size - inter);
}

/**
 * threshold の根拠: 実データで同一クライアントの連投は 0.40〜0.48、
 * 無関係な案件同士は 0.02 前後。0.35 で明確に分離できる。
 */
export function findDuplicates(items: DedupeItem[], threshold = 0.35): DedupeResult {
  const byClient = new Map<string, DedupeItem[]>();
  for (const it of items) {
    if (!it.clientName) continue;
    const list = byClient.get(it.clientName) ?? [];
    list.push(it);
    byClient.set(it.clientName, list);
  }

  const duplicateIds = new Set<string>();
  const clusterSize = new Map<string, number>();

  for (const [, list] of byClient) {
    if (list.length < 2) continue;
    const norm = new Map(list.map((it) => [it.id, normalizeTitle(it.title)]));
    const assigned = new Set<string>();

    for (const seed of list) {
      if (assigned.has(seed.id)) continue;
      const cluster = [seed];
      assigned.add(seed.id);
      for (const other of list) {
        if (assigned.has(other.id)) continue;
        if (similarity(norm.get(seed.id)!, norm.get(other.id)!) >= threshold) {
          cluster.push(other);
          assigned.add(other.id);
        }
      }
      if (cluster.length < 2) continue;
      // 最高スコアを代表として残し、それ以外を重複とする
      cluster.sort((a, b) => (b.totalScore ?? -1) - (a.totalScore ?? -1));
      for (const it of cluster) clusterSize.set(it.id, cluster.length);
      for (const it of cluster.slice(1)) duplicateIds.add(it.id);
    }
  }

  return { duplicateIds, clusterSize };
}
