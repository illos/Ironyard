import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

beforeEach(() => {
  mockPathname = '/';
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('prefers stored value over URL', () => {
    window.localStorage.setItem('ironyard:activeCampaignId', 'stored1');
    withPath('/campaigns/abc');
    const { result } = renderHook(() => useActiveContext());
    expect(result.current.activeCampaignId).toBe('stored1');
  });

  it('setActiveCampaignId writes through and updates the value', () => {
    withPath('/characters');
    const { result } = renderHook(() => useActiveContext());
    expect(result.current.activeCampaignId).toBeNull();
    act(() => {
      result.current.setActiveCampaignId('manual');
    });
    expect(result.current.activeCampaignId).toBe('manual');
    expect(window.localStorage.getItem('ironyard:activeCampaignId')).toBe('manual');
  });

  it('auto-promotes the campaign id from the URL on visit', () => {
    withPath('/campaigns/auto1');
    const { result, rerender } = renderHook(() => useActiveContext());
    // After useEffect runs:
    rerender();
    expect(result.current.activeCampaignId).toBe('auto1');
    // Storage was written:
    expect(window.localStorage.getItem('ironyard:activeCampaignId')).toBe('auto1');
  });

  it('setActiveCampaignId(null) clears storage', () => {
    window.localStorage.setItem('ironyard:activeCampaignId', 'tobecleared');
    withPath('/characters');
    const { result } = renderHook(() => useActiveContext());
    expect(result.current.activeCampaignId).toBe('tobecleared');
    act(() => {
      result.current.setActiveCampaignId(null);
    });
    expect(result.current.activeCampaignId).toBeNull();
    expect(window.localStorage.getItem('ironyard:activeCampaignId')).toBeNull();
  });
});
