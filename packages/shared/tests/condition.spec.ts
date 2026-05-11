import { describe, expect, it } from 'vitest';
import {
  ConditionDurationSchema,
  ConditionInstanceSchema,
  ConditionSourceSchema,
  ConditionTypeSchema,
  ParticipantSchema,
} from '../src/index';

describe('ConditionTypeSchema', () => {
  it('accepts each of the 9 canon condition types', () => {
    const types = [
      'Bleeding',
      'Dazed',
      'Frightened',
      'Grabbed',
      'Prone',
      'Restrained',
      'Slowed',
      'Taunted',
      'Weakened',
    ] as const;
    for (const t of types) {
      expect(ConditionTypeSchema.parse(t)).toBe(t);
    }
  });

  it('rejects an unknown condition type (closed enum)', () => {
    expect(() => ConditionTypeSchema.parse('Stunned')).toThrow();
    expect(() => ConditionTypeSchema.parse('Strained')).toThrow();
  });
});

describe('ConditionDurationSchema', () => {
  it('accepts each duration variant by kind', () => {
    expect(ConditionDurationSchema.parse({ kind: 'EoT' })).toEqual({ kind: 'EoT' });
    expect(ConditionDurationSchema.parse({ kind: 'save_ends' })).toEqual({ kind: 'save_ends' });
    expect(
      ConditionDurationSchema.parse({ kind: 'until_start_next_turn', ownerId: 'pc_a' }),
    ).toEqual({ kind: 'until_start_next_turn', ownerId: 'pc_a' });
    expect(ConditionDurationSchema.parse({ kind: 'end_of_encounter' })).toEqual({
      kind: 'end_of_encounter',
    });
    expect(ConditionDurationSchema.parse({ kind: 'trigger', description: 'on damage' })).toEqual({
      kind: 'trigger',
      description: 'on damage',
    });
  });

  it('rejects an unknown duration kind (discriminator closed)', () => {
    expect(() => ConditionDurationSchema.parse({ kind: 'forever' })).toThrow();
  });

  it('requires ownerId for until_start_next_turn and description for trigger', () => {
    expect(() => ConditionDurationSchema.parse({ kind: 'until_start_next_turn' })).toThrow();
    expect(() =>
      ConditionDurationSchema.parse({ kind: 'until_start_next_turn', ownerId: '' }),
    ).toThrow();
    expect(() => ConditionDurationSchema.parse({ kind: 'trigger' })).toThrow();
    expect(() => ConditionDurationSchema.parse({ kind: 'trigger', description: '' })).toThrow();
  });
});

describe('ConditionSourceSchema', () => {
  it('accepts creature and effect source kinds', () => {
    expect(ConditionSourceSchema.parse({ kind: 'creature', id: 'pc_alice' })).toEqual({
      kind: 'creature',
      id: 'pc_alice',
    });
    expect(ConditionSourceSchema.parse({ kind: 'effect', id: 'spell_1' })).toEqual({
      kind: 'effect',
      id: 'spell_1',
    });
  });

  it('rejects unknown source kinds and empty ids', () => {
    expect(() => ConditionSourceSchema.parse({ kind: 'item', id: 'x' })).toThrow();
    expect(() => ConditionSourceSchema.parse({ kind: 'creature', id: '' })).toThrow();
  });
});

describe('ConditionInstanceSchema', () => {
  it('round-trips a full condition instance and defaults removable to true', () => {
    const raw = {
      type: 'Bleeding' as const,
      source: { kind: 'effect' as const, id: 'spell_1' },
      duration: { kind: 'save_ends' as const },
      appliedAtSeq: 12,
    };
    const parsed = ConditionInstanceSchema.parse(raw);
    expect(parsed.removable).toBe(true);
    expect(parsed.type).toBe('Bleeding');
    expect(parsed.appliedAtSeq).toBe(12);
  });

  it('rejects a negative appliedAtSeq', () => {
    expect(() =>
      ConditionInstanceSchema.parse({
        type: 'Slowed',
        source: { kind: 'creature', id: 'm_goblin' },
        duration: { kind: 'EoT' },
        appliedAtSeq: -1,
      }),
    ).toThrow();
  });
});

describe('ParticipantSchema (conditions extension)', () => {
  const baseParticipant = {
    id: 'pc_alice',
    name: 'Alice',
    kind: 'pc' as const,
    currentStamina: 30,
    maxStamina: 30,
    characteristics: { might: 2, agility: 1, reason: 0, intuition: 0, presence: 0 },
  };

  it('defaults conditions to [] when omitted (slice-3 BringCharacter shape still parses)', () => {
    const parsed = ParticipantSchema.parse(baseParticipant);
    expect(parsed.conditions).toEqual([]);
  });

  it('accepts a populated conditions array', () => {
    const parsed = ParticipantSchema.parse({
      ...baseParticipant,
      conditions: [
        {
          type: 'Bleeding',
          source: { kind: 'effect', id: 'spell_1' },
          duration: { kind: 'save_ends' },
          appliedAtSeq: 5,
        },
      ],
    });
    expect(parsed.conditions).toHaveLength(1);
    expect(parsed.conditions[0]?.type).toBe('Bleeding');
    expect(parsed.conditions[0]?.removable).toBe(true);
  });
});
