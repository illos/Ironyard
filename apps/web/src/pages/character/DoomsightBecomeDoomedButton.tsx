import { type BecomeDoomedPayload, IntentTypes, type Character, type Participant } from '@ironyard/shared';
import { useState } from 'react';
import { buildIntent } from '../../api/dispatch';
import { useMe } from '../../api/queries';
import { useSessionSocket } from '../../ws/useSessionSocket';

type Props = {
  character: Character;
  participant: Participant | null;
  campaignId: string;
};

/**
 * Renders a "Doomsight" section on the player sheet for Hakaan PCs that have
 * the Doomsight purchased trait. Dispatches BecomeDoomed after a confirm modal.
 *
 * Returns null for non-Hakaan characters or Hakaan characters that haven't
 * purchased the Doomsight trait.
 */
export function DoomsightBecomeDoomedButton({ character, participant, campaignId }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const sock = useSessionSocket(campaignId);
  const me = useMe();

  if (character.ancestryId !== 'hakaan') return null;
  if (!(character.ancestryChoices?.traitIds ?? []).includes('doomsight')) return null;

  const disabled =
    !participant ||
    participant.staminaState === 'dead' ||
    participant.staminaState === 'doomed';

  const handleConfirm = () => {
    if (!participant || !me.data) return;
    const payload: BecomeDoomedPayload = {
      participantId: participant.id,
      source: 'hakaan-doomsight',
    };
    sock.dispatch(
      buildIntent({
        campaignId,
        type: IntentTypes.BecomeDoomed,
        payload,
        actor: { userId: me.data.user.id, role: 'player' },
      }),
    );
    setShowConfirm(false);
  };

  return (
    <section
      aria-label="Doomsight"
      className="border border-foe/30 bg-foe/5 p-3 rounded"
    >
      <h3 className="text-sm font-bold uppercase tracking-wider text-foe">Doomsight</h3>
      <p className="text-xs text-text-mute mt-1">Predetermine a heroic death.</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setShowConfirm(true)}
        className="mt-2 px-3 py-2 bg-foe text-bg font-mono uppercase text-sm disabled:opacity-40 disabled:cursor-not-allowed min-h-11"
      >
        Become doomed
      </button>

      {showConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
        >
          <div className="bg-ink-2 p-6 max-w-md border border-line">
            <p className="text-sm">
              This sets your character to the doomed state — auto tier-3 on all power rolls,
              can&apos;t die from stamina, dies at encounter end. Continue?
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="min-h-11 px-3"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="px-3 py-2 bg-foe text-bg font-mono uppercase text-sm min-h-11"
              >
                Yes — become doomed
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
