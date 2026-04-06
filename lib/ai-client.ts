/**
 * Unified AI client adapter.
 *
 * DEPLOY_TARGET=aws  → AWS Bedrock (Claude) via SigV4 + IAM role  (no internet required)
 * otherwise          → Google Gemini (Cloudflare / local dev)
 *
 * Bedrock requires:
 *   - AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN (injected by App Runner instance role)
 *   - VPC endpoint: com.amazonaws.us-west-2.bedrock-runtime
 */

export const isAWS = process.env.DEPLOY_TARGET === "aws";

// Default models
const DEFAULT_BEDROCK_MODEL = "us.anthropic.claude-sonnet-4-6";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-preview";

const BEDROCK_REGION = "us-west-2";
const BEDROCK_BASE = `https://bedrock-runtime.${BEDROCK_REGION}.amazonaws.com`;

export interface AiMessage {
  role: "user" | "model";
  text: string;
}

export interface AiGenerateOptions {
  /** Instruct model to respond with JSON only */
  jsonMode?: boolean;
  /** Request web search grounding (Gemini only; ignored on Bedrock) */
  useSearch?: boolean;
  /** Multi-turn conversation history */
  history?: AiMessage[];
  /** System prompt */
  systemPrompt?: string;
  /** Override model (Gemini model name or Bedrock model ID) */
  model?: string;
  /** Per-request timeout in ms (default 25000). */
  timeoutMs?: number;
}

export interface AiGenerateResult {
  text: string;
  /** Grounding source URLs (Gemini googleSearch only; empty on Bedrock) */
  sources: string[];
}

/** Main entry point. Routes to Bedrock on AWS, Gemini elsewhere. */
export async function aiGenerate(
  prompt: string,
  options: AiGenerateOptions = {}
): Promise<AiGenerateResult> {
  if (isAWS) return bedrockGenerate(prompt, options);
  return geminiGenerate(prompt, options);
}

// ── SigV4 signing (Web Crypto API — edge-runtime compatible) ──────────────

async function hmacSha256(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
}

async function sha256hex(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

/**
 * Fetch AWS credentials.
 * App Runner injects credentials via ECS container metadata endpoint, NOT static env vars.
 * Falls back to static env vars for local dev/testing.
 */
async function getAwsCredentials(): Promise<AwsCredentials> {
  const relativeUri = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
  if (relativeUri) {
    const resp = await fetch(`http://169.254.170.2${relativeUri}`);
    if (!resp.ok) {
      throw new Error(`Failed to fetch container credentials: ${resp.status} ${resp.statusText}`);
    }
    const creds = await resp.json() as {
      AccessKeyId: string;
      SecretAccessKey: string;
      Token?: string;
    };
    return {
      accessKeyId: creds.AccessKeyId,
      secretAccessKey: creds.SecretAccessKey,
      sessionToken: creds.Token,
    };
  }

  // Fallback: static env vars (local dev)
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? "";
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS credentials not available (set AWS_CONTAINER_CREDENTIALS_RELATIVE_URI or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)");
  }
  return { accessKeyId, secretAccessKey, sessionToken };
}

