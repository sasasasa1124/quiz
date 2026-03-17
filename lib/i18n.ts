export type Locale = "en" | "ja" | "zh" | "ko";

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
  | "aiRefineNoChanges";

const translations: Record<Locale, Record<TranslationKey, string>> = {
  en: {
    settings: "Settings",
    language: "Language",
    languageLabel: "Display Language",
    aiPrompt: "AI Explain Prompt",
    aiPromptPlaceholder: "Full prompt sent to AI. Use {question}, {choices}, {answers}, {explanation} as placeholders.",
    aiRefinePrompt: "AI Refine Prompt",
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
    explain: "AI Explain",
    refine: "AI Refine",
    adopt: "Adopt",
    dismiss: "Dismiss",
    aiExplaining: "Analyzing...",
    aiRefining: "Refining...",
    aiSuggestedAnswer: "Suggested Answer",
    aiExplanation: "Explanation",
    aiReasoning: "Reasoning",
    adoptSuccess: "Adopted",
    aiRefineQuestion: "Question",
    aiRefineChoices: "Choices",
    aiRefineChanges: "Changes",
    aiRefineNoChanges: "No changes suggested",
  },
  ja: {
    settings: "設定",
    language: "言語",
    languageLabel: "表示言語",
    aiPrompt: "AI解説プロンプト",
    aiPromptPlaceholder: "AI解説への追加指示（例：簡潔に説明する、実務での使われ方を重視する...）",
    aiRefinePrompt: "AI修正プロンプト",
    aiRefinePromptPlaceholder: "問題文修正への追加指示（例：専門用語はそのまま、日本語の文法のみ修正...）",
    save: "保存",
    saved: "保存済み",
    back: "戻る",
    home: "ホーム",
    submit: "回答する",
    next: "次へ",
    prev: "前へ",
    all: "全問",
    wrong: "不正解",
    explain: "AI解説",
    refine: "AI修正",
    adopt: "採用する",
    dismiss: "閉じる",
    aiExplaining: "解析中...",
    aiRefining: "修正中...",
    aiSuggestedAnswer: "AI推奨の正解",
    aiExplanation: "解説",
    aiReasoning: "根拠",
    adoptSuccess: "採用しました",
    aiRefineQuestion: "問題文",
    aiRefineChoices: "選択肢",
    aiRefineChanges: "変更箇所",
    aiRefineNoChanges: "修正箇所なし",
  },
  zh: {
    settings: "设置",
    language: "语言",
    languageLabel: "显示语言",
    aiPrompt: "AI解释提示词",
    aiPromptPlaceholder: "AI解释的额外指示（例如：用简单的语言解释、重点说明实际用例...）",
    aiRefinePrompt: "AI修正提示词",
    aiRefinePromptPlaceholder: "题目修正的额外指示（例如：保持专业术语、只修正语法...）",
    save: "保存",
    saved: "已保存",
    back: "返回",
    home: "首页",
    submit: "提交",
    next: "下一题",
    prev: "上一题",
    all: "全部",
    wrong: "错误",
    explain: "AI解释",
    refine: "AI修正",
    adopt: "采用",
    dismiss: "关闭",
    aiExplaining: "分析中...",
    aiRefining: "修正中...",
    aiSuggestedAnswer: "AI建议答案",
    aiExplanation: "解释",
    aiReasoning: "推理",
    adoptSuccess: "已采用",
    aiRefineQuestion: "题目",
    aiRefineChoices: "选项",
    aiRefineChanges: "修改内容",
    aiRefineNoChanges: "无修改建议",
  },
  ko: {
    settings: "설정",
    language: "언어",
    languageLabel: "표시 언어",
    aiPrompt: "AI 해설 프롬프트",
    aiPromptPlaceholder: "AI 해설에 대한 추가 지시 (예: 간단히 설명, 실무 사용 사례 위주...)",
    aiRefinePrompt: "AI 수정 프롬프트",
    aiRefinePromptPlaceholder: "문제 수정에 대한 추가 지시 (예: 전문 용어 유지, 문법만 수정...)",
    save: "저장",
    saved: "저장됨",
    back: "뒤로",
    home: "홈",
    submit: "제출",
    next: "다음",
    prev: "이전",
    all: "전체",
    wrong: "오답",
    explain: "AI 해설",
    refine: "AI 수정",
    adopt: "채택",
    dismiss: "닫기",
    aiExplaining: "분석 중...",
    aiRefining: "수정 중...",
    aiSuggestedAnswer: "AI 추천 답",
    aiExplanation: "해설",
    aiReasoning: "근거",
    adoptSuccess: "채택됨",
    aiRefineQuestion: "문제",
    aiRefineChoices: "선택지",
    aiRefineChanges: "변경 사항",
    aiRefineNoChanges: "수정 사항 없음",
  },
};

export function t(locale: Locale, key: TranslationKey): string {
  return translations[locale]?.[key] ?? translations["en"][key];
}
