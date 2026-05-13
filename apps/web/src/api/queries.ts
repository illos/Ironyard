import {
  type CampaignCharacter,
  type CharacterResponse,
  type CurrentUser,
  type EncounterTemplate,
  type MonsterFile,
  MonsterFileSchema,
} from '@ironyard/shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ApiError, api } from './client';

export type CampaignDetail = {
  id: string;
  name: string;
  inviteCode: string;
  isOwner: boolean;
  isDirector: boolean;
  activeDirectorId: string;
};

export type CampaignSummary = {
  id: string;
  name: string;
  inviteCode: string;
  isOwner: boolean;
  isDirector: boolean;
};

export function useMyCampaigns() {
  return useQuery<CampaignSummary[]>({
    queryKey: ['my-campaigns'],
    queryFn: () => api.get<CampaignSummary[]>('/api/campaigns'),
  });
}

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

export function useEncounterTemplates(campaignId: string | undefined) {
  return useQuery<EncounterTemplate[]>({
    queryKey: ['encounter-templates', campaignId],
    queryFn: () => api.get<EncounterTemplate[]>(`/api/campaigns/${campaignId}/templates`),
    enabled: !!campaignId,
  });
}

export function useCampaignCharacters(
  campaignId: string | undefined,
  status: 'pending' | 'approved' | undefined,
) {
  return useQuery<CampaignCharacter[]>({
    queryKey: ['campaign-characters', campaignId, status],
    queryFn: () =>
      api.get<CampaignCharacter[]>(
        `/api/campaigns/${campaignId}/characters${status ? `?status=${status}` : ''}`,
      ),
    enabled: !!campaignId,
  });
}

export type CampaignMember = {
  userId: string;
  displayName: string;
  isDirector: boolean;
};

export function useCampaignMembers(campaignId: string | undefined) {
  return useQuery<CampaignMember[]>({
    queryKey: ['campaign-members', campaignId],
    queryFn: () => api.get<CampaignMember[]>(`/api/campaigns/${campaignId}/members`),
    enabled: !!campaignId,
  });
}

export function useMyCharacters() {
  return useQuery<CharacterResponse[]>({
    queryKey: ['my-characters'],
    queryFn: () => api.get<CharacterResponse[]>('/api/characters'),
  });
}

export function useCharacter(id: string | undefined) {
  return useQuery<CharacterResponse>({
    queryKey: ['character', id],
    queryFn: () => api.get<CharacterResponse>(`/api/characters/${id}`),
    enabled: !!id,
  });
}

// Fan-out helper: given a CampaignCharacter list, fetch each character's full
// row in parallel and return a stable array once all resolve. Errors on a
// single id drop that row silently so one bad character doesn't block the rest.
function useCharactersFull(campaignId: string | undefined, status: 'approved' | 'pending') {
  const list = useCampaignCharacters(campaignId, status);
  const ids = list.data?.map((cc) => cc.characterId) ?? [];
  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['character', id],
      queryFn: () => api.get<CharacterResponse>(`/api/characters/${id}`),
      enabled: !!id,
    })),
  });
  const data = queries.map((q) => q.data).filter((d): d is CharacterResponse => !!d);
  const isLoading = list.isLoading || queries.some((q) => q.isLoading);
  return { data, isLoading };
}

export function useApprovedCharactersFull(campaignId: string | undefined) {
  return useCharactersFull(campaignId, 'approved');
}

export function usePendingCharactersFull(campaignId: string | undefined) {
  return useCharactersFull(campaignId, 'pending');
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
