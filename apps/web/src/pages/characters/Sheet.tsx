import { IntentTypes } from '@ironyard/shared';
import { Link, useParams } from '@tanstack/react-router';
import { useMe, useCharacter } from '../../api/queries';
import { useWizardStaticData } from '../../api/static-data';
import { useSessionSocket } from '../../ws/useSessionSocket';
import { buildIntent } from '../../api/dispatch';
import { RuntimeReadout } from './parts/RuntimeReadout';
import { AttachToCampaign } from './parts/AttachToCampaign';

export function Sheet() {
  const { id } = useParams({ from: '/characters/$id' });
  const me = useMe();
  const ch = useCharacter(id);
  const staticData = useWizardStaticData();

  // Open a WS only when the character has a campaign.
  const campaignId = ch.data?.data.campaignId ?? undefined;
  const sock = useSessionSocket(campaignId);

  if (me.isLoading || ch.isLoading || !staticData) {
    return <main className="mx-auto max-w-3xl p-6 text-neutral-400">Loading…</main>;
  }
  if (!me.data) {
    return <main className="mx-auto max-w-3xl p-6 text-neutral-400">Sign in to view characters.</main>;
  }
  if (!ch.data) {
    return <main className="mx-auto max-w-3xl p-6 text-rose-400">Character not found.</main>;
  }

  const inCampaign = !!campaignId;
  const inEncounter = inCampaign && sock.activeEncounter !== null;

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{ch.data.name}</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Level {ch.data.data.level} · {ch.data.data.classId ?? 'classless'}
            {inEncounter && ' · in encounter'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/characters/$id/edit"
            params={{ id }}
            className="text-sm text-neutral-300 hover:text-neutral-100 underline"
          >
            Edit
          </Link>
          {inEncounter && campaignId && (
            <Link
              to="/campaigns/$id/play"
              params={{ id: campaignId }}
              className="text-sm text-emerald-300 hover:text-emerald-200 underline"
            >
              Go to play screen →
            </Link>
          )}
        </div>
      </header>

      <RuntimeReadout character={ch.data.data} staticData={staticData} />

      {inEncounter && (
        <div className="rounded-md border border-emerald-900 bg-emerald-950/40 p-4 text-sm">
          Your character is live in combat. Open the play screen to control it.
        </div>
      )}

      {inCampaign && !inEncounter && (
        <InLobbyControls
          characterId={id}
          campaignId={campaignId}
          userId={me.data.user.id}
          dispatch={sock.dispatch}
        />
      )}

      {!inCampaign && <AttachToCampaign characterId={id} />}
    </main>
  );
}

function InLobbyControls({
  characterId,
  campaignId,
  userId,
  dispatch,
}: {
  characterId: string;
  campaignId: string;
  userId: string;
  dispatch: ReturnType<typeof useSessionSocket>['dispatch'];
}) {
  const swapKit = () => {
    // Real picker is Phase 2 Epic 2; for now this is a no-op placeholder.
    // SwapKitPayloadSchema requires newKitId.min(1) and ownerId — the DO will
    // reject the empty-string sentinel but the round-trip is benign until the
    // picker is wired up.
    dispatch(
      buildIntent({
        campaignId,
        type: IntentTypes.SwapKit,
        payload: { characterId, newKitId: '__placeholder__', ownerId: userId },
        actor: { userId, role: 'player' },
      }),
    );
  };
  return (
    <div className="rounded-md border border-neutral-800 p-4 space-y-3">
      <h3 className="font-medium">Lobby controls</h3>
      <button
        type="button"
        onClick={swapKit}
        className="min-h-11 px-3 py-2 rounded-md bg-neutral-100 text-neutral-900 text-sm font-medium"
      >
        Swap kit (Epic 2 will populate the picker)
      </button>
    </div>
  );
}
