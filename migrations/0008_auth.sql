-- Auth tables: users, auth_sessions, otp_codes

CREATE TABLE IF NOT EXISTS users (
  email           TEXT PRIMARY KEY,
  password_hash   TEXT,            -- NULL = OTP-only user (PBKDF2 hex)
  password_salt   TEXT,
  email_verified  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at   TEXT
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id          TEXT PRIMARY KEY,        -- 64-char hex (32 random bytes)
  user_email  TEXT NOT NULL REFERENCES users(email),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  user_agent  TEXT,
  ip          TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_email ON auth_sessions(user_email);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS otp_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email  TEXT NOT NULL,
  code        TEXT NOT NULL,           -- 6-digit plain text (ephemeral)
  purpose     TEXT NOT NULL CHECK (purpose IN ('login', 'verify')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(user_email, purpose);
