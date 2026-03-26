/**
 * Robust JSON extraction from Gemini AI responses.
 *
 * When using `responseMimeType: "application/json"` with `googleSearch` grounding,
 * Gemini occasionally returns malformed JSON or wraps it in extra text.
 * This helper tries multiple extraction strategies before giving up.
 *
 * See also: parseAiJsonAs() — parses AND validates against a Zod schema.
 */

/** Strip markdown code fences and trim */
function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

/** Try to extract a JSON object from a string that may contain surrounding text */
function extractJsonObject(text: string): string | null {
  // Find the first { and the last matching }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

/**
 * Parse JSON from an AI response string, trying multiple strategies:
 * 1. Direct parse after stripping fences
 * 2. Extract `{...}` substring and parse
 */
export function parseAiJson(raw: string): unknown {
  const stripped = stripFences(raw);

  // Strategy 1: direct parse
  try {
    return JSON.parse(stripped);
  } catch {
    // continue
  }

  // Strategy 2: extract JSON object from surrounding text
  const extracted = extractJsonObject(stripped);
  if (extracted) {
    try {
      return JSON.parse(extracted);
    } catch {
      // continue
    }
  }

  // Strategy 3: try extracting from the original (unstripped) text
  const extractedRaw = extractJsonObject(raw);
  if (extractedRaw && extractedRaw !== extracted) {
    try {
      return JSON.parse(extractedRaw);
    } catch {
      // continue
    }
  }

  return null;
}

/**
 * Parse JSON from an AI response string AND validate it against a Zod-compatible
 * schema.  Returns a discriminated union so callers can handle errors without
 * try/catch.
 *
 * Works with any object that exposes a `safeParse` method (Zod v3, v4, etc.).
 *
 * @example
 * const { data, error } = parseAiJsonAs(raw, AiFactCheckResponseSchema);
 * if (error) { send({ error }); return; }
 * // data is fully typed
 */
export function parseAiJsonAs<T>(
  raw: string,
  schema: { safeParse(input: unknown): { success: true; data: T } | { success: false; error: { message: string } } }
): { data: T; error: null } | { data: null; error: string } {
  const parsed = parseAiJson(raw);
  if (parsed === null) {
    return { data: null, error: "JSON extraction failed" };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { data: null, error: result.error.message };
  }
  return { data: result.data, error: null };
}
