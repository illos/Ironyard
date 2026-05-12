import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseItemMarkdown } from '../src/parse-item';

const TREASURES = join(__dirname, '../../../.reference/data-md/Rules/Treasures');

function read(category: string, filename: string): string {
  return readFileSync(join(TREASURES, category, filename), 'utf8');
}

function firstFile(category: string): string {
  const dir = join(TREASURES, category);
  const subdirs = readdirSync(dir).filter((d) => !d.endsWith('.md'));
  if (subdirs.length > 0) {
    const sub = join(dir, subdirs[0]!);
    const f = readdirSync(sub).find((x) => x.endsWith('.md'));
    if (!f) throw new Error(`no md in ${sub}`);
    return readFileSync(join(sub, f), 'utf8');
  }
  const f = readdirSync(dir).find((x) => x.endsWith('.md') && !x.startsWith('_'));
  if (!f) throw new Error(`no md in ${dir}`);
  return readFileSync(join(dir, f), 'utf8');
}

describe('parseItemMarkdown', () => {
  it('parses an artifact', () => {
    const i = parseItemMarkdown(firstFile('Artifacts'));
    expect(i?.category).toBe('artifact');
    expect(i?.id.length).toBeGreaterThan(0);
    expect(i?.name.length).toBeGreaterThan(0);
  });

  it('parses a consumable with echelon', () => {
    const i = parseItemMarkdown(firstFile('Consumables'));
    expect(i?.category).toBe('consumable');
    if (i?.category !== 'consumable') throw new Error('narrowing failed');
    expect(i.echelon).toBeGreaterThanOrEqual(1);
  });

  it('parses a leveled treasure with echelon', () => {
    const i = parseItemMarkdown(firstFile('Leveled Treasures'));
    expect(i?.category).toBe('leveled-treasure');
    if (i?.category !== 'leveled-treasure') throw new Error('narrowing failed');
    expect(i.echelon).toBeGreaterThanOrEqual(1);
  });

  it('parses a trinket and extracts bodySlot from Keywords', () => {
    // Mask of Oversight has "Keywords: Head, Magic" — bodySlot should be 'head'.
    const md = read('Trinkets/3rd Echelon Trinkets', 'Mask of Oversight.md');
    const i = parseItemMarkdown(md);
    expect(i?.category).toBe('trinket');
    if (i?.category !== 'trinket') throw new Error('narrowing failed');
    expect(i.bodySlot).toBe('head');
  });
});
