import type { Actor, StaminaTransitionedPayload } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../types';
import { isParticipant } from '../types';
import { resolveParticipantClass } from './helpers';

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
    match: (event, state) => {
      if (event.to !== 'winded') return false;
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
    match: (event, state) => {
      if (event.to !== 'dying') return false;
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
    match: (event, state) => {
      if (event.to !== 'winded') return false;
      const winded = state.participants
        .filter(isParticipant)
        .find((x) => x.id === event.participantId);
      if (!winded || winded.kind !== 'pc') return false;
      // Fire for every Troubadour whose latch is unflipped — return true if any exists.
      return state.participants
        .filter(isParticipant)
        .some(
          (p) =>
            p.kind === 'pc' &&
            resolveParticipantClass(state, p) === 'troubadour' &&
            !p.perEncounterFlags.perEncounter.troubadourAnyHeroWindedTriggered,
        );
    },
    fire: (_event, state, ctx) => {
      const derived: DerivedIntent[] = [];
      for (const trou of state.participants.filter(isParticipant)) {
        if (trou.kind !== 'pc') continue;
        if (resolveParticipantClass(state, trou) !== 'troubadour') continue;
        if (trou.perEncounterFlags.perEncounter.troubadourAnyHeroWindedTriggered) continue;
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
    match: (event, state) => {
      if (event.to !== 'dead') return false;
      const dyer = state.participants
        .filter(isParticipant)
        .find((x) => x.id === event.participantId);
      if (!dyer || dyer.kind !== 'pc') return false;
      return state.participants
        .filter(isParticipant)
        .some((p) => p.kind === 'pc' && resolveParticipantClass(state, p) === 'troubadour');
    },
    fire: (_event, state, ctx) => {
      const derived: DerivedIntent[] = [];
      for (const trou of state.participants.filter(isParticipant)) {
        if (trou.kind !== 'pc') continue;
        if (resolveParticipantClass(state, trou) !== 'troubadour') continue;
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
