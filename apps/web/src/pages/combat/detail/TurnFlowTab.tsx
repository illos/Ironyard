// apps/web/src/pages/combat/detail/TurnFlowTab.tsx
import { type StaticDataBundle, deriveCharacterRuntime } from '@ironyard/rules';
import type { Ability, MarkActionUsedPayload, Monster, Participant } from '@ironyard/shared';
import { useMemo } from 'react';
import { useCharacter } from '../../../api/queries';
import { useWizardStaticData } from '../../../api/static-data';
import { pcFreeStrike } from '../../../data/monsterAbilities';
import { AbilityCard } from '../AbilityCard';
import { TurnFlowSection } from './TurnFlowSection';

export interface TurnFlowTabProps {
  focused: Participant;
  monsterByParticipantId: Map<string, Monster>;
  onMarkUsed: (payload: MarkActionUsedPayload) => void;
  onAbilityRoll: (
    ability: Ability,
    args: { rolls: [number, number]; source: 'manual' | 'auto' },
    target: Participant,
  ) => void;
  /** The resolved target participant — needed to dispatch the roll. Falls back to focused (self-target). */
  target: Participant;
  canRoll: boolean;
  /** True when the focused participant currently holds the turn. Drives the
   *  Skip-turn affordance + the End-turn CTA. */
  isActiveTurn: boolean;
  /** Fired by the End-turn CTA when all three slots are complete (or by the
   *  Skip-turn header button after it marks slots done). */
  onEndTurn: () => void;
}

