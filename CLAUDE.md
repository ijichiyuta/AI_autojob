# 案件応募・納品エージェント

クラウドソーシング案件を自動収集・スコアリングし、応募文と納品物をAIが生成する。
**応募と納品の確定は必ず人間が承認する。自動送信はしない。**

要件定義は `docs/requirements.md`。本人の前提（プロフィール・家計・契約）は `~/.superset/projects/meeeee/`。

---

## 絶対に守ること

1. **動画・切り抜き系の案件には応募しない。**
   BACKSTAGE業務委託契約 第8条（競業避止）に抵触し、違約金 **246万円**。
   `ng_rules` の `video_noncompete` と `blocked_groups`（video_contents / sounds / multimedia / 3dcg）で二重に防いでいる。**この防御を弱める変更をしてはいけない。**

2. **「AI使用不可」と書かれた案件には応募しない。** 正規表現とLLM判定の二重化で、どちらか一方でも該当したら除外する。

3. **プロフィール・応募文に本業（日本ガイシ）を特定できる情報を書かない。** 副業規定がグレーで、会社は副業を知らない。

4. **BACKSTAGE業務の成果物（vad-dashboard / bsclip）を実績に書かない。** IPはBS帰属で秘密保持の対象。
   書ける実績は `~/.claude/docs/stack-inventory.md` と memory の `portfolio-assets` を参照。

5. **CAPTCHA・ログイン失敗を検知したら停止する。** 自動突破は試みない。

6. **ログインを自動化しない。** `npm run login` はブラウザを開くだけで、ID・パスワードは入力しない。
   認証情報はコードにもDBにも置かず、専用Chromeプロファイルの中に閉じる。2段階認証も本人が画面で行う。

---

## 構成

```
worker/      Node.js + Playwright。収集・スコアリング。手元のMacで常駐
dashboard/   Next.js 16。案件一覧・スコア確認
supabase/    マイグレーション（ai-autojob / fptprdieodlubzqigcit / ap-northeast-1）
.env.local   共通の環境変数（gitignore対象）
.secrets/    DBパスワード（gitignore対象）
```

## よく使うコマンド

```bash
# 収集
cd worker
npm run crawl                                   # 全条件
npm run crawl -- --only システム開発 --pages 1     # 一部だけ
npm run crawl -- --max-details 20               # 詳細取得を制限
npm run crawl -- --headed                       # 目視確認
npm run crawl -- --force                        # 深夜帯ガードを無視（手動時のみ）

npm run login       # ブラウザを開いて本人がログインする（認証情報は入力しない）
npm run refetch     # 会員限定公開の案件をログイン後に取り直す

# プロフィール（内容は src/profile/ 配下）
npm run profile -- --apply    # 表示名・ひとことアピール・自己PR・職種
npm run skills  -- --apply    # スキル登録
npm run resumes -- --apply    # ポートフォリオ・経歴

npm run report      # DBの状態を見る
npm run rescore     # 再クロールせずルール・重みを再適用
npm run inspect -- <URL>   # サイト構造の調査

# ダッシュボード
cd dashboard && npm run dev

# DBスキーマ
supabase db push --password "$(cat .secrets/db-password.txt)"
```

---

## 実装上の注意（踏んだ地雷）

- **`page.evaluate` の中で関数を `const` に代入しない。**
  tsx(esbuild) が `__name` を注入し、ブラウザ側で `ReferenceError: __name is not defined` になる。
  インラインのコールバック（`.map(x => ...)`）と素の式は問題ない。

- **待たせる処理は `caffeinate -i` で包む。**
  `login` / `refetch` / `crawl` の npm script には入れてある。入れないと Mac がスリープして
  待機がそのまま止まる（実際に login の60分待機がスリープで潰れた）。常駐ワーカーも `caffeinate -i npm run dev`。

- **Chromeプロファイルは同時に1プロセスしか使えない。**
  収集バッチが動いている間、`inspect` 等の別コマンドは起動できない。だから普段使いのプロファイルは使わず、専用の `.chrome-profile/` を切ってある。

