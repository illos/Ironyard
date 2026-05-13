import { describe, expect, it } from 'vitest';
import { ActiveAbilityInstanceSchema } from '../src/active-ability';

describe('ActiveAbilityInstanceSchema', () => {
  it('parses an EoT instance', () => {
    const parsed = ActiveAbilityInstanceSchema.parse({
      abilityId: 'human.detect-the-supernatural',
      source: 'ancestry',
      expiresAt: { kind: 'EoT' },
      appliedAtSeq: 12,
    });
    expect(parsed.abilityId).toBe('human.detect-the-supernatural');
    expect(parsed.expiresAt.kind).toBe('EoT');
  });

  it('parses an end_of_encounter instance', () => {
    const parsed = ActiveAbilityInstanceSchema.parse({
      abilityId: 'some.long-running-trait',
      source: 'class',
      expiresAt: { kind: 'end_of_encounter' },
      appliedAtSeq: 1,
    });
    expect(parsed.expiresAt.kind).toBe('end_of_encounter');
  });

  it('rejects an unknown source kind', () => {
    expect(() =>
      ActiveAbilityInstanceSchema.parse({
        abilityId: 'x',
        source: 'monster',
        expiresAt: { kind: 'EoT' },
        appliedAtSeq: 0,
      }),
    ).toThrow();
  });

  it('rejects an unknown expiry kind', () => {
    expect(() =>
      ActiveAbilityInstanceSchema.parse({
        abilityId: 'x',
        source: 'ancestry',
        expiresAt: { kind: 'save_ends' },
        appliedAtSeq: 0,
      }),
    ).toThrow();
  });

  it('rejects an empty abilityId', () => {
    expect(() =>
      ActiveAbilityInstanceSchema.parse({
        abilityId: '',
        source: 'ancestry',
        expiresAt: { kind: 'EoT' },
        appliedAtSeq: 0,
      }),
    ).toThrow();
  });
});
