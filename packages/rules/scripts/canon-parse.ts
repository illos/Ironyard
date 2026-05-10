// Pure parsing helpers for docs/rules-canon.md.
// Kept side-effect-free so the unit tests can hit them without touching the filesystem.
// The CLI wrappers (gen-canon-status.ts, canon-report.ts) handle I/O.

export type CanonStatus = 'verified' | 'drafted' | 'tbd';

const STATUS_BY_EMOJI: Record<string, CanonStatus> = {
  '✅': 'verified',
  '🚧': 'drafted',
  '⛔': 'tbd',
};

const STATUS_EMOJI_RE = /[✅🚧⛔]/u;
const STATUS_EMOJI_GLOBAL_RE = /[✅🚧⛔]/gu;
const HEADING_RE = /^(#{2,3})\s+(.+?)\s*$/;
const SECTION_NUMBER_RE = /^(\d+(?:\.\d+)*)\.?\s+/;

export function extractStatus(headingText: string): CanonStatus | null {
  const match = headingText.match(STATUS_EMOJI_RE);
  if (!match) return null;
  return STATUS_BY_EMOJI[match[0]] ?? null;
}

export function deriveSlugFragment(headingText: string): string {
  let text = headingText.replace(STATUS_EMOJI_GLOBAL_RE, '');
  text = text.replace(SECTION_NUMBER_RE, '');
  text = text.replace(/\([^)]*\)/g, '');
  text = text
    .replace(/&/g, ' and ')
    .replace(/[—–]/g, '-') // em dash, en dash
    .replace(/[‘’']/g, ''); // typographic + ASCII apostrophe
  text = text.toLowerCase();
  text = text.replace(/[^a-z0-9-]+/g, '-');
  text = text.replace(/-+/g, '-');
  text = text.replace(/^-+|-+$/g, '');
  return text;
}

type ParseEntry = { slug: string; status: CanonStatus };

export function parseCanonDoc(markdown: string): ParseEntry[] {
  const lines = markdown.split('\n');
  const entries: ParseEntry[] = [];

  let currentH2Slug: string | null = null;
  let currentH2Status: CanonStatus | null = null;

  for (const line of lines) {
    const match = line.match(HEADING_RE);
    if (!match) continue;

    const level = match[1]?.length;
    const headingText = match[2];
    if (level === undefined || headingText === undefined) continue;

    // Skip non-numbered sections (e.g. "## Workflow", "### Section status legend").
    if (!SECTION_NUMBER_RE.test(headingText)) continue;

    const status = extractStatus(headingText);
    const fragment = deriveSlugFragment(headingText);
    if (fragment === '') continue;

    if (level === 2) {
      const resolved = status ?? 'tbd';
      entries.push({ slug: fragment, status: resolved });
      currentH2Slug = fragment;
      currentH2Status = resolved;
    } else if (level === 3) {
      if (currentH2Slug === null) continue;
      const slug = `${currentH2Slug}.${fragment}`;
      const resolved = status ?? currentH2Status ?? 'tbd';
      entries.push({ slug, status: resolved });
    }
  }

  return entries;
}

export function renderRegistry(entries: readonly ParseEntry[]): string {
  const lines: string[] = [];
  lines.push('// @generated — do not edit by hand. Regenerate with `pnpm canon:gen`.');
  lines.push('// Source: docs/rules-canon.md');
  lines.push('');
  lines.push("export type CanonStatus = 'verified' | 'drafted' | 'tbd';");
  lines.push('');
  lines.push('export const canonStatus = {');
  for (const { slug, status } of entries) {
    lines.push(`  '${slug}': '${status}',`);
  }
  lines.push('} as const satisfies Record<string, CanonStatus>;');
  lines.push('');
  lines.push('export type CanonSlug = keyof typeof canonStatus;');
  lines.push('');
  return lines.join('\n');
}
