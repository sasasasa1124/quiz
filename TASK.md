# TASK.md — Scholion 次フェーズ課題

## 完了済み機能

- [x] **AWS バッチジョブ修正** — after()→fire-and-forget、migrate-pg.js SQLiteスキップ、admin routes edge削除
- [x] **AI解説 Core Concept** — DEFAULT_EXPLAIN_PROMPT更新、DBにcore_concept保存、AnswerReveal/ReviewRevealにバナー表示
- [x] **クリーンアップ** — debug-batch削除、stale files git rm
- [x] **問題文の黄色ハイライト削除** — QuizClient/AnswersClientにhighlight適用なし（確認済み）
- [x] **問題文・解説バージョン管理UI** — AnswersClientにversionPanel、history API、rollback実装済み
- [x] **設定画面 AI Model（AWS）** — claude_modelデフォルト追加、競合状態修正
- [x] **正解率表示をセッション内に限定** — sessionTotal/sessionCorrectCount state追加、QuizHeaderに渡すように変更
- [x] **AI Wording Fix Enter→Adopt** — AiRefinePopup.tsx: plain Enter（Ctrl/Cmd不要）でAdopt実行
- [x] **W・X ショートカット追加** — QuizClient/AnswersClient/KeyboardHintToastに追加（W=不正解+次へ、X=無効化トグル）
- [x] **スライダーの過去履歴半透明化** — ExamTrendChart: 直近10セッション以外のdot/lineをopacity 0.3に
- [x] **AWS TTS 修正** — Polly synthesizer: FetchHttpHandlerで edge-compatible化、transformToByteArray対応

- [x] **Import機能 導線追加 + AWS Bedrock対応** — ExamListClientヘッダーにFileUpアイコン追加、Import/Feedbackルートを aiGenerate() に統一（Gemini/Bedrock自動切替）、file-parser.tsでサーバーサイドExcel/CSV解析

---

## 進行中タスク

### Import機能リファクタ — AI code execution

- [x] `ai-client.ts`: Gemini `codeExecution` ツール対応（`useCodeExecution` オプション追加）
- [x] `import/route.ts`: AI code execution でファイルパース（1回のAI呼び出しでPythonコード生成→実行）
- [x] Bedrock フォールバック: 先頭10行でカラムマッピング取得 → 決定論的変換
- [x] ヘッダーのFileUpアイコン削除、Add Examカードにインポート統合
- [x] Upload: CSV/Excel両対応、Excel→AI code executionフロー
- [x] ビルド確認
- [ ] デプロイ・実機テスト
