import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAncestry } from '../src/parse-ancestry';

const fixturesDir = join(__dirname, 'fixtures', 'ancestries');

describe('parseAncestry', () => {
  it('parses a representative ancestry markdown', () => {
    const md = readFileSync(join(fixturesDir, 'human.md'), 'utf-8');
    const ancestry = parseAncestry(md, 'human.md');
    expect(ancestry.id).toBe('human');
    expect(ancestry.name).toBe('Human');
    expect(ancestry.purchasedTraits.length).toBeGreaterThan(0);
  });
});