async function sigV4Headers(url: string, bodyStr: string, region: string): Promise<Record<string, string>> {
  const { accessKeyId, secretAccessKey, sessionToken } = await getAwsCredentials();

  const service = "bedrock";
  const now = new Date();
  // yyyyMMdd
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  // yyyyMMddTHHmmssZ
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const parsedUrl = new URL(url);
  const host = parsedUrl.hostname;
  // SigV4: path must use URI-encoded segments (not the full encoded path)
  const path = parsedUrl.pathname;

  const payloadHash = await sha256hex(bodyStr);

  // Canonical headers — must be sorted, lowercase
  const headersToSign: Record<string, string> = {
    "content-type": "application/json",
    host,
    "x-amz-date": amzDate,
  };
  if (sessionToken) headersToSign["x-amz-security-token"] = sessionToken;

  const sortedKeys = Object.keys(headersToSign).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${headersToSign[k]}`).join("\n") + "\n";
  const signedHeaders = sortedKeys.join(";");

  const canonicalRequest = ["POST", path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256hex(canonicalRequest)].join("\n");

  const enc = new TextEncoder();
  const kDate = await hmacSha256(enc.encode("AWS4" + secretAccessKey), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, "aws4_request");
  const sig = Array.from(new Uint8Array(await hmacSha256(kSigning, stringToSign)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Amz-Date": amzDate,
    Authorization: authHeader,
  };
  if (sessionToken) headers["X-Amz-Security-Token"] = sessionToken;
  return headers;
}

// ── Bedrock (AWS) ─────────────────────────────────────────────────────────

async function bedrockGenerate(
  prompt: string,
  options: AiGenerateOptions
): Promise<AiGenerateResult> {
  // Build message array (convert Gemini-style "model" role → Claude "assistant")
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const h of options.history ?? []) {
    messages.push({ role: h.role === "model" ? "assistant" : "user", content: h.text });
  }
  messages.push({ role: "user", content: prompt });

  // Build system prompt
  let system = options.systemPrompt ?? "";
  if (options.jsonMode) {
    system += (system ? "\n" : "") + "Respond with valid JSON only. No markdown code fences.";
  }

  const modelId = options.model ?? process.env.BEDROCK_MODEL ?? DEFAULT_BEDROCK_MODEL;

  const body: Record<string, unknown> = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 8192,
    messages,
  };
  if (system) body.system = system;

  const url = `${BEDROCK_BASE}/model/${encodeURIComponent(modelId)}/invoke`;
  const bodyStr = JSON.stringify(body);
  const signedHeaders = await sigV4Headers(url, bodyStr, BEDROCK_REGION);

  const resp = await fetch(url, {
    method: "POST",
    headers: signedHeaders,
    body: bodyStr,
    signal: AbortSignal.timeout(options.timeoutMs ?? 25_000),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.statusText);
    throw new Error(`Bedrock ${resp.status}: ${err}`);
  }

  const data = await resp.json() as {
    content: Array<{ type: string; text: string }>;
  };
  const text = data.content.find((c) => c.type === "text")?.text ?? "";
  return { text: text.trim(), sources: [] };
}

// ── Gemini (Cloudflare / local dev) ──────────────────────────────────────

async function geminiGenerate(
  prompt: string,
  options: AiGenerateOptions
): Promise<AiGenerateResult> {
  const { GoogleGenAI } = await import("@google/genai");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const ai = new GoogleGenAI({ apiKey });
  const model = options.model ?? DEFAULT_GEMINI_MODEL;

  // Build contents: string for simple, array for conversation
  type GeminiContents =
    | string
    | Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;

  let contents: GeminiContents = prompt;
  if (options.history?.length) {
    contents = [
      ...options.history.map((h) => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
      { role: "user" as const, parts: [{ text: prompt }] },
    ];
  }

  const timeoutMs = options.timeoutMs ?? 25_000;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const timeoutRace = new Promise<never>((_, reject) => {
    timeoutSignal.addEventListener("abort", () =>
      reject(new DOMException(`Gemini request timed out after ${timeoutMs}ms`, "TimeoutError"))
    );
  });

  const response = await Promise.race([
    ai.models.generateContent({
      model,
      contents,
      config: {
        ...(options.useSearch ? { tools: [{ googleSearch: {} }] } : {}),
        ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    }),
    timeoutRace,
  ]);

  let sources: string[] = [];
  if (options.useSearch) {
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    sources = (chunks as Array<{ web?: { uri?: string } }>)
      .map((c) => c.web?.uri)
      .filter((u): u is string => typeof u === "string" && u.length > 0)
      .slice(0, 3);
  }

  return { text: (response.text ?? "").trim(), sources };
}
