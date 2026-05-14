import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useDevLogin } from '../api/mutations';
import { useMe } from '../api/queries';
import { useActiveContext } from '../lib/active-context';
import { Button } from '../primitives';

export function Home() {
  const { activeCampaignId } = useActiveContext();
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

  // Authenticated, no active campaign — empty state
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center">
      <h1 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-mute">
        No active campaign
      </h1>
      <p className="text-text-dim max-w-md">
        Start a new campaign to run sessions for your table, or join an existing one with an invite
        code.
      </p>
      <div className="flex gap-3">
        <Link to="/campaigns">
          <Button variant="primary">Start campaign</Button>
        </Link>
        <Link to="/campaigns">
          <Button>Join campaign</Button>
        </Link>
      </div>
    </div>
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
      <h1 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-mute">
        Sign in
      </h1>
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
