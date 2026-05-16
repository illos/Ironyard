import {
  IntentTypes,
  type Participant,
  type SetTargetingRelationPayload,
  type StopMaintenancePayload,
  type TargetingRelationKind,
} from '@ironyard/shared';
import { buildIntent } from '../../api/dispatch';
import { useCharacter, useMe } from '../../api/queries';
import { useAbilities } from '../../api/static-data';
import { useSessionSocket } from '../../ws/useSessionSocket';
import { TargetingRelationsCard } from '../../components/TargetingRelationsCard';
import { DoomsightBecomeDoomedButton } from './DoomsightBecomeDoomedButton';
import { EssenceBlock, type Maint } from './EssenceBlock';

// ── Targeting-relation helpers (mirrors ParticipantRow.tsx) ───────────────────

/**
 * Maps a participant's `className` (lower-cased) to its targeting relation kind.
 * Censor → Judgment, Tactician → Mark, Null → Null Field.
 */
const CLASS_RELATION_KIND: Record<string, TargetingRelationKind | undefined> = {
  censor: 'judged',
  tactician: 'marked',
  null: 'nullField',
};

// TODO(Task 35/37): wire `./StrainedSpendModal` into the Talent ability-card
// click flow. The modal is implemented and unit-tested but not yet hooked up
// because the player-facing ability-card click currently routes through
// DetailPane's dispatchRoll (RollPower), not UseAbility. Wiring requires:
//   1. Detecting classId === 'talent' at the ability-card level
//   2. Reading the ability's clarity spend cost (per-ability metadata)
//   3. Reading participant clarity from heroicResources
//   4. Computing isPsion via participant.level >= 10
//   5. Gating dispatchRoll behind modal confirm + dispatching UseAbility with
//      talentStrainedOptInRider / talentClarityDamageOptOutThisTurn toggles
// Defer until the player-facing UseAbility dispatch path lands.

type Props = {
  /** The player's own participant in the active encounter. */
  participant: Participant | null;
  /** Campaign id — needed to dispatch intents and access the WS socket. */
  campaignId: string;
  /**
   * Full roster of participants. Required for the TargetingRelationsCard —
   * callers that don't have it can omit it; the card simply won't render.
   */
  allParticipants?: Participant[];
};

/**
 * Player-facing character sheet panel shown during combat.
 *
 * Renders player-only affordances that aren't part of the director's full
 * sheet tab. Currently homes:
 *   - Doomsight "Become Doomed" section for Hakaan PCs with the trait
 *   - EssenceBlock for Elementalist PCs (Pass 3 Slice 2a)
 *
 * Returns null when no participant is provided and there is no character
 * data to show.
 */
export function PlayerSheetPanel({ participant, campaignId, allParticipants }: Props) {
  const characterId =
    participant?.kind === 'pc' ? (participant.characterId ?? undefined) : undefined;
  const ch = useCharacter(characterId);
  const abilities = useAbilities();
  const me = useMe();
  const sock = useSessionSocket(campaignId);

  if (!ch.data) return null;

  const character = ch.data.data;
  const isElementalist = character.classId === 'elementalist';

  // Build the maintained-ability list with display names looked up from the
  // static abilities map. Falls back to the raw id when the lookup misses
  // (e.g. homebrew ability not yet ingested) so the block never hides
  // unknown rows.
  const abilityNameById = new Map<string, string>(
    (abilities.data ?? []).map((a) => [a.id, a.name] as const),
  );
  const maintained: Maint[] = (participant?.maintainedAbilities ?? []).map((m) => ({
    abilityId: m.abilityId,
    abilityName: abilityNameById.get(m.abilityId) ?? m.abilityId,
    costPerTurn: m.costPerTurn,
  }));

  // Canon: Elementalists always gain +2 essence/turn (the +1 first-dmg-in-10sq
  // is a separate spatial trigger handled by the reducer, surfaced via the
  // EssenceBlock footnote).
  const ESSENCE_BASE_GAIN = 2;
  const currentEssence = participant?.heroicResources.find((r) => r.name === 'essence')?.value ?? 0;

  const handleStopMaintain = (abilityId: string) => {
    if (!participant || !me.data) return;
    const payload: StopMaintenancePayload = {
      participantId: participant.id,
      abilityId,
    };
    sock.dispatch(
      buildIntent({
        campaignId,
        type: IntentTypes.StopMaintenance,
        payload,
        actor: { userId: me.data.user.id, role: 'player' },
      }),
    );
  };

  // ── Targeting-relation card (Censor / Tactician / Null only) ───────────────
  // Determine if the participant's class has a persistent targeting relation.
  const relationKind = participant?.className
    ? CLASS_RELATION_KIND[participant.className.toLowerCase()]
    : undefined;

  // Candidates are opposing-side participants (monsters for PCs). v1: pass
  // all monsters as candidates regardless of stamina, matching the card's
  // own filtering for already-removed entries.
  const candidates = (allParticipants ?? [])
    .filter((p) => p.kind === 'monster')
    .map((p) => ({ id: p.id, name: p.name }));

  const handleToggleRelation = (targetId: string, present: boolean) => {
    if (!participant || !me.data || !relationKind) return;
    const payload: SetTargetingRelationPayload = {
      sourceId: participant.id,
      relationKind,
      targetId,
      present,
    };
    sock.dispatch(
      buildIntent({
        campaignId,
        type: IntentTypes.SetTargetingRelation,
        payload,
        actor: { userId: me.data.user.id, role: 'player' },
      }),
    );
  };

  return (
    <div className="space-y-3">
      {isElementalist && (
        <EssenceBlock
          currentEssence={currentEssence}
          baseGainPerTurn={ESSENCE_BASE_GAIN}
          maintainedAbilities={maintained}
          onStopMaintain={handleStopMaintain}
        />
      )}
      {relationKind && participant && (
        <TargetingRelationsCard
          source={participant}
          relationKind={relationKind}
          candidates={candidates}
          onToggle={handleToggleRelation}
        />
      )}
      <DoomsightBecomeDoomedButton
        character={character}
        participant={participant}
        campaignId={campaignId}
      />
    </div>
  );
}
