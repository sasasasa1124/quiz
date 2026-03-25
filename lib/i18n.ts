export type Locale = "en" | "ja" | "zh" | "ko";

export const LANG_OPTIONS: { value: Locale; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "ja", label: "JA" },
  { value: "zh", label: "ZH" },
  { value: "ko", label: "KO" },
];

export type TranslationKey =
  | "settings"
  | "language"
  | "languageLabel"
  | "aiPrompt"
  | "aiPromptPlaceholder"
  | "aiRefinePrompt"
  | "aiRefinePromptPlaceholder"
  | "save"
  | "saved"
  | "back"
  | "home"
  | "submit"
  | "next"
  | "prev"
  | "all"
  | "wrong"
  | "explain"
  | "refine"
  | "adopt"
  | "dismiss"
  | "aiExplaining"
  | "aiRefining"
  | "aiSuggestedAnswer"
  | "aiExplanation"
  | "aiReasoning"
  | "adoptSuccess"
  | "aiRefineQuestion"
  | "aiRefineChoices"
  | "aiRefineChanges"
  | "aiRefineNoChanges"
  | "onboardingTitle"
  | "onboardingStep1Title"
  | "onboardingStep1Desc"
  | "onboardingStep2Title"
  | "onboardingStep2Desc"
  | "onboardingStep3Title"
  | "onboardingStep3Desc"
  | "onboardingNext"
  | "onboardingDone"
  | "startAll"
  | "showAll"
  | "noWrongAnswers"
  | "noQuestions"
  | "allWrongCleared"
  | "continueFrom"
  | "uniq"
  | "suggest"
  | "alternatives"
  | "suggestSubmit"
  | "suggestAnswers"
  | "suggestExplanation"
  | "suggestComment"
  | "suggestTypeAi"
  | "suggestTypeManual"
  | "suggestSuccess"
  | "suggestNone"
  | "invalidate"
  | "edit"
  | "knewIt"
  | "didntKnow"
  | "filter"
  | "customFilter"
  | "includeUnattempted"
  | "sm2ReviewDue"
  | "attemptsMax"
  | "accuracyMax"
  | "notSeenInDays"
  | "reset"
  | "apply"
  | "noLimit"
  | "answer"
  | "correctAnswer"
  | "source"
  | "factCheck"
  | "aiFactChecking"
  | "aiFactCheckCorrect"
  | "aiFactCheckWrong"
  | "aiFactCheckPrompt";

