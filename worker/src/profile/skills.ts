/**
 * スキル登録の内容。
 *
 * スキル名は**クラウドワークス側のマスタから選ぶ方式**（jQuery UI のオートコンプリート）。
 * 自由入力すると「スキルを選択してください。」で弾かれる。
 * 実測でマスタに無かったもの: Next.js / Supabase / Stripe / Flutter / Playwright / Tailwind / Vercel / SaaS
 * → 実在する近い名前で登録し、実際に使っている技術は note に書く。
 *
 * level: 1初心者 / 2勉強中 / 3普通 / 4上級 / 5エキスパート
 * years: 半年未満 / 半年〜1年 / 1〜3年 / 3〜5年 / 5年以上
 * note: 128文字以内
 */
export interface SkillEntry {
  name: string;
  level: '1:初心者' | '2:勉強中' | '3:普通' | '4:上級' | '5:エキスパート';
  years: '半年未満' | '半年〜1年' | '1〜3年' | '3〜5年' | '5年以上';
  note?: string;
}

export const SKILLS: SkillEntry[] = [
  // --- 登録済み（再実行しても既存判定でスキップされる）---
  { name: 'TypeScript', level: '4:上級', years: '1〜3年',
    note: 'フロント・バックエンドとも型付きで実装しています。' },
  { name: 'React', level: '4:上級', years: '1〜3年' },
  { name: 'PostgreSQL', level: '3:普通', years: '1〜3年' },
  { name: 'HTML', level: '4:上級', years: '1〜3年' },
  { name: 'CSS', level: '4:上級', years: '1〜3年', note: 'Tailwind CSS / レスポンシブ対応。' },
  { name: 'JavaScript', level: '4:上級', years: '1〜3年' },

  // --- 追加分 ---
  { name: 'Webアプリケーション開発', level: '4:上級', years: '1〜3年',
    note: 'Next.js（App Router）+ Supabase が主戦場です。要件定義から本番リリースまで一人で対応します。' },
  { name: '決済システム', level: '4:上級', years: '1〜3年',
    note: 'Stripe のサブスクリプションと、Stripe Connect による代行徴収を実装しています。' },
  { name: 'データベース', level: '3:普通', years: '1〜3年',
    note: 'Supabase（PostgreSQL）。RLSを使ったマルチテナント構成の設計経験があります。' },
  { name: 'node.js', level: '3:普通', years: '1〜3年' },
  { name: '要件定義', level: '4:上級', years: '1〜3年',
    note: '課題のヒアリングから機能の切り出し、優先順位づけまで。要件が固まっていない状態からご相談いただけます。' },
  { name: 'Webサイト制作', level: '4:上級', years: '1〜3年' },
  { name: 'レスポンシブWebデザイン', level: '4:上級', years: '1〜3年' },
  { name: 'LINE', level: '3:普通', years: '1〜3年',
    note: 'Messaging API を使った通知・出席記録・サポートBotの実装。' },
  { name: 'スクレイピング', level: '3:普通', years: '半年〜1年',
    note: 'Playwright によるデータ収集の自動化とE2Eテスト。' },
  { name: 'Dart', level: '3:普通', years: '半年〜1年', note: 'Flutter でのモバイルアプリ開発。' },
  { name: 'モバイルアプリ開発', level: '3:普通', years: '半年〜1年', note: 'Flutter / Dart。' },
  { name: 'Claude', level: '4:上級', years: '半年〜1年',
    note: '文章生成のほか、Webページからの情報抽出パイプラインに利用しています。' },
];

/** note は128文字以内。改行はCRLF換算 */
export function validateSkills(): string[] {
  return SKILLS.filter((s) => s.note && [...s.note].length > 128)
    .map((s) => `${s.name} の備考が${[...s.note!].length}文字（上限128）`);
}
