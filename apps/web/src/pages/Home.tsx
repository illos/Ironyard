import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useDevLogin, useJoinCampaign } from '../api/mutations';
import { type CampaignSummary, useMe, useMyCampaigns } from '../api/queries';
import { useActiveContext } from '../lib/active-context';
import { Button, Chip, Modal, Section } from '../primitives';

export function Home() {
  const { activeCampaignId, setActiveCampaignId } = useActiveContext();
  const navigate = useNavigate();
  const me = useMe();

  useEffect(() => {
    if (me.data && activeCampaignId) {
      navigate({ to: '/campaigns/$id', params: { id: activeCampaignId } });
    }
  }, [me.data, activeCampaignId, navigate]);

  if (me.isLoading) return null;
  if (me.data && activeCampaignId) return null;

  if (!me.data) {
    return <DevLoginPanel />;
  }

  return (
    <NoActiveCampaign
      onMakeActive={(id) => {
        setActiveCampaignId(id);
        navigate({ to: '/campaigns/$id', params: { id } });
      }}
    />
  );
}

function NoActiveCampaign({ onMakeActive }: { onMakeActive: (id: string) => void }) {
  const campaigns = useMyCampaigns();
  const [joinOpen, setJoinOpen] = useState(false);

  const list = campaigns.data ?? [];

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-6">
      <h1 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-mute">
        No active campaign
      </h1>

      <Section heading={`Your campaigns${campaigns.data ? ` (${list.length})` : ''}`}>
        {campaigns.isLoading && <p className="text-text-mute text-sm">Loading…</p>}
        {!campaigns.isLoading && list.length === 0 && (
          <p className="text-text-dim text-sm">
            You're not in any campaigns yet. Start one or join with an invite code.
          </p>
        )}
        {list.length > 0 && (
          <ul className="flex flex-col gap-1">
            {list.map((c) => (
              <CampaignRow key={c.id} c={c} onMakeActive={onMakeActive} />
            ))}
          </ul>
        )}
      </Section>

      <div className="flex justify-center gap-3">
        <Link to="/campaigns/new">
          <Button variant="primary">+ Start a new campaign</Button>
        </Link>
        <Button onClick={() => setJoinOpen(true)}>Join with code</Button>
      </div>

      <JoinModal open={joinOpen} onClose={() => setJoinOpen(false)} onJoined={onMakeActive} />
    </div>
  );
}

function CampaignRow({
  c,
  onMakeActive,
}: {
  c: CampaignSummary;
  onMakeActive: (id: string) => void;
}) {
  const role = c.isOwner ? 'owner' : c.isDirector ? 'director' : 'player';
  return (
    <li className="flex items-center gap-3 bg-ink-2 border border-line px-3 py-2">
      <span className="flex-1 flex items-baseline gap-2 min-w-0">
        <span className="text-text font-semibold truncate">{c.name}</span>
        <Chip size="xs" shape="pill" selected={c.isOwner || c.isDirector}>
          {role}
        </Chip>
      </span>
      <span className="font-mono text-[10px] tracking-[0.12em] text-text-mute">{c.inviteCode}</span>
      <Button size="sm" variant="primary" onClick={() => onMakeActive(c.id)}>
        Make active
      </Button>
    </li>
  );
}

function JoinModal({
  open,
  onClose,
  onJoined,
}: {
  open: boolean;
  onClose: () => void;
  onJoined: (id: string) => void;
}) {
  const [code, setCode] = useState('');
  const joinMut = useJoinCampaign();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = code.trim().toUpperCase();
    if (!v) return;
    joinMut.mutate(
      { inviteCode: v },
      {
        onSuccess: (campaign) => {
          setCode('');
          onJoined(campaign.id);
          onClose();
        },
      },
    );
  };

  const footer = (
    <>
      <Button onClick={onClose} type="button">
        Cancel
      </Button>
      <Button type="submit" form="join-form" variant="primary" disabled={joinMut.isPending}>
        {joinMut.isPending ? 'Joining…' : 'Join'}
      </Button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title="Join a campaign" footer={footer}>
      <form id="join-form" onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-mute">
            Invite code
          </span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="0RKH4X"
            required
            // biome-ignore lint/a11y/noAutofocus: modal-only input — focus on open is the expected interaction for a code-entry modal.
            autoFocus
            className="bg-ink-2 border border-line px-3 py-2 text-text uppercase tracking-[0.12em] focus:border-accent focus:outline-none"
          />
        </label>
        {joinMut.error && <p className="text-foe text-xs">{(joinMut.error as Error).message}</p>}
      </form>
    </Modal>
  );
}

// Dev magic-link form. Restored from the pre-E4 Home (commit 08a7529^) so the
// "open the app → sign in" entry point still works after E4's Home rewrite.
// Production uses the real Resend magic-link flow (useRequestMagicLink); this
// shortcut bypasses that for local development.
function DevLoginPanel() {
  const [email, setEmail] = useState('');
  const devLogin = useDevLogin();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center max-w-md mx-auto">
      <h1 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-mute">Sign in</h1>
      <p className="text-text-dim">
        Enter your email to sign in. (Dev shortcut — production uses a magic link via Resend.)
      </p>
      <form
        className="flex flex-col gap-3 w-full"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim()) return;
          devLogin.mutate({ email: email.trim() });
        }}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="bg-ink-2 border border-line px-3 py-2 text-text placeholder:text-text-mute rounded-md outline-none focus:border-text-mute"
        />
        <Button type="submit" variant="primary" disabled={devLogin.isPending}>
          {devLogin.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
        {devLogin.error && (
          <p className="text-sm text-rose-400">{(devLogin.error as Error).message}</p>
        )}
      </form>
    </div>
  );
}
