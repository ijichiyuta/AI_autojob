import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: '案件応募エージェント',
  description: 'クラウドソーシング案件の収集・スコアリング',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/85 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/85">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3">
            <Link href="/" className="text-sm font-semibold tracking-tight">案件応募エージェント</Link>
            <div className="flex gap-4 text-sm text-neutral-600 dark:text-neutral-400">
              <Link href="/" className="hover:text-neutral-900 dark:hover:text-neutral-100">案件一覧</Link>
              <Link href="/queue" className="hover:text-neutral-900 dark:hover:text-neutral-100">承認キュー</Link>
              <Link href="/status" className="hover:text-neutral-900 dark:hover:text-neutral-100">稼働状況</Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-6">{children}</main>
      </body>
    </html>
  );
}
