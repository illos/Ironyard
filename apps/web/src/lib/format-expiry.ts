import type { OpenAction } from '@ironyard/shared';

export function formatExpiry(oa: OpenAction, currentRound: number): string {
  if (oa.expiresAtRound === null) return 'expires end of encounter';
  if (oa.expiresAtRound === currentRound) return 'expires end of turn';
  if (oa.expiresAtRound === currentRound + 1) return 'expires end of round';
  return `expires round ${oa.expiresAtRound}`;
}
