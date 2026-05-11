import { Link, useParams } from '@tanstack/react-router';
import { useCampaign, useMe } from '../api/queries';
import { useSessionSocket } from '../ws/useSessionSocket';

export function CampaignView() {
  const { id } = useParams({ from: '/campaigns/$id' });
  const me = useMe();
  const campaign = useCampaign(id);
  const { members, status, activeEncounter } = useSessionSocket(id);

  if (me.isLoading || campaign.isLoading) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p className="text-neutral-400">Loading…</p>
      </main>
    );
  }

  if (!me.data) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p className="text-neutral-400">
          Not signed in.{' '}
          <Link to="/" className="underline">
            Go home
          </Link>
          .
        </p>
      </main>
    );
  }

  if (campaign.error || !campaign.data) {
    return (
      <main className="mx-auto max-w-2xl p-6 space-y-2">
        <p className="text-rose-400">
          {(campaign.error as Error)?.message ?? 'Campaign not found.'}
        </p>
        <Link to="/" className="underline text-neutral-300">
          Back home
        </Link>
      </main>
    );
  }

  const meId = me.data.user.id;

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{campaign.data.name}</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Invite code:{' '}
            <span className="text-neutral-200 tracking-widest font-mono">
              {campaign.data.inviteCode}
            </span>
            {' · '}
            {campaign.data.isOwner ? 'Owner' : campaign.data.isDirector ? 'Director' : 'Player'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {activeEncounter && activeEncounter.currentRound !== null && (
            <Link
              to="/campaigns/$id/play"
              params={{ id }}
              className="text-sm text-emerald-300 hover:text-emerald-200 underline"
            >
              Continue in play screen →
            </Link>
          )}
          <Link
            to="/campaigns/$id/build"
            params={{ id }}
            className="text-sm text-neutral-300 hover:text-neutral-100 underline"
          >
            Build encounter
          </Link>
          <Link to="/" className="text-sm text-neutral-400 hover:text-neutral-200">
            Leave
          </Link>
        </div>
      </header>

      <section>
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Connected ({members.length})</h2>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              status === 'open'
                ? 'bg-emerald-900/40 text-emerald-300'
                : status === 'connecting'
                  ? 'bg-amber-900/40 text-amber-300'
                  : 'bg-rose-900/40 text-rose-300'
            }`}
          >
            {status}
          </span>
        </div>

        <ul className="mt-3 space-y-1">
          {members.length === 0 && (
            <li className="text-sm text-neutral-500">Waiting for the socket…</li>
          )}
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center gap-3 rounded-md bg-neutral-900/60 px-3 py-2"
            >
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-neutral-800 font-semibold">
                {m.displayName[0]?.toUpperCase() ?? '?'}
              </span>
              <span>
                {m.displayName}
                {m.userId === meId && <span className="text-neutral-500 text-xs"> (you)</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-neutral-600">
        Campaign lobby. The combat tracker, character sheets, and intent dispatch are in the
        encounter builder and play screen.
      </p>
    </main>
  );
}
