import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useActiveContext } from './active-context';

// Mock TanStack Router's useLocation so we can drive pathname per test
// without mounting a full Router. The hook only reads `pathname`.
let mockPathname = '/';
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({
    pathname: mockPathname,
    search: '',
    hash: '',
    state: {},
    key: 'default',
  }),
}));

function withPath(pathname: string) {
  mockPathname = pathname;
}

describe('useActiveContext', () => {
  it('returns no active campaign when not on a /campaigns/:id route', () => {
    withPath('/characters');
    const { result } = renderHook(() => useActiveContext());
    expect(result.current.activeCampaignId).toBeNull();
  });

  it('extracts the campaign id from /campaigns/:id', () => {
    withPath('/campaigns/abc123');
    const { result } = renderHook(() => useActiveContext());
    expect(result.current.activeCampaignId).toBe('abc123');
  });

  it('extracts the campaign id from /campaigns/:id/play', () => {
    withPath('/campaigns/c1/play');
    const { result } = renderHook(() => useActiveContext());
    expect(result.current.activeCampaignId).toBe('c1');
  });

  it('returns null for /campaigns (the list route)', () => {
    withPath('/campaigns');
    const { result } = renderHook(() => useActiveContext());
    expect(result.current.activeCampaignId).toBeNull();
  });
});
