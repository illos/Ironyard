import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useCreateCampaign, useJoinCampaign } from '../api/mutations';
import { type CampaignSummary, useMe, useMyCampaigns } from '../api/queries';

export function CampaignsList() {
  const me = useMe();
  const campaigns = useMyCampaigns();

  if (me.isLoading || campaigns.isLoading) {
    return <main className="mx-auto max-w-3xl p-6 text-neutral-400">Loading…</main>;
  }
  if (!me.data) {
    return (
      <main className="mx-auto max-w-3xl p-6 text-neutral-400">Sign in to view campaigns.</main>
    );
  }

  const owned = (campaigns.data ?? []).filter((c) => c.isOwner);
  const joined = (campaigns.data ?? []).filter((c) => !c.isOwner);

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Campaigns</h1>

      <CampaignSection title="My Campaigns" emptyMessage="You haven't created any campaigns yet.">
        {owned.map((c) => (
          <CampaignRow key={c.id} c={c} />
        ))}
      </CampaignSection>

      <CampaignSection
        title="Joined Campaigns"
        emptyMessage="You haven't joined any campaigns yet."
      >
        {joined.map((c) => (
          <CampaignRow key={c.id} c={c} />
        ))}
      </CampaignSection>

      <NewCampaignForm />
      <JoinCampaignForm />
    </main>
  );
}

function CampaignSection({
  title,
  emptyMessage,
  children,
}: {
  title: string;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const empty = arr.filter(Boolean).length === 0;
  return (
    <section className="rounded-lg border border-neutral-800 p-5">
      <h2 className="font-semibold">{title}</h2>
      {empty ? (
        <p className="mt-3 text-sm text-neutral-500">{emptyMessage}</p>
      ) : (
        <ul className="mt-3 space-y-2">{children}</ul>
      )}
    </section>
  );
}

function CampaignRow({ c }: { c: CampaignSummary }) {
  return (
    <li>
      <Link
        to="/campaigns/$id"
        params={{ id: c.id }}
        className="flex items-center gap-3 rounded-md bg-neutral-900/60 hover:bg-neutral-900 border border-neutral-800 px-4 py-3 min-h-11"
      >
        <span className="flex-1">
          <span className="font-medium">{c.name}</span>
          {c.isOwner && <span className="ml-2 text-xs text-amber-400">owner</span>}
          {c.isDirector && !c.isOwner && (
            <span className="ml-2 text-xs text-amber-400">director</span>
          )}
        </span>
        <span className="text-xs text-neutral-500 tracking-widest">{c.inviteCode}</span>
      </Link>
    </li>
  );
}

function NewCampaignForm() {
  const navigate = useNavigate();
  const createCampaign = useCreateCampaign();
  const [name, setName] = useState('');

  return (
    <section className="rounded-lg border border-neutral-800 p-5">
      <h2 className="font-semibold">New Campaign</h2>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          createCampaign.mutate(
            { name: name.trim() },
            {
              onSuccess: (s) => {
                setName('');
                navigate({ to: '/campaigns/$id', params: { id: s.id } });
              },
            },
          );
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Saturday game"
          className="flex-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:border-neutral-600"
        />
        <button
          type="submit"
          disabled={createCampaign.isPending || !name.trim()}
          className="min-h-11 rounded-md bg-neutral-100 text-neutral-900 px-4 py-2 font-medium disabled:opacity-60"
        >
          Create
        </button>
      </form>
      {createCampaign.error && (
        <p className="mt-2 text-sm text-rose-400">{(createCampaign.error as Error).message}</p>
      )}
    </section>
  );
}

function JoinCampaignForm() {
  const navigate = useNavigate();
  const joinCampaign = useJoinCampaign();
  const [code, setCode] = useState('');

  return (
    <section className="rounded-lg border border-neutral-800 p-5">
      <h2 className="font-semibold">Join with invite code</h2>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = code.trim().toUpperCase();
          if (!v) return;
          joinCampaign.mutate(
            { inviteCode: v },
            {
              onSuccess: (s) => {
                setCode('');
                navigate({ to: '/campaigns/$id', params: { id: s.id } });
              },
            },
          );
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Invite code"
          className="flex-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:border-neutral-600 uppercase tracking-widest"
        />
        <button
          type="submit"
          disabled={joinCampaign.isPending || !code.trim()}
          className="min-h-11 rounded-md bg-neutral-100 text-neutral-900 px-4 py-2 font-medium disabled:opacity-60"
        >
          Join
        </button>
      </form>
      {joinCampaign.error && (
        <p className="mt-2 text-sm text-rose-400">{(joinCampaign.error as Error).message}</p>
      )}
    </section>
  );
}
