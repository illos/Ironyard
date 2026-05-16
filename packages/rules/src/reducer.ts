import { IntentTypes } from '@ironyard/shared';
import {
  applyAddMonster,
  applyAdjustVictories,
  applyApplyDamage,
  applyApplyHeal,
  applyApplyParticipantOverride,
  applyApproveCharacter,
  applyBecomeDoomed,
  applyClaimOpenAction,
  applyClearLobby,
  applyClearParticipantOverride,
  applyDenyCharacter,
  applyEndEncounter,
  applyEndRound,
  applyEndSession,
  applyEndTurn,
  applyEquipItem,
  applyExecuteTrigger,
  applyGainHeroToken,
  applyGainMalice,
  applyGainResource,
  applyGrantExtraMainAction,
  applyJoinLobby,
  applyJumpBehindScreen,
  applyKickPlayer,
  applyKnockUnconscious,
  applyLeaveLobby,
  applyLoadEncounterTemplate,
  applyMarkActionUsed,
  applyMarkSurprised,
  applyNote,
  applyPickNextActor,
  applyPushItem,
  applyRaiseOpenAction,
  applyRemoveApprovedCharacter,
  applyRemoveCondition,
  applyRemoveParticipant,
  applyRespite,
  applyResolveTriggerOrder,
  applyRollInitiative,
  applyRollPower,
  applyRollResistance,
  applySetCondition,
  applySetParticipantPerEncounterLatch,
  applySetParticipantPerRoundFlag,
  applySetParticipantPerTurnEntry,
  applySetParticipantPosthumousDramaEligible,
  applySetResource,
  applySetStamina,
  applySetTargetingRelation,
  applySpendHeroToken,
  applySpendMalice,
  applySpendRecovery,
  applySpendResource,
  applySpendSurge,
  applyStartEncounter,
  applyStartMaintenance,
  applyStartRound,
  applyStartSession,
  applyStartTurn,
  applyStopMaintenance,
  applySubmitCharacter,
  applySwapKit,
  applyTroubadourAutoRevive,
  applyUndo,
  applyUnequipItem,
  applyUpdateSessionAttendance,
  applyUseAbility,
  applyUseConsumable,
} from './intents';
import type { CampaignState, IntentResult, ReducerContext, StampedIntent } from './types';

// Shared empty bundle for callers that don't need static data (e.g. tests that
// don't involve PC materialization). Lazily initialized.
const EMPTY_BUNDLE: ReducerContext['staticData'] = {
  ancestries: new Map(),
  careers: new Map(),
  classes: new Map(),
  kits: new Map(),
  abilities: new Map(),
  items: new Map(),
  titles: new Map(),
};

