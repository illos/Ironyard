import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useDevLogin, useLogout } from '../api/mutations';
import { type CampaignSummary, useMe, useMyCampaigns, useMyCharacters } from '../api/queries';

const PREVIEW_LIMIT = 3;

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
  return <Dashboard user={me.data.user} />;
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

function Dashboard({ user }: { user: { displayName: string; email: string } }) {
  const logout = useLogout();
  const campaigns = useMyCampaigns();
  const chars = useMyCharacters();

  const owned = (campaigns.data ?? []).filter((c) => c.isOwner).slice(0, PREVIEW_LIMIT);
  const joined = (campaigns.data ?? []).filter((c) => !c.isOwner).slice(0, PREVIEW_LIMIT);
  const characters = (chars.data ?? []).slice(0, PREVIEW_LIMIT);

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold">Ironyard</h1>
      </header>

      <section className="rounded-lg border border-neutral-800 p-5">
        <h2 className="font-semibold">Account</h2>
        <dl className="mt-3 grid grid-cols-[8rem,1fr] gap-y-1 text-sm">
          <dt className="text-neutral-500">Display name</dt>
          <dd className="text-neutral-200">{user.displayName}</dd>
          <dt className="text-neutral-500">Email</dt>
          <dd className="text-neutral-200">{user.email}</dd>
        </dl>
        <button
          type="button"
          onClick={() => logout.mutate()}
          className="mt-4 min-h-11 px-3 rounded-md border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-900"
        >
          Sign out
        </button>
      </section>

      <PreviewSection
        title="My Campaigns"
        viewAllTo="/campaigns"
        emptyMessage="You haven't created any campaigns yet."
      >
        {owned.map((c) => (
          <CampaignRow key={c.id} c={c} />
        ))}
      </PreviewSection>

      <PreviewSection
        title="Joined Campaigns"
        viewAllTo="/campaigns"
        emptyMessage="You haven't joined any campaigns yet."
      >
        {joined.map((c) => (
          <CampaignRow key={c.id} c={c} />
        ))}
      </PreviewSection>

      <PreviewSection
        title="My Characters"
        viewAllTo="/characters"
        emptyMessage="No characters yet."
      >
        {characters.map((c) => (
          <li key={c.id}>
            <Link
              to="/characters/$id"
              params={{ id: c.id }}
              className="flex items-center gap-3 rounded-md bg-neutral-900/60 hover:bg-neutral-900 border border-neutral-800 px-4 py-3 min-h-11"
            >
              <span className="flex-1 font-medium">{c.name}</span>
              <span className="text-xs text-neutral-500">L{c.data.level}</span>
              {c.data.classId && (
                <span className="text-xs text-neutral-400 capitalize">{c.data.classId}</span>
              )}
            </Link>
          </li>
        ))}
      </PreviewSection>
    </main>
  );
}

function PreviewSection({
  title,
  viewAllTo,
  emptyMessage,
  children,
}: {
  title: string;
  viewAllTo: '/campaigns' | '/characters';
  emptyMessage: string;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const empty = arr.filter(Boolean).length === 0;
  return (
    <section className="rounded-lg border border-neutral-800 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Link
          to={viewAllTo}
          className="text-sm text-neutral-400 hover:text-neutral-200 underline"
        >
          View all →
        </Link>
      </header>
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
