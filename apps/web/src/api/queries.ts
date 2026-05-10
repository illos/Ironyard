import type { CurrentUser } from '@ironyard/shared';
import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from './client';

export type SessionDetail = {
  id: string;
  name: string;
  inviteCode: string;
  role: 'director' | 'player';
};

export function useMe() {
  return useQuery<{ user: CurrentUser } | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<{ user: CurrentUser }>('/api/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 30_000,
  });
}

export function useSession(id: string | undefined) {
  return useQuery<SessionDetail>({
    queryKey: ['session', id],
    queryFn: () => api.get<SessionDetail>(`/api/sessions/${id}`),
    enabled: !!id,
  });
}
