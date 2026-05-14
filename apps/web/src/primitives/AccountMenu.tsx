import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

export interface AccountMenuProps {
  onSignOut?: () => void;
}

export function AccountMenu({ onSignOut }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
