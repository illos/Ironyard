import { type CurrentUser, type MonsterFile, MonsterFileSchema } from '@ironyard/shared';
import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from './client';

export type CampaignDetail = {
  id: string;
  name: string;
  inviteCode: string;
  isOwner: boolean;
  isDirector: boolean;
  activeDirectorId: string;
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

export function useCampaign(id: string | undefined) {
  return useQuery<CampaignDetail>({
    queryKey: ['campaign', id],
    queryFn: () => api.get<CampaignDetail>(`/api/campaigns/${id}`),
    enabled: !!id,
  });
}

// Static monster ingest output. Lives at apps/web/public/data/monsters.json
// (gitignored, rebuilt by `pnpm --filter @ironyard/data build:data`). The
// schema parse catches drift between the ingest and the runtime.
export function useMonsters() {
  return useQuery<MonsterFile>({
    queryKey: ['data', 'monsters'],
    queryFn: async () => {
      const res = await fetch('/data/monsters.json');
      if (!res.ok) {
        throw new ApiError(res.status, `monsters.json: ${res.statusText}`);
      }
      const json = await res.json();
      return MonsterFileSchema.parse(json);
    },
    staleTime: 60 * 60_000, // bundled static data, no need to re-fetch
    refetchOnWindowFocus: false,
  });
}
