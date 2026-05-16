import { IntentTypes } from '@ironyard/shared';
import type { Actor, Participant, StaminaTransitionedPayload } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../types';
import { isParticipant } from '../types';
import { resolveParticipantClass } from './helpers';

// Phase 2b 2b.16 B21 — Troubadour drama-eligibility predicate. Mirrors the
// per-class action-trigger gate in per-class/troubadour.ts. Alive Troubadours
// always gain; a dead Troubadour can still bank drama only if their body is
// intact AND posthumousDramaEligible is true. State-transition triggers were
// previously missing this filter — latent until ablation events ship.
function canGainDrama(trou: Participant): boolean {
  if (trou.staminaState !== 'dead') return true;
  return trou.bodyIntact === true && trou.posthumousDramaEligible === true;
}

// Pass 3 Slice 2a — Class-trigger subscribers to slice-1's StaminaTransitioned
// derived event. Each entry says: "I match if event is X and my class is in
// state; firing produces these derived intents." Slice 2a ships five entries
// (Fury winded, Fury dying, Troubadour any-hero-winded, Troubadour hero-dies,
// Troubadour dies → posthumousDramaEligible).
//
// Task 16 wires the call site into stamina.ts; for now this module just
// exposes `evaluateStaminaTransitionTriggers` as a pure subscriber.
//
// Purity contract: this module is pure. Any random draws (e.g. Fury Ferocity
// 1d3) MUST be pre-rolled at the impure call site (Task 16's stamina.ts) and
// passed via `ctx.rolls`. The reducer header (reducer.ts:80) forbids
// Math.random inside packages/rules/src/.
//
// See `docs/superpowers/specs/2026-05-15-pass-3-slice-2a-…-design.md`
// § class-δ trigger dispatch.

export type StaminaTransitionTriggerContext = {
  actor: Actor;
  rolls: {
    // Pre-rolled 1..3, required if a Fury winded/dying entry fires; consumers
    // (Task 16) generate this at the impure call site.
    ferocityD3?: number;
  };
};

type StaminaTransitionTrigger = {
  match: (event: StaminaTransitionedPayload, state: CampaignState) => boolean;
  fire: (
    event: StaminaTransitionedPayload,
    state: CampaignState,
    ctx: StaminaTransitionTriggerContext,
  ) => DerivedIntent[];
};

function requireFerocityD3(ctx: StaminaTransitionTriggerContext): number {
  if (ctx.rolls.ferocityD3 === undefined) {
    // Contract violation: a Fury entry matched but the caller did not supply
    // a pre-rolled ferocity value. Throw to surface the bug at the call site
    // rather than silently producing NaN downstream.
    throw new Error(
      'evaluateStaminaTransitionTriggers: Fury Ferocity entry fired but ctx.rolls.ferocityD3 was not supplied',
    );
  }
  return ctx.rolls.ferocityD3;
}

