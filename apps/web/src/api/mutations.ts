import type { CurrentUser } from '@ironyard/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { SessionDetail } from './queries';

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

export function useCreateSession() {
  return useMutation({
    mutationFn: (input: { name: string }) => api.post<SessionDetail>('/api/sessions', input),
  });
}

export function useJoinSession() {
  return useMutation({
    mutationFn: (input: { inviteCode: string }) =>
      api.post<SessionDetail>('/api/sessions/join', input),
  });
}
