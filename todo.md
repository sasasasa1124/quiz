## 🔥 In Progress

### batch-status 500 エラー修正 (fix/batch-status-500)
両PF (Cloudflare / AWS) で `/api/admin/exams/[id]/batch-status` が 500 を返す。
- [x] 原因特定: `batch_jobs` テーブルが正しく作成されていない
- [x] `scripts/migrate-pg.js` — 非init SQL の分割を `\n` → `;` に修正 (AWS)
- [x] `package.json` — `db:migrate` を全 `migrations/*.sql` 対応に (CF D1)
- [x] `app/api/admin/exams/[id]/batch-status/route.ts` — try-catch 追加
- [x] `npm run build` 確認
- [ ] PR → main Squash Merge (コミット: 080c6e6)
  - ローカルコミット完了、ブランチ push は sandbox ネットワーク制限で失敗
  - `git push origin fix/batch-status-500` → `gh pr create` で手動作成が必要
- [ ] `main:deploy/aws` push → migrate-pg.js 自動適用を確認
- [ ] `main:deploy/cloudflare` push → `npm run db:migrate` で batch_jobs 作成

---

## Backlog

- [] settingでpromptsにai fact checkが二つある。使われている方を調べて不要な方を削除
- [] aws側でのモデルは全然geminiではないのに、まだgeminiが出てきている。aws側でのTTSはそもそも実装されている？なければ作って。pollyとかのリソース追加しても良い
- [] aiの問題文をfixするやつを以下のプロンプトへと更新して
You are an expert editor for Salesforce/MuleSoft certification exam questions.
Your tasks:

Fix typos, grammatical errors, spelling mistakes, awkward phrasing, and missing line breaks (list bullets: - item, * item, 1. item, etc.).

Add bold markers around the key terms in the question and ALL choices (both correct and incorrect) that are critical for identifying the correct answer or ruling out incorrect ones.
   - In the question: Highlight the core action ("which feature should be used"), technical conditions ("without sharing"), and important constraints ("without writing code").
   - In the choices: Highlight the specific terms, features, or parameters that make the choice correct, OR the fatal flaws/incorrect elements that make a choice wrong (e.g., highlighting "after save" when the context requires before save, or highlighting an incorrect feature name).
   Use bold sparingly — only on genuinely important distinguishing terms, not on every noun.

Do NOT change meaning, technical content, correct answers, or add/remove choices.
Do NOT rewrite or rephrase if there is no error — preserve the original wording.
Do NOT remove, alter, or reformat any image tags — preserve <img src="..."> HTML tags and [img: ...] syntax exactly as they appear in the input.
When searching, limit to official sources only (help.salesforce.com, developer.salesforce.com, trailhead.salesforce.com, docs.mulesoft.com).

Question:
{question}

Choices:
{choices}

Currently recorded answer(s): {answers}

Respond ONLY with a JSON object (no markdown, no code fences) with exactly these keys:
{ "question": "...", "choices": [{"label": "A", "text": "..."}], "changesSummary": "...", "highlights": ["phrase1", "phrase2"] }

question: the corrected question text with bold highlights

choices: array of corrected choices in the same order, with bold highlights added to the critical terms that prove each choice right or wrong

changesSummary: a brief human-readable summary of what was changed, or empty string if nothing changed

highlights: up to 6 exact substrings from the (possibly refined) question text that are critical for a test-taker to correctly identify the correct answer(s). The recorded correct answer(s) are {answers} — use these to anchor your highlights to what actually makes those specific choices correct. Prioritize:
  (a) constraint words or qualifying conditions that rule out wrong answers (e.g. "without writing code", "before save", "in a single transaction")
  (b) technical terms or feature names that the correct answer(s) uniquely depend on
  (c) the core decision clause of the question (e.g. "which feature should be used", "what is the first step")
  Avoid generic nouns. Choose only phrases where changing the phrase would change which answer is correct.

- [] DAILY GOALの問題として解いた数がカウントおかしい。ロジック確認して、回答した解答した数だけになるようにして。
- [] Mobileで(e.g.iphone16e)見ると完全にquizの時に選択肢が潰れて選択できないので、ちゃんとコンポーネント構成を考える。必要に応じて問題のsourceなどは潰した表示にする/Gridを整えるなど
