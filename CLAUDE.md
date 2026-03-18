# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Quiz — a Salesforce/MuleSoft certification exam practice app. Built with Next.js 15 (App Router), React 19, TypeScript, and Tailwind CSS v4. All application code lives under `quiz/`.

CSV question files are stored in the repository root (parent of `quiz/`), read server-side via `quiz/lib/csv.ts`.

## Commands

All commands run from the `quiz/` directory:

```bash
# Development server
npm run dev

# Production build
npm run build

# Start production server
npm start
```

## Architecture

### Routes

- `/` — mode select (Home)
- `/select/[mode]` — language select
- `/select/[mode]/[lang]` — exam list
- `/quiz/[exam]?mode=&filter=` — quiz screen

### Key Files

- **`lib/csv.ts`**: Server-side CSV loader. Reads question files from the repository root (one directory above `quiz/`).
- **`lib/types.ts`**: Shared TypeScript types.
- **`app/api/`**: API routes.
- **`components/`**: UI components (QuizClient, QuizQuestion, ExamCard, etc.).

### Data

- **CSV files**: Located at `/Users/kota.sasamoto/sandbox/claude-code/*.csv`. Each file corresponds to an exam.
- **Stats**: Stored in `localStorage` with key `quiz-stats-{examId}`. Value shape: `{ [questionId]: { attempts: number, correct: number } }`.

### UI Stack

- Tailwind CSS v4
- Lucide React icons (no emojis in UI)
- No external UI component library

## Deployment Rules

- **Branch strategy**: Never work directly on `main`. Always create a feature branch (`feat/xxx`, `fix/xxx`).
- **Deployment verification**: After pushing, confirm the GitHub Actions workflow completes successfully. Check deployment status before declaring the work done.
- **Cloudflare commit messages**: Cloudflare Pages API rejects non-ASCII characters in commit messages (error code 8000111). Keep commit messages in English/ASCII only.
- **D1 migrations**: Production migrations are applied via `scripts/migrate-d1.sh` or wrangler. Verify the migration ran on production after deployment.

## UI Design System

All components must follow these patterns consistently. Do not introduce new patterns without updating this section.

### Colors (semantic)

| Semantic | Tailwind scale |
|----------|---------------|
| Correct / Know | `emerald-50/200/500/600/900` |
| Wrong / Don't Know | `rose-50/100/200/400/500` |
| Primary action | `gray-900` hover `gray-700` |
| Page background | `#f8f9fb` (CSS var `--background`) |
| Secondary text | `text-gray-400` |
| Caption/hint | `text-gray-300` |

### Buttons

- **Primary**: `h-10 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors`
- **Secondary/outline**: `h-10 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors`
- **Success action** (Know): `h-10 rounded-xl border-2 border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 font-semibold text-sm transition-colors`
- **Danger action** (Don't Know): `h-10 rounded-xl border-2 border-rose-200 text-rose-500 bg-rose-50 hover:bg-rose-100 font-semibold text-sm transition-colors`
- **Utility small**: `px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors`
- **Keyboard hint inline**: `<span className="text-xs opacity-40 hidden sm:inline">Enter</span>`

### Answer choice (interactive, QuizQuestion)

```
Container: border rounded-xl px-4 py-3 lg:px-5 lg:py-4
Badge:     w-6 h-6 lg:w-7 lg:h-7 rounded-lg border
Text:      text-sm lg:text-base leading-relaxed
```

### Answer pill (reveal, non-interactive — ReviewReveal / AnswerRevealModal)

```
Container: flex items-start gap-3 px-4 py-3 lg:px-5 lg:py-4 rounded-xl bg-emerald-50 border border-emerald-200
Badge:     shrink-0 w-6 h-6 lg:w-7 lg:h-7 rounded-lg bg-emerald-500 text-white text-xs lg:text-sm font-bold
Text:      text-sm lg:text-base text-emerald-900 leading-snug
```

### Typography

- **Section label**: `text-[11px] font-semibold text-gray-400 uppercase tracking-wider`
- **Body**: `text-sm leading-relaxed text-gray-700`
- **Caption**: `text-xs text-gray-400`

### Spacing

- Content containers: `px-4 sm:px-8`
- Footer/action areas: `px-4 sm:px-8 py-4 border-t border-gray-100`
