import { describe, expect, it } from 'vitest';
import { applyBecomeDoomed } from '../../src/intents/become-doomed';
import {
  OWNER_ID,
  baseState,
  makeHeroParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

const PC_ID = 'pc:hero-1';
const PLAYER_ID = 'player-2';

function stateWithHero(heroOverrides = {}) {
  const hero = makeHeroParticipant(PC_ID, { ownerId: OWNER_ID, ...heroOverrides });
  return baseState({
    currentSessionId: 'sess-1',
    participants: [hero],
    encounter: makeRunningEncounterPhase('enc-1'),
  });
}

function becomeDoomedIntent(
  opts: {
    participantId?: string;
    source?: 'hakaan-doomsight' | 'manual';
    userId?: string;
  } = {},
) {
  return stamped({
    type: 'BecomeDoomed',
    actor: { userId: opts.userId ?? OWNER_ID, role: 'player' },
    payload: {
      participantId: opts.participantId ?? PC_ID,
      source: opts.source ?? 'hakaan-doomsight',
    },
  });
}

describe('applyBecomeDoomed — Hakaan-Doomsight path', () => {
  it('sets doomed override when Hakaan PC with Doomsight dispatches own intent', () => {
    const s = stateWithHero({
      ancestry: ['hakaan'],
      purchasedTraits: ['doomsight'],
      staminaState: 'healthy',
    });
    const result = applyBecomeDoomed(s, becomeDoomedIntent({ source: 'hakaan-doomsight' }));
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === PC_ID)!;
    expect(updated.staminaOverride?.kind).toBe('doomed');
    expect(updated.staminaOverride?.source).toBe('hakaan-doomsight');
    const override = updated.staminaOverride as {
      canRegainStamina: boolean;
      staminaDeathThreshold: string;
    };
    expect(override.canRegainStamina).toBe(true);
    expect(override.staminaDeathThreshold).toBe('none');
    expect(updated.staminaState).toBe('doomed');
  });

  it('emits StaminaTransitioned with cause=override-applied', () => {
    const s = stateWithHero({
      ancestry: ['hakaan'],
      purchasedTraits: ['doomsight'],
      staminaState: 'healthy',
    });
    const result = applyBecomeDoomed(s, becomeDoomedIntent({ source: 'hakaan-doomsight' }));
    expect(result.derived).toHaveLength(1);
    const st = result.derived[0]!;
    expect(st.type).toBe('StaminaTransitioned');
    const p = st.payload as { from: string; to: string; cause: string; participantId: string };
    expect(p.from).toBe('healthy');
    expect(p.to).toBe('doomed');
    expect(p.cause).toBe('override-applied');
    expect(p.participantId).toBe(PC_ID);
  });

  it('rejects when participant is not Hakaan ancestry', () => {
    const s = stateWithHero({
      ancestry: ['human'],
      purchasedTraits: ['doomsight'],
      staminaState: 'healthy',
    });
    const result = applyBecomeDoomed(s, becomeDoomedIntent({ source: 'hakaan-doomsight' }));
    expect(result.errors?.[0]?.code).toBe('not_eligible');
  });

  it('rejects when Hakaan PC does not have Doomsight purchased trait', () => {
    const s = stateWithHero({
      ancestry: ['hakaan'],
      purchasedTraits: ['all-is-a-feather'],
      staminaState: 'healthy',
    });
    const result = applyBecomeDoomed(s, becomeDoomedIntent({ source: 'hakaan-doomsight' }));
    expect(result.errors?.[0]?.code).toBe('not_eligible');
  });

  it('rejects when participant is already dead', () => {
    const s = stateWithHero({
      ancestry: ['hakaan'],
      purchasedTraits: ['doomsight'],
      staminaState: 'dead',
    });
    const result = applyBecomeDoomed(s, becomeDoomedIntent({ source: 'hakaan-doomsight' }));
    expect(result.errors?.[0]?.code).toBe('not_eligible');
  });

  it('rejects when actor is not the PC owner and not active director', () => {
    const s = stateWithHero({
      ancestry: ['hakaan'],
      purchasedTraits: ['doomsight'],
      staminaState: 'healthy',
    });
    const result = applyBecomeDoomed(
      s,
      becomeDoomedIntent({ source: 'hakaan-doomsight', userId: PLAYER_ID }),
    );
    expect(result.errors?.[0]?.code).toBe('not_authorized');
  });
});

describe('applyBecomeDoomed — manual (director) path', () => {
  it('director can apply manual source override to any PC', () => {
    const s = stateWithHero({
      ancestry: [],
      purchasedTraits: [],
      staminaState: 'healthy',
    });
    const result = applyBecomeDoomed(
      s,
      stamped({
        type: 'BecomeDoomed',
        actor: { userId: OWNER_ID, role: 'director' },
        payload: { participantId: PC_ID, source: 'manual' },
      }),
    );
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === PC_ID)!;
    expect(updated.staminaOverride?.kind).toBe('doomed');
    expect(updated.staminaOverride?.source).toBe('manual');
    expect(updated.staminaState).toBe('doomed');
  });

  it('non-director player rejected for manual source', () => {
    const s = stateWithHero({ staminaState: 'healthy' });
    const result = applyBecomeDoomed(
      s,
      stamped({
        type: 'BecomeDoomed',
        actor: { userId: PLAYER_ID, role: 'player' },
        payload: { participantId: PC_ID, source: 'manual' },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('not_authorized');
  });
});
