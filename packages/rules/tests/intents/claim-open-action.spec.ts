import type { OpenAction, OpenActionKind } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyClaimOpenAction } from '../../src/intents/claim-open-action';
import { baseState, makeHeroParticipant, makeRunningEncounterPhase, stamped } from './test-utils';

function stateWithOA(opts: {
  participantId: string;
  ownerId: string;
  kind?: OpenActionKind;
  oaPayload?: Record<string, unknown>;
  participantOverrides?: Partial<ReturnType<typeof makeHeroParticipant>>;
}) {
  const pc = makeHeroParticipant(opts.participantId, {
    ownerId: opts.ownerId,
    ...(opts.participantOverrides ?? {}),
  });
  const pcOther = makeHeroParticipant('pc-other', { ownerId: 'other-user' });
  const s = baseState({
    currentSessionId: 'sess-1',
    participants: [pc, pcOther],
    encounter: makeRunningEncounterPhase('enc-1'),
  });
  const oa: OpenAction = {
    id: 'oa-1',
    kind: opts.kind ?? 'title-doomed-opt-in',
    participantId: opts.participantId,
    raisedAtRound: 1,
    raisedByIntentId: 'i-prev',
    expiresAtRound: null,
    payload: opts.oaPayload ?? {},
  };
  s.openActions = [oa];
  return s;
}

