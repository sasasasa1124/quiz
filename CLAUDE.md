# Scholion プロジェクト仕様書

> 本ドキュメントは、本リポジトリで作業するAIエージェント向けのガイドラインです。

## 1. プロジェクト概要

Scholionは資格試験対策アプリです。より詳細な機能の要件は`README.md`に記載されています。
* **技術スタック:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4
必ず `TASK.md` を参照/更新する。
開発・デプロイ運用タスクは2つの全く異なる環境によって運用されている。
両環境とも **github/repo: https://github.com/sasasasa1124/Scholion** (git remote: `origin`) を使用する。
AWSは、ブランチ `deploy/aws`, デプロイ先: https://bngmzhtypy.us-west-2.awsapprunner.com/
Cloudflareは、ブランチ `deploy/cloudflare`, デプロイ先: https://quiz-aad.pages.dev/
※ `scholion` remote (`kota-sasamoto_sfemu/scholion`) はデプロイには使用しない

それぞれ独立した環境・デプロイ用ブランチで管理され、ローカル開発やGit操作を含む全てのワークフローは、AIの拡張スキル（MCP等）を積極的に活用して処理してください。

---

## 2. AIスキルの活用

* **git戦略** ブランチ戦略・管理は`/git-workflow`を利用します。
* **Next.js 開発/ビルド:** サーバー起動やビルド全般は `vercel-labs/next-skills` や `vercel-labs/agent-skills` を利用します。
* **API/エッジ処理:** 必要に応じて `hono-skills` 等を活用します。
* **デザイン:** `/frontend-design` を参照し、プロジェクト特有のブランドイメージについては `DESIGN.md` を参照してください。
* **デプロイ (Cloudflare):** 作業完了後、`main` を `deploy/cloudflare` にpushし、GitHub Actionsをトリガーします（※コミットメッセージはASCII英語のみ）。
* **デプロイ (AWS):** 作業完了後、`main` を `deploy/aws` にpushし、GitHub Actionsをトリガーします（※デプロイ環境に環境変数 `DEPLOY_TARGET=aws` を設定すること）。

---

## 3. アーキテクチャ

* **主要ルート:** `/` (ホーム), `/select/[mode]` (言語・試験選択), `/quiz/[exam]` (クイズ画面), `/exam/[id]` (履歴詳細), `/profile`, `/settings`
* **重要ファイル:** `lib/csv.ts` (CSV読込), `lib/db.ts` (D1接続), `lib/schema.ts` (Drizzleスキーマ), `app/api/` (Edge API)

---

## 4. タスク管理 (`TASK.md`)

計画時には必ず `TASK.md` に詳細タスクを記載する。機能レベルでの要件を上部に書き、その下に機能・タスクレベルで詳細にTodoを管理する。すでに100行以上存在していた場合は、既存のものを削除して良い
作業開始前に `TASK.md` を確認して進捗を把握する。また`/git-workflow`を用いたブランチ戦略をとる
作業終了後は `TASK.md` を更新し、全てのリクエストを満たし、テストを完了できていることを確認してTodoを確認してから作業報告

* 実装機能ごとにTODOを網羅的にリスト化すること。
* 完了したタスクにはチェックを入れ、常に最新の状態を維持すること。