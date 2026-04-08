# TASK.md

## 機能要件: バッチジョブ + UI 修正 (AWS + Cloudflare)

### 背景・要件
1. 管理画面の Fill / Wording Fix / Fact Check が AWS・CF 両環境で500エラーまたは無限スピン
2. CF の個別 AI Wording Fix「Adopt」ボタンが "Update failed" エラー
3. 問題文表示でアンバー（黄色）ハイライトボックスが不要

---

## 根本原因 (確定)

### 1. AWS: batch_jobs テーブル不在
- `migrate-pg.js` が `ALTER TABLE ADD COLUMN` 重複エラー(42701)で中断し `0021_batch_jobs.sql` に未到達
- **修正済み** (commit `c7b147d`): ステートメント単位 try-catch で 42701/42P07/42710 をスキップ

### 2. CF: D1 に batch_jobs テーブル未適用
- wrangler migration が proxy エラーで失敗していた
- **修正済み** (commit `c7b147d`): `createBatchJob()` 冒頭で `CREATE TABLE IF NOT EXISTS` 自動作成

### 3. CF: ctx.waitUntil の誤ったアクセスパターン (根本原因)
- `getRequestContext()` は `{ request, env, ctx }` を返すが、コードが `ctx.waitUntil` を直接呼んでいた
- 正しくは `getRequestContext().ctx.waitUntil`
- `waitUntil` が実行されず background task がレスポンス送信後に kill されていた → Wording Fix 0/0 の原因
- **修正中** (本ブランチ): refine/fill/factcheck の 3 route を修正

### 4. CF: suggestions adopt route に不要な edge runtime
- `app/api/suggestions/[id]/adopt/route.ts` に `export const runtime = 'edge'` があり CF で失敗
- **修正中** (本ブランチ): edge runtime 宣言を削除

### 5. UI: 問題文アンバーハイライト
- `QuizQuestion.tsx` の final question を `bg-amber-50/border-amber-200` ボックスで囲んでいた
- **修正中** (本ブランチ): グレーの区切り線に変更

---

## 実装 Todo

### ブランチ: `fix/ui-and-adopt-route` (現在のブランチ)

- [x] `app/api/suggestions/[id]/adopt/route.ts` — `export const runtime = 'edge'` 削除
- [x] `components/QuizQuestion.tsx` — アンバーハイライトを `border-t border-gray-200` に変更
- [x] `app/api/admin/exams/[id]/refine/route.ts` — `getRequestContext().ctx.waitUntil` に修正
- [x] `app/api/admin/exams/[id]/fill/route.ts` — 同上
- [x] `app/api/admin/exams/[id]/factcheck/route.ts` — 同上
- [ ] TASK.md コミット
- [ ] `main` マージ → `deploy/aws` push
- [ ] `deploy/cloudflare` cherry-pick → push

### テスト
- CF: Wording Fix ボタン → 進捗が更新される（0/0 で止まらない）
- CF: AI Wording Fix モーダルの Adopt → 成功する
- AWS: Wording Fix ボタン → ジョブ作成後に処理が進む
- 両環境: 問題文のアンバーハイライトが消える

---

## 完了済みタスク

- [x] `scripts/migrate-pg.js` 冪等化 (`c7b147d`)
- [x] `lib/batch-job.ts` D1 auto-create (`c7b147d`)
- [x] batch-status try-catch (`db76701`)
- [x] ゾンビジョブ自動クリーン (`5ac6a2c`)
- [x] Admin route から edge runtime 削除-AWS 修正 (`5da210b`)
- [x] AWS Polly TTS + Gemini フォールバック (`79f599a`)
