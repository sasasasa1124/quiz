# Quiz — Salesforce/MuleSoft 認定資格 練習アプリ

**CSV を置くだけで動く、AI 搭載の資格試験練習アプリ。**

スペースド・リピティション（SM-2）で効率よく記憶を定着させ、AI が解説・ファクトチェック・スタディガイドを生成する。管理者は問題の追加・編集・翻訳をブラウザ上で完結できる。

---

## 設計思想

> "Understand deeply, not just pass."

**シンプルに、速く、深く。** 画面遷移を減らし、キーボードだけで完結する操作性を追求した。アニメーションやモーダルを最小限に抑え、問題と向き合う時間を最大化する。

AI は「答えを教える道具」ではなく「理解を深める道具」として使う。解説・ファクトチェック・スタディガイドはすべてオプション機能であり、まず自分で考えることを促す UI になっている。

---

## 目次

- [学習モード](#学習モード)
- [AI 機能](#ai-機能)
- [音声読み上げ (TTS)](#音声読み上げ-tts)
- [スペースドリピティション](#スペースドリピティション)
- [フィルター機能](#フィルター機能)
- [管理者機能](#管理者機能)
- [インポート機能](#インポート機能)
- [ユーザー設定](#ユーザー設定)
- [認証・アクセス制御](#認証アクセス制御)
- [技術スタック](#技術スタック)
- [ローカル開発](#ローカル開発)
- [デプロイ](#デプロイ)
- [ルート一覧](#ルート一覧)
- [API エンドポイント](#api-エンドポイント)

---

## 学習モード

`/quiz/[exam]?mode=` パラメータで切り替える。

| モード | 説明 |
|--------|------|
| **Quiz** | 回答 → 正誤確認 → Know / Don't Know を評価して SM-2 に反映 |
| **Review** | 問題と解答・解説をフラッシュカード形式で確認（スコア更新なし） |
| **Mock Exam** | 制限時間付き模擬試験（60 問 / 105 分）。終了後にスコア表示 |
| **Answers** | 全問題の解答・解説をカテゴリ別に一覧。管理者は直接編集可 |
| **Study Guide** | AI がカテゴリ別の重要ポイント・落とし穴・学習アドバイスを Markdown でまとめる |

### Quiz モードの操作

- キーボード: **1–4** で選択、**Enter** で送信・次へ進む
- 回答後に AI 解説ポップアップ（Explain / Fact Check）を呼び出せる
- 正解時は次回復習日（SM-2）が自動更新される

### Mock モードの仕様

- 重複問題 (`isDuplicate=1`) を除いた全問からランダム 60 問を抽出
- カウントダウンタイマーをヘッダーに表示
- 終了後: 正答数・正答率・カテゴリ別成績を表示

---

## AI 機能

使用モデルは `app_settings` テーブルの `gemini_model` キーで変更可能（デフォルト: `gemini-3-flash-preview`）。

### 解説生成 (Explain)

問題・選択肢・正解を渡して詳細な解説を生成する。

| 出力 | 内容 |
|------|------|
| ハイライト | 問題文中の重要フレーズ（最大 6 箇所） |
| Key Concepts | 正解に必要な概念の要約 |
| 選択肢分析 | 各選択肢が正解/不正解である理由 |
| 推論ステップ | 誤答を排除していく step-by-step reasoning |
| ソース | Google Search でグラウンディングした公式 URL |

### Refine (AI 修正)

問題文・解説の品質を自動改善する。

- 誤字・スペルミス・改行を修正
- 判断に重要なキーワードへ **bold** マーカーを付与
- Salesforce/MuleSoft 公式ソースに基づいた内容検証
- 変更サマリーで差分を確認してから適用

### Fact Check (事実確認)

記録されている正解を公式資料と照合する。

| 出力 | 内容 |
|------|------|
| isCorrect | 現在の答えが正しいか |
| correctAnswers | 正しい答え |
| confidence | 確信度 (high / medium / low) |
| issues | 問題点の詳細 |
| sources | 参照した公式 URL |

### スタディガイド生成 (Study Guide)

カテゴリ別に体系化された学習ノートを生成する。

- 試験概要・必須知識・出やすいポイント
- Google Search で最新の公式ドキュメントを参照
- ユーザーの弱点カテゴリを渡すと個別アドバイスを追加

### AI プロンプトカスタマイズ

設定画面から各機能のシステムプロンプトを編集・バージョン管理できる。

| プロンプト種別 | 使用タイミング |
|--------------|--------------|
| Explain | 解説生成 |
| Refine | 問題文修正 |
| StudyGuide | スタディガイド生成 |
| Fill | 自動補完（管理者） |
| FactCheck | ファクトチェック |

プレースホルダー: `{question}` `{choices}` `{answers}` `{language}`
名前・作成者付きでバージョン保存・切り替えが可能。

---

## 音声読み上げ (TTS)

設定で **Audio Mode** を有効にすると、問題文と解説を音声で読み上げる。

| 項目 | 詳細 |
|------|------|
| エンジン | Gemini 2.5 Flash Preview TTS |
| 音声 | Aoede（多言語対応） |
| 出力形式 | WAV（24kHz / 16-bit モノラル） |
| キャッシュ | テキストの SHA-256 ハッシュをキーに DB へ保存。再読み込みしても再生成しない |
| 再生速度 | 0.5x – 4.0x（設定から変更） |
| プリフェッチ | 次の n チャンク先読み（デフォルト: 3） |

音声は DB キャッシュ → ブラウザ IndexedDB キャッシュ → Gemini API の順に確認する。
一度生成した音声は全デバイスで共有される。

---

## スペースドリピティション

SM-2 アルゴリズムで各問題の次回復習日を自動管理する。

```
正解後: intervalDays = 1 → 3 → intervalDays × easeFactor（繰り返し）
不正解後: intervalDays = 1 にリセット
easeFactor = max(1.3, EF + 0.1 - (5 - grade) × (0.08 + (5 - grade) × 0.02))
```

- `/profile` の **Due for Review** カウントで今日期限の問題数を確認
- フィルターで **Due for review** を選択すると対象問題のみ出題

---

## フィルター機能

Quiz / Review モードでは以下のフィルターを組み合わせて出題範囲を絞れる。

| フィルター | 説明 |
|-----------|------|
| Never attempted | 一度も回答していない問題 |
| Due for review | SM-2 で今日以前が復習日の問題 |
| Wrong answers | 直前の回答が不正解だった問題 |
| Max attempts | 指定回数以下の問題 |
| Max accuracy | 正答率が指定 % 以下の問題 |
| Not seen in N days | 指定日数以上見ていない問題 |
| Category | カテゴリで絞り込み |

複数条件は AND で適用される。

---

## 管理者機能

`ADMIN_EMAILS` 環境変数に登録されたメールアドレスが管理者として扱われる。未設定の場合は @salesforce.com 全ユーザーが管理者権限を持つ。

### 問題編集

Answers モードで問題をクリックして編集モーダルを開く。

- 問題文・選択肢・正解・解説・カテゴリを編集
- 保存時に変更理由を入力（バージョン履歴へ記録）
- 履歴パネルで過去バージョンとの差分を確認・ロールバック

### 一括処理 (`/exam/[id]` の管理メニュー)

| 操作 | 内容 |
|------|------|
| Refine All | 全問題の誤字修正・ハイライト付与 |
| FactCheck All | 全問題の答えを公式ソースで検証 |
| Fill All | 未入力フィールド（解説・カテゴリ等）を AI で補完 |
| Translate | 指定言語に翻訳 |

進捗は Server-Sent Events でリアルタイム表示される。

### サジェスト管理

ユーザーが提案した修正案を確認し、採用または却下できる。
採用すると問題の正解・解説が更新され、バージョン履歴に記録される。

---

## インポート機能

Excel (.xlsx / .xls) または CSV ファイルをアップロードすると、AI が自動解析して問題をインポートする。

**処理フロー:**

1. **Inspect** — シート・カラム構成を解析してサンプルを表示
2. **Convert** — 全問題を統一 JSON 形式に変換（GoogleGenAI code execution）
3. **Save** — PostgreSQL に一括 INSERT（既存問題は番号を継続）

**統一フォーマット:**

```json
{
  "num": 1,
  "question": "問題文",
  "choices": ["A. 選択肢1", "B. 選択肢2"],
  "answer": ["A"],
  "explanation": "解説",
  "source": "参考URL"
}
```

進捗は Server-Sent Events でストリーム配信される。

### CSV フォーマット（直接配置）

リポジトリルート（`quiz/` の親）に CSV を置くだけで試験が追加される。

```
id, question, optionA, optionB, optionC, optionD, optionE, answer, explanation, source
```

---

## ユーザー設定

`/settings` から変更できる。

| 設定 | 説明 | デフォルト |
|------|------|-----------|
| Language | UI 言語（ja / en / zh / ko） | ja |
| Daily Goal | 1 日の目標回答数 | 100 |
| Skip Reveal on Correct | 正解時に解説をスキップして次へ | OFF |
| Audio Mode | 音声読み上げの ON/OFF | OFF |
| Audio Speed | 再生速度 | 1.0x |
| Prefetch Chunks | 先読みチャンク数 | 3 |
| AI Prompts | 各 AI 機能のプロンプトをカスタマイズ | — |

---

## 認証・アクセス制御

- **認証基盤**: Clerk (`@clerk/nextjs`)
- **ドメイン制限**: @salesforce.com のメールアドレスのみ許可
  - ログインフォームでリアルタイム検証（入力段階でエラー表示）
  - middleware でログイン後にも検証（バイパス防止）
  - 非許可ドメインは `/unauthorized` にリダイレクト
- **管理者権限**: `ADMIN_EMAILS` 環境変数（カンマ区切り）で指定。未設定の場合は全認証ユーザーが管理者

---

## 技術スタック

```
Next.js 15 (App Router)    フレームワーク
React 19                   UI ランタイム
TypeScript                 言語
Tailwind CSS v4            スタイリング
Drizzle ORM                データベース ORM
PostgreSQL / D1 (SQLite)   データベース（環境によって切り替え）
Clerk                      認証
Google Gemini API          AI 機能・TTS
Lucide React               アイコン
Recharts                   グラフ
Zod                        バリデーション
Cloudflare Pages           ホスティング（エッジ）
GCP Cloud Run              代替ホスティング
```

外部 UI ライブラリは使用しない。

---

## ローカル開発

### セットアップ

```bash
cd quiz
npm install
```

### 環境変数 (`.env.local`)

```bash
DEPLOY_TARGET=local

# 認証（Clerk）
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# AI
GEMINI_API_KEY=AIza...

# 管理者（カンマ区切り）
ADMIN_EMAILS=you@salesforce.com

# フィードバック（GitHub Issue 自動作成）
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=your-org
GITHUB_REPO=your-repo

NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

`DATABASE_URL` を設定しない場合は CSV フォールバックで動作（スコア保存なし）。

### コマンド

```bash
npm run dev                # 開発サーバー（Turbopack）
npm run build              # プロダクションビルド
npm start                  # プロダクションサーバー

npm run db:migrate:local   # ローカル DB にマイグレーション適用
npm run db:seed:local      # ローカル DB に CSV を投入
npm run db:migrate         # 本番 D1 にマイグレーション適用

npm run build:cf           # Cloudflare Pages 向けビルド
```

---

## デプロイ

**AWS**（主）と **Cloudflare Pages**（副）の両方に対応。

```
main ──────────────────────────────► 開発の source of truth
  │
  ├─ git push origin main:deploy/cloudflare ──► Cloudflare Pages
  └─ git push origin main:deploy/gcp         ──► GCP Cloud Run
```

各 `deploy/*` ブランチへの push が GitHub Actions を起動し、対応プラットフォームへ自動デプロイする。

### 本番マイグレーション

デプロイ後に必ず実行する:

```bash
npm run db:migrate
```
---

## ルート一覧

| パス | 説明 |
|------|------|
| `/` | 試験一覧 |
| `/login` | ログイン（@salesforce.com のみ） |
| `/sign-up` | 新規登録 |
| `/unauthorized` | アクセス拒否ページ |
| `/quiz/[exam]` | クイズ画面（`?mode=quiz\|review\|mock\|answers\|study-guide`） |
| `/exam/[id]` | 試験詳細・カテゴリ統計・管理メニュー |
| `/profile` | 学習履歴・進捗グラフ |
| `/settings` | ユーザー設定・AI プロンプト |
| `/admin/import` | 問題ファイルのインポート（管理者） |

---

## API エンドポイント

### ユーザー操作

| エンドポイント | 説明 |
|---------------|------|
| `POST /api/scores` | 回答結果を保存（SM-2 更新） |
| `GET /api/scores` | 試験のスコア統計を取得 |
| `GET /api/scores/due-count` | 今日の復習期限問題数 |
| `GET /api/category-stats` | カテゴリ別正答率 |
| `GET/POST /api/sessions` | セッション記録の作成・取得 |
| `GET /api/snapshots` | 正答率の時系列履歴 |

### AI

| エンドポイント | 説明 |
|---------------|------|
| `POST /api/ai/explain` | 問題の解説生成 |
| `POST /api/ai/refine` | 問題文の修正・ハイライト |
| `POST /api/ai/factcheck` | 答えの事実確認 |
| `POST /api/ai/study-guide` | スタディガイド生成 |
| `GET /api/ai/models` | 利用可能モデル一覧 |

### 音声

| エンドポイント | 説明 |
|---------------|------|
| `POST /api/audio/tts` | テキストを WAV 音声に変換（DB キャッシュ付き） |

### 管理者

| エンドポイント | 説明 |
|---------------|------|
| `POST /api/admin/import` | Excel/CSV インポート（SSE ストリーム） |
| `GET/PUT/DELETE /api/admin/exams/[id]` | 試験メタデータの管理 |
| `POST /api/admin/exams/[id]/refine` | 全問題一括 Refine |
| `POST /api/admin/exams/[id]/factcheck` | 全問題一括 FactCheck |
| `POST /api/admin/exams/[id]/fill` | 全問題一括 Fill |
| `POST /api/admin/exams/[id]/translate` | 全問題翻訳 |
| `GET/POST /api/admin/questions` | 問題の作成・取得 |
| `GET /api/admin/questions/[id]/history` | 問題の編集履歴 |

### ユーザー設定・フィードバック

| エンドポイント | 説明 |
|---------------|------|
| `GET/PUT /api/user-settings` | ユーザー設定の取得・保存 |
| `GET/POST /api/suggestions` | 改善提案の作成・取得 |
| `POST /api/suggestions/[id]/adopt` | 提案の採用 |
| `POST /api/feedback` | 一般フィードバック送信 |

---

## ライセンス

Private repository.