const translations: Record<Locale, Record<TranslationKey, string>> = {
  en: {
    settings: "Settings",
    language: "Language",
    languageLabel: "Display Language",
    aiPrompt: "AI Fact-Check Prompt",
    aiPromptPlaceholder: "Full prompt sent to AI. Use {question}, {choices}, {answers}, {explanation} as placeholders.",
    aiRefinePrompt: "AI Wording Fix Prompt",
    aiRefinePromptPlaceholder: "Full prompt sent to AI. Use {question}, {choices} as placeholders.",
    save: "Save",
    saved: "Saved",
    back: "Back",
    home: "Home",
    submit: "Submit",
    next: "Next",
    prev: "Prev",
    all: "All",
    wrong: "Wrong",
    explain: "AI Fact-Check",
    refine: "AI Wording Fix",
    adopt: "Adopt",
    dismiss: "Dismiss",
    aiExplaining: "Fact-checking...",
    aiRefining: "Fixing wording...",
    aiSuggestedAnswer: "Suggested Answer",
    aiExplanation: "Explanation",
    aiReasoning: "Reasoning",
    adoptSuccess: "Adopted",
    aiRefineQuestion: "Question",
    aiRefineChoices: "Choices",
    aiRefineChanges: "Changes",
    aiRefineNoChanges: "No changes suggested",
    onboardingTitle: "Welcome to Quiz",
    onboardingStep1Title: "Add an exam",
    onboardingStep1Desc: "Click the Add card or drag & drop a CSV file to load your first exam.",
    onboardingStep2Title: "Start practicing",
    onboardingStep2Desc: "Tap any exam card to begin. Wrong answers are tracked so you can focus on what matters.",
    onboardingStep3Title: "Customize",
    onboardingStep3Desc: "Open Settings to change the display language or configure the AI explanation prompt.",
    onboardingNext: "Next",
    onboardingDone: "Got it",
    startAll: "Start All",
    showAll: "Show all",
    noWrongAnswers: "No wrong answers",
    noQuestions: "No questions",
    allWrongCleared: "All wrong answers cleared",
    continueFrom: "Continue",
    uniq: "Uniq",
    suggest: "Suggest",
    alternatives: "Alternatives",
    suggestSubmit: "Submit",
    suggestAnswers: "Suggested Answers",
    suggestExplanation: "Explanation",
    suggestComment: "Comment (optional)",
    suggestTypeAi: "AI",
    suggestTypeManual: "Manual",
    suggestSuccess: "Suggestion submitted",
    suggestNone: "No suggestions yet",
    invalidate: "Invalidate",
    edit: "Edit",
    knewIt: "Knew it",
    didntKnow: "Didn't know",
    filter: "Filter",
    customFilter: "Custom Filter",
    includeUnattempted: "Include unattempted",
    sm2ReviewDue: "SM-2 review due today",
    attemptsMax: "Attempts ≤",
    accuracyMax: "Accuracy ≤ (%)",
    notSeenInDays: "Not seen ≥ (days)",
    reset: "Reset",
    apply: "Apply",
    noLimit: "no limit",
    answer: "Answer",
    correctAnswer: "Correct Answer",
    source: "Source",
    factCheck: "AI Fact Check",
    aiFactChecking: "Fact checking...",
    aiFactCheckCorrect: "Answers verified correct",
    aiFactCheckWrong: "Answer issue found",
    aiFactCheckPrompt: "AI Fact Check Prompt",
  },
  ja: {
    settings: "設定",
    language: "言語",
    languageLabel: "表示言語",
    aiPrompt: "AIファクトチェックプロンプト",
    aiPromptPlaceholder: "AIファクトチェックへの追加指示（例：簡潔に説明する、実務での使われ方を重視する...）",
    aiRefinePrompt: "AI文面修正プロンプト",
    aiRefinePromptPlaceholder: "文面修正への追加指示（例：専門用語はそのまま、日本語の文法のみ修正...）",
    save: "保存",
    saved: "保存済み",
    back: "戻る",
    home: "ホーム",
    submit: "回答する",
    next: "次へ",
    prev: "前へ",
    all: "全問",
    wrong: "不正解",
    explain: "AIファクトチェック",
    refine: "AI文面修正",
    adopt: "採用する",
    dismiss: "閉じる",
    aiExplaining: "ファクトチェック中...",
    aiRefining: "文面修正中...",
    aiSuggestedAnswer: "AI推奨の正解",
    aiExplanation: "解説",
    aiReasoning: "根拠",
    adoptSuccess: "採用しました",
    aiRefineQuestion: "問題文",
    aiRefineChoices: "選択肢",
    aiRefineChanges: "変更箇所",
    aiRefineNoChanges: "修正箇所なし",
    onboardingTitle: "Quizへようこそ",
    onboardingStep1Title: "試験を追加する",
    onboardingStep1Desc: "「Add」カードをクリックするか、CSVファイルをドラッグ＆ドロップして試験を読み込みましょう。",
    onboardingStep2Title: "練習を始める",
    onboardingStep2Desc: "試験カードをタップしてスタート。不正解の問題は記録され、苦手克服に集中できます。",
    onboardingStep3Title: "カスタマイズ",
    onboardingStep3Desc: "設定を開いて表示言語の変更やAIファクトチェックプロンプトの設定ができます。",
    onboardingNext: "次へ",
    onboardingDone: "はじめる",
    startAll: "全問スタート",
    showAll: "全問表示",
    noWrongAnswers: "不正解なし",
    noQuestions: "問題なし",
    allWrongCleared: "不正解が全てクリアされました",
    continueFrom: "続きから",
    uniq: "重複除外",
    suggest: "提案する",
    alternatives: "代替案",
    suggestSubmit: "送信",
    suggestAnswers: "推奨の正解",
    suggestExplanation: "解説",
    suggestComment: "コメント（任意）",
    suggestTypeAi: "AI",
    suggestTypeManual: "手動",
    suggestSuccess: "提案を送信しました",
    suggestNone: "まだ提案がありません",
    invalidate: "無効化",
    edit: "編集",
    knewIt: "知っていた",
    didntKnow: "知らなかった",
    filter: "フィルター",
    customFilter: "カスタムフィルター",
    includeUnattempted: "未挑戦を含む",
    sm2ReviewDue: "本日の復習対象 (SM-2)",
    attemptsMax: "試行回数 ≤",
    accuracyMax: "正答率 ≤ (%)",
    notSeenInDays: "未回答から ≥ 日",
    reset: "リセット",
    apply: "適用",
    noLimit: "制限なし",
    answer: "解答",
    correctAnswer: "正解",
    source: "出典",
    factCheck: "AIファクトチェック",
    aiFactChecking: "ファクトチェック中...",
    aiFactCheckCorrect: "正解が確認されました",
    aiFactCheckWrong: "問題が見つかりました",
    aiFactCheckPrompt: "AIファクトチェックプロンプト",
  },
  zh: {
    settings: "设置",
    language: "语言",
    languageLabel: "显示语言",
    aiPrompt: "AI事实核查提示词",
    aiPromptPlaceholder: "AI事实核查的额外指示（例如：用简单的语言解释、重点说明实际用例...）",
    aiRefinePrompt: "AI措辞修正提示词",
    aiRefinePromptPlaceholder: "措辞修正的额外指示（例如：保持专业术语、只修正语法...）",
    save: "保存",
    saved: "已保存",
    back: "返回",
    home: "首页",
    submit: "提交",
    next: "下一题",
    prev: "上一题",
    all: "全部",
    wrong: "错误",
    explain: "AI事实核查",
    refine: "AI措辞修正",
    adopt: "采用",
    dismiss: "关闭",
    aiExplaining: "事实核查中...",
    aiRefining: "措辞修正中...",
    aiSuggestedAnswer: "AI建议答案",
    aiExplanation: "解释",
    aiReasoning: "推理",
    adoptSuccess: "已采用",
    aiRefineQuestion: "题目",
    aiRefineChoices: "选项",
    aiRefineChanges: "修改内容",
    aiRefineNoChanges: "无修改建议",
    onboardingTitle: "欢迎使用 Quiz",
    onboardingStep1Title: "添加考试",
    onboardingStep1Desc: "点击「Add」卡片或拖放 CSV 文件来加载你的第一个考试。",
    onboardingStep2Title: "开始练习",
    onboardingStep2Desc: "点击任意考试卡片即可开始。答错的题目会被记录，方便你专项突破。",
    onboardingStep3Title: "个性化设置",
    onboardingStep3Desc: "打开设置可以更改显示语言或配置 AI 事实核查提示词。",
    onboardingNext: "下一步",
    onboardingDone: "开始吧",
    startAll: "全部开始",
    showAll: "显示全部",
    noWrongAnswers: "无错误答案",
    noQuestions: "无题目",
    allWrongCleared: "所有错误答案已清除",
    continueFrom: "继续",
    uniq: "去重",
    suggest: "建议",
    alternatives: "替代方案",
    suggestSubmit: "提交",
    suggestAnswers: "建议答案",
    suggestExplanation: "解释",
    suggestComment: "评论（可选）",
    suggestTypeAi: "AI",
    suggestTypeManual: "手动",
    suggestSuccess: "建议已提交",
    suggestNone: "暂无建议",
    invalidate: "作废",
    edit: "编辑",
    knewIt: "知道了",
    didntKnow: "不知道",
    filter: "筛选",
    customFilter: "自定义筛选",
    includeUnattempted: "包含未尝试",
    sm2ReviewDue: "今日待复习 (SM-2)",
    attemptsMax: "尝试次数 ≤",
    accuracyMax: "正确率 ≤ (%)",
    notSeenInDays: "未见 ≥ (天)",
    reset: "重置",
    apply: "应用",
    noLimit: "无限制",
    answer: "答案",
    correctAnswer: "正确答案",
    source: "来源",
    factCheck: "AI事实核查",
    aiFactChecking: "事实核查中...",
    aiFactCheckCorrect: "答案已验证正确",
    aiFactCheckWrong: "发现答案问题",
    aiFactCheckPrompt: "AI事实核查提示词",
  },
  ko: {
    settings: "설정",
    language: "언어",
    languageLabel: "표시 언어",
    aiPrompt: "AI 팩트체크 프롬프트",
    aiPromptPlaceholder: "AI 팩트체크에 대한 추가 지시 (예: 간단히 설명, 실무 사용 사례 위주...)",
    aiRefinePrompt: "AI 문구 수정 프롬프트",
    aiRefinePromptPlaceholder: "문구 수정에 대한 추가 지시 (예: 전문 용어 유지, 문법만 수정...)",
    save: "저장",
    saved: "저장됨",
    back: "뒤로",
    home: "홈",
    submit: "제출",
    next: "다음",
    prev: "이전",
    all: "전체",
    wrong: "오답",
    explain: "AI 팩트체크",
    refine: "AI 문구 수정",
    adopt: "채택",
    dismiss: "닫기",
    aiExplaining: "팩트체크 중...",
    aiRefining: "문구 수정 중...",
    aiSuggestedAnswer: "AI 추천 답",
    aiExplanation: "해설",
    aiReasoning: "근거",
    adoptSuccess: "채택됨",
    aiRefineQuestion: "문제",
    aiRefineChoices: "선택지",
    aiRefineChanges: "변경 사항",
    aiRefineNoChanges: "수정 사항 없음",
    onboardingTitle: "Quiz에 오신 것을 환영합니다",
    onboardingStep1Title: "시험 추가",
    onboardingStep1Desc: "「Add」카드를 클릭하거나 CSV 파일을 드래그 & 드롭하여 시험을 불러오세요.",
    onboardingStep2Title: "연습 시작",
    onboardingStep2Desc: "시험 카드를 탭하여 시작하세요. 틀린 문제는 기록되어 취약 부분에 집중할 수 있습니다.",
    onboardingStep3Title: "커스터마이즈",
    onboardingStep3Desc: "설정을 열어 표시 언어를 변경하거나 AI 팩트체크 프롬프트를 설정할 수 있습니다.",
    onboardingNext: "다음",
    onboardingDone: "시작하기",
    startAll: "전체 시작",
    showAll: "전체 보기",
    noWrongAnswers: "오답 없음",
    noQuestions: "문제 없음",
    allWrongCleared: "모든 오답이 해결되었습니다",
    continueFrom: "이어서",
    uniq: "중복제외",
    suggest: "제안",
    alternatives: "대안",
    suggestSubmit: "제출",
    suggestAnswers: "추천 답",
    suggestExplanation: "해설",
    suggestComment: "댓글 (선택)",
    suggestTypeAi: "AI",
    suggestTypeManual: "수동",
    suggestSuccess: "제안 제출됨",
    suggestNone: "아직 제안 없음",
    invalidate: "무효화",
    edit: "편집",
    knewIt: "알고 있었음",
    didntKnow: "몰랐음",
    filter: "필터",
    customFilter: "맞춤 필터",
    includeUnattempted: "미시도 포함",
    sm2ReviewDue: "오늘 복습 예정 (SM-2)",
    attemptsMax: "시도 횟수 ≤",
    accuracyMax: "정답률 ≤ (%)",
    notSeenInDays: "미확인 ≥ (일)",
    reset: "초기화",
    apply: "적용",
    noLimit: "제한 없음",
    answer: "정답",
    correctAnswer: "정답",
    source: "출처",
    factCheck: "AI 팩트체크",
    aiFactChecking: "팩트체크 중...",
    aiFactCheckCorrect: "답변 확인됨",
    aiFactCheckWrong: "답변 문제 발견",
    aiFactCheckPrompt: "AI 팩트체크 프롬프트",
  },
};

export function t(locale: Locale, key: TranslationKey): string {
  return translations[locale]?.[key] ?? translations["en"][key];
}
