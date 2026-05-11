import {
  type ApplyDamagePayload,
  type EndTurnPayload,
  IntentTypes,
  type Participant,
  type RemoveConditionPayload,
  type RollPowerPayload,
  type SetConditionPayload,
  type StartRoundPayload,
  type StartTurnPayload,
} from '@ironyard/shared';
import type { MirrorIntent } from '../ws/useSessionSocket';

// Toast attribution. Takes the applied intent + the participant list AS IT WAS
// just before the intent applied (so e.g. ApplyDamage knows the target's name)
// and returns a one-line human string.
//
// Slice 11: keeps the most useful sentences for the play screen; everything
// else falls back to a terse "<actor> dispatched <type>".

export type DescribeArgs = {
  intent: MirrorIntent;
  participantsBefore: Participant[];
  // The parent RollPower (for derived ApplyDamage attribution). Undefined when
  // the intent isn't derived.
  parent?: MirrorIntent;
};

function nameOf(participants: Participant[], id: string | undefined): string {
  if (!id) return 'someone';
  const p = participants.find((x) => x.id === id);
  return p ? p.name : id;
}

export function describeIntent(args: DescribeArgs): string {
  const { intent, participantsBefore, parent } = args;
  switch (intent.type) {
    case IntentTypes.ApplyDamage: {
      const { targetId, amount, damageType } = intent.payload as ApplyDamagePayload;
      const target = nameOf(participantsBefore, targetId);
      if (parent && parent.type === IntentTypes.RollPower) {
        const p = parent.payload as RollPowerPayload;
        const attacker = nameOf(participantsBefore, p.attackerId);
        const tag = parent.source === 'manual' ? 'manual' : 'auto';
        return `${attacker} → ${target} took ${amount} ${damageType} — ${p.abilityId} (${tag})`;
      }
      return `${target} took ${amount} ${damageType}`;
    }
    case IntentTypes.RollPower: {
      const p = intent.payload as RollPowerPayload;
      const attacker = nameOf(participantsBefore, p.attackerId);
      const targetNames = p.targetIds.map((id) => nameOf(participantsBefore, id)).join(', ');
      const tag = intent.source === 'manual' ? 'manual' : 'auto';
      return `${attacker} rolls ${p.abilityId} vs ${targetNames} (${tag})`;
    }
    case IntentTypes.StartRound: {
      void (intent.payload as StartRoundPayload);
      return 'Round started';
    }
    case IntentTypes.EndRound:
      return 'Round ended';
    case IntentTypes.StartTurn: {
      const { participantId } = intent.payload as StartTurnPayload;
      return `${nameOf(participantsBefore, participantId)}'s turn`;
    }
    case IntentTypes.EndTurn: {
      void (intent.payload as EndTurnPayload);
      return 'Turn ended';
    }
    case IntentTypes.SetCondition: {
      const { targetId, condition } = intent.payload as SetConditionPayload;
      return `${nameOf(participantsBefore, targetId)} gained ${condition}`;
    }
    case IntentTypes.RemoveCondition: {
      const { targetId, condition } = intent.payload as RemoveConditionPayload;
      return `${nameOf(participantsBefore, targetId)} freed of ${condition}`;
    }
    case IntentTypes.BringCharacterIntoEncounter:
      return 'Participant added';
    case IntentTypes.StartEncounter:
      return 'Encounter started';
    case IntentTypes.Undo:
      return 'Undone';
    default:
      return `${intent.actor.userId} dispatched ${intent.type}`;
  }
}

// Find the most recent intent (working back from the end of the log) that is
// safe to undo from the UI — i.e. it's user-dispatched (not derived), not yet
// voided, and lives inside the current round. Returns null if nothing in the
// log qualifies.
export function findLatestUndoable(log: MirrorIntent[]): MirrorIntent | null {
  // Identify the most recent EndRound; anything at or before its seq is
  // committed and can't be undone (DO enforces this anyway, but the UI
  // shouldn't tease the affordance).
  let lastEndRoundSeq = 0;
  for (const i of log) {
    if (i.type === IntentTypes.EndRound && !i.voided && i.seq > lastEndRoundSeq) {
      lastEndRoundSeq = i.seq;
    }
  }
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    if (!entry) continue;
    if (entry.voided) continue;
    if (entry.causedBy) continue; // derived; the parent is the undo target
    if (entry.seq <= lastEndRoundSeq) continue;
    if (entry.type === IntentTypes.Undo) continue;
    if (entry.type === IntentTypes.JoinSession) continue;
    if (entry.type === IntentTypes.LeaveSession) continue;
    return entry;
  }
  return null;
}
