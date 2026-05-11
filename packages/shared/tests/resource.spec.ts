import { describe, expect, it } from 'vitest';
import {
  ExtraResourceInstanceSchema,
  HEROIC_RESOURCE_NAMES,
  HeroicResourceInstanceSchema,
  HeroicResourceNameSchema,
  MaliceStateSchema,
  ParticipantSchema,
  ResourceRefSchema,
} from '../src/index';

describe('HeroicResourceNameSchema', () => {
  it('accepts each of the 9 canon heroic resource names', () => {
    for (const name of HEROIC_RESOURCE_NAMES) {
      expect(HeroicResourceNameSchema.parse(name)).toBe(name);
    }
  });

  it('rejects an unknown resource name (closed enum)', () => {
    expect(() => HeroicResourceNameSchema.parse('mana')).toThrow();
    expect(() => HeroicResourceNameSchema.parse('virtue')).toThrow();
  });

  it('exports exactly the 9 canon names', () => {
    expect(HEROIC_RESOURCE_NAMES).toHaveLength(9);
    expect(new Set(HEROIC_RESOURCE_NAMES)).toEqual(
      new Set([
        'wrath',
        'piety',
        'essence',
        'ferocity',
        'discipline',
        'insight',
        'focus',
        'clarity',
        'drama',
      ]),
    );
  });
});

describe('HeroicResourceInstanceSchema', () => {
  it('parses a minimal Clarity instance with negative floor (Talent canon §5.3)', () => {
    const parsed = HeroicResourceInstanceSchema.parse({
      name: 'clarity',
      value: 0,
      floor: -3,
    });
    expect(parsed.floor).toBe(-3);
    expect(parsed.value).toBe(0);
    expect(parsed.max).toBeUndefined();
  });

  it('defaults floor to 0 when omitted', () => {
    const parsed = HeroicResourceInstanceSchema.parse({ name: 'wrath', value: 5 });
    expect(parsed.floor).toBe(0);
  });

  it('rejects non-integer value', () => {
    expect(() => HeroicResourceInstanceSchema.parse({ name: 'wrath', value: 1.5 })).toThrow();
  });

  it('rejects negative max (max must be ≥ 0)', () => {
    expect(() =>
      HeroicResourceInstanceSchema.parse({ name: 'wrath', value: 0, max: -1 }),
    ).toThrow();
  });
});

describe('ExtraResourceInstanceSchema', () => {
  it('accepts an arbitrary string name (homebrew or epic secondary)', () => {
    const parsed = ExtraResourceInstanceSchema.parse({ name: 'virtue', value: 3 });
    expect(parsed.name).toBe('virtue');
  });

  it('rejects an empty name', () => {
    expect(() => ExtraResourceInstanceSchema.parse({ name: '', value: 0 })).toThrow();
  });
});

describe('MaliceStateSchema', () => {
  it('parses with default lastMaliciousStrikeRound: null', () => {
    const parsed = MaliceStateSchema.parse({ current: 0 });
    expect(parsed.current).toBe(0);
    expect(parsed.lastMaliciousStrikeRound).toBeNull();
  });

  it('accepts negative current (canon §5.5 permits negative Malice)', () => {
    const parsed = MaliceStateSchema.parse({ current: -2 });
    expect(parsed.current).toBe(-2);
  });
});

describe('ResourceRefSchema', () => {
  it('accepts a typed heroic resource name', () => {
    expect(ResourceRefSchema.parse('clarity')).toBe('clarity');
  });

  it('accepts an extras-array reference', () => {
    expect(ResourceRefSchema.parse({ extra: 'virtue' })).toEqual({ extra: 'virtue' });
  });

  it('rejects an unknown heroic name not wrapped in extras', () => {
    expect(() => ResourceRefSchema.parse('virtue')).toThrow();
  });
});

describe('ParticipantSchema (slice 7 resource fields)', () => {
  const baseParticipant = {
    id: 'pc_talent',
    name: 'Talent',
    kind: 'pc' as const,
    currentStamina: 30,
    maxStamina: 30,
    characteristics: { might: 0, agility: 0, reason: 2, intuition: 0, presence: 0 },
  };

  it('defaults heroicResources/extras/surges/recoveries/recoveryValue when omitted', () => {
    const parsed = ParticipantSchema.parse(baseParticipant);
    expect(parsed.heroicResources).toEqual([]);
    expect(parsed.extras).toEqual([]);
    expect(parsed.surges).toBe(0);
    expect(parsed.recoveries).toEqual({ current: 0, max: 0 });
    expect(parsed.recoveryValue).toBe(0);
  });

  it('accepts a populated Talent Clarity instance with negative floor', () => {
    const parsed = ParticipantSchema.parse({
      ...baseParticipant,
      heroicResources: [{ name: 'clarity', value: 0, floor: -3 }],
      surges: 2,
      recoveries: { current: 4, max: 4 },
      recoveryValue: 10,
    });
    expect(parsed.heroicResources[0]?.name).toBe('clarity');
    expect(parsed.heroicResources[0]?.floor).toBe(-3);
    expect(parsed.surges).toBe(2);
    expect(parsed.recoveries.current).toBe(4);
    expect(parsed.recoveryValue).toBe(10);
  });
});
