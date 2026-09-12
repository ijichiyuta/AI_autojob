/**
 * スキル登録の内容。
 * level: 1初心者 / 2勉強中 / 3普通 / 4上級 / 5エキスパート
 * years: 半年未満 / 半年〜1年 / 1〜3年 / 3〜5年 / 5年以上（範囲選択）
 *
 * 経験年数は本人の申告なので、推測で盛らないこと。
 */
export interface SkillEntry {
  name: string;
  level: '1:初心者' | '2:勉強中' | '3:普通' | '4:上級' | '5:エキスパート';
  years: '半年未満' | '半年〜1年' | '1〜3年' | '3〜5年' | '5年以上';
  note?: string;
}

export const SKILLS: SkillEntry[] = [
  { name: 'Next.js', level: '4:上級', years: '1〜3年',
    note: 'App Router で業務システム・SaaS・LPを構築。Vercelでの本番運用まで。' },
  { name: 'TypeScript', level: '4:上級', years: '1〜3年',
    note: 'フロント・バックエンドとも型付きで実装しています。' },
  { name: 'React', level: '4:上級', years: '1〜3年' },
  { name: 'Supabase', level: '4:上級', years: '1〜3年',
    note: 'Postgres・Auth・Storage・RLS。マルチテナント構成の設計経験あり。' },
  { name: 'PostgreSQL', level: '3:普通', years: '1〜3年' },
  { name: 'Stripe', level: '4:上級', years: '1〜3年',
    note: 'サブスクリプションのほか、Stripe Connect による代行徴収を実装。' },
  { name: 'HTML', level: '4:上級', years: '1〜3年' },
  { name: 'CSS', level: '4:上級', years: '1〜3年', note: 'Tailwind CSS / レスポンシブ対応。' },
  { name: 'JavaScript', level: '4:上級', years: '1〜3年' },
  { name: 'LINE Messaging API', level: '3:普通', years: '1〜3年',
    note: '出席通知・請求通知・サポートBotの実装。' },
  { name: 'Flutter', level: '3:普通', years: '半年〜1年' },
  { name: 'Playwright', level: '3:普通', years: '半年〜1年',
    note: 'E2Eテストとデータ収集の自動化。' },
  { name: 'Claude API', level: '4:上級', years: '半年〜1年',
    note: '文章生成のほか、Webページからの情報抽出パイプラインに利用。' },
];
