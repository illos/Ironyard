import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTitleMarkdown } from '../src/parse-title';

const TITLES = join(__dirname, '../../../.reference/data-md/Rules/Titles');

function firstTitleInEchelon(folder: string): string {
  const dir = join(TITLES, folder);
  const f = readdirSync(dir).find((x) => x.endsWith('.md') && !x.startsWith('_'));
  if (!f) throw new Error(`no md in ${dir}`);
  return readFileSync(join(dir, f), 'utf8');
}

describe('parseTitleMarkdown', () => {
  it('parses a 1st Echelon title with echelon: 1', () => {
    const t = parseTitleMarkdown(firstTitleInEchelon('1st Echelon'));
    expect(t?.echelon).toBe(1);
  });
  it('parses a 2nd Echelon title with echelon: 2', () => {
    const t = parseTitleMarkdown(firstTitleInEchelon('2nd Echelon'));
    expect(t?.echelon).toBe(2);
  });
  it('parses a 3rd Echelon title with echelon: 3', () => {
    const t = parseTitleMarkdown(firstTitleInEchelon('3rd Echelon'));
    expect(t?.echelon).toBe(3);
  });
  it('parses a 4th Echelon title with echelon: 4', () => {
    const t = parseTitleMarkdown(firstTitleInEchelon('4th Echelon'));
    expect(t?.echelon).toBe(4);
  });
  it('returns null on _Index.md', () => {
    const idxPath = join(TITLES, '_Index.md');
    const t = parseTitleMarkdown(readFileSync(idxPath, 'utf8'));
    expect(t).toBeNull();
  });
});
