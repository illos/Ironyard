import type { Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  type CampaignState,
  type PcPlaceholder,
  type ReducerContext,
  type StampedIntent,
  applyIntent,
  emptyCampaignState,
  isParticipant,
} from '../src/index';
import { buildBundleWithFury, buildFuryL1Fixture } from './fixtures/character-runtime';

const T = 1_700_000_000_000;
const campaignId = 'sess_start_enc';

function intent(type: string, payload: unknown): StampedIntent {
  return {
    id: `i_${Math.random().toString(36).slice(2)}`,
    campaignId,
    actor: { userId: 'user-owner', role: 'director' },
    timestamp: T,
    source: 'manual',
    type,
    payload,
    causedBy: undefined,
  };
}

describe('applyStartEncounter — materialization / ownerId', () => {
  it('materialized PC carries ownerId from the placeholder', () => {
    const character = buildFuryL1Fixture();
    const ctx: ReducerContext = { staticData: buildBundleWithFury() };
    const placeholder: PcPlaceholder = {
      kind: 'pc-placeholder',
      characterId: 'c1',
      ownerId: 'user-1',
      position: 0,
    };
    let s: CampaignState = emptyCampaignState(campaignId, 'user-owner');
    s = { ...s, participants: [placeholder] };

    const result = applyIntent(
      s,
      intent('StartEncounter', {
        stampedPcs: [{ characterId: 'c1', name: 'Hero', ownerId: 'user-1', character }],
      }),
      ctx,
    );

    expect(result.errors).toBeUndefined();
    const pc = result.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.kind === 'pc',
    );
    expect(pc).toBeDefined();
    expect(pc?.ownerId).toBe('user-1');
  });

  it('materialized PC carries characterId from the placeholder', () => {
    const character = buildFuryL1Fixture();
    const ctx: ReducerContext = { staticData: buildBundleWithFury() };
    const placeholder: PcPlaceholder = {
      kind: 'pc-placeholder',
      characterId: 'c1',
      ownerId: 'user-1',
      position: 0,
    };
    let s: CampaignState = emptyCampaignState(campaignId, 'user-owner');
    s = { ...s, participants: [placeholder] };

    const result = applyIntent(
      s,
      intent('StartEncounter', {
        stampedPcs: [{ characterId: 'c1', name: 'Hero', ownerId: 'user-1', character }],
      }),
      ctx,
    );

    expect(result.errors).toBeUndefined();
    const pc = result.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.kind === 'pc',
    );
    expect(pc).toBeDefined();
    expect(pc?.characterId).toBe('c1');
  });

  it('monsters carry ownerId: null', () => {
    // Monsters are constructed with ownerId: null (the schema default).
    // This test verifies the field is present on the Participant type.
    const monster: Participant = {
      id: 'm1',
      name: 'Goblin',
      kind: 'monster',
      level: 1,
      currentStamina: 20,
      maxStamina: 20,
      characteristics: { might: 0, agility: 1, reason: -1, intuition: 0, presence: -1 },
      immunities: [],
      weaknesses: [],
      conditions: [],
      heroicResources: [],
      extras: [],
      surges: 0,
      recoveries: { current: 0, max: 0 },
      recoveryValue: 0,
      ownerId: null,
      characterId: null,
      weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
    };
    let s: CampaignState = emptyCampaignState(campaignId, 'user-owner');
    s = { ...s, participants: [monster] };

    const result = applyIntent(s, intent('StartEncounter', {}));

    expect(result.errors).toBeUndefined();
    const m = result.state.participants.find(
      (p): p is Participant => isParticipant(p) && p.kind === 'monster',
    );
    expect(m).toBeDefined();
    expect(m?.ownerId).toBeNull();
  });
});
