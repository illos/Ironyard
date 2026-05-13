import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyPushItem } from '../../src/intents/push-item';
import { baseState, stamped } from './test-utils';

const DIRECTOR = { userId: 'director-1', role: 'director' } as const;
const TARGET_CHAR = 'char-target';
const ITEM_ID = 'item-test';

function stampedPushItem(payload: Record<string, unknown>) {
  return stamped({
    type: IntentTypes.PushItem,
    actor: DIRECTOR,
    payload: {
      targetCharacterId: TARGET_CHAR,
      itemId: ITEM_ID,
      quantity: 1,
      isDirectorPermitted: true,
      targetCharacterExists: true,
      itemExists: true,
      ...payload,
    },
  });
}

describe('applyPushItem (ratification intent)', () => {
  it('rejects invalid payload', () => {
    const state = baseState();
    const result = applyPushItem(
      state,
      stamped({
        type: IntentTypes.PushItem,
        actor: DIRECTOR,
        payload: {},
      }),
    );
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
    expect(result.state.seq).toBe(state.seq);
    expect(result.derived).toEqual([]);
  });

  it('rejects when actor lacks director permission', () => {
    const state = baseState();
    const result = applyPushItem(state, stampedPushItem({ isDirectorPermitted: false }));
    expect(result.errors?.[0]?.code).toBe('not_authorized');
    expect(result.state.seq).toBe(state.seq);
    expect(result.derived).toEqual([]);
  });

  it('rejects when the target character does not exist', () => {
    const state = baseState();
    const result = applyPushItem(state, stampedPushItem({ targetCharacterExists: false }));
    expect(result.errors?.[0]?.code).toBe('character_missing');
    expect(result.state.seq).toBe(state.seq);
    expect(result.derived).toEqual([]);
  });

  it('rejects when the item is not in the catalog', () => {
    const state = baseState();
    const result = applyPushItem(state, stampedPushItem({ itemExists: false }));
    expect(result.errors?.[0]?.code).toBe('item_missing');
    expect(result.state.seq).toBe(state.seq);
    expect(result.derived).toEqual([]);
  });

  it('accepts a fully-stamped payload and logs the director-push action', () => {
    const state = baseState();
    const result = applyPushItem(state, stampedPushItem({ quantity: 3 }));
    expect(result.errors).toBeUndefined();
    expect(result.state.seq).toBe(state.seq + 1);
    expect(result.derived).toEqual([]);
    expect(result.log[0]?.kind).toBe('info');
    expect(result.log[0]?.text).toMatch(/director pushed 3/);
    expect(result.log[0]?.text).toMatch(ITEM_ID);
    expect(result.log[0]?.text).toMatch(TARGET_CHAR);
  });

  it('does not mutate state.participants (character-side intent)', () => {
    const state = baseState();
    const result = applyPushItem(state, stampedPushItem({}));
    // Reducer is character-side; participants array is reference-equal.
    expect(result.state.participants).toBe(state.participants);
  });
});
