import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseKitMarkdown } from '../src/parse-kit';

const FIXTURES = join(__dirname, '../../../.reference/data-md/Rules/Kits');

function read(filename: string): string {
  return readFileSync(join(FIXTURES, filename), 'utf8');
}

describe('parseKitMarkdown', () => {
  it('parses Mountain — heavy weapon + heavy armor + Stamina +9', () => {
    const k = parseKitMarkdown(read('Mountain.md'));
    expect(k).not.toBeNull();
    expect(k!.id).toBe('mountain');
    expect(k!.name).toBe('Mountain');
    expect(k!.staminaBonus).toBe(9);
    expect(k!.stabilityBonus).toBe(2);
    expect(k!.meleeDamageBonus).toBe(4);
    expect(k!.keywords).toContain('heavy-weapon');
    expect(k!.keywords).toContain('heavy-armor');
    expect(k!.signatureAbilityId).toBe('mountain-pain-for-pain');
  });

  it('parses Cloak and Dagger — light armor + light weapon', () => {
    const k = parseKitMarkdown(read('Cloak and Dagger.md'));
    expect(k).not.toBeNull();
    expect(k!.id).toBe('cloak-and-dagger');
    expect(k!.keywords).toContain('light-armor');
  });

  it('parses Arcane Archer — bow keyword', () => {
    const k = parseKitMarkdown(read('Arcane Archer.md'));
    expect(k).not.toBeNull();
    expect(k!.keywords).toContain('bow');
  });

  it('returns null on the Kits Table.md index (not a kit)', () => {
    const k = parseKitMarkdown(read('Kits Table.md'));
    expect(k).toBeNull();
  });
});
