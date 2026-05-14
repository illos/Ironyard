import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useActiveContext } from '../lib/active-context';
import { Button } from '../primitives';

export function Home() {
  const { activeCampaignId } = useActiveContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (activeCampaignId) {
      navigate({ to: '/campaigns/$id', params: { id: activeCampaignId } });
    }
  }, [activeCampaignId, navigate]);

  if (activeCampaignId) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center">
      <h1 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-mute">
        No active campaign
      </h1>
      <p className="text-text-dim max-w-md">
        Start a new campaign to run sessions for your table, or join an existing one with an invite code.
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
