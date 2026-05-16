import { IntentTypes, type Participant, type StopMaintenancePayload } from '@ironyard/shared';
import { buildIntent } from '../../api/dispatch';
import { useCharacter, useMe } from '../../api/queries';
import { useAbilities } from '../../api/static-data';
import { useSessionSocket } from '../../ws/useSessionSocket';
import { DoomsightBecomeDoomedButton } from './DoomsightBecomeDoomedButton';
import { EssenceBlock, type Maint } from './EssenceBlock';

type Props = {
  /** The player's own participant in the active encounter. */
  participant: Participant | null;
  /** Campaign id — needed to dispatch intents and access the WS socket. */
  campaignId: string;
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
export function PlayerSheetPanel({ participant, campaignId }: Props) {
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
      <DoomsightBecomeDoomedButton
        character={character}
        participant={participant}
        campaignId={campaignId}
      />
    </div>
  );
}
