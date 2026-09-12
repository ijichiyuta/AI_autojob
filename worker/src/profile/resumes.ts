/**
 * ポートフォリオ・経歴の登録内容。
 * 制限: タイトル35文字 / 概要128文字（改行はCRLF換算）
 *
 * 期間は各リポジトリの履歴から推定した値。事実の申告なので、本人の確認を取ること。
 * BACKSTAGE案件（vad-dashboard / bsclip）は契約7条・11条により載せない。
 * スマスマ期待値ラボは元コンテンツの許可条件により載せない。
 */
export interface ResumeEntry {
  title: string;
  summary: string;
  startedYear: string; startedMonth: string;
  endedYear?: string; endedMonth?: string;
  refUrl?: string;
  details: string;
  company: string;
  role: string;
  skills: string;
  numMembers: string;
}

export const RESUMES: ResumeEntry[] = [
  {
    title: 'フリースクール向け 月謝集金SaaS',
    summary: 'LINEで出席を記録し月末にStripeで自動請求。未収金の自動督促と、複数校を分離して運用するマルチテナント構成まで実装しました。',
    startedYear: '2026', startedMonth: '4', endedYear: '2026', endedMonth: '7',
    details: `フリースクール・通信制サポート校向けの、変動月謝を自動で集金するSaaSです。

【解決した課題】
出欠を紙で管理し、月謝を手作業で集計して個別に請求していたため、月末に大きな事務作業が発生していました。欠席の多い月に減額する運用も手計算で、未収金の把握も属人化していました。

【実装した機能】
・QRコード／GPS／手動での出席記録（保護者・生徒はLINEから）
・出席日数に応じた月謝の自動計算と月末の締め処理
・Stripe Connect による請求と決済（施設ごとに入金先を分離）
・未収金の自動督促（LINE通知とリトライ）
・複数校のテナント分離（Supabase の RLS で実装）

【担当】
企画のヒアリングから要件定義・データ設計・実装・本番リリースまで一人で担当しました。実際のフリースクール1校で運用しています。`,
    company: 'スマートコネクト（自社開発）',
    role: '企画・要件定義・設計・実装・リリース（一人で担当）',
    skills: 'Next.js, TypeScript, Supabase, PostgreSQL, Stripe Connect, LINE Messaging API, Vercel',
    numMembers: '1',
  },
  {
    title: 'SNS投稿の転載支援サービス',
    summary: '投稿URLを貼るだけで別プラットフォーム向けに整形するWebサービス。サブスク課金・パスワードレス認証・サポートBotまで実装しました。',
    startedYear: '2026', startedMonth: '7', endedYear: '2026', endedMonth: '7',
    details: `SNSの投稿URLを貼ると、別プラットフォーム向けに本文と画像を整形して投稿できるWebサービスです。

【実装した機能】
・投稿URLからの本文・画像・投稿者情報の取得
・転載先プラットフォームの仕様に合わせた整形とプレビュー生成
・マジックリンクによるパスワードレスログイン
・Stripe によるサブスクリプション課金
・LINE を使ったサポートBot

【担当】
企画から実装まで一人で担当しました。認証・課金・外部API連携を含む一通りの構成を、個人開発で組み切っています。`,
    company: 'スマートコネクト（自社開発）',
    role: '企画・設計・実装（一人で担当）',
    skills: 'Next.js, TypeScript, Prisma, SQLite, Stripe, LINE Messaging API, Resend',
    numMembers: '1',
  },
  {
    title: 'サークル運営アプリ（Flutter）',
    summary: 'スポーツサークルの運営を1つにまとめたモバイルアプリ。イベントの出欠・集金・組み合わせの自動作成・レーティング管理を実装しました。',
    startedYear: '2026', startedMonth: '4', endedYear: '2026', endedMonth: '6',
    details: `スポーツサークルの運営業務をまとめたモバイルアプリです。

【解決した課題】
出欠の取りまとめ、参加費の集金、対戦組み合わせの作成が、いずれも幹事の手作業になっていました。

【実装した機能】
・イベントの作成と出欠管理
・参加費の集金管理
・実力差が偏らないよう配慮した対戦組み合わせの自動生成
・参加者のレーティング管理

【担当】
企画・設計・実装を一人で担当しました。`,
    company: 'スマートコネクト（自社開発）',
    role: '企画・設計・実装（一人で担当）',
    skills: 'Flutter, Dart, Supabase, PostgreSQL',
    numMembers: '1',
  },
  {
    title: '店舗向けホームページ制作（4業種）',
    summary: 'カフェ・美容室・料理教室・士業事務所を想定した制作サンプルです。業種ごとにターゲットを変え、問い合わせまでの導線を設計しました。',
    startedYear: '2026', startedMonth: '6', endedYear: '2026', endedMonth: '7',
    refUrl: 'https://smcn-jp.com',
    details: `中小店舗向けのホームページ制作サンプルです。実在の店舗ではなく、業種ごとの見せ方を検証するために制作した架空店舗のデモサイトです。

【制作したもの】
・カフェ … demo-cafe.smcn-jp.com
・美容室 … demo-salon.smcn-jp.com
・料理教室 … demo-cooking.smcn-jp.com
・士業事務所 … demo-tax.smcn-jp.com

【設計の考え方】
業種ごとに来訪者の目的が違うため、ファーストビューで見せる情報と、問い合わせ・予約までの導線を分けて設計しました。いずれもスマートフォンでの閲覧を前提にしたレスポンシブ対応です。

【担当】
構成・デザイン・実装を一人で担当しました。`,
    company: 'スマートコネクト（自社開発）',
    role: '構成・デザイン・実装（一人で担当）',
    skills: 'HTML, CSS, JavaScript, レスポンシブデザイン',
    numMembers: '1',
  },
];

/** サイト側は改行をCRLF(2文字)で数える */
const countAsSite = (s: string) => [...s].length + (s.match(/\n/g) ?? []).length;

export function validateResumes(): string[] {
  const errs: string[] = [];
  for (const r of RESUMES) {
    if (countAsSite(r.title) > 35) errs.push(`「${r.title}」タイトルが${countAsSite(r.title)}文字（上限35）`);
    if (countAsSite(r.summary) > 128) errs.push(`「${r.title}」概要が${countAsSite(r.summary)}文字（上限128）`);
  }
  return errs;
}
