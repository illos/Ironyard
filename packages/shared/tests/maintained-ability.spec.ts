import { describe, expect, it } from 'vitest';
import { MaintainedAbilitySchema } from '../src/maintained-ability';

describe('MaintainedAbilitySchema', () => {
  it('parses a valid maintained ability', () => {
    const parsed = MaintainedAbilitySchema.parse({
      abilityId: 'elementalist-storm-aegis',
      costPerTurn: 2,
      startedAtRound: 2,
    });
    expect(parsed.abilityId).toBe('elementalist-storm-aegis');
    expect(parsed.costPerTurn).toBe(2);
  });

  it('rejects zero costPerTurn', () => {
    expect(() =>
      MaintainedAbilitySchema.parse({ abilityId: 'x', costPerTurn: 0, startedAtRound: 1 }),
    ).toThrow();
  });

  it('rejects negative costPerTurn', () => {
    expect(() =>
      MaintainedAbilitySchema.parse({ abilityId: 'x', costPerTurn: -1, startedAtRound: 1 }),
    ).toThrow();
  });

  it('rejects empty abilityId', () => {
    expect(() =>
      MaintainedAbilitySchema.parse({ abilityId: '', costPerTurn: 2, startedAtRound: 1 }),
    ).toThrow();
  });
});
