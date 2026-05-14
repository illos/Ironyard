import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useCreateCampaign, useJoinCampaign } from '../api/mutations';
import { type CampaignSummary, useMe, useMyCampaigns } from '../api/queries';
import { useActiveContext } from '../lib/active-context';
import { Button, Chip, Section } from '../primitives';

export function CampaignsList() {
  const me = useMe();
  const campaigns = useMyCampaigns();
  const { activeCampaignId, setActiveCampaignId } = useActiveContext();
  const navigate = useNavigate();

  if (me.isLoading || campaigns.isLoading) {
    return <main className="mx-auto max-w-3xl p-6 text-text-dim">Loading…</main>;
  }
  if (!me.data) {
    return <main className="mx-auto max-w-3xl p-6 text-text-dim">Sign in to view campaigns.</main>;
  }

  const owned = (campaigns.data ?? []).filter((c) => c.isOwner);
  const joined = (campaigns.data ?? []).filter((c) => !c.isOwner);

  const handleMakeActive = (id: string) => {
    setActiveCampaignId(id);
    navigate({ to: '/campaigns/$id', params: { id } });
  };

  const handleDeactivate = () => {
    setActiveCampaignId(null);
    // No navigation — user stays on /campaigns and can pick something else.
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-text">Campaigns</h1>

      <CampaignSection heading="My Campaigns" emptyMessage="You haven't created any campaigns yet.">
        {owned.map((c) => (
          <CampaignRow
            key={c.id}
            c={c}
            isActive={c.id === activeCampaignId}
            onMakeActive={() => handleMakeActive(c.id)}
            onDeactivate={handleDeactivate}
          />
        ))}
      </CampaignSection>

      <CampaignSection
        heading="Joined Campaigns"
        emptyMessage="You haven't joined any campaigns yet."
      >
        {joined.map((c) => (
          <CampaignRow
            key={c.id}
            c={c}
            isActive={c.id === activeCampaignId}
            onMakeActive={() => handleMakeActive(c.id)}
            onDeactivate={handleDeactivate}
          />
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

function CampaignRow({
  c,
  isActive,
  onMakeActive,
  onDeactivate,
}: {
  c: CampaignSummary;
  isActive: boolean;
  onMakeActive: () => void;
  onDeactivate: () => void;
}) {
  return (
    <li
      className={`flex items-center gap-3 bg-ink-2 px-3 py-2 min-h-11 border ${
        isActive ? 'border-accent' : 'border-line'
      }`}
    >
      <Link
        to="/campaigns/$id"
        params={{ id: c.id }}
        className="flex-1 flex items-baseline gap-2 min-w-0 text-text hover:text-text"
      >
        <span className="font-medium truncate">{c.name}</span>
        {c.isOwner && <span className="text-xs text-accent">owner</span>}
        {c.isDirector && !c.isOwner && <span className="text-xs text-accent">director</span>}
      </Link>
      <span className="font-mono text-[10px] tracking-[0.12em] text-text-mute">{c.inviteCode}</span>
      {isActive ? (
        <>
          <Chip size="xs" shape="pill" selected>
            ACTIVE
          </Chip>
          <Button size="sm" onClick={onDeactivate}>
            Deactivate
          </Button>
        </>
      ) : (
        <Button size="sm" variant="primary" onClick={onMakeActive}>
          Make active
        </Button>
      )}
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
