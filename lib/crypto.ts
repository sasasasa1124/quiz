// Edge-compatible cryptographic utilities (Web Crypto API only — no Node.js)

/** Generate a cryptographically secure random hex string of given byte length */
export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Generate a 6-digit OTP code */
export function generateOtp(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1_000_000).padStart(6, "0");
}

/** Generate a 64-char hex session token (32 random bytes) */
export function generateSessionToken(): string {
  return randomHex(32);
}

function hexToBytes(hex: string): Uint8Array {
  const buf = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    buf[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return buf;
}

/** Hash a password using PBKDF2-SHA256. Returns { hash, salt } as hex strings. */
export async function hashPassword(
  password: string
): Promise<{ hash: string; salt: string }> {
  const salt = randomHex(16); // 16 random bytes
  const saltBytes = hexToBytes(salt);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes.buffer as ArrayBuffer, iterations: 100_000 },
    keyMaterial,
    256
  );

  const hash = Array.from(new Uint8Array(derived))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return { hash, salt };
}

/** Constant-time byte comparison to prevent timing attacks */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/** Verify a password against stored hash + salt (both hex strings) */
export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  const saltBytes = hexToBytes(storedSalt);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes.buffer as ArrayBuffer, iterations: 100_000 },
    keyMaterial,
    256
  );

  return constantTimeEqual(new Uint8Array(derived), hexToBytes(storedHash));
}
