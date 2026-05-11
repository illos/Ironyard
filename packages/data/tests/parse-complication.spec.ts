import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseComplication } from '../src/parse-complication';

const fixturesDir = join(__dirname, 'fixtures', 'complications');

describe('parseComplication', () => {
  it('parses a standard complication with benefit + drawback', () => {
    const md = readFileSync(join(fixturesDir, 'amnesia.md'), 'utf-8');
    const c = parseComplication(md, 'amnesia.md');
    expect(c.name).toBe('Amnesia');
    expect(c.benefit.length).toBeGreaterThan(0);
    expect(c.drawback.length).toBeGreaterThan(0);
  });

  it('parses a complication whose benefit/drawback use the variant heading style', () => {
    const md = readFileSync(join(fixturesDir, 'advanced-studies.md'), 'utf-8');
    const c = parseComplication(md, 'advanced-studies.md');
    expect(c.benefit.length).toBeGreaterThan(0);
    expect(c.drawback.length).toBeGreaterThan(0);
  });
});
