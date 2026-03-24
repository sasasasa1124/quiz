"use client";

import React from "react";

// Matches (in order): **bold**, *italic*, `code`
const INLINE_RE = /(\*\*([^\n*]+?)\*\*|\*([^\n*]+?)\*|`([^`\n]+?)`)/g;

type InlineToken =
  | { t: "text"; v: string }
  | { t: "bold"; v: string }
  | { t: "italic"; v: string }
  | { t: "code"; v: string };

function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(INLINE_RE.source, INLINE_RE.flags); // reset lastIndex
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ t: "text", v: text.slice(last, m.index) });
    if (m[0].startsWith("**"))     tokens.push({ t: "bold",    v: m[2] ?? "" });
    else if (m[0].startsWith("*")) tokens.push({ t: "italic",  v: m[3] ?? "" });
    else if (m[0].startsWith("`")) tokens.push({ t: "code",    v: m[4] ?? "" });
    else                            tokens.push({ t: "text", v: m[0] });
    last = re.lastIndex;
  }
  if (last < text.length) tokens.push({ t: "text", v: text.slice(last) });
  return tokens;
}

function renderInline(text: string): React.ReactNode {
  const tokens = tokenizeInline(text);
  return tokens.map((tok, i) => {
    if (tok.t === "bold")
      return <strong key={i} className="font-semibold text-gray-950">{tok.v}</strong>;
    if (tok.t === "italic")
      return <em key={i} className="italic">{tok.v}</em>;
    if (tok.t === "code")
      return (
        <code key={i} className="font-mono text-[0.875em] bg-gray-100 px-1 py-0.5 rounded text-violet-700">
          {tok.v}
        </code>
      );
    return <React.Fragment key={i}>{tok.v}</React.Fragment>;
  });
}

// ── Block parser ──────────────────────────────────────────────────────────────
// Groups lines into: plain text runs, bullet lists (- / *), numbered lists (1.), images
type Block =
  | { type: "text"; lines: string[] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "img"; src: string };

const UL_RE = /^[ \t]*[-*]\s+(.+)$/;
const OL_RE = /^[ \t]*\d+[.)]\s+(.+)$/;
// [img: /path/to/image.jpg] — image embed
const IMG_RE = /^\[img:\s*([^\]]+)\]$/;

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let cur: Block | null = null;

  const flush = () => { if (cur) { blocks.push(cur); cur = null; } };

  for (const line of lines) {
    const imgM = IMG_RE.exec(line.trim());
    const ulM = !imgM && UL_RE.exec(line);
    const olM = !imgM && !ulM && OL_RE.exec(line);

    if (imgM) {
      flush();
      blocks.push({ type: "img", src: imgM[1].trim() });
    } else if (ulM) {
      if (cur?.type !== "ul") { flush(); cur = { type: "ul", items: [] }; }
      (cur as { type: "ul"; items: string[] }).items.push(ulM[1]);
    } else if (olM) {
      if (cur?.type !== "ol") { flush(); cur = { type: "ol", items: [] }; }
      (cur as { type: "ol"; items: string[] }).items.push(olM[1]);
    } else {
      if (cur?.type !== "text") { flush(); cur = { type: "text", lines: [] }; }
      (cur as { type: "text"; lines: string[] }).lines.push(line);
    }
  }
  flush();
  return blocks;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface RichTextProps {
  text: string;
  className?: string;
  /** Enable block-level parsing (lists). Use for question bodies and explanations. */
  block?: boolean;
}

/**
 * Renders text with:
 * - Inline markdown: **bold**, *italic*, `code`
 * - Optional block parsing: bullet/numbered lists, paragraph breaks
 */
export function RichText({ text, className, block = false }: RichTextProps) {
  if (!block) {
    const lines = text.split("\n");
    return (
      <span className={className}>
        {lines.map((line, i) => (
          <React.Fragment key={i}>
            {renderInline(line)}
            {i < lines.length - 1 && <br />}
          </React.Fragment>
        ))}
      </span>
    );
  }

  const blocks = parseBlocks(text);
  return (
    <div className={className}>
      {blocks.map((b, bi) => {
        if (b.type === "img") {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={bi}
              src={b.src}
              alt="Exhibit"
              className="max-w-full rounded-lg mt-2 border border-gray-200"
            />
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={bi} className="list-disc list-outside pl-5 space-y-0.5 my-1.5">
              {b.items.map((item, ii) => (
                <li key={ii} className="leading-relaxed">{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={bi} className="list-decimal list-outside pl-5 space-y-0.5 my-1.5">
              {b.items.map((item, ii) => (
                <li key={ii} className="leading-relaxed">{renderInline(item)}</li>
              ))}
            </ol>
          );
        }
        // Plain text block
        return (
          <p key={bi} className={bi > 0 ? "mt-2" : undefined}>
            {b.lines.map((line, li) => (
              <React.Fragment key={li}>
                {renderInline(line)}
                {li < b.lines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
