CREATE TABLE IF NOT EXISTS user_invalidated_questions (
  user_email  TEXT NOT NULL,
  question_id TEXT NOT NULL,
  PRIMARY KEY (user_email, question_id)
);
