// apps/web/src/pages/combat/rails/rail-utils.ts
import type { Participant } from '@ironyard/shared';
import { parseMonsterRole } from './rank-palette';
import type { RoleReadoutData } from './RoleReadout';

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Resolve a Participant into the data shape RoleReadout consumes.
 * Pre-2b2a monster snapshots (role === null) fall back to the FOE readout.
 */
export function roleReadoutFor(p: Participant): RoleReadoutData {
  if (p.kind === 'monster') {
    if (p.role === null) {
      return { kind: 'monster-fallback', level: p.level };
    }
    const { rank, family } = parseMonsterRole(p.role);
    if (rank === null) {
      return { kind: 'monster-unranked', level: p.level, family };
    }
    return { kind: 'monster-ranked', level: p.level, rank, family };
  }
  return { kind: 'pc', level: p.level, className: p.className };
}
