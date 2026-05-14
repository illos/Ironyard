// apps/web/src/pages/combat/rails/rail-utils.ts
import type { Participant } from '@ironyard/shared';

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function summarizeRole(p: Participant): string {
  // Pass 2b will materialize monster role / class / ancestry onto the
  // participant. Until then we render what's available.
  if (p.kind === 'monster') return p.level ? `L${p.level} · FOE` : 'FOE';
  return `L${p.level} · HERO`;
}
