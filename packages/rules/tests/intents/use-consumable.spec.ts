import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyUseConsumable } from '../../src/intents/use-consumable';
import { baseState, makeHeroParticipant, stamped } from './test-utils';

const PLAYER = { userId: 'player-1', role: 'player' } as const;
const CHAR_ID = 'char-1';
const ENTRY_ID = 'inv-1';

function stampedUseConsumable(payload: Record<string, unknown>) {
  return stamped({
    type: IntentTypes.UseConsumable,
    actor: PLAYER,
    payload: {
      characterId: CHAR_ID,
      inventoryEntryId: ENTRY_ID,
      ownsCharacter: true,
      inventoryEntryExists: true,
      itemIsConsumable: true,
      ...payload,
    },
  });
}

describe('applyUseConsumable (ratification intent)', () => {
  it('rejects invalid payload', () => {
    const state = baseState();
    const result = applyUseConsumable(
      state,
      stamped({
        type: IntentTypes.UseConsumable,
        actor: PLAYER,
        payload: {},
      }),
    );
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
    expect(result.state.seq).toBe(state.seq);
    expect(result.derived).toEqual([]);
  });

  it('rejects when actor does not own the character', () => {
    const state = baseState();
    const result = applyUseConsumable(state, stampedUseConsumable({ ownsCharacter: false }));
    expect(result.errors?.[0]?.code).toBe('not_character_owner');
    expect(result.state.seq).toBe(state.seq);
    expect(result.derived).toEqual([]);
  });

  it('rejects when the inventory entry does not exist', () => {
    const state = baseState();
    const result = applyUseConsumable(state, stampedUseConsumable({ inventoryEntryExists: false }));
    expect(result.errors?.[0]?.code).toBe('inventory_entry_missing');
    expect(result.state.seq).toBe(state.seq);
    expect(result.derived).toEqual([]);
  });

  it('rejects when the item is not a consumable', () => {
    const state = baseState();
    const result = applyUseConsumable(state, stampedUseConsumable({ itemIsConsumable: false }));
    expect(result.errors?.[0]?.code).toBe('not_a_consumable');
    expect(result.state.seq).toBe(state.seq);
    expect(result.derived).toEqual([]);
  });

  it('derives ApplyHeal for instant effectKind with healAmount > 0 (own participant default)', () => {
    const hero = makeHeroParticipant('pc:char-1', {
      kind: 'pc',
      characterId: CHAR_ID,
    });
    const state = baseState({ participants: [hero] });
    const result = applyUseConsumable(
      state,
      stampedUseConsumable({ effectKind: 'instant', healAmount: 12 }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.seq).toBe(state.seq + 1);
    expect(result.derived).toHaveLength(1);
    expect(result.derived[0]?.type).toBe(IntentTypes.ApplyHeal);
    expect(result.derived[0]?.payload).toMatchObject({ targetId: hero.id, amount: 12 });
    expect(result.derived[0]?.causedBy).toBeDefined();
    expect(result.log[0]?.text).toMatch(/heals 12/);
  });

  it('derives ApplyHeal targeting an explicit targetParticipantId when supplied', () => {
    const hero = makeHeroParticipant('pc:char-1', {
      kind: 'pc',
      characterId: CHAR_ID,
    });
    const ally = makeHeroParticipant('pc:char-2', {
      kind: 'pc',
      characterId: 'char-2',
    });
    const state = baseState({ participants: [hero, ally] });
    const result = applyUseConsumable(
      state,
      stampedUseConsumable({
        effectKind: 'instant',
        healAmount: 8,
        targetParticipantId: ally.id,
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.derived).toHaveLength(1);
    expect(result.derived[0]?.payload).toMatchObject({ targetId: ally.id, amount: 8 });
  });

  it('logs manual path for instant when healAmount is 0 (table not yet populated)', () => {
    const hero = makeHeroParticipant('pc:char-1', {
      kind: 'pc',
      characterId: CHAR_ID,
    });
    const state = baseState({ participants: [hero] });
    const result = applyUseConsumable(
      state,
      stampedUseConsumable({ effectKind: 'instant', healAmount: 0 }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.seq).toBe(state.seq + 1);
    expect(result.derived).toEqual([]);
    expect(result.log[0]?.text).toMatch(/instant/);
  });

  it('logs no-target message for instant when consumer has no participant in lobby', () => {
    // No PC participant for the consumer — derive should not fire even if
    // healAmount > 0.
    const state = baseState();
    const result = applyUseConsumable(
      state,
      stampedUseConsumable({ effectKind: 'instant', healAmount: 5 }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.derived).toEqual([]);
    expect(result.log[0]?.text).toMatch(/no target resolved/);
  });

  it('logs manual path for attack effectKind (no derive)', () => {
    const state = baseState();
    const result = applyUseConsumable(
      state,
      stampedUseConsumable({ effectKind: 'attack', healAmount: 0 }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.seq).toBe(state.seq + 1);
    expect(result.derived).toEqual([]);
    expect(result.log[0]?.text).toMatch(/attack/);
    expect(result.log[0]?.text).toMatch(/RollPower/);
  });

  it('logs manual path for area effectKind (no derive)', () => {
    const state = baseState();
    const result = applyUseConsumable(state, stampedUseConsumable({ effectKind: 'area' }));
    expect(result.errors).toBeUndefined();
    expect(result.derived).toEqual([]);
    expect(result.log[0]?.text).toMatch(/area/);
  });

  it('logs manual path for duration effectKind (no derive)', () => {
    const state = baseState();
    const result = applyUseConsumable(state, stampedUseConsumable({ effectKind: 'duration' }));
    expect(result.errors).toBeUndefined();
    expect(result.derived).toEqual([]);
    expect(result.log[0]?.text).toMatch(/duration/);
  });

  it('logs manual path for two-phase effectKind (no derive)', () => {
    const state = baseState();
    const result = applyUseConsumable(state, stampedUseConsumable({ effectKind: 'two-phase' }));
    expect(result.errors).toBeUndefined();
    expect(result.derived).toEqual([]);
    expect(result.log[0]?.text).toMatch(/two-phase/);
  });

  it('logs manual path for unknown effectKind (no derive)', () => {
    const state = baseState();
    const result = applyUseConsumable(state, stampedUseConsumable({ effectKind: 'unknown' }));
    expect(result.errors).toBeUndefined();
    expect(result.derived).toEqual([]);
    expect(result.log[0]?.text).toMatch(/unknown/);
  });

  it('does not mutate state.participants (side-effect intent)', () => {
    const hero = makeHeroParticipant('pc:char-1', {
      kind: 'pc',
      characterId: CHAR_ID,
    });
    const state = baseState({ participants: [hero] });
    const result = applyUseConsumable(
      state,
      stampedUseConsumable({ effectKind: 'instant', healAmount: 12 }),
    );
    // Reducer is character-side; participants array is reference-equal.
    expect(result.state.participants).toBe(state.participants);
  });
});
