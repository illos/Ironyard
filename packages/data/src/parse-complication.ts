import { type Complication, ComplicationSchema } from '@ironyard/shared';
import matter from 'gray-matter';

export type ComplicationParseResult =
  | { ok: true; complication: Complication }
  | { ok: false; reason: string };

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Extract the leading description paragraph(s) before **Benefit:** */
function extractDescription(body: string): string {
  const lines = body.split(/\r?\n/);
  const parts: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (
      /^\*\*Benefit:\*\*/i.test(t) ||
      /^\*\*Drawback:\*\*/i.test(t) ||
      /^\*\*Benefit and Drawback:\*\*/i.test(t)
    )
      break;
    parts.push(t);
  }
  return parts.join(' ').trim();
}

/** Extract the value after a bold label like "**Benefit:** ..." */
function extractBoldField(body: string, label: string): string | null {
  const re = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, 'im');
  const m = re.exec(body);
  if (!m || m[1] === undefined) return null;
  return m[1].trim();
}

/**
 * Extract benefit and drawback text from a complication body.
 *
 * Handles two layouts observed in the SteelCompendium markdown:
 *
 *   Standard (most complications):
 *     **Benefit:** <inline text>
 *     **Drawback:** <inline text>
 *
 *   Combined (8 complications: Advanced Studies, Feytouched, etc.):
 *     **Benefit and Drawback:** <inline text followed by bullet list>
 *     In this case the same text is used for both benefit and drawback fields
 *     so the schema is satisfied and the full description is accessible.
 */
function extractBenefitAndDrawback(body: string): { benefit: string; drawback: string } | null {
  // Try standard separate fields first.
  const benefit = extractBoldField(body, 'Benefit');
  const drawback = extractBoldField(body, 'Drawback');
  if (benefit && drawback) return { benefit, drawback };

  // Fallback: combined "Benefit and Drawback" field.
  // Capture the inline text on the same line; subsequent bullet lines are
  // included by collecting until the next blank line or heading.
  const combinedRe = /^\*\*Benefit and Drawback:\*\*\s*(.*)$/im;
  const combinedMatch = combinedRe.exec(body);
  if (combinedMatch) {
    const firstLine = (combinedMatch[1] ?? '').trim();
    // Collect any continuation lines (bullet points, etc.) until blank/heading.
    const afterIdx = body.indexOf(combinedMatch[0]) + combinedMatch[0].length;
    const rest = body.slice(afterIdx);
    const continuationLines: string[] = [];
    for (const line of rest.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || /^#{1,6}\s/.test(t) || /^\*\*\w/.test(t)) break;
      continuationLines.push(t);
    }
    const combined = [firstLine, ...continuationLines].filter(Boolean).join(' ');
    if (combined) return { benefit: combined, drawback: combined };
  }

  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main entry
// ──────────────────────────────────────────────────────────────────────────────

export function parseComplicationMarkdown(content: string): ComplicationParseResult {
  let fm: Record<string, unknown>;
  let body: string;
  try {
    const parsed = matter(content);
    fm = parsed.data as Record<string, unknown>;
    body = parsed.content;
  } catch (e) {
    return { ok: false, reason: `frontmatter parse failed: ${(e as Error).message}` };
  }

  const id = typeof fm.item_id === 'string' ? fm.item_id : null;
  const name = typeof fm.item_name === 'string' ? fm.item_name : null;
  if (!id) return { ok: false, reason: 'missing item_id' };
  if (!name) return { ok: false, reason: 'missing item_name' };

  const description = extractDescription(body);
  const fields = extractBenefitAndDrawback(body);

  if (!fields) return { ok: false, reason: 'missing Benefit field' };
  const { benefit, drawback } = fields;

  const candidate = { id, name, description, benefit, drawback };
  const parsed = ComplicationSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, reason: `schema validation: ${parsed.error.message}` };
  }
  return { ok: true, complication: parsed.data };
}

/**
 * Convenience wrapper for tests: parses complication markdown and throws on failure.
 * The `_filename` parameter is accepted for interface consistency but unused.
 */
export function parseComplication(content: string, _filename: string): Complication {
  const result = parseComplicationMarkdown(content);
  if (!result.ok) throw new Error(result.reason);
  return result.complication;
}
