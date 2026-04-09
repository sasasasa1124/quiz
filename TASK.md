# TASK.md — Scholion 次フェーズ課題

## 完了済み機能

- [x] **AWS バッチジョブ修正** — after()→fire-and-forget、migrate-pg.js SQLiteスキップ、admin routes edge削除
- [x] **AI解説 Core Concept** — DEFAULT_EXPLAIN_PROMPT更新、DBにcore_concept保存、AnswerReveal/ReviewRevealにバナー表示
- [x] **クリーンアップ** — debug-batch削除、stale files git rm
- [x] **問題文の黄色ハイライト削除** — QuizClient/AnswersClientにhighlight適用なし（確認済み）
- [x] **問題文・解説バージョン管理UI** — AnswersClientにversionPanel、history API、rollback実装済み
- [x] **設定画面 AI Model（AWS）** — claude_modelデフォルト追加、競合状態修正

---

## 未着手タスク

### 1. 正解率表示をセッション内に限定
**目標:** 正解率をセッション累計ではなく「今回のセッション内」の正答率に変更する

- [ ] `components/QuizClient.tsx` の正解率計算ロジックを特定
- [ ] セッション開始時点のカウンタをローカル state で管理（`sessionCorrect / sessionTotal`）
- [ ] ヘッダー or ステータスバーの正解率表示を差し替え
- [ ] **テスト:** セッション開始→5問回答後の正解率がそのセッション分のみ反映されること

---

### 2. スライダーの過去履歴半透明化
**目標:** プロフィール画面の正解率グラフで過去データを薄く表示し、トレンドを視認しやすくする

- [ ] `components/ExamTrendChart.tsx` または該当グラフコンポーネントを特定
- [ ] 直近N件以外のデータポイントに `opacity: 0.3` を適用
- [ ] 境界（直近N件の定義）を定数化（デフォルト: 直近10セッション）
- [ ] **テスト:** プロフィール画面で古い履歴ポイントが薄くなっていること

---

### 3. AWS TTS 修正
**目標:** AWS App Runner環境でTTS音声再生が動作すること

- [ ] `app/api/audio/tts/route.ts` の実装を確認（Gemini TTS vs AWS Polly の切り替えロジック）
- [ ] `DEPLOY_TARGET=aws` 時の分岐を確認・デバッグ
- [ ] AWS Polly の IAM権限が App Runner タスクロールに付与されているか確認
- [ ] 音声キャッシュ（DB保存）が PostgreSQL で正常動作するか確認
- [ ] **テスト:** AWS環境でAudio Mode ON → 問題文が音声再生されること

---

### 4. AI Wording Fix の Enter でAdopt
**目標:** AI Refine提案ダイアログでEnterキーを押すと採用（Adopt）される

- [ ] `components/AiRefinePopup.tsx` の `onKeyDown` で `Enter` → Adoptトリガー
- [ ] フォーカス管理（ダイアログ開いた時点でAdoptボタンにフォーカス）
- [ ] **テスト:** Refineポップアップ表示中にEnterで採用され、問題文が更新されること

---

### 5. W・X ショートカット追加（Quiz / フラッシュカード / Answers）
**目標:** W=不正解として次へ、X=問題を無効化 のショートカットを全モードに追加

- [ ] `components/QuizClient.tsx` の `onKeyDown` に追加:
  - `W` → 不正解として記録して次へ（`POST /api/scores` + SM-2更新）
  - `X` → 問題を無効化（`POST /api/user/questions/[id]/invalidate`）
- [ ] `components/AnswersClient.tsx` にも同様のキーハンドラ追加
- [ ] フラッシュカード（Reviewモード）コンポーネントにも追加
- [ ] `KeyboardHintToast` に W・X の説明を追記
- [ ] **テスト:** 各モードでW/Xキーを押して正しい動作になること
