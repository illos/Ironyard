import {
  type AdjustVictoriesPayload,
  type ApplyDamagePayload,
  type ApplyHealPayload,
  type ApplyParticipantOverridePayload,
  type BecomeDoomedPayload,
  type ClearParticipantOverridePayload,
  type EndTurnPayload,
  type ExecuteTriggerPayload,
  type GainResourcePayload,
  type GrantExtraMainActionPayload,
  IntentTypes,
  type KnockUnconsciousPayload,
  type MarkActionUsedPayload,
  type MarkSurprisedPayload,
  type Participant,
  type PickNextActorPayload,
  type RemoveConditionPayload,
  type ResolveTriggerOrderPayload,
  type RollInitiativePayload,
  type RollPowerPayload,
  type SetConditionPayload,
  type SetStaminaPayload,
  type SpendRecoveryPayload,
  type SpendResourcePayload,
  type SpendSurgePayload,
  type StaminaTransitionedPayload,
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
        const abilityLabel = p.abilityName ?? p.abilityId;
        return `${attacker} → ${target} took ${amount} ${damageType} — ${abilityLabel} (${tag})`;
      }
      return `${target} took ${amount} ${damageType}`;
    }
    case IntentTypes.RollPower: {
      const p = intent.payload as RollPowerPayload;
      const attacker = nameOf(participantsBefore, p.attackerId);
      const targetNames = p.targetIds.map((id) => nameOf(participantsBefore, id)).join(', ');
      const tag = intent.source === 'manual' ? 'manual' : 'auto';
      const abilityLabel = p.abilityName ?? p.abilityId;
      return `${attacker} rolls ${abilityLabel} vs ${targetNames} (${tag})`;
    }
    case IntentTypes.RollInitiative: {
      const p = intent.payload as RollInitiativePayload;
      const reason = p.rolledD10 !== undefined ? ` (d10=${p.rolledD10})` : '';
      const surpriseSummary =
        p.surprised.length > 0 ? `; ${p.surprised.length} surprised` : '';
      return `Initiative — ${p.winner} first${reason}${surpriseSummary}`;
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
    case IntentTypes.StartEncounter:
      return 'Encounter started';
    case IntentTypes.Undo:
      return 'Undone';
    case IntentTypes.MarkActionUsed: {
      const payload = intent.payload as MarkActionUsedPayload;
      const p = participantsBefore.find((x) => x.id === payload.participantId);
      const name = p?.name ?? 'Someone';
      if (payload.slot === 'move') return `${name} finished moving`;
      // Explicit Skip dispatch (no parent causedBy, and used: true).
      if (!intent.causedBy && payload.used) {
        return `${name} skipped their ${payload.slot}`;
      }
      // Auto-emitted from RollPower (causedBy is set) — suppress so the parent
      // RollPower toast isn't double-described.
      return '';
    }
    case IntentTypes.MarkSurprised: {
      const p = intent.payload as MarkSurprisedPayload;
      return p.surprised
        ? `${nameOf(participantsBefore, p.participantId)} marked surprised`
        : `${nameOf(participantsBefore, p.participantId)} unmarked surprised`;
    }
    case IntentTypes.PickNextActor: {
      const p = intent.payload as PickNextActorPayload;
      return `${nameOf(participantsBefore, p.participantId)} picked next`;
    }
    case IntentTypes.AdjustVictories: {
      const payload = intent.payload as AdjustVictoriesPayload;
      const verb = payload.delta >= 0 ? 'awards' : 'deducts';
      const count = Math.abs(payload.delta);
      const word = count === 1 ? 'victory' : 'victories';
      return `Director ${verb} ${count} ${word}`;
    }
    case IntentTypes.SpendRecovery: {
      const { participantId } = intent.payload as SpendRecoveryPayload;
      return `${nameOf(participantsBefore, participantId)} spent a recovery`;
    }
    case IntentTypes.SpendResource: {
      const { participantId, amount, name } = intent.payload as SpendResourcePayload;
      return `${nameOf(participantsBefore, participantId)} spent ${amount} ${name}`;
    }
    case IntentTypes.GainResource: {
      const { participantId, amount, name } = intent.payload as GainResourcePayload;
      const verb = amount >= 0 ? 'gained' : 'lost';
      return `${nameOf(participantsBefore, participantId)} ${verb} ${Math.abs(amount)} ${name}`;
    }
    case IntentTypes.SpendSurge: {
      const { participantId, count } = intent.payload as SpendSurgePayload;
      const word = count === 1 ? 'surge' : 'surges';
      return `${nameOf(participantsBefore, participantId)} spent ${count} ${word}`;
    }
    case IntentTypes.SetStamina: {
      const { participantId, currentStamina, maxStamina } = intent.payload as SetStaminaPayload;
      const name = nameOf(participantsBefore, participantId);
      if (currentStamina !== undefined && maxStamina !== undefined) {
        return `${name} stamina set to ${currentStamina}/${maxStamina}`;
      }
      if (currentStamina !== undefined) return `${name} stamina set to ${currentStamina}`;
      if (maxStamina !== undefined) return `${name} max stamina set to ${maxStamina}`;
      return `${name} stamina updated`;
    }
    case IntentTypes.ApplyHeal: {
      const { targetId, amount } = intent.payload as ApplyHealPayload;
      return `${nameOf(participantsBefore, targetId)} healed ${amount}`;
    }
    case IntentTypes.GainMalice: {
      const { amount } = intent.payload as { amount: number };
      const verb = amount >= 0 ? 'gained' : 'lost';
      return `Director ${verb} ${Math.abs(amount)} Malice`;
    }
    case IntentTypes.SpendMalice: {
      const { amount } = intent.payload as { amount: number };
      return `Director spent ${amount} Malice`;
    }
    // ---- Pass 3 Slice 1 — stamina state machine describes ----
    case IntentTypes.BecomeDoomed: {
      const p = intent.payload as BecomeDoomedPayload;
      const actor = nameOf(participantsBefore, p.participantId);
      return `${actor} becomes doomed (${p.source})`;
    }
    case IntentTypes.KnockUnconscious: {
      const p = intent.payload as KnockUnconsciousPayload;
      return `${nameOf(participantsBefore, p.targetId)} knocked unconscious`;
    }
    case IntentTypes.ApplyParticipantOverride: {
      const p = intent.payload as ApplyParticipantOverridePayload;
      return `${nameOf(participantsBefore, p.participantId)}: ${p.override.kind} override applied`;
    }
    case IntentTypes.ClearParticipantOverride: {
      const p = intent.payload as ClearParticipantOverridePayload;
      return `${nameOf(participantsBefore, p.participantId)}: override cleared`;
    }
    case IntentTypes.ResolveTriggerOrder: {
      const p = intent.payload as ResolveTriggerOrderPayload;
      const names = p.order.map((id) => nameOf(participantsBefore, id)).join(' → ');
      return `Trigger order resolved: ${names}`;
    }
    case IntentTypes.GrantExtraMainAction: {
      const p = intent.payload as GrantExtraMainActionPayload;
      return `${nameOf(participantsBefore, p.participantId)} gains extra main action (critical hit)`;
    }
    case IntentTypes.ExecuteTrigger: {
      const p = intent.payload as ExecuteTriggerPayload;
      return `${nameOf(participantsBefore, p.participantId)} fires triggered action`;
    }
    case IntentTypes.StaminaTransitioned: {
      const p = intent.payload as StaminaTransitionedPayload;
      return `${nameOf(participantsBefore, p.participantId)}: ${p.from} → ${p.to}`;
    }
    // ---- end Pass 3 Slice 1 ----
    default:
      return `Dispatched ${intent.type}`;
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
    if (entry.type === IntentTypes.JoinLobby) continue;
    if (entry.type === IntentTypes.LeaveLobby) continue;
    return entry;
  }
  return null;
}
