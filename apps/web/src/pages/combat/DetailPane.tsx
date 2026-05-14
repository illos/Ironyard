import {
  type Ability,
  IntentTypes,
  type Monster,
  type Participant,
  type RemoveConditionPayload,
  type RollPowerPayload,
  type SetConditionPayload,
  type SetStaminaPayload,
  type GainResourcePayload,
  type SpendResourcePayload,
  type SetResourcePayload,
  type SpendSurgePayload,
  type SpendRecoveryPayload,
} from '@ironyard/shared';
import { DetailHeader } from './detail/DetailHeader';
import { FullSheetTab } from './detail/FullSheetTab';

type Props = {
  focused: Participant | null;
  // Everyone else in the encounter (target candidates).
  participants: Participant[];
  monsterLevelById: Map<string, number>;
  // Real monster data keyed by participant id (slice 10's `${monsterId}-instance-N`
  // convention). Used to pull the focused monster's full ability list.
  monsterByParticipantId: Map<string, Monster>;
  disabled: boolean;
  // Dispatch helpers wired by the parent CombatRun.
  dispatchRoll: (args: {
    ability: Ability;
    attacker: Participant;
    target: Participant;
    rolls: [number, number];
    source: 'manual' | 'auto';
  }) => void;
  dispatchSetCondition: (payload: SetConditionPayload) => void;
  dispatchRemoveCondition: (payload: RemoveConditionPayload) => void;
  dispatchSetStamina: (payload: SetStaminaPayload) => void;
  dispatchGainResource: (payload: GainResourcePayload) => void;
  dispatchSpendResource: (payload: SpendResourcePayload) => void;
  dispatchSetResource: (payload: SetResourcePayload) => void;
  dispatchSpendSurge: (payload: SpendSurgePayload) => void;
  dispatchSpendRecovery: (payload: SpendRecoveryPayload) => void;
};

export type DetailPaneProps = Props;

export function DetailPane({
  focused,
  participants,
  monsterLevelById,
  monsterByParticipantId,
  disabled,
  dispatchRoll,
  dispatchSetCondition,
  dispatchRemoveCondition,
  dispatchSetStamina,
  dispatchGainResource,
  dispatchSpendResource,
  dispatchSetResource,
  dispatchSpendSurge,
  dispatchSpendRecovery,
}: Props) {
  if (!focused) {
    return (
      <div className="border border-dashed border-line-soft p-6 text-center text-sm text-text-mute">
        Select a participant from initiative to see their detail.
      </div>
    );
  }

  return (
    <DetailBody
      focused={focused}
      participants={participants}
      monsterLevelById={monsterLevelById}
      monsterByParticipantId={monsterByParticipantId}
      disabled={disabled}
      dispatchRoll={dispatchRoll}
      dispatchSetCondition={dispatchSetCondition}
      dispatchRemoveCondition={dispatchRemoveCondition}
      dispatchSetStamina={dispatchSetStamina}
      dispatchGainResource={dispatchGainResource}
      dispatchSpendResource={dispatchSpendResource}
      dispatchSetResource={dispatchSetResource}
      dispatchSpendSurge={dispatchSpendSurge}
      dispatchSpendRecovery={dispatchSpendRecovery}
    />
  );
}

// Split into a separate component so per-focus state (target picker, popovers)
// resets cleanly when the parent switches focus.
function DetailBody({
  focused,
  participants,
  monsterLevelById,
  monsterByParticipantId,
  disabled,
  dispatchRoll,
  dispatchSetCondition,
  dispatchRemoveCondition,
  dispatchSetStamina,
  dispatchGainResource,
  dispatchSpendResource,
  dispatchSetResource,
  dispatchSpendSurge,
  dispatchSpendRecovery,
}: Props & { focused: Participant }) {
  return (
    <div className="space-y-5">
      <DetailHeader
        focused={focused}
        monsterLevel={monsterLevelById.get(focused.id) ?? null}
        dispatchSetStamina={dispatchSetStamina}
        dispatchSetCondition={dispatchSetCondition}
        dispatchRemoveCondition={dispatchRemoveCondition}
      />
      <FullSheetTab
        focused={focused}
        participants={participants}
        monsterByParticipantId={monsterByParticipantId}
        disabled={disabled}
        dispatchRoll={dispatchRoll}
        dispatchGainResource={dispatchGainResource}
        dispatchSpendResource={dispatchSpendResource}
        dispatchSetResource={dispatchSetResource}
        dispatchSpendSurge={dispatchSpendSurge}
        dispatchSpendRecovery={dispatchSpendRecovery}
      />
    </div>
  );
}

// Re-exporting the intent type identifiers used by the parent helps callers
// build the SetCondition / RemoveCondition payloads without re-importing from
// shared. Keep the import path stable.
export const COMBAT_INTENT_TYPES = {
  SetCondition: IntentTypes.SetCondition,
  RemoveCondition: IntentTypes.RemoveCondition,
  RollPower: IntentTypes.RollPower,
  SetStamina: IntentTypes.SetStamina,
} as const;
export type { RollPowerPayload };
