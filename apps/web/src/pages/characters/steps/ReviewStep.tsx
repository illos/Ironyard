import { type Character, IntentTypes } from '@ironyard/shared';
import { useSessionSocket } from '../../../ws/useSessionSocket';
import { useMe } from '../../../api/queries';
import { buildIntent } from '../../../api/dispatch';
import { type WizardStaticData } from '../../../api/static-data';
import { RuntimeReadout, checkSubmitGate } from '../parts/RuntimeReadout';

export function ReviewStep({
  draft,
  staticData,
  characterId,
  onSubmitted,
}: {
  draft: Character;
  staticData: WizardStaticData;
  characterId: string | null;
  onSubmitted: (id: string) => void;
}) {
  const me = useMe();
  const campaignId = draft.campaignId;
  const { dispatch, status } = useSessionSocket(campaignId ?? undefined);
  const gate = checkSubmitGate(draft);

  const onSubmit = () => {
    if (!gate.ok || !characterId || !campaignId || !me.data) return;
    dispatch(
      buildIntent({
        campaignId,
        type: IntentTypes.SubmitCharacter,
        // ownsCharacter and isCampaignMember are stamped by the DO on receipt
        payload: { characterId },
        actor: { userId: me.data.user.id, role: 'player' },
      }),
    );
    onSubmitted(characterId);
  };

  const onDone = () => characterId && onSubmitted(characterId);

  return (
    <div className="space-y-5">
      <RuntimeReadout character={draft} staticData={staticData} />
      <div className="border border-line p-4">
        {campaignId ? (
          <>
            <p className="text-sm text-text-dim mb-3">
              {gate.ok
                ? 'Ready to submit to the director for approval.'
                : `Cannot submit yet: ${gate.blockingMessage}`}
            </p>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!gate.ok || status !== 'open'}
              className="min-h-11 px-4 py-2 bg-accent text-ink-0 font-medium disabled:opacity-50"
            >
              Submit to director
            </button>
            {status !== 'open' && (
              <p className="text-xs text-text-mute mt-2">Waiting for campaign connection…</p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-text-dim mb-3">
              Standalone character — not yet attached to a campaign. You can attach later from the sheet.
            </p>
            <button
              type="button"
              onClick={onDone}
              className="min-h-11 px-4 py-2 bg-accent text-ink-0 font-medium"
            >
              View character
            </button>
          </>
        )}
      </div>
    </div>
  );
}
