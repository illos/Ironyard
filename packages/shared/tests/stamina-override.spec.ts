import { describe, expect, it } from 'vitest';
import { ParticipantStateOverrideSchema } from '../src/stamina-override';

describe('ParticipantStateOverrideSchema', () => {
  it('parses an inert override (Revenant)', () => {
    const parsed = ParticipantStateOverrideSchema.parse({
      kind: 'inert',
      source: 'revenant',
      instantDeathDamageTypes: ['fire'],
      regainHours: 12,
      regainAmount: 'recoveryValue',
    });
    expect(parsed.kind).toBe('inert');
  });

  it('parses a rubble override (Hakaan)', () => {
    const parsed = ParticipantStateOverrideSchema.parse({
      kind: 'rubble',
      source: 'hakaan-doomsight',
      regainHours: 12,
      regainAmount: 'recoveryValue',
    });
    expect(parsed.kind).toBe('rubble');
  });

  it('parses a doomed override with Hakaan params', () => {
    const parsed = ParticipantStateOverrideSchema.parse({
      kind: 'doomed',
      source: 'hakaan-doomsight',
      canRegainStamina: true,
      autoTier3OnPowerRolls: true,
      staminaDeathThreshold: 'none',
      dieAtEncounterEnd: true,
    });
    expect(parsed.kind).toBe('doomed');
    expect(parsed.source).toBe('hakaan-doomsight');
  });

  it('parses a doomed override with Title params', () => {
    const parsed = ParticipantStateOverrideSchema.parse({
      kind: 'doomed',
      source: 'title-doomed',
      canRegainStamina: false,
      autoTier3OnPowerRolls: true,
      staminaDeathThreshold: 'staminaMax',
      dieAtEncounterEnd: true,
    });
    if (parsed.kind === 'doomed') {
      expect(parsed.canRegainStamina).toBe(false);
      expect(parsed.staminaDeathThreshold).toBe('staminaMax');
    } else {
      throw new Error('Expected doomed kind');
    }
  });

  it('parses an extra-dying-trigger override (CoP)', () => {
    const parsed = ParticipantStateOverrideSchema.parse({
      kind: 'extra-dying-trigger',
      source: 'curse-of-punishment',
      predicate: 'recoveries-exhausted',
    });
    if (parsed.kind === 'extra-dying-trigger') {
      expect(parsed.predicate).toBe('recoveries-exhausted');
    } else {
      throw new Error('Expected extra-dying-trigger kind');
    }
  });

  it('rejects unknown kind', () => {
    expect(() => ParticipantStateOverrideSchema.parse({ kind: 'nonsense', source: 'x' })).toThrow();
  });

  it('rejects mismatched source for inert', () => {
    expect(() =>
      ParticipantStateOverrideSchema.parse({
        kind: 'inert',
        source: 'hakaan-doomsight',
        instantDeathDamageTypes: ['fire'],
        regainHours: 12,
        regainAmount: 'recoveryValue',
      }),
    ).toThrow();
  });
});
