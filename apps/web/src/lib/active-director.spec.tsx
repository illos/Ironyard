import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsActingAsDirector } from './active-director';

vi.mock('../api/queries', () => ({
  useMe: () => ({ data: { user: { id: 'u-mira' } } }),
  useCampaign: (id: string | undefined) => ({
    data:
      id === 'camp-1'
        ? { id: 'camp-1', name: 'C1', inviteCode: 'X', isOwner: true, isDirector: true, activeDirectorId: 'u-mira' }
        : id === 'camp-2'
          ? { id: 'camp-2', name: 'C2', inviteCode: 'Y', isOwner: false, isDirector: false, activeDirectorId: 'u-someone-else' }
          : undefined,
  }),
}));

describe('useIsActingAsDirector', () => {
  it('returns true when me === activeDirectorId', () => {
    const { result } = renderHook(() => useIsActingAsDirector('camp-1'));
    expect(result.current).toBe(true);
  });

  it('returns false for a non-director user', () => {
    const { result } = renderHook(() => useIsActingAsDirector('camp-2'));
    expect(result.current).toBe(false);
  });

  it('returns false when campaignId is null', () => {
    const { result } = renderHook(() => useIsActingAsDirector(null));
    expect(result.current).toBe(false);
  });
});
