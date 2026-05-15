import {
  type Ability,
  IntentTypes,
  type MarkActionUsedPayload,
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
import { TurnFlowTab } from './TurnFlowTab';

type Props = {
  focused: Participant | null;
  // Everyone else in the encounter (target candidates).
  participants: Participant[];
  monsterLevelById: Map<string, number>;
  // Real monster data keyed by participant id (slice 10's `${monsterId}-instance-N`
  // convention). Used to pull the focused monster's full ability list.
  monsterByParticipantId: Map<string, Monster>;
  disabled: boolean;
  /** Campaign id — forwarded to FullSheetTab for PC-only sub-panels. */
  campaignId: string;
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
  dispatchMarkActionUsed: (payload: MarkActionUsedPayload) => void;
  /** True when the focused participant is the active turn-holder. */
  isActiveTurn?: boolean;
  /** Fired by the Turn-flow Skip-turn / End-turn affordances. */
  onEndTurn?: () => void;
};

export type DetailPaneProps = Props;

export function DetailPane({
  focused,
  participants,
  monsterLevelById,
  monsterByParticipantId,
  disabled,
  campaignId,
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
  dispatchMarkActionUsed,
  isActiveTurn,
  onEndTurn,
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
        campaignId={campaignId}
        targetParticipantId={targetParticipantId}
        selfParticipantId={selfParticipantId}
        viewerRole={viewerRole}
        canEdit={canEdit}
        resolvedTarget={resolvedTarget}
        dispatchRoll={dispatchRoll}
        dispatchSetCondition={dispatchSetCondition}
        dispatchRemoveCondition={dispatchRemoveCondition}
        dispatchSetStamina={dispatchSetStamina}
        dispatchGainResource={dispatchGainResource}
        dispatchSpendResource={dispatchSpendResource}
        dispatchSetResource={dispatchSetResource}
        dispatchSpendSurge={dispatchSpendSurge}
        dispatchSpendRecovery={dispatchSpendRecovery}
        dispatchMarkActionUsed={dispatchMarkActionUsed}
        isActiveTurn={isActiveTurn}
        onEndTurn={onEndTurn}
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
  campaignId,
  targetParticipantId,
  viewerRole,
  canEdit,
  resolvedTarget,
  dispatchRoll,
  dispatchSetCondition,
  dispatchRemoveCondition,
  dispatchSetStamina,
  dispatchGainResource,
  dispatchSpendResource,
  dispatchSetResource,
  dispatchSpendSurge,
  dispatchSpendRecovery,
  dispatchMarkActionUsed,
  isActiveTurn,
  onEndTurn,
}: Props & { focused: Participant; canEdit: boolean; resolvedTarget: Participant | null }) {
  // Default tab: Turn-flow for any focused monster (director is running its
  // turn) and for players (acting on their own PC). Full-sheet only when a
  // director focuses a PC — they want the at-a-glance stat block since the
  // PC's owning player drives the Turn-flow.
  const defaultTab: TabId =
    focused.kind === 'monster' || viewerRole === 'player' ? 'turn-flow' : 'full-sheet';
  const [tab, setTab] = useState<TabId>(defaultTab);

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
        <TurnFlowTab
          focused={focused}
          monsterByParticipantId={monsterByParticipantId}
          onMarkUsed={dispatchMarkActionUsed}
          onAbilityRoll={(ability, args, target) =>
            dispatchRoll({ ability, attacker: focused, target, rolls: args.rolls, source: args.source })
          }
          target={resolvedTarget ?? focused}
          canRoll={canEdit}
          isActiveTurn={isActiveTurn ?? false}
          onEndTurn={onEndTurn ?? (() => {})}
        />
      ) : (
        <FullSheetTab
          focused={focused}
          participants={participants}
          monsterByParticipantId={monsterByParticipantId}
          disabled={disabled}
          canRoll={canEdit}
          campaignId={campaignId}
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
