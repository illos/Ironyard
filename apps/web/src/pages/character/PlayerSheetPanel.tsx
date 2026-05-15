import type { Participant } from '@ironyard/shared';
import { useCharacter } from '../../api/queries';
import { DoomsightBecomeDoomedButton } from './DoomsightBecomeDoomedButton';

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
 * sheet tab. Currently homes the Doomsight "Become Doomed" section for
 * Hakaan PCs with the Doomsight purchased trait.
 *
 * Returns null when no participant is provided and there is no character
 * data to show.
 */
export function PlayerSheetPanel({ participant, campaignId }: Props) {
  const characterId =
    participant?.kind === 'pc' ? (participant.characterId ?? undefined) : undefined;
  const ch = useCharacter(characterId);

  if (!ch.data) return null;

  const character = ch.data.data;

  return (
    <div className="space-y-3">
      <DoomsightBecomeDoomedButton
        character={character}
        participant={participant}
        campaignId={campaignId}
      />
    </div>
  );
}
