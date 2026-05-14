import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useCreateCampaign, useJoinCampaign } from '../api/mutations';
import { type CampaignSummary, useMe, useMyCampaigns } from '../api/queries';
import { Button, Section } from '../primitives';

export function CampaignsList() {
  const me = useMe();
  const campaigns = useMyCampaigns();

  if (me.isLoading || campaigns.isLoading) {
    return <main className="mx-auto max-w-3xl p-6 text-text-dim">Loading…</main>;
  }
  if (!me.data) {
    return <main className="mx-auto max-w-3xl p-6 text-text-dim">Sign in to view campaigns.</main>;
  }

  const owned = (campaigns.data ?? []).filter((c) => c.isOwner);
  const joined = (campaigns.data ?? []).filter((c) => !c.isOwner);

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-text">Campaigns</h1>

      <CampaignSection heading="My Campaigns" emptyMessage="You haven't created any campaigns yet.">
        {owned.map((c) => (
          <CampaignRow key={c.id} c={c} />
        ))}
      </CampaignSection>

      <CampaignSection
        heading="Joined Campaigns"
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
  heading,
  emptyMessage,
  children,
}: {
  heading: string;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const empty = arr.filter(Boolean).length === 0;
  return (
    <Section heading={heading}>
      {empty ? (
        <p className="text-sm text-text-mute">{emptyMessage}</p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </Section>
  );
}

function CampaignRow({ c }: { c: CampaignSummary }) {
  return (
    <li>
      <Link
        to="/campaigns/$id"
        params={{ id: c.id }}
        className="flex items-center gap-3 bg-ink-2 hover:bg-ink-3 border border-line px-4 py-3 min-h-11 text-text"
      >
        <span className="flex-1">
          <span className="font-medium">{c.name}</span>
          {c.isOwner && <span className="ml-2 text-xs text-accent">owner</span>}
          {c.isDirector && !c.isOwner && <span className="ml-2 text-xs text-accent">director</span>}
        </span>
        <span className="text-xs text-text-mute tracking-widest">{c.inviteCode}</span>
      </Link>
    </li>
  );
}

function NewCampaignForm() {
  const navigate = useNavigate();
  const createCampaign = useCreateCampaign();
  const [name, setName] = useState('');

  return (
    <Section heading="New Campaign">
      <form
        className="flex gap-2"
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
          className="flex-1 bg-ink-2 border border-line text-text px-3 py-2 outline-none focus:border-accent"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={createCampaign.isPending || !name.trim()}
          className="min-h-11 disabled:opacity-60"
        >
          Create
        </Button>
      </form>
      {createCampaign.error && (
        <p className="mt-2 text-sm text-foe">{(createCampaign.error as Error).message}</p>
      )}
    </Section>
  );
}

function JoinCampaignForm() {
  const navigate = useNavigate();
  const joinCampaign = useJoinCampaign();
  const [code, setCode] = useState('');

  return (
    <Section heading="Join with invite code">
      <form
        className="flex gap-2"
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
          className="flex-1 bg-ink-2 border border-line text-text px-3 py-2 outline-none focus:border-accent uppercase tracking-widest"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={joinCampaign.isPending || !code.trim()}
          className="min-h-11 disabled:opacity-60"
        >
          Join
        </Button>
      </form>
      {joinCampaign.error && (
        <p className="mt-2 text-sm text-foe">{(joinCampaign.error as Error).message}</p>
      )}
    </Section>
  );
}
