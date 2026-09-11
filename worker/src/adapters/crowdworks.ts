import type { Page } from 'playwright';
import type {
  JobAdapter, JobSummary, JobDetail, SearchOptions, Category, PaymentType,
} from './types.js';
import selectors from '../config/selectors.crowdworks.json' with { type: 'json' };
import { assertNotBlocked } from '../browser/guard.js';
import { randomDelay } from '../util/sleep.js';
import { raiseAlert } from '../db/client.js';

// ------------------------------------------------------------
// パース補助（Node側で動かす）
// ------------------------------------------------------------

/** "500,000円 〜 1,000,000円" / "50,000円" → [min, max] */
export function parseAmount(text: string | null): [number | null, number | null] {
  if (!text) return [null, null];
  const nums = [...text.matchAll(/([0-9][0-9,]*)\s*円/g)].map((m) =>
    Number(m[1]!.replace(/,/g, '')),
  );
  if (nums.length === 0) return [null, null];
  if (nums.length === 1) return [nums[0]!, nums[0]!];
  return [Math.min(...nums), Math.max(...nums)];
}

/** "2026年09月13日" → "2026-09-13" */
export function parseJaDate(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!m) return null;
  return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
}

/** "13 人" / "26 件" / "4.85" → 数値 */
export function parseNumber(text: string | null): number | null {
  if (!text) return null;
  const m = text.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function parsePaymentType(label: string | null): PaymentType | null {
  if (!label) return null;
  if (label.includes('固定報酬')) return 'fixed';
  if (label.includes('時間単価')) return 'hourly';
  if (label.includes('コンペ')) return 'competition';
  if (label.includes('タスク')) return 'task';
  return null;
}

/**
 * カテゴリを正規化する。サイト側のカテゴリ名だけでは実態とずれることがあるため
 * タイトルも併せて見る（例: カテゴリ「LP制作・デザイン」でも中身はInstagramバナー制作）。
 * video は BACKSTAGE競業避止（違約金246万）の絶対NG。最優先で判定する。
 */
export function normalizeCategory(raw: string | null, title = ''): Category {
  const cat = raw ?? '';
  const all = `${title}\n${cat}`;

  // 「音声AI開発」のような開発案件を動画扱いしないよう、音まわりは制作文脈に限定する
  if (/動画|映像|撮影|ナレーション|音響|ボイス(オーバー|録音)|音声(収録|編集|制作|素材)|YouTube|ユーチューブ|アニメーション|モーショングラフィック|切り?抜き|リール|TikTok|Premiere|AfterEffects/i.test(all)) {
    return 'video';
  }
  // 制作物がデザイン単体のもの。カテゴリがLP制作でも実態はバナーということがある
  if (/(バナー|ロゴ|サムネイル|アイコン|チラシ|名刺|パンフレット|ポスター|イラスト|似顔絵|キャラクターデザイン|投稿画像|フィード投稿|投稿デザイン|投稿制作|画像作成|画像制作)/.test(title)
      && !/(コーディング|実装|開発|システム|サイト制作|ホームページ制作)/.test(all)) {
    return 'design';
  }
  if (/システム|アプリ|開発|プログラ|データベース|サーバー|ネットワーク|スクレイピング|VBA|マクロ|AWS|CRM|SFA|要件定義|保守|運用|テスト|検証|デバッグ|セキュリティ|メタバース|API/.test(cat)) {
    return 'dev';
  }
  if (/サイト|ホームページ|HP|LP|ランディング|Web制作|WordPress|コーディング|EC|ネットショップ|レスポンシブ|Webデザイン/i.test(cat)) {
    return 'web';
  }
  if (/ライティング|記事|執筆|ブログ|コピー|シナリオ|文章|校正|リライト|翻訳|編集/.test(cat)) {
    return 'writing';
  }
  if (/デザイン|ロゴ|バナー|イラスト|Figma|チラシ|名刺|パッケージ/.test(cat)) {
    return 'design';
  }
  return 'other';
}

// ------------------------------------------------------------
// アダプタ
// ------------------------------------------------------------

export class CrowdWorksAdapter implements JobAdapter {
  readonly platform = 'crowdworks' as const;
  /** セレクタ取得の連続失敗回数。閾値を超えたら停止する */
  private consecutiveEmpty = 0;

  constructor(private page: Page) {}

  private listUrl(group: string, pageNo: number): string {
    const path = selectors.searchPath.replace('{group}', group);
    const u = new URL(selectors.baseUrl + path);
    if (pageNo > 1) u.searchParams.set(selectors.pageParam, String(pageNo));
    return u.toString();
  }

  async search(opts: SearchOptions): Promise<JobSummary[]> {
    if (Object.keys(selectors.blockedGroups).includes(opts.group)) {
      throw new Error(`group "${opts.group}" は収集禁止（競業避止）`);
    }

    const all: JobSummary[] = [];
    const seen = new Set<string>();

    for (let p = 1; p <= opts.maxPages; p++) {
      const url = this.listUrl(opts.group, p);
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await this.page.waitForTimeout(1500);
      await assertNotBlocked(this.page, `一覧 ${opts.group} p${p}`);

      const raw = await this.page.evaluate((sel) => {
        return Array.from(document.querySelectorAll(sel.titleLink))
          .map((a) => {
            const href = a.getAttribute('href') || '';
            const card = a.closest('li') || a.parentElement;
            if (!card) return null;
            const pick = Array.from(card.querySelectorAll(sel.amountValue))
              .map((n) => (n.textContent || '').trim());
            return {
              href,
              title: (a.textContent || '').trim(),
              rawCategory: (card.querySelector(sel.category)?.textContent || '').trim() || null,
              description: (card.querySelector(sel.description)?.textContent || '').trim() || null,
              paymentLabel: (card.querySelector(sel.paymentLabel)?.textContent || '').trim() || null,
              amounts: pick,
              applicant: (card.querySelector(sel.applicantCount)?.textContent || '').trim() || null,
              clientName: (card.querySelector(sel.clientLink + ':not(:has(img))')?.textContent || '').trim() || null,
              postedAt: card.querySelector(sel.postedAt)?.getAttribute('datetime') || null,
              absoluteDate: (card.querySelector(sel.absoluteDate)?.textContent || '').trim() || null,
            };
          })
          .filter((x) => x !== null);
      }, selectors.list);

      // セレクタ破損の検知
      if (raw.length === 0) {
        this.consecutiveEmpty++;
        if (this.consecutiveEmpty >= 2) {
          await raiseAlert('error', 'selector_broken',
            `クラウドワークスの一覧から案件を1件も取得できませんでした（${opts.group} p${p}）。DOM変更の可能性`,
            { url, selector: selectors.list.titleLink });
          throw new Error('セレクタ破損の可能性があるため停止しました');
        }
      } else {
        this.consecutiveEmpty = 0;
      }

      for (const r of raw) {
        const m = r.href.match(new RegExp(selectors.jobUrlPattern));
        if (!m) continue;
        const externalId = m[1]!;
        if (seen.has(externalId)) continue;
        seen.add(externalId);

        const amountText = r.amounts.length ? r.amounts.join('円 〜 ') + '円' : null;
        const [min, max] = parseAmount(amountText);

        all.push({
          platform: 'crowdworks',
          externalId,
          url: selectors.baseUrl + r.href,
          title: r.title,
          descriptionExcerpt: r.description,
          rawCategory: r.rawCategory,
          category: normalizeCategory(r.rawCategory, r.title),
          paymentType: parsePaymentType(r.paymentLabel),
          budgetMin: min,
          budgetMax: max,
          applicantCount: parseNumber(r.applicant),
          clientName: r.clientName,
          postedAt: r.postedAt,
          deadline: null, // 一覧は「9月13日まで」で年がないため詳細で取る
        });
      }

      opts.onPage?.(p, raw.length);
      if (raw.length === 0) break;
      if (p < opts.maxPages) await randomDelay([3000, 8000]);
    }

    return all;
  }

  async fetchDetail(url: string): Promise<JobDetail> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await this.page.waitForTimeout(1200);
    await assertNotBlocked(this.page, `詳細 ${url}`);

    const d = await this.page.evaluate((sel) => {
      // th/td・dt/dd をラベル文字列で引く（クラス名に依存しない）
      const table: Record<string, string> = {};
      Array.from(document.querySelectorAll('th')).forEach((th) => {
        const key = (th.textContent || '').trim();
        const td = th.nextElementSibling;
        if (key && td) table[key] = (td.textContent || '').replace(/\s+/g, ' ').trim();
      });
      Array.from(document.querySelectorAll('dt')).forEach((dt) => {
        const key = (dt.textContent || '').trim();
        const dd = dt.nextElementSibling;
        if (key && dd) table[key] = (dd.textContent || '').replace(/\s+/g, ' ').trim();
      });

      // 報酬は th のラベル自体が「固定報酬制」等になっている
      let paymentLabel: string | null = null;
      let amountText: string | null = null;
      Array.from(document.querySelectorAll('th')).forEach((th) => {
        const t = (th.textContent || '').trim();
        if (!paymentLabel && /固定報酬制|時間単価制|コンペ|タスク/.test(t)) {
          paymentLabel = t;
          amountText = (th.nextElementSibling?.textContent || '').replace(/\s+/g, ' ').trim();
        }
      });

      // 本文は見出しを除いてから取る
      let description: string | null = null;
      const secEl = document.querySelector(sel.descriptionSection);
      if (secEl) {
        const clone = secEl.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('h1,h2,h3,h4').forEach((h) => h.remove());
        description = clone.innerText.trim() || null;
      }

      const clientEl = document.querySelector(sel.clientSection) as HTMLElement | null;
      const clientText = clientEl ? clientEl.innerText : document.body.innerText;

      return {
        table,
        paymentLabel,
        amountText,
        description,
        clientName: (document.querySelector(sel.clientName)?.textContent || '').trim() || null,
        identityVerified:
          clientText.includes(sel.verifiedText) ||
          document.querySelector(sel.identityVerifiedFallback) !== null,
        ruleChecked: document.querySelector(sel.ruleCheck) !== null,
      };
    }, selectors.detail);

    if (!d.description) {
      await raiseAlert('warn', 'selector_degraded',
        `詳細ページの本文が取得できませんでした: ${url}`,
        { selector: selectors.detail.descriptionSection });
    }

    const t = d.table;
    const L = selectors.detail.labels;
    const [min, max] = parseAmount(d.amountText);

    return {
      description: d.description,
      budgetMin: min,
      budgetMax: max,
      paymentType: parsePaymentType(d.paymentLabel),
      deadline: parseJaDate(t[L.deadline] ?? null),
      postedAt: parseJaDate(t[L.postedAt] ?? null),
      applicantCount: parseNumber(t[L.applicantCount] ?? null),
      contractedCount: parseNumber(t[L.contractedCount] ?? null),
      recruitCount: parseNumber(t[L.recruitCount] ?? null),
      clientName: d.clientName,
      clientRating: parseNumber(t[L.clientRating] ?? null),
      clientOrderCount: parseNumber(t[L.clientOrderCount] ?? null),
      clientVerified: d.identityVerified,
      completionRate: parseNumber(t[L.completionRate] ?? null),
    };
  }
}
