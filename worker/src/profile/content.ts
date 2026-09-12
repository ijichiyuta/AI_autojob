/**
 * クラウドワークスのプロフィールに載せる内容。
 *
 * 守ること:
 * - 本業（日本ガイシ）を推測させる記述を入れない
 * - BACKSTAGE業務の成果物（vad-dashboard / bsclip）に触れない（契約7条・11条）
 * - スマスマ期待値ラボに触れない（元コンテンツの許可条件）
 * - 実名・個人のGitHubを出さない。屋号「スマートコネクト」で統一する
 * - AI活用を明記する（要件定義 5.3）
 *
 * サイト側の文字数制限（実測）:
 *   表示名 12文字 / ひとことアピール 35文字 / 自己PR 1024文字
 */

export const LIMITS = { displayName: 12, simple: 35, introduction: 1024 } as const;

/** 「スマートコネクトウェブ開発」は13文字で入らないため10文字に収めた */
export const DISPLAY_NAME = 'スマートコネクト開発';

export const SIMPLE_INTRODUCTION = 'Next.js×Supabaseで決済まで動くWebアプリを作ります';

export const INTRODUCTION = `スマートコネクト（愛知県名古屋市）です。
Webアプリ・業務システムの開発と、ホームページ・LP制作をしています。
→ https://smcn-jp.com

■ できること
ヒアリングから要件定義・設計・実装・決済の組み込み・本番リリースまで一人で対応します。
要件が固まっていない段階からご相談いただけます。

・Webアプリ / 業務システム … Next.js（TypeScript）+ Supabase（PostgreSQL）
・決済 … Stripe / Stripe Connect（サブスクリプション、代行徴収）
・外部連携 … LINE公式アカウント、各種API、データ収集（Playwright）
・ホームページ / LP … HTML・CSS・JavaScript、レスポンシブ対応
・モバイルアプリ … Flutter

■ 作ったもの
・フリースクール・通信制高校向け 月謝集金SaaS（運用中）
　LINEで出席を記録 → 月末に自動請求（Stripe）→ 未収金は自動で督促。複数校のテナント分離まで対応。
　手作業だった出欠管理と集金を、まるごと自動化しました。→ https://app.smcn-jp.com

・SNS投稿の転載支援サービス
　投稿URLから別プラットフォーム向けに整形。課金・ログイン・サポートBotまで実装。

・サークル運営アプリ（Flutter）／ 店舗向けホームページ
　前者は出欠・集金・組み合わせ作成。後者はカフェ・美容室・料理教室・士業事務所のデモサイトを
　公開しています（実在の店舗ではなく制作サンプルです）→ https://smcn-jp.com

■ 開発にAIを使っています
設計・実装・テストでAI（Claude）を活用し、短納期・低コストでお出しします。
成果物は必ず自分で動作確認したうえで納品します。AIの使用が難しい案件はお受けしません。

■ ご依頼にあたって
・料金の目安：LP 30,000円〜／ホームページ 50,000円〜／Webアプリは規模に応じてお見積もり
　（自社サイトの料金は月額保守込みのプラン価格です。こちらは単発制作のため上記が目安です）
・稼働：週20〜30時間
・平日の日中は返信が遅くなることがあります。夜間・土日は概ね当日中にお返しします。`;

/**
 * メインの職種カテゴリは1つしか選べない（サイトのヘルプに明記）。
 * カテゴリをまたぐ職種（システムエンジニア × UI・UXデザイナー）は同時に持てず、
 * 幅は「仕事カテゴリ」と「スキル登録」で出す仕様。
 */
export const OCCUPATION_PRESETS: Record<string, string[]> = {
  web_production: ['2', '9', '46'],          // プログラマ(Web) / HTMLコーダー / UI・UXデザイナー
  engineer: ['1', '4', '98', '50'],          // SE / プログラマ(PG) / AIエンジニア / 業務アプリ開発者
};

/** 個人アカウントの露出を避けるため空にする */
export const CLEAR_FIELDS = { github: '' };

/**
 * サイト側は改行を CRLF（2文字）として数える。
 * 素の文字数だけで判定すると通ったつもりで弾かれるので、改行分を足して数える。
 */
export function countAsSite(s: string): number {
  return [...s].length + (s.match(/\n/g) ?? []).length;
}

/** 送信前に文字数を検査する。超えるとサイト側でフォームごと弾かれ、何も保存されない */
export function validate(): string[] {
  const errs: string[] = [];
  const d = countAsSite(DISPLAY_NAME);
  const si = countAsSite(SIMPLE_INTRODUCTION);
  const it = countAsSite(INTRODUCTION);
  if (d > LIMITS.displayName) errs.push(`表示名が${d}文字（上限${LIMITS.displayName}）`);
  if (si > LIMITS.simple) errs.push(`ひとことアピールが${si}文字（上限${LIMITS.simple}）`);
  if (it > LIMITS.introduction) errs.push(`自己PRが${it}文字（上限${LIMITS.introduction}）`);
  return errs;
}
