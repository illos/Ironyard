import type {
  CharacterResponse,
  CreateCharacterRequest,
  CurrentUser,
  EncounterTemplateData,
  UpdateCharacterRequest,
} from '@ironyard/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { CampaignDetail } from './queries';

export function useDevLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; displayName?: string }) =>
      api.post<{ user: CurrentUser }>('/api/auth/dev-login', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

export function useRequestMagicLink() {
  return useMutation({
    mutationFn: (input: { email: string }) =>
      api.post<{ ok: true; devLink?: string }>('/api/auth/request', input),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: true }>('/api/auth/logout', {}),
    onSuccess: () => qc.setQueryData(['me'], null),
  });
}

export function useCreateCampaign() {
  return useMutation({
    mutationFn: (input: { name: string }) => api.post<CampaignDetail>('/api/campaigns', input),
  });
}

export function useJoinCampaign() {
  return useMutation({
    mutationFn: (input: { inviteCode: string }) =>
      api.post<CampaignDetail>('/api/campaigns/join', input),
  });
}

export function useCreateEncounterTemplate(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; data: EncounterTemplateData }) =>
      api.post(`/api/campaigns/${campaignId}/templates`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['encounter-templates', campaignId] }),
  });
}

export function useDeleteEncounterTemplate(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      api.delete(`/api/campaigns/${campaignId}/templates/${templateId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['encounter-templates', campaignId] }),
  });
}

export function useGrantDirectorPermission(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.post(`/api/campaigns/${campaignId}/members/${userId}/director`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign-members', campaignId] }),
  });
}

export function useRevokeDirectorPermission(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/api/campaigns/${campaignId}/members/${userId}/director`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign-members', campaignId] }),
  });
}

export function useCreateCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCharacterRequest) =>
      api.post<CharacterResponse>('/api/characters', input),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['my-characters'] });
      qc.setQueryData(['character', created.id], created);
    },
  });
}

export function useUpdateCharacter(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCharacterRequest) =>
      api.put<CharacterResponse>(`/api/characters/${id}`, input),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['my-characters'] });
      qc.setQueryData(['character', id], updated);
    },
  });
}

export function useDeleteCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/characters/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['my-characters'] });
      qc.removeQueries({ queryKey: ['character', id] });
    },
  });
}

export function useAttachCharacterToCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { campaignCode: string }) =>
      api.post<CharacterResponse>(`/api/characters/${id}/attach`, input),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['my-characters'] });
      qc.invalidateQueries({ queryKey: ['my-campaigns'] });
      qc.setQueryData(['character', id], updated);
    },
  });
}