- **一覧ページのクラス名は当てにならない。**
  Vue + CSSモジュールで `_jobDescription_b2jur_18` のようにハッシュが入り、デプロイのたびに変わる。
  `[class*="_jobDescription_"]` の部分一致で拾う。**詳細ページは旧来クラス（`section.cw-section.detail_information`、`table.job_offer_detail_table`）が残っていて安定するのでそちらを優先する。**
  値の取り出しは `th`/`dt` のラベル文字列で引くのが最も堅い。

- **詳細取得は一次フィルタを通ったものだけに絞る。**
  システム開発だけで8,000件あるため全件の詳細を取るとリクエストが膨れる。
  一覧の情報（タイトル・抜粋・予算）でNG判定と予算足切りをしてから詳細に行く。

- **ログイン状態の判定は `/dashboard` へのリダイレクトで行う。**
  未ログインだと `/login` に飛ばされる。`/mypage` は404なので使えない。
  判定と記録は `src/browser/session.ts`。状態は `settings.login_state` に入り、ダッシュボードの稼働状況に出る。

- **会員限定公開の案件は未ログインだと本文が読めない。**
  「会員限定公開オプションが選択されているため…」という本文が返る。`jobs.members_only` に印をつけ、
  ログイン後に `npm run refetch` で取り直す。取り直すと本文が変わるので `llm_status` は `pending` に戻す。

- **プロフィール系フォームの落とし穴**
  - 文字数はサイト側が**改行をCRLF(2文字)で数える**。素の文字数で判定すると通ったつもりで
    フォームごと弾かれ、何も保存されない。`countAsSite()` で検査してから送る
  - 上限: 表示名12 / ひとことアピール35 / 自己PR1024 / 経歴のタイトル35・概要128
  - **スキル名はマスタから選ぶ方式**（jQuery UIのオートコンプリート）。自由入力は
    「スキルを選択してください。」で弾かれる。マスタに無いもの: Next.js / Supabase / Stripe /
    Flutter / Playwright / Tailwind / Vercel / SaaS → 近い名前で登録し、備考に実技術を書く
  - **メイン職種カテゴリは1つだけ**。カテゴリをまたぐ職種は持てない
  - 経歴の編集は `/resumes/{id}/edit`（一覧からの導線が無いのでIDを直接使う）

- **クラウドワークスのグループslug**（`/public/jobs/group/{slug}`）
  `development` `web_products` `ai_machine_learning` `ai_bpo` `software_development` `ec` `writing_beginner` `business` `design` `task` ほか。
  ライティングは `writing` ではなく **`writing_beginner`**。
  **収集禁止**: `video_contents` `sounds` `multimedia` `3dcg`

- **「クラウドワークス テック」等のエージェント出稿に注意。**
  評価4.9・実績3,415件でクライアント評価が満点になり、放っておくと上位を占める。
  実態は月160時間稼働の常駐案件で、応募も外部サイト（tech.crowdworks.jp）に誘導される。
  `capacity_excess` と `external_application` で除外している。

---

## 設定はコードでなくDBにある

`settings` テーブルの `ng_rules` / `scoring_weights` / `thresholds` / `bootstrap_mode` / `guardrails` / `genre_profile`。
変更したら `npm run rescore` で既存データに再適用する。

**`bootstrap_mode` は実績ゼロ期間のための緩和設定。** 完了案件が5件に達したら `enabled: false` にして通常の閾値（予算3万円以上・時給3,000円以上）へ戻す。

## LLM判定は Claude Code 側でやる

本人の方針で Claude API は当面使わない。ワーカーは機械的に判定できるところまでを処理し、
`job_scores.llm_status = 'pending'` を立てて止める。
案件文の具体性・得意ジャンル一致度・想定工数・AI不可のLLM判定は対話で処理する。
`llm_status='pending'` のうちは `breakdown._meta.provisional = true` で、スコアは有効な重みで正規化した暫定値。

## フェーズ

- **Phase 1（現在）**: 収集＋スコアリング＋案件一覧 ← Supabase・ワーカー・ダッシュボードまで実装済み
- Phase 2: 応募文生成＋承認キュー＋応募送信（ログインが必要になる）
- Phase 3: 成果物生成＋納品レビュー
- Phase 4: 残ジャンル＋実績分析
