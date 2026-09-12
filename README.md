# 案件応募・納品エージェント

クラウドワークスの案件を自動で収集・スコアリングし、応募文と納品物をAIが生成する。
人間は「応募してよいか」「納品してよいか」の2点だけをダッシュボードで判断する。

**応募も納品も、確定は必ず人間が承認する。自動送信はしない。**

要件定義は [docs/requirements.md](docs/requirements.md)、実装時の変更点は [docs/revisions.md](docs/revisions.md)。
開発時の注意は [CLAUDE.md](CLAUDE.md)。

---

## 構成

```
[手元のMac] worker/  Node.js 24 + Playwright + node-cron
     │  収集・スコアリング
     ▼
[Supabase] ai-autojob (ap-northeast-1)
     ▲
     │  閲覧
[dashboard/] Next.js 16
```

## セットアップ

```bash
# 1. 依存関係
cd worker && npm install && npx playwright install chromium
cd ../dashboard && npm install

# 2. 環境変数（すでに .env.local がある場合は不要）
cp .env.example .env.local   # SUPABASE_URL / SERVICE_ROLE_KEY を記入

# 3. DBスキーマ
supabase link --project-ref fptprdieodlubzqigcit
supabase db push --password "$(cat .secrets/db-password.txt)"
```

## 使い方

### ログイン

会員限定公開の案件は、ログインしないと詳細が読めない。Phase 2 の応募送信にも必要になる。

```bash
cd worker
npm run login     # ブラウザが開くので、画面でログインする
```

ID・パスワードはツール側では入力しない。ブラウザを開くだけなので、本人が画面で入力する。
2段階認証も同じ画面で進めればよい。**「ログイン状態を保持する」にチェックを入れること。**
認証情報はコードにもDBにも保存されず、専用Chromeプロファイル（`.chrome-profile/`）の中だけに残る。

ログイン後、会員限定だった案件を取り直す:

```bash
npm run refetch
```

ログイン状態はダッシュボードの「稼働状況」で確認できる。切れたらアラートが出る。

### 収集

```bash
cd worker
npm run crawl                                  # 全検索条件
npm run crawl -- --only システム開発 --pages 1    # 一部だけ
npm run crawl -- --max-details 20              # 詳細取得を制限（様子見）
npm run crawl -- --headed                      # ブラウザを表示して目視確認
```

深夜1〜7時は自動で止まる。手動で回したいときだけ `--force`。

### LLM判定（Claude Code が実行する）

ワーカーは機械的に判定できるところまでを処理し、`llm_status = 'pending'` を立てて止まる。
案件文の具体性・ジャンル一致度・想定工数・AI不可の判定は Claude Code 側で行う。

```bash
npm run llm:export     # llm/llm-queue.json に書き出す
#  → Claude Code が読んで llm/llm-results.json に判定を書く
npm run llm:import     # 取り込んでスコアを再計算
```

### 確認・調整

```bash
npm run report      # DBの状態をターミナルで見る
npm run rescore     # 再クロールせずにルール・重みを再適用
npm run inspect -- <URL>   # サイト構造の調査（セレクタが壊れたとき）
```

### ダッシュボード

```bash
cd dashboard && npm run dev   # http://localhost:3000
```

- `/` 案件一覧（スコア順・フィルタ）
- `/jobs/[id]` 案件詳細（スコア内訳・除外理由・案件文）
- `/status` 稼働状況（収集履歴・アラート・NG内訳）

### 常駐

手元で回すだけなら:

```bash
cd worker
caffeinate -i npm run dev            # 毎日 9/13/17/21時 に収集
caffeinate -i npm run dev -- --now   # 起動直後にも1回走らせる
```

ターミナルを閉じても動かし続けるなら launchd に載せる:

```bash
cp scripts/com.smartconnect.ai-autojob.plist ~/Library/LaunchAgents/
launchctl load  ~/Library/LaunchAgents/com.smartconnect.ai-autojob.plist   # 開始
launchctl list | grep ai-autojob                                          # 状態
launchctl unload ~/Library/LaunchAgents/com.smartconnect.ai-autojob.plist # 停止
```

ログインのたびに起動し、落ちても10秒後に再起動する。ログは `logs/worker.log` と
`logs/launchd.{out,err}.log`。

> **Chromeプロファイルは同時に1プロセスしか使えない。** launchd で常駐させている間は、
> `npm run crawl` などを手で叩くと `ProcessSingleton` エラーになる。先に unload すること。

---

## 設定

コードではなく Supabase の `settings` テーブルにある。変更後は `npm run rescore`。

| キー | 中身 |
|---|---|
| `ng_rules` | 除外・警告の正規表現ルール |
| `scoring_weights` | スコアの重み（合計100） |
| `thresholds` | 予算・時給の下限、応募上限、週の可処分時間 |
| `bootstrap_mode` | 実績ゼロ期間の緩和設定。完了5件で解除する |
| `guardrails` | 待機時間・実行時刻・深夜停止 |
| `genre_profile` | 得意ジャンル（一致度判定に使う） |
| `blocked_groups` | 収集禁止グループ（動画・音声系） |

## 現在の状態

**Phase 1 完了**: 収集・スコアリング・案件一覧まで動作。
Phase 2（応募文生成・承認キュー・応募送信）以降は未着手。
