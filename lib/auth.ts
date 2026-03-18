import type { D1Database } from "./db";
import { generateOtp, generateSessionToken, hashPassword, verifyPassword } from "./crypto";

// ── Domain restriction ──────────────────────────────────────────────────────
// To allow additional domains, add them to ALLOWED_DOMAINS.
// To disable domain restriction entirely, set ALLOWED_DOMAINS to null.
const ALLOWED_DOMAINS: string[] | null = ["salesforce.com"];
// const ALLOWED_DOMAINS: string[] | null = null; // unrestricted mode

export function isEmailAllowed(email: string | null): boolean {
  if (email === null) return true; // local dev: CF header absent
  if (ALLOWED_DOMAINS === null) return true; // unrestricted mode
  return ALLOWED_DOMAINS.some((d) => email.endsWith(`@${d}`));
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface SessionInfo {
  userEmail: string;
  emailVerified: boolean;
}

// ── User ────────────────────────────────────────────────────────────────────

/** Upsert a users row. Returns the row's email_verified state. */
export async function getOrCreateUser(
  db: D1Database,
  email: string
): Promise<{ emailVerified: boolean }> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO users (email, email_verified, created_at)
       VALUES (?, 0, datetime('now'))`
    )
    .bind(email)
    .run();

  const row = await db
    .prepare("SELECT email_verified FROM users WHERE email = ?")
    .bind(email)
    .first<{ email_verified: number }>();

  return { emailVerified: (row?.email_verified ?? 0) === 1 };
}

export async function setUserVerified(
  db: D1Database,
  email: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE users SET email_verified = 1, last_login_at = datetime('now') WHERE email = ?`
    )
    .bind(email)
    .run();
}

export async function setUserPassword(
  db: D1Database,
  email: string,
  password: string
): Promise<void> {
  const { hash, salt } = await hashPassword(password);
  await db
    .prepare(
      `UPDATE users SET password_hash = ?, password_salt = ? WHERE email = ?`
    )
    .bind(hash, salt, email)
    .run();
}

export async function checkUserPassword(
  db: D1Database,
  email: string,
  password: string
): Promise<{ ok: boolean; emailVerified: boolean }> {
  const row = await db
    .prepare(
      "SELECT password_hash, password_salt, email_verified FROM users WHERE email = ?"
    )
    .bind(email)
    .first<{
      password_hash: string | null;
      password_salt: string | null;
      email_verified: number;
    }>();

  if (!row || !row.password_hash || !row.password_salt) {
    return { ok: false, emailVerified: false };
  }

  const ok = await verifyPassword(password, row.password_hash, row.password_salt);
  return { ok, emailVerified: (row.email_verified ?? 0) === 1 };
}

// ── OTP ─────────────────────────────────────────────────────────────────────

const OTP_TTL_MINUTES = 10;
const OTP_RATE_LIMIT_PER_HOUR = 5;

export async function createOtp(
  db: D1Database,
  email: string,
  purpose: "login" | "verify"
): Promise<{ code: string } | { rateLimited: true }> {
  // Rate limiting: max OTP_RATE_LIMIT_PER_HOUR sends per hour
  const recent = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM otp_codes
       WHERE user_email = ? AND created_at > datetime('now', '-1 hour')`
    )
    .bind(email)
    .first<{ cnt: number }>();

  if ((recent?.cnt ?? 0) >= OTP_RATE_LIMIT_PER_HOUR) {
    return { rateLimited: true };
  }

  // Invalidate old unused codes for same email+purpose
  await db
    .prepare(
      `UPDATE otp_codes SET used = 1
       WHERE user_email = ? AND purpose = ? AND used = 0`
    )
    .bind(email, purpose)
    .run();

  const code = generateOtp();
  await db
    .prepare(
      `INSERT INTO otp_codes (user_email, code, purpose, created_at, expires_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now', '+${OTP_TTL_MINUTES} minutes'))`
    )
    .bind(email, code, purpose)
    .run();

  return { code };
}

export async function verifyOtp(
  db: D1Database,
  email: string,
  code: string,
  purpose: "login" | "verify"
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT id FROM otp_codes
       WHERE user_email = ? AND code = ? AND purpose = ?
         AND used = 0 AND expires_at > datetime('now')
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(email, code, purpose)
    .first<{ id: number }>();

  if (!row) return false;

  await db
    .prepare("UPDATE otp_codes SET used = 1 WHERE id = ?")
    .bind(row.id)
    .run();

  return true;
}

// ── Auth sessions ───────────────────────────────────────────────────────────

const SESSION_TTL_DAYS = 30;

export async function createAuthSession(
  db: D1Database,
  userEmail: string,
  userAgent?: string,
  ip?: string
): Promise<string> {
  const token = generateSessionToken();
  await db
    .prepare(
      `INSERT INTO auth_sessions (id, user_email, created_at, expires_at, user_agent, ip)
       VALUES (?, ?, datetime('now'), datetime('now', '+${SESSION_TTL_DAYS} days'), ?, ?)`
    )
    .bind(token, userEmail, userAgent ?? null, ip ?? null)
    .run();
  return token;
}

export async function validateAuthSession(
  db: D1Database,
  token: string
): Promise<SessionInfo | null> {
  const row = await db
    .prepare(
      `SELECT s.user_email, u.email_verified
       FROM auth_sessions s
       JOIN users u ON u.email = s.user_email
       WHERE s.id = ? AND s.expires_at > datetime('now')`
    )
    .bind(token)
    .first<{ user_email: string; email_verified: number }>();

  if (!row) return null;
  return {
    userEmail: row.user_email,
    emailVerified: row.email_verified === 1,
  };
}

export async function deleteAuthSession(
  db: D1Database,
  token: string
): Promise<void> {
  await db
    .prepare("DELETE FROM auth_sessions WHERE id = ?")
    .bind(token)
    .run();
}

export async function touchSession(
  db: D1Database,
  token: string
): Promise<void> {
  // Extend session expiry on activity
  await db
    .prepare(
      `UPDATE auth_sessions SET expires_at = datetime('now', '+${SESSION_TTL_DAYS} days')
       WHERE id = ?`
    )
    .bind(token)
    .run();
}
