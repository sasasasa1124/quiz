# TASK.md — Scholion 次フェーズ課題

## AWS バッチジョブ ✅ 全修正完了 (2026-04-09)

### 修正済み根本原因
1. **migrate-pg.js SQLiteスキップ** — AUTOINCREMENT/datetime() ファイルをスキップ
2. **Admin routes runtime='edge' 削除** — 全14ルートからedge削除
3. **batch_jobs ensureTable追加** — getBatchJob/getActiveJob に追加
4. **after() → fire-and-forget async** — App RunnerでのNext.js after()不動作を修正 (d1a1663)

### テスト結果 ✅
- [x] `GET /api/debug-batch` → `{"ok":true}` (200)
- [x] `GET /api/admin/exams/.../batch-status?latest=factcheck` → 200
- [x] Fact Check実行 → jobId返却 → status `running` → `done` 確認済み (109問完走)
- [x] App Runner: SUCCEEDED デプロイ確認済み

---

## 次フェーズ課題

### 1. クリーンアップ
- [ ] `app/api/debug-batch/route.ts` を削除
- [ ] `middleware.ts` の `PUBLIC_PATHS` から `/api/debug-batch` を削除
- [ ] git の未コミット削除ファイル（CSV/xlsx/古いMD）を `git rm` してコミット
- [ ] **テスト:** `/api/debug-batch` が401を返すことを確認

---

### 2. AI解説プロンプト改善 ✅ 修正済み
**目標:** 解説の冒頭に「コア知識1行」を挿入し、理解の軸を先に提示する

- [x] `lib/types.ts` の `DEFAULT_EXPLAIN_PROMPT` に `coreConcept` フィールド定義を追加
- [x] `app/api/ai/explain/route.ts` の Zod スキーマに `coreConcept: z.string().optional()` を追加
- [x] `components/AiExplainPopup.tsx` で Core Concept バナーを解説最上部に表示
- [ ] **テスト:** Explainを実行し、コア知識が解説の先頭に表示されることを確認

---

### 3. 問題文・解説バージョン管理UI
**目標:** 管理者が過去バージョンと現在の差分を見てロールバックできる

- [ ] `app/api/admin/questions/[id]/history/route.ts` のレスポンス確認（フィールド網羅性）
- [ ] `components/` に `QuestionHistoryPanel.tsx` 作成
  - 左右diff表示（変更前/変更後をハイライト）
  - バージョン一覧（日時・変更者・変更理由）
  - ロールバックボタン → PUT `/api/admin/questions/[id]` 呼び出し
- [ ] Answers画面の編集モーダルに「履歴」タブを追加
- [ ] **テスト:** 問題を2回編集後、v1にロールバックして内容が戻ることを確認

---

### 4. 問題文の黄色ハイライト削除
**目標:** AI Explainのハイライト表示をやめ、クリーンな問題文表示にする

- [ ] `components/RichText.tsx`（または該当コンポーネント）でハイライト適用ロジックを特定
- [ ] QuizClient でハイライトを問題文に適用している箇所を削除
- [ ] AiExplainPopup 内の「ハイライト」セクション表示も削除 or 非表示化
- [ ] **テスト:** Quiz画面で問題文に黄色マーカーが出ないことを確認

---

### 5. 正解率表示をセッション内に限定
**目標:** 正解率をセッション累計ではなく「今回のセッション内」の正答率に変更する

- [ ] `components/QuizClient.tsx` の正解率計算ロジックを特定
- [ ] セッション開始時点のカウンタをローカル state で管理（`sessionCorrect / sessionTotal`）
- [ ] ヘッダー or ステータスバーの正解率表示を差し替え
- [ ] **テスト:** セッション開始→5問回答後の正解率がそのセッション分のみ反映されることを確認

---

### 6. スライダーの過去履歴半透明化
**目標:** プロフィール画面の正解率スライダーで過去データを薄く表示し、トレンドを視認しやすくする

- [ ] `components/ExamTrendChart.tsx` または該当グラフコンポーネントを特定
- [ ] 直近N件以外のデータポイントに `opacity: 0.3` を適用
- [ ] 境界（直近N件の定義）を定数化（デフォルト: 直近10セッション）
- [ ] **テスト:** プロフィール画面で古い履歴ポイントが薄くなっていることを確認

---

### 7. 設定画面 AI Model — AWS で Claude モデルを表示 ✅ 修正済み
**修正内容:**
- `app/api/app-settings/route.ts`: `claude_model` デフォルト (`us.anthropic.claude-sonnet-4-6`) を追加
- `app/settings/page.tsx`: `deployTarget` 取得後に正しいキー (`claude_model` / `gemini_model`) でモデルをロード・保存するよう修正

---

### 8. AWS TTS 修正
**目標:** AWS App Runner環境でTTS音声再生が動作すること

- [ ] `app/api/audio/tts/route.ts` の現在の実装を確認（Gemini TTS vs AWS Polly の切り替えロジック）
- [ ] `DEPLOY_TARGET=aws` 時の分岐を確認・デバッグ
- [ ] AWS Polly の IAM権限が App Runner タスクロールに付与されているか確認
- [ ] 音声キャッシュ（DB保存）が PostgreSQL で正常動作するか確認
- [ ] **テスト:** AWS環境でAudio Mode ON → 問題文が音声再生されることを確認

---

### 9. AI Wording Fix の Enter でAdopt
**目標:** AI Refine提案ダイアログでEnterキーを押すと採用（Adopt）される

- [ ] `components/AiRefinePopup.tsx` のキーボードイベントハンドラを確認
- [ ] `onKeyDown` で `Enter` → Adoptボタンのクリックをトリガー
- [ ] フォーカス管理（ダイアログ開いた時点でAdoptボタンにフォーカス）
- [ ] **テスト:** Refineポップアップ表示中にEnterで採用され、問題文が更新されることを確認

---

### 10. W・X ショートカット追加（Quiz / フラッシュカード / Answers）
**目標:** W=不正解として次へ、X=問題を無効化 のショートカットを全モードに追加

- [ ] `components/QuizClient.tsx` の `onKeyDown` ハンドラに追加:
  - `W` → 不正解として記録して次へ（`POST /api/scores` + SM-2更新）
  - `X` → 問題を無効化（`POST /api/user/questions/[id]/invalidate`）
- [ ] `components/AnswersClient.tsx` にも同様のキーハンドラ追加
- [ ] フラッシュカード（Reviewモード）コンポーネントにも追加
- [ ] `KeyboardHintToast` に W・X の説明を追記
- [ ] **テスト:** 各モードでW/Xキーを押して正しい動作になることを確認