// The pure reducer. No Date.now(), no Math.random(). The DO stamps timestamp
// and assigns seq before calling. Each handler returns a new state via
// immutable spread — no mutation. Derived intents are emitted without
// id/timestamp/campaignId; the DO fills those in before recursively applying.
// `ctx` carries the static data bundle for PC materialization at StartEncounter;
// callers that don't do PC materialization (most tests) may omit it.
export function applyIntent(
  state: CampaignState,
  intent: StampedIntent,
  ctx: ReducerContext = { staticData: EMPTY_BUNDLE },
): IntentResult {
  switch (intent.type) {
    case IntentTypes.AddMonster:
      return applyAddMonster(state, intent);
    case IntentTypes.AdjustVictories:
      return applyAdjustVictories(state, intent);
    case IntentTypes.ApproveCharacter:
      return applyApproveCharacter(state, intent);
    case IntentTypes.BecomeDoomed:
      return applyBecomeDoomed(state, intent);
    case IntentTypes.ClaimOpenAction:
      return applyClaimOpenAction(state, intent);
    case IntentTypes.ApplyDamage:
      return applyApplyDamage(state, intent);
    case IntentTypes.ApplyHeal:
      return applyApplyHeal(state, intent);
    case IntentTypes.ApplyParticipantOverride:
      return applyApplyParticipantOverride(state, intent);
    case IntentTypes.ClearLobby:
      return applyClearLobby(state, intent);
    case IntentTypes.ClearParticipantOverride:
      return applyClearParticipantOverride(state, intent);
    case IntentTypes.DenyCharacter:
      return applyDenyCharacter(state, intent);
    case IntentTypes.EndEncounter:
      return applyEndEncounter(state, intent);
    case IntentTypes.EndRound:
      return applyEndRound(state, intent);
    case IntentTypes.EndSession:
      return applyEndSession(state, intent);
    case IntentTypes.EndTurn:
      return applyEndTurn(state, intent);
    case IntentTypes.EquipItem:
      return applyEquipItem(state, intent);
    case IntentTypes.ExecuteTrigger:
      return applyExecuteTrigger(state, intent);
    case IntentTypes.GainHeroToken:
      return applyGainHeroToken(state, intent);
    case IntentTypes.GainMalice:
      return applyGainMalice(state, intent);
    case IntentTypes.GainResource:
      return applyGainResource(state, intent);
    case IntentTypes.GrantExtraMainAction:
      return applyGrantExtraMainAction(state, intent);
    case IntentTypes.JoinLobby:
      return applyJoinLobby(state, intent);
    case IntentTypes.JumpBehindScreen:
      return applyJumpBehindScreen(state, intent);
    case IntentTypes.KickPlayer:
      return applyKickPlayer(state, intent);
    case IntentTypes.KnockUnconscious:
      return applyKnockUnconscious(state, intent);
    case IntentTypes.LeaveLobby:
      return applyLeaveLobby(state, intent);
    case IntentTypes.LoadEncounterTemplate:
      return applyLoadEncounterTemplate(state, intent);
    case IntentTypes.MarkActionUsed:
      return applyMarkActionUsed(state, intent);
    case IntentTypes.MarkSurprised:
      return applyMarkSurprised(state, intent);
    case IntentTypes.Note:
      return applyNote(state, intent);
    case IntentTypes.PickNextActor:
      return applyPickNextActor(state, intent);
    case IntentTypes.PushItem:
      return applyPushItem(state, intent);
    case IntentTypes.RaiseOpenAction:
      return applyRaiseOpenAction(state, intent);
    case IntentTypes.RemoveApprovedCharacter:
      return applyRemoveApprovedCharacter(state, intent);
    case IntentTypes.Respite:
      return applyRespite(state, intent);
    case IntentTypes.RemoveCondition:
      return applyRemoveCondition(state, intent);
    case IntentTypes.RemoveParticipant:
      return applyRemoveParticipant(state, intent);
    case IntentTypes.ResolveTriggerOrder:
      return applyResolveTriggerOrder(state, intent);
    case IntentTypes.RollInitiative:
      return applyRollInitiative(state, intent);
    case IntentTypes.RollPower:
      return applyRollPower(state, intent);
    case IntentTypes.RollResistance:
      return applyRollResistance(state, intent);
    case IntentTypes.SetCondition:
      return applySetCondition(state, intent);
    case IntentTypes.SetParticipantPerEncounterLatch:
      return applySetParticipantPerEncounterLatch(state, intent);
    case IntentTypes.SetParticipantPerRoundFlag:
      return applySetParticipantPerRoundFlag(state, intent);
    case IntentTypes.SetParticipantPerTurnEntry:
      return applySetParticipantPerTurnEntry(state, intent);
    case IntentTypes.SetParticipantPosthumousDramaEligible:
      return applySetParticipantPosthumousDramaEligible(state, intent);
    case IntentTypes.SetResource:
      return applySetResource(state, intent);
    case IntentTypes.SetStamina:
      return applySetStamina(state, intent);
    case IntentTypes.SetTargetingRelation:
      return applySetTargetingRelation(state, intent);
    case IntentTypes.SpendHeroToken:
      return applySpendHeroToken(state, intent);
    case IntentTypes.SpendMalice:
      return applySpendMalice(state, intent);
    case IntentTypes.SpendRecovery:
      return applySpendRecovery(state, intent);
    case IntentTypes.SpendResource:
      return applySpendResource(state, intent);
    case IntentTypes.SpendSurge:
      return applySpendSurge(state, intent);
    case IntentTypes.StartEncounter:
      return applyStartEncounter(state, intent, ctx);
    case IntentTypes.StartMaintenance:
      return applyStartMaintenance(state, intent);
    case IntentTypes.StartRound:
      return applyStartRound(state, intent);
    case IntentTypes.StartSession:
      return applyStartSession(state, intent);
    case IntentTypes.StartTurn:
      return applyStartTurn(state, intent);
    case IntentTypes.StopMaintenance:
      return applyStopMaintenance(state, intent);
    case IntentTypes.StaminaTransitioned: {
      // Pass 3 Slice 1 — server-only event substrate. No state mutation; the
      // emit-site reducer (apply-damage, apply-heal, etc.) already mutated state.
      // This case exists so the dispatch is exhaustive and the log captures the
      // transition for slice-2 consumers + UI subscribers.
      const p = intent.payload as { participantId: string; from: string; to: string; cause: string };
      return {
        state,
        derived: [],
        log: [{ kind: 'info', text: `stamina: ${p.participantId} ${p.from} → ${p.to} (${p.cause})`, intentId: intent.id }],
      };
    }
    case IntentTypes.SubmitCharacter:
      return applySubmitCharacter(state, intent);
    case IntentTypes.SwapKit:
      return applySwapKit(state, intent);
    case IntentTypes.TroubadourAutoRevive:
      return applyTroubadourAutoRevive(state, intent);
    case IntentTypes.UnequipItem:
      return applyUnequipItem(state, intent);
    case IntentTypes.Undo:
      return applyUndo(state, intent);
    case IntentTypes.UpdateSessionAttendance:
      return applyUpdateSessionAttendance(state, intent);
    case IntentTypes.UseAbility:
      return applyUseAbility(state, intent);
    case IntentTypes.UseConsumable:
      return applyUseConsumable(state, intent);
    default:
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `Unknown intent type: ${intent.type}`,
            intentId: intent.id,
          },
        ],
        errors: [{ code: 'unknown_intent', message: `Unknown intent type: ${intent.type}` }],
      };
  }
}
