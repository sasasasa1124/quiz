- [x] settingでpromptsにai fact checkが二つある。使われている方を調べて不要な方を削除
- [x] aws側でのモデルは全然geminiではないのに、まだgeminiが出てきている。aws側でのTTSはそもそも実装されている？なければ作って。pollyとかのリソース追加しても良い
  - Settings UI更新完了（AWS: "Claude model"/"Ruth" Cloudflare: "Gemini model"/"gemini-2.5-flash-preview-tts"）
  - Polly TTS実装: npm install @aws-sdk/client-polly 失敗（パッケージキャッシュ権限問題）。App Runner IAMで polly:SynthesizeSpeech 権限が必要
- [x] aiの問題文をfixするやつを以下のプロンプトへと更新して
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

- [x] DAILY GOALの問題として解いた数がカウントおかしい。ロジック確認して、回答した解答した数だけになるようにして。
  - getDailyProgress() を修正: sessions.question_count の合計 → scores テーブルの行数カウント
  - activeDays クエリも scores.updated_at::date に変更
- [x] Mobileで(e.g.iphone16e)見ると完全にquizの時に選択肢が潰れて選択できないので、ちゃんとコンポーネント構成を考える。必要に応じて問題のsourceなどは潰した表示にする/Gridを整えるなど
  - 質問セクション高さ: max-h-[25vh] sm:max-h-[40vh]
  - Source/メタデータ: hidden sm:block で非表示
  - 選択肢パディング: px-3 py-2.5 sm:px-4 sm:py-3 lg:px-5 lg:py-4
  - バッジサイズ: w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7
  - Gap: gap-2 sm:gap-3
