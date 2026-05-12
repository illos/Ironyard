import { describe, expect, it } from 'vitest';
import { applyAttachments } from '../../src/attachments/apply';
import type { CharacterAttachment } from '../../src/attachments/types';
import type { CharacterRuntime } from '../../src/derive-character-runtime';
import { CharacterSchema, type Character } from '@ironyard/shared';

function baseRuntime(overrides: Partial<CharacterRuntime> = {}): CharacterRuntime {
  return {
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    maxStamina: 18,
    recoveriesMax: 8,
    recoveryValue: 6,
    heroicResource: { name: 'heroic', max: null, floor: 0 },
    abilityIds: [],
    skills: [],
    languages: [],
    immunities: [],
    weaknesses: [],
    speed: 5,
    size: '1M',
    stability: 0,
    freeStrikeDamage: 2,
    ...overrides,
  };
}

function baseCharacter(level = 1): Character {
  return CharacterSchema.parse({ level });
}

const NOOP_CTX = { kit: null };

describe('applyAttachments — effect kinds', () => {
  it('stat-mod adds to numeric field', () => {
    const att: CharacterAttachment = {
      source: { kind: 'kit', id: 'wrath.stamina' },
      effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 9 },
    };
    const out = applyAttachments(baseRuntime(), [att], { character: baseCharacter(), ...NOOP_CTX });
    expect(out.maxStamina).toBe(27);
    expect(out.recoveryValue).toBe(9); // re-derived = floor(27 / 3)
  });

  it('stat-replace overwrites string field', () => {
    const att: CharacterAttachment = {
      source: { kind: 'ancestry-trait', id: 'hakaan.large' },
      effect: { kind: 'stat-replace', stat: 'size', value: '1L' },
    };
    const out = applyAttachments(baseRuntime(), [att], { character: baseCharacter(), ...NOOP_CTX });
    expect(out.size).toBe('1L');
  });

  it('grant-ability appends to abilityIds and dedupes', () => {
    const a1: CharacterAttachment = {
      source: { kind: 'ancestry-signature', id: 'human.detect' },
      effect: { kind: 'grant-ability', abilityId: 'human-detect-the-supernatural' },
    };
    const a2: CharacterAttachment = {
      source: { kind: 'level-pick', id: 'lvl1.0' },
      effect: { kind: 'grant-ability', abilityId: 'human-detect-the-supernatural' },
    };
    const out = applyAttachments(baseRuntime(), [a1, a2], {
      character: baseCharacter(),
      ...NOOP_CTX,
    });
    expect(out.abilityIds).toEqual(['human-detect-the-supernatural']);
  });

  it('grant-skill and grant-language dedupe', () => {
    const out = applyAttachments(
      baseRuntime({ skills: ['arcana'], languages: ['caelian'] }),
      [
        {
          source: { kind: 'ancestry-trait', id: 'devil.silver-tongue' },
          effect: { kind: 'grant-skill', skill: 'arcana' },
        },
        {
          source: { kind: 'ancestry-trait', id: 'devil.tongue' },
          effect: { kind: 'grant-language', language: 'caelian' },
        },
      ],
      { character: baseCharacter(), ...NOOP_CTX },
    );
    expect(out.skills).toEqual(['arcana']);
    expect(out.languages).toEqual(['caelian']);
  });

  it('immunity resolves value: level', () => {
    const att: CharacterAttachment = {
      source: { kind: 'ancestry-trait', id: 'time-raider.psychic-scar' },
      effect: { kind: 'immunity', damageKind: 'psychic', value: 'level' },
    };
    const out = applyAttachments(baseRuntime(), [att], {
      character: baseCharacter(7),
      ...NOOP_CTX,
    });
    expect(out.immunities).toEqual([{ kind: 'psychic', value: 7 }]);
  });

  it('weakness resolves numeric value', () => {
    const att: CharacterAttachment = {
      source: { kind: 'item', id: 'cursed-amulet' },
      effect: { kind: 'weakness', damageKind: 'corruption', value: 3 },
    };
    const out = applyAttachments(baseRuntime(), [att], { character: baseCharacter(), ...NOOP_CTX });
    expect(out.weaknesses).toEqual([{ kind: 'corruption', value: 3 }]);
  });

  it('free-strike-damage adds to baseline', () => {
    const att: CharacterAttachment = {
      source: { kind: 'kit', id: 'wrath.melee' },
      effect: { kind: 'free-strike-damage', delta: 4 },
    };
    const out = applyAttachments(baseRuntime(), [att], { character: baseCharacter(), ...NOOP_CTX });
    expect(out.freeStrikeDamage).toBe(6);
  });
});

describe('applyAttachments — ordering', () => {
  it('stat-mod order does not change result', () => {
    const a: CharacterAttachment = {
      source: { kind: 'kit', id: 'a' },
      effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 9 },
    };
    const b: CharacterAttachment = {
      source: { kind: 'ancestry-trait', id: 'b' },
      effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 6 },
    };
    const out1 = applyAttachments(baseRuntime(), [a, b], { character: baseCharacter(), ...NOOP_CTX });
    const out2 = applyAttachments(baseRuntime(), [b, a], { character: baseCharacter(), ...NOOP_CTX });
    expect(out1.maxStamina).toBe(out2.maxStamina);
    expect(out1.maxStamina).toBe(33);
  });

  it('direct recoveryValue mod applies AFTER maxStamina re-derive', () => {
    const staminaMod: CharacterAttachment = {
      source: { kind: 'kit', id: 'a' },
      effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 9 },
    };
    const directRecoveryMod: CharacterAttachment = {
      source: { kind: 'item', id: 'b' },
      effect: { kind: 'stat-mod', stat: 'recoveryValue', delta: 2 },
    };
    const out = applyAttachments(baseRuntime(), [staminaMod, directRecoveryMod], {
      character: baseCharacter(),
      ...NOOP_CTX,
    });
    // maxStamina: 18 + 9 = 27. recoveryValue re-derived to floor(27/3) = 9.
    // Direct mod adds +2 → 11.
    expect(out.maxStamina).toBe(27);
    expect(out.recoveryValue).toBe(11);
  });
});

describe('applyAttachments — condition gating', () => {
  it('skips kit-has-keyword attachment when kit lacks keyword', () => {
    const att: CharacterAttachment = {
      source: { kind: 'kit-keyword-bonus', id: 'sword-of-X' },
      condition: { kind: 'kit-has-keyword', keyword: 'sword' },
      effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 99 },
    };
    const out = applyAttachments(baseRuntime(), [att], {
      character: baseCharacter(),
      kit: { id: 'wrath', name: 'Wrath', keywords: ['axe'] } as never,
    });
    expect(out.maxStamina).toBe(18); // unchanged
  });

  it('applies kit-has-keyword attachment when kit has keyword', () => {
    const att: CharacterAttachment = {
      source: { kind: 'kit-keyword-bonus', id: 'sword-of-X' },
      condition: { kind: 'kit-has-keyword', keyword: 'sword' },
      effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 5 },
    };
    const out = applyAttachments(baseRuntime(), [att], {
      character: baseCharacter(),
      kit: { id: 'wrath', name: 'Wrath', keywords: ['sword'] } as never,
    });
    expect(out.maxStamina).toBe(23);
  });
});
