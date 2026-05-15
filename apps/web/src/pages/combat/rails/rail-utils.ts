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
/**
 * Capitalize the first letter of a string (for HeroicResourceName enum members
 * which are lowercase in the schema but displayed mixed-case in the UI).
 */
export function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

export function roleReadoutFor(p: Participant): RoleReadoutData {
  if (p.kind === 'monster') {
    // == null catches both null and undefined — WS-mirrored snapshots bypass
    // Zod parse so .default(null) clauses don't fire; field may be undefined.
    if (p.role == null) {
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
