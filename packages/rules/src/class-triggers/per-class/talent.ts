import type { CampaignState, DerivedIntent } from '../../types';
import { isParticipant } from '../../types';
import type { ActionEvent, ActionTriggerContext } from '../action-triggers';
import { resolveParticipantClass } from '../helpers';

// Pass 3 Slice 2a — Talent class-δ action triggers.
//
// Clarity (canon § 5.3):
//   When a creature is force-moved, every Talent in the encounter gains 1
//   clarity, first time per round per Talent (gated by
//   `perRound.creatureForceMoved` on each Talent independently).
//
// Note: this trigger is global — every Talent gets the gain regardless of
// who caused the forced movement (the canon entry is "when a creature is
// force-moved", not "when a creature you force-move…"). The per-Talent latch
// makes a multi-Talent party gain independently, which is verified by the
// two-Talent test.

export function evaluate(
  state: CampaignState,
  event: ActionEvent,
  ctx: ActionTriggerContext,
): DerivedIntent[] {
  if (event.kind !== 'creature-force-moved') return [];
  const derived: DerivedIntent[] = [];
  for (const talent of state.participants.filter(isParticipant)) {
    if (talent.kind !== 'pc') continue;
    if (resolveParticipantClass(state, talent) !== 'talent') continue;
    if (talent.perEncounterFlags.perRound.creatureForceMoved) continue;
    // Phase 2b 2b.13 — Talent force-move clarity level scaling:
    //   L1-L3: +1 (baseline)
    //   L4-L9: +2 (Mind Recovery)
    //   L10:   +3 (Clear Mind)
    const clarityAmount = talent.level >= 10 ? 3 : talent.level >= 4 ? 2 : 1;
    derived.push(
      {
        actor: ctx.actor,
        source: 'server',
        type: 'GainResource',
        payload: { participantId: talent.id, name: 'clarity', amount: clarityAmount },
      },
      {
        actor: ctx.actor,
        source: 'server',
        type: 'SetParticipantPerRoundFlag',
        payload: {
          participantId: talent.id,
          key: 'creatureForceMoved',
          value: true,
        },
      },
    );
  }
  return derived;
}
