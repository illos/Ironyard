import { describe, expect, it } from 'vitest';
import { parseTierOutcome } from '../src/parse-monster';

// Phase 1: parse the per-tier raw markdown strings into structured damage +
// effect. Coverage target: 90%+ tier outcomes have parseable `damage`. UI
// still always renders `raw` somewhere — these tests pin only the structured
// shape.

describe('parseTierOutcome — damage-leading shapes', () => {
  it('parses bare untyped damage', () => {
    expect(parseTierOutcome('2 damage')).toEqual({
      raw: '2 damage',
      damage: 2,
      damageType: 'untyped',
    });
  });

  it('parses typed damage (fire)', () => {
    expect(parseTierOutcome('5 fire damage')).toEqual({
      raw: '5 fire damage',
      damage: 5,
      damageType: 'fire',
    });
  });

  it('parses typed damage (corruption)', () => {
    expect(parseTierOutcome('13 corruption damage')).toEqual({
      raw: '13 corruption damage',
      damage: 13,
      damageType: 'corruption',
    });
  });

  it('parses typed damage with mixed case', () => {
    expect(parseTierOutcome('7 Cold damage')).toEqual({
      raw: '7 Cold damage',
      damage: 7,
      damageType: 'cold',
    });
  });

  it('parses zero damage', () => {
    expect(parseTierOutcome('0 damage')).toEqual({
      raw: '0 damage',
      damage: 0,
      damageType: 'untyped',
    });
  });

  it('parses large damage values (boss-tier)', () => {
    expect(parseTierOutcome('25 holy damage')).toEqual({
      raw: '25 holy damage',
      damage: 25,
      damageType: 'holy',
    });
  });
});

describe('parseTierOutcome — damage + trailing effect', () => {
  it('parses damage + push suffix (semicolon-separated)', () => {
    expect(parseTierOutcome('3 damage; push 1')).toEqual({
      raw: '3 damage; push 1',
      damage: 3,
      damageType: 'untyped',
      effect: 'push 1',
    });
  });

  it('parses typed damage + condition save', () => {
    expect(parseTierOutcome('12 fire damage; A < 1 the target is burning (save ends)')).toEqual({
      raw: '12 fire damage; A < 1 the target is burning (save ends)',
      damage: 12,
      damageType: 'fire',
      effect: 'A < 1 the target is burning (save ends)',
    });
  });

  it('parses damage + " and " separator', () => {
    expect(parseTierOutcome('6 damage and the target is Slowed (save ends)')).toEqual({
      raw: '6 damage and the target is Slowed (save ends)',
      damage: 6,
      damageType: 'untyped',
      effect: 'the target is Slowed (save ends)',
    });
  });

  it('parses multi-clause damage effects', () => {
    expect(parseTierOutcome('8 sonic damage; slide 5, the maestro shifts up to 5 squares')).toEqual(
      {
        raw: '8 sonic damage; slide 5, the maestro shifts up to 5 squares',
        damage: 8,
        damageType: 'sonic',
        effect: 'slide 5, the maestro shifts up to 5 squares',
      },
    );
  });
});

describe('parseTierOutcome — effect-only (no damage)', () => {
  it('parses save-clause without damage', () => {
    expect(parseTierOutcome('M < 3 restrained (save ends)')).toEqual({
      raw: 'M < 3 restrained (save ends)',
      damage: null,
      effect: 'M < 3 restrained (save ends)',
    });
  });

  it('parses pure movement-only outcome', () => {
    expect(parseTierOutcome('Vertical push 3')).toEqual({
      raw: 'Vertical push 3',
      damage: null,
      effect: 'Vertical push 3',
    });
  });

  it('parses healing / narrative outcome', () => {
    expect(
      parseTierOutcome('The target regains 12 Stamina and the Director gains 3 Malice.'),
    ).toEqual({
      raw: 'The target regains 12 Stamina and the Director gains 3 Malice.',
      damage: null,
      effect: 'The target regains 12 Stamina and the Director gains 3 Malice.',
    });
  });

  it('parses condition-only narrative', () => {
    expect(parseTierOutcome('the target is Restrained until end of next turn')).toEqual({
      raw: 'the target is Restrained until end of next turn',
      damage: null,
      effect: 'the target is Restrained until end of next turn',
    });
  });

  it('does not match a number not followed by "damage"', () => {
    expect(parseTierOutcome('Pull 10; I < 4 slowed (save ends)')).toEqual({
      raw: 'Pull 10; I < 4 slowed (save ends)',
      damage: null,
      effect: 'Pull 10; I < 4 slowed (save ends)',
    });
  });
});

describe('parseTierOutcome — defensive prefix stripping', () => {
  // None of these prefixes appear in the current corpus, but the regex is
  // defensive so future SteelCompendium changes / overrides don't break us.

  it('strips a leading "≤11:" prefix', () => {
    expect(parseTierOutcome('≤11: 2 damage')).toEqual({
      raw: '≤11: 2 damage',
      damage: 2,
      damageType: 'untyped',
    });
  });

  it('strips a leading "miss:" prefix', () => {
    expect(parseTierOutcome('miss: 5 fire damage')).toEqual({
      raw: 'miss: 5 fire damage',
      damage: 5,
      damageType: 'fire',
    });
  });

  it('strips a leading "crit:" prefix', () => {
    expect(parseTierOutcome('crit: 9 damage')).toEqual({
      raw: 'crit: 9 damage',
      damage: 9,
      damageType: 'untyped',
    });
  });
});

describe('parseTierOutcome — unknown damage type fallback', () => {
  it('falls back to untyped when the damage word is not in the enum', () => {
    // Hypothetical future type — we expect the parser to not throw and to
    // fall back rather than emit a bogus enum value.
    const result = parseTierOutcome('5 mystery damage');
    expect(result.damage).toBe(5);
    expect(result.damageType).toBe('untyped');
    expect(result.raw).toBe('5 mystery damage');
  });
});

describe('parseTierOutcome — raw always preserved', () => {
  it('echoes raw verbatim regardless of parse outcome', () => {
    const inputs = ['2 damage', '5 fire damage; push 2', 'the target is Slowed (save ends)', ''];
    for (const input of inputs) {
      expect(parseTierOutcome(input).raw).toBe(input);
    }
  });

  it('handles empty string without throwing', () => {
    expect(parseTierOutcome('')).toEqual({
      raw: '',
      damage: null,
    });
  });
});
