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
    // Slice 6: per-tier tuple from "+0/+0/+4"; the engine adds tier-N at roll time.
    expect(k!.meleeDamageBonusPerTier).toEqual([0, 0, 4]);
    expect(k!.rangedDamageBonusPerTier).toEqual([0, 0, 0]);
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

// Slice 10 / Phase 2b Group A+B (2b.3): distance + disengage bonus extraction.
// Source format in Kits.md is "**Melee Distance Bonus:** +1" /
// "**Ranged Distance Bonus:** +10" / "**Disengage Bonus:** +1". Always-on flat
// (not per-tier). 13 of 22 v1 kits carry +1 disengage; 10 carry a distance
// bonus on exactly one of melee or ranged. AoE sizes (burst/cube/wall) are
// NOT affected — canon-explicit (Kits.md:135).
describe('parseKitMarkdown — distance + disengage bonuses', () => {
  it('Arcane Archer extracts rangedDistanceBonus: 10 + disengageBonus: 1', () => {
    const k = parseKitMarkdown(read('Arcane Archer.md'));
    expect(k).not.toBeNull();
    expect(k!.rangedDistanceBonus).toBe(10);
    expect(k!.meleeDistanceBonus).toBe(0);
    expect(k!.disengageBonus).toBe(1);
  });

  it('Guisarmier extracts meleeDistanceBonus: 1, no ranged, no disengage', () => {
    const k = parseKitMarkdown(read('Guisarmier.md'));
    expect(k).not.toBeNull();
    expect(k!.meleeDistanceBonus).toBe(1);
    expect(k!.rangedDistanceBonus).toBe(0);
    expect(k!.disengageBonus).toBe(0);
  });

  it('Cloak and Dagger extracts rangedDistanceBonus: 5 + disengageBonus: 1', () => {
    const k = parseKitMarkdown(read('Cloak and Dagger.md'));
    expect(k).not.toBeNull();
    expect(k!.rangedDistanceBonus).toBe(5);
    expect(k!.disengageBonus).toBe(1);
  });

  it('Whirlwind extracts meleeDistanceBonus: 1 + disengageBonus: 1', () => {
    const k = parseKitMarkdown(read('Whirlwind.md'));
    expect(k).not.toBeNull();
    expect(k!.meleeDistanceBonus).toBe(1);
    expect(k!.rangedDistanceBonus).toBe(0);
    expect(k!.disengageBonus).toBe(1);
  });

  it('Mountain has no distance + no disengage bonus (defaults to 0)', () => {
    const k = parseKitMarkdown(read('Mountain.md'));
    expect(k).not.toBeNull();
    expect(k!.meleeDistanceBonus).toBe(0);
    expect(k!.rangedDistanceBonus).toBe(0);
    expect(k!.disengageBonus).toBe(0);
  });
});
