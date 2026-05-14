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
import { useState } from 'react';
import { DetailHeader } from './DetailHeader';
import { FullSheetTab } from './FullSheetTab';
import { TargetBanner } from './TargetBanner';

type Props = {
  focused: Participant | null;
  // Everyone else in the encounter (target candidates).
  participants: Participant[];
  monsterLevelById: Map<string, number>;
  // Real monster data keyed by participant id (slice 10's `${monsterId}-instance-N`
  // convention). Used to pull the focused monster's full ability list.
  monsterByParticipantId: Map<string, Monster>;
  disabled: boolean;
  /** Row-tap target id from DirectorCombat (player view). Forwarded to FullSheetTab. */
  targetParticipantId?: string | null;
  /** The viewer's own participant id (player view). Used by TargetBanner. */
  selfParticipantId?: string | null;
  /** 'director' | 'player'. Controls whether the TargetBanner is shown. */
  viewerRole?: 'director' | 'player';
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
  targetParticipantId = null,
  selfParticipantId = null,
  viewerRole = 'director',
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
  if (viewerRole === 'player' && !selfParticipantId) {
    return (
      <div className="border border-dashed border-line-soft p-6 text-center text-sm text-text-mute">
        You're not in this encounter. The director can bring you in via Encounter Builder.
      </div>
    );
  }

  if (!focused) {
    return (
      <div className="border border-dashed border-line-soft p-6 text-center text-sm text-text-mute">
        Select a participant from initiative to see their detail.
      </div>
    );
  }

  const resolvedTarget =
    targetParticipantId ? (participants.find((p) => p.id === targetParticipantId) ?? null) : null;

  // Directors can edit any participant; players can only edit their own character.
  const canEdit = viewerRole === 'director' || (focused !== null && focused.id === selfParticipantId);

  return (
    <div className="space-y-0">
      {viewerRole === 'player' && (
        <TargetBanner target={resolvedTarget} selfParticipantId={selfParticipantId} />
      )}
      <DetailBody
        focused={focused}
        participants={participants}
        monsterLevelById={monsterLevelById}
        monsterByParticipantId={monsterByParticipantId}
        disabled={disabled}
        targetParticipantId={targetParticipantId}
        selfParticipantId={selfParticipantId}
        viewerRole={viewerRole}
        canEdit={canEdit}
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
    </div>
  );
}

type TabId = 'turn-flow' | 'full-sheet';

// Split into a separate component so per-focus state (target picker, popovers)
// resets cleanly when the parent switches focus.
function DetailBody({
  focused,
  participants,
  monsterLevelById,
  monsterByParticipantId,
  disabled,
  targetParticipantId,
  viewerRole,
  canEdit,
  dispatchRoll,
  dispatchSetCondition,
  dispatchRemoveCondition,
  dispatchSetStamina,
  dispatchGainResource,
  dispatchSpendResource,
  dispatchSetResource,
  dispatchSpendSurge,
  dispatchSpendRecovery,
}: Props & { focused: Participant; canEdit: boolean }) {
  const [tab, setTab] = useState<TabId>(viewerRole === 'player' ? 'turn-flow' : 'full-sheet');

  return (
    <div className="space-y-5">
      <DetailHeader
        focused={focused}
        monsterLevel={monsterLevelById.get(focused.id) ?? null}
        canEditStamina={canEdit}
        canEditConditions={canEdit}
        dispatchSetStamina={dispatchSetStamina}
        dispatchSetCondition={dispatchSetCondition}
        dispatchRemoveCondition={dispatchRemoveCondition}
      />
      <div className="flex justify-end mb-3">
        <div className="inline-flex border border-line">
          <button
            type="button"
            onClick={() => setTab('turn-flow')}
            className={`px-3 py-1 text-xs uppercase tracking-wider ${tab === 'turn-flow' ? 'bg-accent text-ink-0' : 'bg-ink-2 text-text-dim'}`}
          >
            Turn flow
          </button>
          <button
            type="button"
            onClick={() => setTab('full-sheet')}
            className={`px-3 py-1 text-xs uppercase tracking-wider ${tab === 'full-sheet' ? 'bg-accent text-ink-0' : 'bg-ink-2 text-text-dim'}`}
          >
            Full sheet
          </button>
        </div>
      </div>
      {tab === 'turn-flow' ? (
        <div className="text-text-mute text-sm p-6 border border-dashed border-line-soft text-center">
          Turn flow — coming next task.
        </div>
      ) : (
        <FullSheetTab
          focused={focused}
          participants={participants}
          monsterByParticipantId={monsterByParticipantId}
          disabled={disabled}
          canRoll={canEdit}
          targetParticipantId={targetParticipantId}
          dispatchRoll={dispatchRoll}
          dispatchGainResource={dispatchGainResource}
          dispatchSpendResource={dispatchSpendResource}
          dispatchSetResource={dispatchSetResource}
          dispatchSpendSurge={dispatchSpendSurge}
          dispatchSpendRecovery={dispatchSpendRecovery}
        />
      )}
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
