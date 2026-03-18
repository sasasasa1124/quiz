-- Spaced Repetition System (SM-2) fields on scores table
ALTER TABLE scores ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 1;
ALTER TABLE scores ADD COLUMN ease_factor REAL NOT NULL DEFAULT 2.5;
ALTER TABLE scores ADD COLUMN next_review_at TEXT; -- ISO date YYYY-MM-DD, NULL = never reviewed via flashcard
