CREATE TABLE IF NOT EXISTS suggestions (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id           TEXT NOT NULL,
  type                  TEXT NOT NULL CHECK (type IN ('ai', 'manual')),
  suggested_answers     TEXT DEFAULT NULL,
  suggested_explanation TEXT DEFAULT NULL,
  ai_model              TEXT DEFAULT NULL,
  comment               TEXT DEFAULT NULL,
  created_by            TEXT NOT NULL,
  created_at            TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_suggestions_question_id ON suggestions(question_id);
