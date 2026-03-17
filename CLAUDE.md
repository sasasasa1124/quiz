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
