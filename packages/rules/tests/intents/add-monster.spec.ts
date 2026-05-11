import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/index';
import { OWNER_ID, baseState, makeMonsterFixture, ownerActor, stamped } from './test-utils';

const goblins = makeMonsterFixture({ name: 'Goblin Warrior', level: 1 });

describe('applyAddMonster', () => {
  it('appends N monsters to the roster', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'AddMonster',
        actor: ownerActor,
        payload: {
          monsterId: 'goblin-warrior-1',
          quantity: 3,
          monster: goblins,
        },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.participants).toHaveLength(3);
    expect(result.state.participants[0]?.name).toMatch(/Goblin Warrior/);
    // Each monster gets a unique id
    expect(result.state.participants[0]?.id).not.toEqual(result.state.participants[1]?.id);
  });

  it('names each monster with a suffix when quantity > 1', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'AddMonster',
        actor: ownerActor,
        payload: { monsterId: 'goblin-warrior-1', quantity: 2, monster: goblins },
      }),
    );
    expect(result.state.participants[0]?.name).toBe('Goblin Warrior 1');
    expect(result.state.participants[1]?.name).toBe('Goblin Warrior 2');
  });

  it('uses nameOverride when provided', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'AddMonster',
        actor: ownerActor,
        payload: {
          monsterId: 'goblin-warrior-1',
          quantity: 1,
          nameOverride: 'Cave Goblin',
          monster: goblins,
        },
      }),
    );
    expect(result.state.participants[0]?.name).toBe('Cave Goblin');
  });

  it('sets currentStamina and maxStamina from monster.stamina.base', () => {
    const state = baseState();
    const monster = makeMonsterFixture({ stamina: { base: 40 } });
    const result = applyIntent(
      state,
      stamped({
        type: 'AddMonster',
        actor: ownerActor,
        payload: { monsterId: 'big-monster', quantity: 1, monster },
      }),
    );
    const p = result.state.participants[0];
    expect(p?.currentStamina).toBe(40);
    expect(p?.maxStamina).toBe(40);
  });

  it('advances seq', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'AddMonster',
        actor: ownerActor,
        payload: { monsterId: 'goblin-warrior-1', quantity: 1, monster: goblins },
      }),
    );
    expect(result.state.seq).toBe(state.seq + 1);
  });

  it('rejects when actor is not the active director', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'AddMonster',
        actor: { userId: 'random-player', role: 'player' },
        payload: { monsterId: 'goblin-1', quantity: 1, monster: goblins },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('not_active_director');
    expect(result.state.participants).toHaveLength(0);
  });

  it('a non-owner who is the activeDirectorId can add monsters', () => {
    const state = baseState({ activeDirectorId: 'co-dm' });
    const result = applyIntent(
      state,
      stamped({
        type: 'AddMonster',
        actor: { userId: 'co-dm', role: 'player' },
        payload: { monsterId: 'goblin-warrior-1', quantity: 1, monster: goblins },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.participants).toHaveLength(1);
  });

  it('rejects with invalid_payload when payload is malformed', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'AddMonster',
        actor: ownerActor,
        payload: { quantity: 1 }, // missing monsterId and monster
      }),
    );
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });

  it('owner userId matches activeDirectorId default', () => {
    const state = baseState();
    expect(state.activeDirectorId).toBe(OWNER_ID);
  });
});