const STAMINA_TRANSITION_TRIGGERS: StaminaTransitionTrigger[] = [
  {
    // Fury Ferocity — first time per encounter winded (+1d3 ferocity).
    // Per Phase 5 design spec (line 212), Ferocity is "took damage" — the
    // trigger must NOT fire when the transition came from a heal, override
    // application, encounter-end, or recoveries-refilled / -exhausted. The
    // cause-filter also guards `requireFerocityD3` from throwing when callers
    // (e.g. apply-heal) legitimately have no pre-rolled ferocityD3 to supply.
    match: (event, state) => {
      if (event.to !== 'winded') return false;
      if (event.cause !== 'damage') return false;
      const p = state.participants.filter(isParticipant).find((x) => x.id === event.participantId);
      if (!p || p.kind !== 'pc') return false;
      if (resolveParticipantClass(state, p) !== 'fury') return false;
      if (p.perEncounterFlags.perEncounter.firstTimeWindedTriggered) return false;
      return true;
    },
    fire: (event, _state, ctx) => [
      {
        actor: ctx.actor,
        source: 'server',
        type: 'GainResource',
        payload: {
          participantId: event.participantId,
          name: 'ferocity',
          amount: requireFerocityD3(ctx),
        },
      },
      {
        actor: ctx.actor,
        source: 'server',
        type: 'SetParticipantPerEncounterLatch',
        payload: {
          participantId: event.participantId,
          key: 'firstTimeWindedTriggered',
          value: true,
        },
      },
    ],
  },
  {
    // Fury Ferocity — first time per encounter dying (+1d3 ferocity).
    // Same damage-only cause filter as the winded entry above — Ferocity is a
    // "took damage" trigger per spec, and apply-heal cannot supply ferocityD3.
    match: (event, state) => {
      if (event.to !== 'dying') return false;
      if (event.cause !== 'damage') return false;
      const p = state.participants.filter(isParticipant).find((x) => x.id === event.participantId);
      if (!p || p.kind !== 'pc') return false;
      if (resolveParticipantClass(state, p) !== 'fury') return false;
      if (p.perEncounterFlags.perEncounter.firstTimeDyingTriggered) return false;
      return true;
    },
    fire: (event, _state, ctx) => [
      {
        actor: ctx.actor,
        source: 'server',
        type: 'GainResource',
        payload: {
          participantId: event.participantId,
          name: 'ferocity',
          amount: requireFerocityD3(ctx),
        },
      },
      {
        actor: ctx.actor,
        source: 'server',
        type: 'SetParticipantPerEncounterLatch',
        payload: {
          participantId: event.participantId,
          key: 'firstTimeDyingTriggered',
          value: true,
        },
      },
    ],
  },
  {
    // Troubadour Drama — first time per encounter any hero becomes winded (+2 drama,
    // per Troubadour, per encounter).
    //
    // Cause filter (Phase 2b 2b.16 B23): canon "any hero is *made* winded" is
    // cause-agnostic for threat-pressure events. Damage is the dominant path;
    // override-applied (e.g. a CoP-style override forcing a state flip) also
    // counts. Heal-into-winded never qualifies — that's recovery, not threat.
    match: (event, state) => {
      if (event.to !== 'winded') return false;
      if (event.cause !== 'damage' && event.cause !== 'override-applied') return false;
      const winded = state.participants
        .filter(isParticipant)
        .find((x) => x.id === event.participantId);
      if (!winded || winded.kind !== 'pc') return false;
      // Fire for every Troubadour whose latch is unflipped AND eligible to gain
      // drama (B21 — bodyIntact / posthumousDramaEligible gate).
      return state.participants
        .filter(isParticipant)
        .some(
          (p) =>
            p.kind === 'pc' &&
            resolveParticipantClass(state, p) === 'troubadour' &&
            !p.perEncounterFlags.perEncounter.troubadourAnyHeroWindedTriggered &&
            canGainDrama(p),
        );
    },
    fire: (_event, state, ctx) => {
      const derived: DerivedIntent[] = [];
      for (const trou of state.participants.filter(isParticipant)) {
        if (trou.kind !== 'pc') continue;
        if (resolveParticipantClass(state, trou) !== 'troubadour') continue;
        if (trou.perEncounterFlags.perEncounter.troubadourAnyHeroWindedTriggered) continue;
        if (!canGainDrama(trou)) continue;
        derived.push(
          {
            actor: ctx.actor,
            source: 'server',
            type: 'GainResource',
            payload: { participantId: trou.id, name: 'drama', amount: 2 },
          },
          {
            actor: ctx.actor,
            source: 'server',
            type: 'SetParticipantPerEncounterLatch',
            payload: {
              participantId: trou.id,
              key: 'troubadourAnyHeroWindedTriggered',
              value: true,
            },
          },
        );
      }
      return derived;
    },
  },
  {
    // Troubadour Drama — hero dies (+10 drama, no latch — every time).
    // B21 — canGainDrama gate (bodyIntact / posthumousDramaEligible).
    match: (event, state) => {
      if (event.to !== 'dead') return false;
      const dyer = state.participants
        .filter(isParticipant)
        .find((x) => x.id === event.participantId);
      if (!dyer || dyer.kind !== 'pc') return false;
      return state.participants
        .filter(isParticipant)
        .some(
          (p) =>
            p.kind === 'pc' &&
            resolveParticipantClass(state, p) === 'troubadour' &&
            canGainDrama(p),
        );
    },
    fire: (_event, state, ctx) => {
      const derived: DerivedIntent[] = [];
      for (const trou of state.participants.filter(isParticipant)) {
        if (trou.kind !== 'pc') continue;
        if (resolveParticipantClass(state, trou) !== 'troubadour') continue;
        if (!canGainDrama(trou)) continue;
        derived.push({
          actor: ctx.actor,
          source: 'server',
          type: 'GainResource',
          payload: { participantId: trou.id, name: 'drama', amount: 10 },
        });
      }
      return derived;
    },
  },
  {
    // Troubadour death — set posthumousDramaEligible flag (consumed by Drama
    // crossing 30 → auto-revive open action in Task 28).
    match: (event, state) => {
      if (event.to !== 'dead') return false;
      const p = state.participants.filter(isParticipant).find((x) => x.id === event.participantId);
      if (!p || p.kind !== 'pc') return false;
      return resolveParticipantClass(state, p) === 'troubadour';
    },
    fire: (event, _state, ctx) => [
      {
        actor: ctx.actor,
        source: 'server',
        type: 'SetParticipantPosthumousDramaEligible',
        payload: { participantId: event.participantId, value: true },
      },
    ],
  },
  {
    // Phase 2b cleanup 2b.14 — Tactician → dying clears the source's `marked`
    // list. Canon Tactician.md:229: Mark ends "until the end of the encounter,
    // until you are dying, or until you use this ability again." The
    // end-of-encounter clear is handled by `applyEndEncounter`; the
    // use-again-clear by the `mode: 'replace'` cascade in `applyUseAbility`;
    // this entry covers the dying-clear case.
    match: (event, state) => {
      if (event.to !== 'dying') return false;
      const p = state.participants.filter(isParticipant).find((x) => x.id === event.participantId);
      if (!p || p.kind !== 'pc') return false;
      if (resolveParticipantClass(state, p) !== 'tactician') return false;
      return p.targetingRelations.marked.length > 0;
    },
    fire: (event, state, ctx) => {
      const p = state.participants.filter(isParticipant).find((x) => x.id === event.participantId);
      if (!p) return [];
      return p.targetingRelations.marked.map((targetId) => ({
        actor: ctx.actor,
        source: 'server' as const,
        type: IntentTypes.SetTargetingRelation,
        payload: {
          sourceId: p.id,
          relationKind: 'marked',
          targetId,
          present: false,
        },
      }));
    },
  },
  {
    // Phase 2b cleanup 2b.14 — Null → dying clears the source's `nullField`
    // list. Canon Null.md:116: Null Field "ends only if you are dying or if
    // you willingly end it (no action required)." Willing end is the
    // per-row chip; this entry covers the dying-end case.
    match: (event, state) => {
      if (event.to !== 'dying') return false;
      const p = state.participants.filter(isParticipant).find((x) => x.id === event.participantId);
      if (!p || p.kind !== 'pc') return false;
      if (resolveParticipantClass(state, p) !== 'null') return false;
      return p.targetingRelations.nullField.length > 0;
    },
    fire: (event, state, ctx) => {
      const p = state.participants.filter(isParticipant).find((x) => x.id === event.participantId);
      if (!p) return [];
      return p.targetingRelations.nullField.map((targetId) => ({
        actor: ctx.actor,
        source: 'server' as const,
        type: IntentTypes.SetTargetingRelation,
        payload: {
          sourceId: p.id,
          relationKind: 'nullField',
          targetId,
          present: false,
        },
      }));
    },
  },
];

export function evaluateStaminaTransitionTriggers(
  event: StaminaTransitionedPayload,
  state: CampaignState,
  ctx: StaminaTransitionTriggerContext,
): DerivedIntent[] {
  return STAMINA_TRANSITION_TRIGGERS.flatMap((t) =>
    t.match(event, state) ? t.fire(event, state, ctx) : [],
  );
}
