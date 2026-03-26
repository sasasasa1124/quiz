/**
 * Robust JSON extraction from Gemini AI responses.
 *
 * When using `responseMimeType: "application/json"` with `googleSearch` grounding,
 * Gemini occasionally returns malformed JSON or wraps it in extra text.
 * This helper tries multiple extraction strategies before giving up.
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