describe('applyClaimOpenAction', () => {
  it('owner of the targeted PC can claim — OA removed', () => {
    const s = stateWithOA({ participantId: 'pc-1', ownerId: 'alice' });
    const intent = stamped({
      actor: { userId: 'alice', role: 'player' },
      type: 'ClaimOpenAction',
      payload: { openActionId: 'oa-1' },
    });
    const result = applyClaimOpenAction(s, intent);
    expect(result.errors ?? []).toEqual([]);
    expect(result.state.openActions).toHaveLength(0);
  });

  it('active director can claim on behalf of a player', () => {
    const s = stateWithOA({ participantId: 'pc-1', ownerId: 'alice' });
    s.activeDirectorId = 'gm';
    const intent = stamped({
      actor: { userId: 'gm', role: 'director' },
      type: 'ClaimOpenAction',
      payload: { openActionId: 'oa-1' },
    });
    const result = applyClaimOpenAction(s, intent);
    expect(result.errors ?? []).toEqual([]);
    expect(result.state.openActions).toHaveLength(0);
  });

  it('rejects when actor is neither owner nor active director', () => {
    const s = stateWithOA({ participantId: 'pc-1', ownerId: 'alice' });
    const intent = stamped({
      actor: { userId: 'bob', role: 'player' },
      type: 'ClaimOpenAction',
      payload: { openActionId: 'oa-1' },
    });
    const result = applyClaimOpenAction(s, intent);
    expect(result.errors?.[0]?.code).toBe('not_authorized');
    expect(result.state.openActions).toHaveLength(1);
  });

  it('rejects an unknown openActionId', () => {
    const s = stateWithOA({ participantId: 'pc-1', ownerId: 'alice' });
    const intent = stamped({
      actor: { userId: 'alice', role: 'player' },
      type: 'ClaimOpenAction',
      payload: { openActionId: 'missing' },
    });
    const result = applyClaimOpenAction(s, intent);
    expect(result.errors?.[0]?.code).toBe('not_found');
  });

  it('rejects a malformed payload', () => {
    const s = stateWithOA({ participantId: 'pc-1', ownerId: 'alice' });
    const intent = stamped({
      actor: { userId: 'alice', role: 'player' },
      type: 'ClaimOpenAction',
      payload: { openActionId: '' },
    });
    const result = applyClaimOpenAction(s, intent);
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });

  // --- Phase 2b 2b.15 — title-doomed-opt-in claim applies the override ------
  // Canon Doomed.md:22 — claim should put the PC into the doomed state so it
  // auto-tier-3s ability rolls and dies at encounter end.
  it('title-doomed-opt-in claim emits ApplyParticipantOverride { doomed/title-doomed }', () => {
    const s = stateWithOA({
      participantId: 'pc-1',
      ownerId: 'alice',
      kind: 'title-doomed-opt-in',
    });
    const intent = stamped({
      actor: { userId: 'alice', role: 'player' },
      type: 'ClaimOpenAction',
      payload: { openActionId: 'oa-1' },
    });
    const result = applyClaimOpenAction(s, intent);
    expect(result.errors ?? []).toEqual([]);
    expect(result.state.openActions).toHaveLength(0);

    const apply = result.derived.find((d) => d.type === 'ApplyParticipantOverride');
    expect(apply).toBeDefined();
    const payload = apply!.payload as {
      participantId: string;
      override: {
        kind: string;
        source: string;
        canRegainStamina: boolean;
        autoTier3OnPowerRolls: boolean;
        staminaDeathThreshold: string;
        dieAtEncounterEnd: boolean;
      };
    };
    expect(payload.participantId).toBe('pc-1');
    expect(payload.override.kind).toBe('doomed');
    expect(payload.override.source).toBe('title-doomed');
    expect(payload.override.canRegainStamina).toBe(false);
    expect(payload.override.autoTier3OnPowerRolls).toBe(true);
    expect(payload.override.staminaDeathThreshold).toBe('staminaMax');
    expect(payload.override.dieAtEncounterEnd).toBe(true);
    expect(apply!.causedBy).toBe(intent.id);
    expect(apply!.source).toBe('server');
  });

  // --- Slice 2a: spatial-trigger OAs ----------------------------------------

  const spatialCases: Array<{
    kind: OpenActionKind;
    resource: string;
    amount: number;
    flagKey: string | null;
  }> = [
    {
      kind: 'spatial-trigger-elementalist-essence',
      resource: 'essence',
      amount: 1,
      flagKey: 'elementalistDamageWithin10Triggered',
    },
    {
      kind: 'spatial-trigger-tactician-ally-heroic',
      resource: 'focus',
      amount: 1,
      flagKey: 'allyHeroicWithin10Triggered',
    },
    {
      kind: 'spatial-trigger-null-field',
      resource: 'discipline',
      amount: 1,
      flagKey: 'nullFieldEnemyMainTriggered',
    },
    {
      kind: 'spatial-trigger-troubadour-line-of-effect',
      resource: 'drama',
      amount: 3,
      flagKey: null,
    },
  ];

  it.each(spatialCases)(
    '$kind → emits GainResource($resource, $amount)' + ' (and per-round latch if applicable)',
    ({ kind, resource, amount, flagKey }) => {
      const s = stateWithOA({ participantId: 'pc-1', ownerId: 'alice', kind });
      const intent = stamped({
        actor: { userId: 'alice', role: 'player' },
        type: 'ClaimOpenAction',
        payload: { openActionId: 'oa-1' },
      });
      const result = applyClaimOpenAction(s, intent);
      expect(result.errors ?? []).toEqual([]);
      expect(result.state.openActions).toHaveLength(0);

      const gain = result.derived.find((d) => d.type === 'GainResource');
      expect(gain).toBeDefined();
      const gainPayload = gain!.payload as { name: string; amount: number; participantId: string };
      expect(gainPayload.name).toBe(resource);
      expect(gainPayload.amount).toBe(amount);
      expect(gainPayload.participantId).toBe('pc-1');
      expect(gain!.causedBy).toBe(intent.id);
      expect(gain!.source).toBe('server');

      if (flagKey) {
        const setFlag = result.derived.find((d) => d.type === 'SetParticipantPerRoundFlag');
        expect(setFlag).toBeDefined();
        const flagPayload = setFlag!.payload as { key: string; value: boolean };
        expect(flagPayload.key).toBe(flagKey);
        expect(flagPayload.value).toBe(true);
        expect(setFlag!.causedBy).toBe(intent.id);
      } else {
        // Troubadour LoE has no latch — every nat 19/20 fires fresh.
        const setFlag = result.derived.find((d) => d.type === 'SetParticipantPerRoundFlag');
        expect(setFlag).toBeUndefined();
      }
    },
  );

  // --- Phase 2b 2b.13: Elementalist Font of Essence @L4 ---------------------
  // Canon Elementalist.md: "The first time each combat round that you or a
  // creature within 10 squares takes damage that isn't untyped or holy
  // damage, you gain 2 essence instead of 1."
  it('spatial-trigger-elementalist-essence at L4+ grants +2 essence (Font of Essence)', () => {
    const s = stateWithOA({
      participantId: 'pc-1',
      ownerId: 'alice',
      kind: 'spatial-trigger-elementalist-essence',
      participantOverrides: { level: 4, className: 'Elementalist' },
    });
    const intent = stamped({
      actor: { userId: 'alice', role: 'player' },
      type: 'ClaimOpenAction',
      payload: { openActionId: 'oa-1' },
    });
    const result = applyClaimOpenAction(s, intent);
    const gain = result.derived.find((d) => d.type === 'GainResource');
    expect((gain!.payload as { name: string; amount: number }).name).toBe('essence');
    expect((gain!.payload as { name: string; amount: number }).amount).toBe(2);
  });

  it('spatial-trigger-elementalist-essence at L3 grants +1 essence (baseline)', () => {
    const s = stateWithOA({
      participantId: 'pc-1',
      ownerId: 'alice',
      kind: 'spatial-trigger-elementalist-essence',
      participantOverrides: { level: 3, className: 'Elementalist' },
    });
    const intent = stamped({
      actor: { userId: 'alice', role: 'player' },
      type: 'ClaimOpenAction',
      payload: { openActionId: 'oa-1' },
    });
    const result = applyClaimOpenAction(s, intent);
    const gain = result.derived.find((d) => d.type === 'GainResource');
    expect((gain!.payload as { name: string; amount: number }).amount).toBe(1);
  });

  // --- Slice 2a: pray-to-the-gods ------------------------------------------

  it('pray-to-the-gods prayD3=1 → piety+1 + bypass-reduction psychic damage', () => {
    const s = stateWithOA({
      participantId: 'pc-conduit',
      ownerId: 'alice',
      kind: 'pray-to-the-gods',
      participantOverrides: { level: 4 },
    });
    const intent = stamped({
      actor: { userId: 'alice', role: 'player' },
      type: 'ClaimOpenAction',
      payload: {
        openActionId: 'oa-1',
        choice: { prayD3: 1, prayDamage: { d6: 5 } },
      },
    });
    const result = applyClaimOpenAction(s, intent);
    expect(result.errors ?? []).toEqual([]);

    const gain = result.derived.find((d) => d.type === 'GainResource');
    expect(gain).toBeDefined();
    expect((gain!.payload as { name: string; amount: number }).name).toBe('piety');
    expect((gain!.payload as { name: string; amount: number }).amount).toBe(1);

    const damage = result.derived.find((d) => d.type === 'ApplyDamage');
    expect(damage).toBeDefined();
    const dmgPayload = damage!.payload as {
      targetId: string;
      amount: number;
      damageType: string;
      bypassDamageReduction: boolean;
      sourceIntentId: string;
    };
    expect(dmgPayload.targetId).toBe('pc-conduit');
    expect(dmgPayload.amount).toBe(5 + 4); // d6 + level
    expect(dmgPayload.damageType).toBe('psychic');
    expect(dmgPayload.bypassDamageReduction).toBe(true);
    expect(dmgPayload.sourceIntentId).toBe(intent.id);
    expect(damage!.causedBy).toBe(intent.id);
    expect(damage!.source).toBe('server');
  });

  it('pray-to-the-gods prayD3=1 defaults level=1 when participant.level missing', () => {
    const s = stateWithOA({
      participantId: 'pc-conduit',
      ownerId: 'alice',
      kind: 'pray-to-the-gods',
      participantOverrides: { level: 0 },
    });
    const intent = stamped({
      actor: { userId: 'alice', role: 'player' },
      type: 'ClaimOpenAction',
      payload: {
        openActionId: 'oa-1',
        choice: { prayD3: 1, prayDamage: { d6: 2 } },
      },
    });
    const result = applyClaimOpenAction(s, intent);
    expect(result.errors ?? []).toEqual([]);
    const damage = result.derived.find((d) => d.type === 'ApplyDamage');
    expect((damage!.payload as { amount: number }).amount).toBe(2 + 1); // d6 + default level 1
  });

  it('pray-to-the-gods prayD3=2 → piety+1, no damage', () => {
    const s = stateWithOA({
      participantId: 'pc-conduit',
      ownerId: 'alice',
      kind: 'pray-to-the-gods',
    });
    const intent = stamped({
      actor: { userId: 'alice', role: 'player' },
      type: 'ClaimOpenAction',
      payload: { openActionId: 'oa-1', choice: { prayD3: 2 } },
    });
    const result = applyClaimOpenAction(s, intent);
    expect(result.errors ?? []).toEqual([]);

    const gains = result.derived.filter((d) => d.type === 'GainResource');
    expect(gains).toHaveLength(1);
    expect((gains[0]!.payload as { amount: number }).amount).toBe(1);
    expect(result.derived.find((d) => d.type === 'ApplyDamage')).toBeUndefined();
  });

  it('pray-to-the-gods prayD3=3 → piety+2 + deferred-domain-effect log', () => {
    const s = stateWithOA({
      participantId: 'pc-conduit',
      ownerId: 'alice',
      kind: 'pray-to-the-gods',
    });
    const intent = stamped({
      actor: { userId: 'alice', role: 'player' },
      type: 'ClaimOpenAction',
      payload: { openActionId: 'oa-1', choice: { prayD3: 3 } },
    });
    const result = applyClaimOpenAction(s, intent);
    expect(result.errors ?? []).toEqual([]);

    const gain = result.derived.find((d) => d.type === 'GainResource');
    expect((gain!.payload as { amount: number }).amount).toBe(2);
    expect(result.derived.find((d) => d.type === 'ApplyDamage')).toBeUndefined();
    const domainLog = result.log.find((l) => /domain effect/i.test(l.text));
    expect(domainLog).toBeDefined();
  });

  it('pray-to-the-gods missing prayD3 → error', () => {
    const s = stateWithOA({
      participantId: 'pc-conduit',
      ownerId: 'alice',
      kind: 'pray-to-the-gods',
    });
    const intent = stamped({
      actor: { userId: 'alice', role: 'player' },
      type: 'ClaimOpenAction',
      payload: { openActionId: 'oa-1' },
    });
    const result = applyClaimOpenAction(s, intent);
    expect(result.errors?.[0]?.code).toBe('missing_pray_d3');
    expect(result.state.openActions).toHaveLength(1); // not removed on error
  });

  it('pray-to-the-gods prayD3=1 without prayDamage → error', () => {
    const s = stateWithOA({
      participantId: 'pc-conduit',
      ownerId: 'alice',
      kind: 'pray-to-the-gods',
    });
    const intent = stamped({
      actor: { userId: 'alice', role: 'player' },
      type: 'ClaimOpenAction',
      payload: { openActionId: 'oa-1', choice: { prayD3: 1 } },
    });
    const result = applyClaimOpenAction(s, intent);
    expect(result.errors?.[0]?.code).toBe('missing_pray_damage');
    expect(result.state.openActions).toHaveLength(1);
  });

  // --- Slice 2a: troubadour-auto-revive ------------------------------------

  it('troubadour-auto-revive → emits TroubadourAutoRevive derived', () => {
    const s = stateWithOA({
      participantId: 'pc-trou',
      ownerId: 'alice',
      kind: 'troubadour-auto-revive',
    });
    const intent = stamped({
      actor: { userId: 'alice', role: 'player' },
      type: 'ClaimOpenAction',
      payload: { openActionId: 'oa-1' },
    });
    const result = applyClaimOpenAction(s, intent);
    expect(result.errors ?? []).toEqual([]);
    expect(result.state.openActions).toHaveLength(0);

    const revive = result.derived.find((d) => d.type === 'TroubadourAutoRevive');
    expect(revive).toBeDefined();
    expect((revive!.payload as { participantId: string }).participantId).toBe('pc-trou');
    expect(revive!.causedBy).toBe(intent.id);
    expect(revive!.source).toBe('server');
  });
});