export function TurnFlowTab({
  focused,
  monsterByParticipantId,
  onMarkUsed,
  onAbilityRoll,
  target,
  canRoll,
  isActiveTurn,
  onEndTurn,
}: TurnFlowTabProps) {
  // Mirror the abilities derivation from FullSheetTab so both tabs see the
  // same list without requiring a FullSheetTab re-render.
  const focusedCharacter = useCharacter(
    focused.kind === 'pc' ? (focused.characterId ?? undefined) : undefined,
  );
  const staticData = useWizardStaticData();

  const abilities: Ability[] = useMemo(() => {
    if (focused.kind === 'monster') {
      const monster = monsterByParticipantId.get(focused.id);
      if (!monster) return [];
      return monster.abilities.filter((a) => a.powerRoll !== undefined);
    }
    // PC focus.
    if (!focusedCharacter.data || !staticData) return [pcFreeStrike()];
    const bundle: StaticDataBundle = {
      ancestries: staticData.ancestries as StaticDataBundle['ancestries'],
      careers: staticData.careers as StaticDataBundle['careers'],
      classes: staticData.classes as StaticDataBundle['classes'],
      kits: staticData.kits as StaticDataBundle['kits'],
      abilities: staticData.abilities as StaticDataBundle['abilities'],
      items: staticData.items as StaticDataBundle['items'],
      titles: staticData.titles as StaticDataBundle['titles'],
    };
    const runtime = deriveCharacterRuntime(focusedCharacter.data.data, bundle);
    const resolved = runtime.abilityIds
      .map((id) => bundle.abilities.get(id))
      .filter((a): a is Ability => !!a && a.powerRoll !== undefined);
    return resolved.length > 0 ? resolved : [pcFreeStrike()];
  }, [focused, monsterByParticipantId, focusedCharacter.data, staticData]);

  // Defensive default: encounters that were started before Task 1 landed don't
  // carry turnActionUsage on their participants (the WS mirror builds participant
  // snapshots without running them through ParticipantSchema.parse, so the
  // .default() never fires). Treat absence as all-false.
  const usage = focused.turnActionUsage ?? { main: false, maneuver: false, move: false };

  // Pick the lowest-index pending slot as "active".
  const activeSlot: 'main' | 'maneuver' | 'move' = !usage.main
    ? 'main'
    : !usage.maneuver
      ? 'maneuver'
      : !usage.move
        ? 'move'
        : 'main';

  const mainAbilities = abilities.filter((a) => a.type === 'action');
  const maneuverAbilities = abilities.filter((a) => a.type === 'maneuver');

  const stateFor = (slot: 'main' | 'maneuver' | 'move'): 'pending' | 'active' | 'done' => {
    if (usage[slot]) return 'done';
    if (slot === activeSlot) return 'active';
    return 'pending';
  };

  // Pass 2a stub for the "done" summary — always renders "done";
  // a later PS task can walk the intent log to surface the ability name.
  const summaryFor = (slot: 'main' | 'maneuver' | 'move'): string | undefined =>
    usage[slot] ? 'done' : undefined;

  const rollDisabled = !canRoll;

  const handleRoll = (ability: Ability, args: { rolls: [number, number]; source: 'manual' | 'auto' }) => {
    onAbilityRoll(ability, args, target);
  };

  const allSlotsDone = usage.main && usage.maneuver && usage.move;
  const handleSkipTurn = () => {
    // Mark each pending slot so the UI is consistent post-end, then end the turn.
    if (!usage.main) onMarkUsed({ participantId: focused.id, slot: 'main', used: true });
    if (!usage.maneuver) onMarkUsed({ participantId: focused.id, slot: 'maneuver', used: true });
    if (!usage.move) onMarkUsed({ participantId: focused.id, slot: 'move', used: true });
    onEndTurn();
  };

  return (
    <div className="space-y-3">
      {isActiveTurn && !allSlotsDone && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSkipTurn}
            disabled={!canRoll}
            className="font-mono uppercase tracking-[0.08em] text-[10px] px-2 py-1 border border-line text-text-dim hover:text-text hover:border-text-dim disabled:opacity-40"
            aria-label="Skip rest of turn"
          >
            Skip turn
          </button>
        </div>
      )}

      <TurnFlowSection
        index={1}
        label="Main"
        state={stateFor('main')}
        doneSummary={summaryFor('main')}
        skipLabel="Skip"
        skipDisabled={!canRoll}
        onSkip={() => onMarkUsed({ participantId: focused.id, slot: 'main', used: true })}
      >
        {mainAbilities.map((a) => (
          <AbilityCard
            key={a.name}
            ability={a}
            disabled={rollDisabled}
            onRoll={(ab, args) => handleRoll(ab, args)}
          />
        ))}
      </TurnFlowSection>

      <TurnFlowSection
        index={2}
        label="Maneuver"
        state={stateFor('maneuver')}
        doneSummary={summaryFor('maneuver')}
        skipLabel="Skip"
        skipDisabled={!canRoll}
        onSkip={() => onMarkUsed({ participantId: focused.id, slot: 'maneuver', used: true })}
      >
        {maneuverAbilities.map((a) => (
          <AbilityCard
            key={a.name}
            ability={a}
            disabled={rollDisabled}
            onRoll={(ab, args) => handleRoll(ab, args)}
          />
        ))}
      </TurnFlowSection>

      <TurnFlowSection
        index={3}
        label="Move"
        subtitle="speed varies"
        state={stateFor('move')}
        doneSummary={usage.move ? 'done moving' : undefined}
        skipLabel="Done moving"
        skipDisabled={!canRoll}
        onSkip={() => onMarkUsed({ participantId: focused.id, slot: 'move', used: true })}
      />

      {isActiveTurn && allSlotsDone && (
        <div className="border border-accent bg-ink-1 p-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-text">Turn complete.</p>
            <p className="text-xs text-text-mute mt-0.5">
              Main, Maneuver, and Move are all used. End the turn to pass priority.
            </p>
          </div>
          <button
            type="button"
            onClick={onEndTurn}
            disabled={!canRoll}
            className="min-h-11 px-4 bg-accent text-ink-0 font-semibold hover:bg-accent-strong disabled:opacity-40"
          >
            End turn
          </button>
        </div>
      )}
    </div>
  );
}
