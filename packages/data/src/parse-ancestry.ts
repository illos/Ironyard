import { type Ancestry, AncestrySchema, type AncestryTrait } from '@ironyard/shared';
import matter from 'gray-matter';

export type AncestryParseResult = { ok: true; ancestry: Ancestry } | { ok: false; reason: string };

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Strip markdown bold/italic markers from a string. */
function stripMarkdown(s: string): string {
  return s.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1').trim();
}

/**
 * Extract the ancestry description — the prose paragraphs that appear before
 * the "### [Ancestry Name] Traits" section.
 */
function extractDescription(body: string): string {
  const lines = body.split(/\r?\n/);
  const parts: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    // Stop at the Traits section heading or any h3+.
    if (/^#{1,3}\s+\S/.test(t)) break;
    if (!t) continue;
    parts.push(t);
  }
  return parts.join(' ').trim();
}

/**
 * Extract the signature trait. Looks for "#### Signature Trait: Name" then
 * captures the text that follows until the next heading.
 */
function extractSignatureTrait(body: string): { name: string; description: string } | null {
  const sigMatch = /^####\s+Signature Trait:\s*(.+)$/im.exec(body);
  if (!sigMatch || sigMatch[1] === undefined) return null;
  const traitName = sigMatch[1].trim();

  // Collect lines after the heading until the next heading.
  const afterIdx = body.indexOf(sigMatch[0]) + sigMatch[0].length;
  const rest = body.slice(afterIdx);
  const lines = rest.split(/\r?\n/);
  const descParts: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^#{1,6}\s/.test(t)) break;
    if (t) descParts.push(t);
  }

  return { name: traitName, description: descParts.join(' ').trim() };
}

/**
 * Extract purchased traits from "#####" headings like:
 *   ##### Barbed Tail (1 Point)
 *   ##### Impressive Horns (2 Points)
 */
function extractPurchasedTraits(body: string): AncestryTrait[] {
  const traits: AncestryTrait[] = [];

  // Match headings of the form "##### Name (N Point[s])"
  const headingRe = /^#####\s+(.+?)\s*\((\d+)\s+Points?\)/gim;
  const matches = [...body.matchAll(headingRe)];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (!m || m[1] === undefined || m[2] === undefined) continue;
    const traitName = m[1].trim();
    const cost = Number.parseInt(m[2], 10);

    // Slugify name for id.
    const id = traitName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Description: lines after this heading up to the next heading.
    const headingEnd = (m.index ?? 0) + m[0].length;
    const nextHeadingIdx =
      i + 1 < matches.length ? (matches[i + 1]?.index ?? body.length) : body.length;
    const section = body.slice(headingEnd, nextHeadingIdx);
    const descParts: string[] = [];
    for (const line of section.split(/\r?\n/)) {
      const t = line.trim();
      if (/^#{1,6}\s/.test(t)) break;
      if (t) descParts.push(t);
    }

    traits.push({
      id,
      name: traitName,
      cost,
      description: stripMarkdown(descParts.join(' ').trim()),
    });
  }

  return traits;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main entry
// ──────────────────────────────────────────────────────────────────────────────

export function parseAncestryMarkdown(content: string): AncestryParseResult {
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
  const sig = extractSignatureTrait(body);
  if (!sig) return { ok: false, reason: 'missing Signature Trait section' };

  const purchasedTraits = extractPurchasedTraits(body);

  const candidate = {
    id,
    name,
    description,
    signatureTrait: { name: sig.name, description: sig.description },
    purchasedTraits,
    ancestryPoints: 3,
  };

  const parsed = AncestrySchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, reason: `schema validation: ${parsed.error.message}` };
  }
  return { ok: true, ancestry: parsed.data };
}

/**
 * Convenience wrapper for tests: parses ancestry markdown and throws on failure.
 * The `_filename` parameter is accepted for interface consistency but unused.
 */
export function parseAncestry(content: string, _filename: string): Ancestry {
  const result = parseAncestryMarkdown(content);
  if (!result.ok) throw new Error(result.reason);
  return result.ancestry;
}
