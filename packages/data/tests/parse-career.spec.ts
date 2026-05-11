import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCareer } from '../src/parse-career';

const fixturesDir = join(__dirname, 'fixtures', 'careers');

describe('parseCareer', () => {
  it('parses a representative career markdown', () => {
    const md = readFileSync(join(fixturesDir, 'soldier.md'), 'utf-8');
    const career = parseCareer(md, 'soldier.md');
    expect(career.id).toBe('soldier');
    expect(career.name).toBe('Soldier');
    expect(career.incitingIncidents.length).toBeGreaterThan(0);
  });
});
