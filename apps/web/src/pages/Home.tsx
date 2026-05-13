import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import {
  useCreateCampaign,
  useDeleteCharacter,
  useDevLogin,
  useJoinCampaign,
  useLogout,
} from '../api/mutations';
import { useMe, useMyCampaigns, useMyCharacters } from '../api/queries';

export function Home() {
  const me = useMe();

  if (me.isLoading) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p className="text-neutral-400">Loading…</p>
      </main>
    );
  }

  if (!me.data) return <LoginPanel />;
  return <CampaignsPanel user={me.data.user} />;
}

function LoginPanel() {
  const [email, setEmail] = useState('');
  const devLogin = useDevLogin();

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-3xl font-semibold">Ironyard</h1>
      <p className="mt-1 text-neutral-400">Sign in to start or join a session.</p>

      <Link
        to="/foes"
        className="mt-3 inline-block text-sm text-neutral-400 underline hover:text-neutral-200"
      >
        Or browse the foes list →
      </Link>

      <form
        className="mt-6 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim()) return;
          devLogin.mutate({ email: email.trim() });
        }}
      >
        <label className="block text-sm text-neutral-300">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-base outline-none focus:border-neutral-600"
            placeholder="you@example.com"
          />
        </label>
        <button
          type="submit"
          disabled={devLogin.isPending}
          className="w-full rounded-md bg-neutral-100 text-neutral-900 px-4 py-2 font-medium disabled:opacity-60"
        >
          {devLogin.isPending ? 'Signing in…' : 'Sign in'}
        </button>
        {devLogin.error && (
          <p className="text-sm text-rose-400">{(devLogin.error as Error).message}</p>
        )}
        <p className="text-xs text-neutral-500">
          Dev mode: passwordless. The real magic-link flow is wired but disabled in dev.
        </p>
      </form>
    </main>
  );
}

function CampaignsPanel({ user }: { user: { displayName: string; email: string } }) {
  const navigate = useNavigate();
  const logout = useLogout();
  const createCampaign = useCreateCampaign();
  const joinCampaign = useJoinCampaign();
  const myCampaigns = useMyCampaigns();
  const [campaignName, setCampaignName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Ironyard</h1>
          <p className="text-neutral-400 text-sm mt-1">
            Signed in as <span className="text-neutral-200">{user.displayName}</span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/foes" className="text-sm text-neutral-400 hover:text-neutral-200">
            Foes
          </Link>
          <button
            type="button"
            onClick={() => logout.mutate()}
            className="text-sm text-neutral-400 hover:text-neutral-200"
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="rounded-lg border border-neutral-800 p-5">
        <h2 className="font-semibold">Your campaigns</h2>
        {myCampaigns.isLoading ? (
          <p className="mt-3 text-sm text-neutral-500">Loading…</p>
        ) : !myCampaigns.data || myCampaigns.data.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            You're not in any campaigns yet. Start one or join with an invite code below.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {myCampaigns.data.map((c) => (
              <li key={c.id}>
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
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-neutral-800 p-5">
        <header className="flex items-center justify-between">
          <h2 className="font-semibold">Your characters</h2>
          <Link
            to="/characters/new"
            search={{ code: undefined }}
            className="text-sm text-neutral-300 hover:text-neutral-100 underline"
          >
            + New character
          </Link>
        </header>
        <YourCharactersList />
      </section>

      <section className="rounded-lg border border-neutral-800 p-5">
        <h2 className="font-semibold">Start a campaign</h2>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!campaignName.trim()) return;
            createCampaign.mutate(
              { name: campaignName.trim() },
              {
                onSuccess: (s) => {
                  setCampaignName('');
                  navigate({ to: '/campaigns/$id', params: { id: s.id } });
                },
              },
            );
          }}
        >
          <input
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="Saturday game"
            className="flex-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:border-neutral-600"
          />
          <button
            type="submit"
            disabled={createCampaign.isPending || !campaignName.trim()}
            className="rounded-md bg-neutral-100 text-neutral-900 px-4 py-2 font-medium disabled:opacity-60"
          >
            Create
          </button>
        </form>
        {createCampaign.error && (
          <p className="mt-2 text-sm text-rose-400">{(createCampaign.error as Error).message}</p>
        )}
      </section>

      <section className="rounded-lg border border-neutral-800 p-5">
        <h2 className="font-semibold">Join a campaign</h2>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const code = inviteCode.trim().toUpperCase();
            if (!code) return;
            joinCampaign.mutate(
              { inviteCode: code },
              {
                onSuccess: (s) => {
                  setInviteCode('');
                  navigate({ to: '/campaigns/$id', params: { id: s.id } });
                },
              },
            );
          }}
        >
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="Invite code"
            className="flex-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:border-neutral-600 uppercase tracking-widest"
          />
          <button
            type="submit"
            disabled={joinCampaign.isPending || !inviteCode.trim()}
            className="rounded-md bg-neutral-100 text-neutral-900 px-4 py-2 font-medium disabled:opacity-60"
          >
            Join
          </button>
        </form>
        {joinCampaign.error && (
          <p className="mt-2 text-sm text-rose-400">{(joinCampaign.error as Error).message}</p>
        )}
      </section>
    </main>
  );
}

function YourCharactersList() {
  const chars = useMyCharacters();
  const deleteCharacter = useDeleteCharacter();
  if (chars.isLoading) return <p className="mt-3 text-sm text-neutral-500">Loading…</p>;
  if (!chars.data || chars.data.length === 0) {
    return <p className="mt-3 text-sm text-neutral-500">No characters yet.</p>;
  }
  return (
    <ul className="mt-3 space-y-2">
      {chars.data.map((c) => (
        <li
          key={c.id}
          className="flex items-stretch gap-2 rounded-md bg-neutral-900/60 hover:bg-neutral-900 border border-neutral-800"
        >
          <Link
            to="/characters/$id"
            params={{ id: c.id }}
            className="flex items-center gap-3 px-4 py-3 min-h-11 flex-1"
          >
            <span className="flex-1 font-medium">{c.name}</span>
            <span className="text-xs text-neutral-500">L{c.data.level}</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              if (
                !window.confirm(
                  `Delete character "${c.name}"? This permanently removes the character and detaches it from any campaigns.`,
                )
              ) {
                return;
              }
              deleteCharacter.mutate(c.id);
            }}
            disabled={deleteCharacter.isPending}
            className="my-2 mr-2 min-h-11 px-3 rounded-md border border-rose-700 text-rose-300 text-xs hover:bg-rose-900/30 disabled:opacity-50"
            aria-label={`Delete ${c.name}`}
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}
