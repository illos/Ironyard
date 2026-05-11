import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseClass } from '../src/parse-class';

const fixturesDir = join(__dirname, 'fixtures', 'classes');

describe('parseClass', () => {
  it('parses a class with standard characteristics block', () => {
    const md = readFileSync(join(fixturesDir, 'fury.md'), 'utf-8');
    const cls = parseClass(md, 'fury.md');
    expect(cls.id).toBe('fury');
    expect(cls.lockedCharacteristics).toBeDefined();
    expect(cls.levels.length).toBe(10);
  });

  it('parses Conduit (subclass-label variant)', () => {
    const md = readFileSync(join(fixturesDir, 'conduit.md'), 'utf-8');
    const cls = parseClass(md, 'conduit.md');
    expect(cls.id).toBe('conduit');
    expect(cls.subclasses.length).toBeGreaterThan(0);
  });

  it('parses Troubadour (subclass-label variant)', () => {
    const md = readFileSync(join(fixturesDir, 'troubadour.md'), 'utf-8');
    const cls = parseClass(md, 'troubadour.md');
    expect(cls.id).toBe('troubadour');
    expect(cls.subclasses.length).toBeGreaterThan(0);
  });
});
