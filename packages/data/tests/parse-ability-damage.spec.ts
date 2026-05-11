import { describe, expect, it } from 'vitest';
import { parseTierOutcome } from '../src/parse-monster';

// Phase 1: parse the per-tier raw markdown strings into structured damage +
// effect. Coverage target: 90%+ tier outcomes have parseable `damage`. UI
// still always renders `raw` somewhere — these tests pin only the structured
// shape.

describe('parseTierOutcome — damage-leading shapes', () => {
  it('parses bare untyped damage', () => {
    expect(parseTierOutcome('2 damage')).toMatchObject({
      raw: '2 damage',
      damage: 2,
      damageType: 'untyped',
    });
  });

  it('parses typed damage (fire)', () => {
    expect(parseTierOutcome('5 fire damage')).toMatchObject({
      raw: '5 fire damage',
      damage: 5,
      damageType: 'fire',
    });
  });

  it('parses typed damage (corruption)', () => {
    expect(parseTierOutcome('13 corruption damage')).toMatchObject({
      raw: '13 corruption damage',
      damage: 13,
      damageType: 'corruption',
    });
  });

  it('parses typed damage with mixed case', () => {
    expect(parseTierOutcome('7 Cold damage')).toMatchObject({
      raw: '7 Cold damage',
      damage: 7,
      damageType: 'cold',
    });
  });

  it('parses zero damage', () => {
    expect(parseTierOutcome('0 damage')).toMatchObject({
      raw: '0 damage',
      damage: 0,
      damageType: 'untyped',
    });
  });

  it('parses large damage values (boss-tier)', () => {
    expect(parseTierOutcome('25 holy damage')).toMatchObject({
      raw: '25 holy damage',
      damage: 25,
      damageType: 'holy',
    });
  });
});

describe('parseTierOutcome — damage + trailing effect', () => {
  it('parses damage + push suffix (semicolon-separated)', () => {
    expect(parseTierOutcome('3 damage; push 1')).toMatchObject({
      raw: '3 damage; push 1',
      damage: 3,
      damageType: 'untyped',
      effect: 'push 1',
    });
  });

  it('parses typed damage + condition save (non-canon condition stays in effect)', () => {
    // "burning" is not in the 9-canon-condition enum, so it's left in effect
    // text verbatim and no condition is structurally extracted.
    expect(
      parseTierOutcome('12 fire damage; A < 1 the target is burning (save ends)'),
    ).toMatchObject({
      raw: '12 fire damage; A < 1 the target is burning (save ends)',
      damage: 12,
      damageType: 'fire',
      effect: 'A < 1 the target is burning (save ends)',
      conditions: [],
    });
  });

  it('parses damage + " and " separator (canon condition gets extracted)', () => {
    expect(parseTierOutcome('6 damage and the target is Slowed (save ends)')).toMatchObject({
      raw: '6 damage and the target is Slowed (save ends)',
      damage: 6,
      damageType: 'untyped',
      conditions: [{ condition: 'Slowed', duration: { kind: 'save_ends' }, scope: 'target' }],
    });
  });

  it('parses multi-clause damage effects', () => {
    expect(
      parseTierOutcome('8 sonic damage; slide 5, the maestro shifts up to 5 squares'),
    ).toMatchObject({
      raw: '8 sonic damage; slide 5, the maestro shifts up to 5 squares',
      damage: 8,
      damageType: 'sonic',
      effect: 'slide 5, the maestro shifts up to 5 squares',
    });
  });
});

describe('parseTierOutcome — effect-only (no damage)', () => {
  it('parses save-clause without damage — extracts canon condition, notes potency', () => {
    expect(parseTierOutcome('M < 3 restrained (save ends)')).toMatchObject({
      raw: 'M < 3 restrained (save ends)',
      damage: null,
      conditions: [
        {
          condition: 'Restrained',
          duration: { kind: 'save_ends' },
          scope: 'target',
          note: 'M < 3',
        },
      ],
    });
  });

  it('parses pure movement-only outcome', () => {
    expect(parseTierOutcome('Vertical push 3')).toMatchObject({
      raw: 'Vertical push 3',
      damage: null,
      effect: 'Vertical push 3',
    });
  });

  it('parses healing / narrative outcome', () => {
    expect(
      parseTierOutcome('The target regains 12 Stamina and the Director gains 3 Malice.'),
    ).toMatchObject({
      raw: 'The target regains 12 Stamina and the Director gains 3 Malice.',
      damage: null,
      effect: 'The target regains 12 Stamina and the Director gains 3 Malice.',
    });
  });

  it('parses condition-only narrative — extracts canon condition with EoT', () => {
    expect(parseTierOutcome('the target is Restrained until end of next turn')).toMatchObject({
      raw: 'the target is Restrained until end of next turn',
      damage: null,
      conditions: [{ condition: 'Restrained', duration: { kind: 'EoT' }, scope: 'target' }],
    });
  });

  it('does not match a number not followed by "damage" — push 10 stays in effect, slowed gets extracted', () => {
    expect(parseTierOutcome('Pull 10; I < 4 slowed (save ends)')).toMatchObject({
      raw: 'Pull 10; I < 4 slowed (save ends)',
      damage: null,
      conditions: [{ condition: 'Slowed', duration: { kind: 'save_ends' }, scope: 'target' }],
    });
  });
});

describe('parseTierOutcome — defensive prefix stripping', () => {
  // None of these prefixes appear in the current corpus, but the regex is
  // defensive so future SteelCompendium changes / overrides don't break us.

  it('strips a leading "≤11:" prefix', () => {
    expect(parseTierOutcome('≤11: 2 damage')).toMatchObject({
      raw: '≤11: 2 damage',
      damage: 2,
      damageType: 'untyped',
    });
  });

  it('strips a leading "miss:" prefix', () => {
    expect(parseTierOutcome('miss: 5 fire damage')).toMatchObject({
      raw: 'miss: 5 fire damage',
      damage: 5,
      damageType: 'fire',
    });
  });

  it('strips a leading "crit:" prefix', () => {
    expect(parseTierOutcome('crit: 9 damage')).toMatchObject({
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
    expect(parseTierOutcome('')).toMatchObject({
      raw: '',
      damage: null,
    });
  });
});
