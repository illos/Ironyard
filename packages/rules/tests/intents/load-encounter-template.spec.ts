import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/index';
import { baseState, makeMonsterFixture, ownerActor, stamped } from './test-utils';

const goblinFixture = makeMonsterFixture({ name: 'Goblin', id: 'goblin-1' });
const sniperFixture = makeMonsterFixture({ name: 'Sniper', id: 'sniper-1' });

describe('applyLoadEncounterTemplate', () => {
  it('fans into derived AddMonster intents — one per entry', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'LoadEncounterTemplate',
        actor: ownerActor,
        payload: {
          templateId: 'tpl-1',
          entries: [
            { monsterId: 'goblin-1', quantity: 6, monster: goblinFixture },
            { monsterId: 'sniper-1', quantity: 1, monster: sniperFixture },
          ],
        },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.derived).toHaveLength(2);
    expect(result.derived[0]?.type).toBe('AddMonster');
    expect((result.derived[0]?.payload as Record<string, unknown>).quantity).toBe(6);
    expect(result.derived[1]?.type).toBe('AddMonster');
    expect((result.derived[1]?.payload as Record<string, unknown>).quantity).toBe(1);
  });

  it('does not mutate state directly — state is returned unchanged', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'LoadEncounterTemplate',
        actor: ownerActor,
        payload: {
          templateId: 'tpl-1',
          entries: [{ monsterId: 'goblin-1', quantity: 3, monster: goblinFixture }],
        },
      }),
    );
    // Participants stay empty at this level; derived intents will populate them.
    expect(result.state.participants).toHaveLength(0);
    expect(result.state.seq).toBe(state.seq); // seq is NOT bumped (no direct state change)
  });

  it('derived intents carry the monster fixture in their payload', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'LoadEncounterTemplate',
        actor: ownerActor,
        payload: {
          templateId: 'tpl-1',
          entries: [{ monsterId: 'goblin-1', quantity: 1, monster: goblinFixture }],
        },
      }),
    );
    const derived = result.derived[0];
    const payload = derived?.payload as Record<string, unknown>;
    expect(payload?.monsterId).toBe('goblin-1');
    expect((payload?.monster as Record<string, unknown>)?.name).toBe('Goblin');
  });

  it('forwards nameOverride to the derived AddMonster payload', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'LoadEncounterTemplate',
        actor: ownerActor,
        payload: {
          templateId: 'tpl-1',
          entries: [
            {
              monsterId: 'goblin-1',
              quantity: 2,
              nameOverride: 'Cave Goblin',
              monster: goblinFixture,
            },
          ],
        },
      }),
    );
    const payload = result.derived[0]?.payload as Record<string, unknown>;
    expect(payload.nameOverride).toBe('Cave Goblin');
  });

  it('rejects when actor is not the active director', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'LoadEncounterTemplate',
        actor: { userId: 'some-player', role: 'player' },
        payload: {
          templateId: 'tpl-1',
          entries: [{ monsterId: 'goblin-1', quantity: 1, monster: goblinFixture }],
        },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('not_active_director');
    expect(result.derived).toHaveLength(0);
  });

  it('rejects with invalid_payload when entries is empty', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'LoadEncounterTemplate',
        actor: ownerActor,
        payload: { templateId: 'tpl-1', entries: [] }, // min(1) violated
      }),
    );
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });
});
