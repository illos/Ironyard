import { useLocation } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';

export interface ActiveContext {
  /** Campaign the user is currently in. Backed by localStorage (Pass 1
   *  follow-up); falls back to URL inference when storage is unset. */
  activeCampaignId: string | null;
  /** Character the user has active in this campaign. Always null in Pass 1
   *  (no persistence layer); consumers should treat null as "unknown — use
   *  defaults / let pages fetch their own roster pick". */
  activeCharacterId: string | null;
  /** Persist an explicit active campaign id (or null to clear). */
  setActiveCampaignId: (id: string | null) => void;
}

const STORAGE_KEY = 'ironyard:activeCampaignId';
const CAMPAIGN_ID_RE = /^\/campaigns\/([^/]+)(?:\/|$)/;

function readStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, value);
    // Notify same-tab listeners.
    window.dispatchEvent(new Event('ironyard:active-context-change'));
  } catch {
    // ignore quota / privacy errors
  }
}

export function useActiveContext(): ActiveContext {
  const { pathname } = useLocation();
  const [stored, setStored] = useState<string | null>(() => readStorage());

  // Listen for changes from other components in the same tab AND for cross-tab
  // storage events.
  useEffect(() => {
    const onChange = () => setStored(readStorage());
    window.addEventListener('ironyard:active-context-change', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('ironyard:active-context-change', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  // Auto-promote: when the user lands on /campaigns/:id and nothing else is
  // stored yet, mark that campaign active. An explicit stored value wins over
  // the URL (so navigating to a foreign campaign URL doesn't silently switch
  // contexts — the user must `setActiveCampaignId` or visit Home to clear).
  useEffect(() => {
    if (stored) return;
    const match = CAMPAIGN_ID_RE.exec(pathname);
    if (match?.[1]) writeStorage(match[1]);
  }, [pathname, stored]);

  const setActiveCampaignId = useCallback((id: string | null) => {
    writeStorage(id);
  }, []);

  const urlMatch = CAMPAIGN_ID_RE.exec(pathname);
  const activeCampaignId = stored ?? urlMatch?.[1] ?? null;

  return {
    activeCampaignId,
    activeCharacterId: null,
    setActiveCampaignId,
  };
}
