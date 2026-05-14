import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useMyCampaigns } from '../api/queries';
import { useActiveContext } from '../lib/active-context';

export interface AccountMenuProps {
  onSignOut?: () => void;
}

export function AccountMenu({ onSignOut }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { activeCampaignId, setActiveCampaignId } = useActiveContext();
  const navigate = useNavigate();
  const campaigns = useMyCampaigns();
  const activeCampaignName = campaigns.data?.find((c) => c.id === activeCampaignId)?.name;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-text-dim hover:text-text text-xs cursor-pointer"
      >
        Account <span className="text-text-mute text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute top-7 left-0 z-30 min-w-[160px] bg-ink-1 border border-line py-1">
          {activeCampaignId && (
            <>
              <div className="px-3.5 py-2 flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-mute">
                  Active campaign
                </span>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-xs text-text truncate">
                    {activeCampaignName ?? '…'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setActiveCampaignId(null);
                      navigate({ to: '/' });
                    }}
                    className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-dim hover:text-foe"
                  >
                    Deactivate
                  </button>
                </div>
              </div>
              <div className="h-px bg-line-soft my-1" />
            </>
          )}
          <Link
            to="/campaigns"
            onClick={() => setOpen(false)}
            className="block px-3.5 py-2 text-xs text-text-dim hover:bg-ink-2 hover:text-text"
          >
            Campaigns
          </Link>
          <Link
            to="/characters"
            onClick={() => setOpen(false)}
            className="block px-3.5 py-2 text-xs text-text-dim hover:bg-ink-2 hover:text-text"
          >
            Characters
          </Link>
          <div className="h-px bg-line-soft my-1" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut?.();
            }}
            className="w-full text-left block px-3.5 py-2 text-xs text-text-dim hover:bg-ink-2 hover:text-text"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
