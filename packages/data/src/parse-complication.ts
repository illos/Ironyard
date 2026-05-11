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
    if (/^\*\*Benefit:\*\*/i.test(t) || /^\*\*Drawback:\*\*/i.test(t)) break;
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
  const benefit = extractBoldField(body, 'Benefit');
  const drawback = extractBoldField(body, 'Drawback');

  if (!benefit) return { ok: false, reason: 'missing Benefit field' };
  if (!drawback) return { ok: false, reason: 'missing Drawback field' };

  const candidate = { id, name, description, benefit, drawback };
  const parsed = ComplicationSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, reason: `schema validation: ${parsed.error.message}` };
  }
  return { ok: true, complication: parsed.data };
}
