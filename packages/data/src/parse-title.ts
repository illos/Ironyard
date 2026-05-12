import matter from 'gray-matter';
import type { Title } from '@ironyard/shared';

function parseEchelon(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d)/.exec(s);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null;
}

function firstParagraph(content: string): string {
  const lines = content.split('\n');
  let inBody = false;
  const para: string[] = [];
  for (const line of lines) {
    if (!inBody) {
      if (/^####\s+/.test(line)) inBody = true;
      continue;
    }
    if (line.trim() === '' && para.length === 0) continue;
    if (line.trim() === '') break;
    if (line.startsWith('**')) continue;
    if (line.startsWith('*') && line.endsWith('*')) {
      para.push(line.replace(/^\*|\*$/g, '').trim());
      break;
    }
    para.push(line.trim());
  }
  return para.join(' ').trim();
}

function parseGrantsAbilityId(content: string, titleId: string): string | null {
  const m = /######\s+([^\n(]+?)(?:\s*\([^)]*\))?\s*$/m.exec(content);
  if (!m || !m[1]) return null;
  const slug = m[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${titleId}-${slug}`;
}

export function parseTitleMarkdown(md: string): Title | null {
  const { data: fm, content } = matter(md);
  const typeStr = typeof fm.type === 'string' ? fm.type : '';
  if (!typeStr.startsWith('title/')) return null;
  const id = typeof fm.item_id === 'string' ? fm.item_id : null;
  const name = typeof fm.item_name === 'string' ? fm.item_name : null;
  if (!id || !name) return null;
  const echelon = parseEchelon(fm.echelon);
  if (echelon === null) return null;

  return {
    id, name, echelon,
    description: firstParagraph(content),
    raw: content,
    grantsAbilityId: parseGrantsAbilityId(content, id),
  };
}
