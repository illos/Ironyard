import { describe, expect, it } from 'vitest';
import { applyUnequipItem } from '../../src/intents/unequip-item';
import { baseState, stamped } from './test-utils';

describe('applyUnequipItem (ratification intent)', () => {
  it('accepts a stamped payload — logs the unequip action', () => {
    const state = baseState();
    const result = applyUnequipItem(
      state,
      stamped({
        type: 'UnequipItem',
        actor: { userId: 'player-1', role: 'player' },
        payload: {
          characterId: 'char-1',
          inventoryEntryId: 'inv-1',
          ownsCharacter: true,
          inventoryEntryExists: true,
        },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.seq).toBe(state.seq + 1);
    expect(result.log[0]?.kind).toBe('info');
    expect(result.log[0]?.text).toMatch(/unequipped/i);
  });

  it('rejects when actor does not own the character', () => {
    const state = baseState();
    const result = applyUnequipItem(
      state,
      stamped({
        type: 'UnequipItem',
        actor: { userId: 'player-1', role: 'player' },
        payload: {
          characterId: 'char-1',
          inventoryEntryId: 'inv-1',
          ownsCharacter: false,
          inventoryEntryExists: true,
        },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('not_character_owner');
    expect(result.state.seq).toBe(state.seq);
  });

  it('rejects when inventory entry does not exist', () => {
    const state = baseState();
    const result = applyUnequipItem(
      state,
      stamped({
        type: 'UnequipItem',
        actor: { userId: 'player-1', role: 'player' },
        payload: {
          characterId: 'char-1',
          inventoryEntryId: 'inv-missing',
          ownsCharacter: true,
          inventoryEntryExists: false,
        },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('inventory_entry_missing');
    expect(result.state.seq).toBe(state.seq);
  });

  it('rejects invalid payload', () => {
    const state = baseState();
    const result = applyUnequipItem(
      state,
      stamped({
        type: 'UnequipItem',
        actor: { userId: 'player-1', role: 'player' },
        payload: {},
      }),
    );
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });

  it('does not touch state.participants (side-effect intent)', () => {
    const state = baseState();
    const result = applyUnequipItem(
      state,
      stamped({
        type: 'UnequipItem',
        actor: { userId: 'player-1', role: 'player' },
        payload: {
          characterId: 'char-1',
          inventoryEntryId: 'inv-1',
          ownsCharacter: true,
          inventoryEntryExists: true,
        },
      }),
    );
    expect(result.state.participants).toHaveLength(0);
  });
});
