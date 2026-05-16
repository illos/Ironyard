// Per-intent trust gate. Called by the lobby DO after the `SERVER_ONLY_INTENTS`
// envelope check (which lives in `@ironyard/shared`) and before the reducer.
//
// `canDispatch` returns true when the actor is allowed to dispatch the intent.
// The default is **permissive** (return true) — Phase 1 trusts the friend-group
// model and the reducer-level validation is the primary defence. Per-intent
// cases here narrow that trust where the spec calls for it (e.g. an owner-or-
// director gate on maintenance toggling).
//
// Adding a new case:
//   1. Read the participant by `intent.payload.participantId` (or whatever the
//      intent's payload exposes).
//   2. Compare `actor.userId` to `participant.ownerId` (owner check) and to
//      `state.activeDirectorId` (director check).
//   3. Return true if either matches; false otherwise.
//
// See docs/intent-protocol.md §3 for the wider trust model.

import { type Actor, type Intent, IntentTypes } from '@ironyard/shared';
import type { CampaignState } from './types';

export function canDispatch(intent: Intent, actor: Actor, state: CampaignState): boolean {
  switch (intent.type) {
    case IntentTypes.StartMaintenance:
    case IntentTypes.StopMaintenance: {
      // Pass 3 Slice 2a — Maintenance toggling is owner-or-director.
      // The owning player can pick up / drop their own maintained ability;
      // the active director can do it for any PC (e.g. cleanup after a NPC
      // takeover). Other players are rejected.
      const payload = intent.payload as { participantId?: unknown } | null;
      const participantId =
        typeof payload?.participantId === 'string' ? payload.participantId : null;
      if (!participantId) return false;
      const participant = state.participants.find((p) => p.id === participantId);
      if (!participant) return false;
      const isOwner = participant.kind === 'pc' && actor.userId === participant.ownerId;
      const isDirector = actor.userId === state.activeDirectorId;
      return isOwner || isDirector;
    }
    default:
      // Permissive default — Phase 1 friend-group trust model. The lobby
      // envelope already rejected `SERVER_ONLY_INTENTS` from the client side.
      return true;
  }
}
