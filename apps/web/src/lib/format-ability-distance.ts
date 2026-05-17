// Slice 10 / Phase 2b Group A+B (2b.3) — display-time fold of kit
// distance bonuses into ability cards.
//
// Canon (Kits.md:135 + 142-146):
//   - Melee N + meleeDistanceBonus → "Melee N+B" (display) where B is the
//     fold of all melee-distance attachments.
//   - Ranged N + rangedDistanceBonus → "Ranged N+B".
//   - AoE shapes (Burst / Cube / Wall / Line / Aura) are NOT adjusted by
//     distance bonuses — canon-explicit. We pass these through unchanged.
//   - Signature abilities that already bake the kit bonus in do NOT double-add.
//     We detect signature via `ability.cost === 0` (per AbilitySchema.cost
//     docstring: "0 = signature, 3/5/7/9 = heroic"; kit signatures also set
//     cost = 0 via parse-kit.ts).
//
// The engine snapshots the bonuses onto the participant at StartEncounter
// from runtime.{melee,ranged}DistanceBonus (slice 1). This helper reads
// directly off participant — no separate runtime fetch needed for display.

import type { Ability, Participant } from '@ironyard/shared';

/**
 * Compute the display string for an ability's distance, layering the
 * participant's kit distance bonuses for non-AoE weapon abilities.
 *
 * Returns the raw `ability.distance` unchanged when:
 *   - the ability has no distance string,
 *   - the distance is an AoE shape (Burst / Cube / Wall / Line / Aura),
 *   - the ability is a signature (cost === 0) — bonus already baked in,
 *   - the participant has no matching bonus for the ability's range kind.
 *
 * Otherwise returns "Melee N+B" / "Ranged N+B".
 */
export function formatAbilityDistance(ability: Ability, participant: Participant | null): string {
  const raw = ability.distance;
  if (!raw) return '';
  if (!participant) return raw;

  // Signature abilities bake the bonus in — do not double-add. (Canon
  // caveat Kits.md:142-146.)
  if (ability.cost === 0) return raw;

  // Match "Melee N" or "Ranged N" at the start of the distance string. The
  // canonical format from parse-ability is exactly this; we allow an optional
  // trailing modifier (e.g. " or Melee 1") which is rare but appears in a few
  // ability authoring patterns. We fold the leading N only.
  const meleeMatch = raw.match(/^Melee\s+(\d+)(.*)$/);
  if (meleeMatch?.[1] !== undefined) {
    const base = Number.parseInt(meleeMatch[1], 10);
    const bonus = participant.meleeDistanceBonus ?? 0;
    if (bonus <= 0) return raw;
    return `Melee ${base + bonus}${meleeMatch[2] ?? ''}`;
  }

  const rangedMatch = raw.match(/^Ranged\s+(\d+)(.*)$/);
  if (rangedMatch?.[1] !== undefined) {
    const base = Number.parseInt(rangedMatch[1], 10);
    const bonus = participant.rangedDistanceBonus ?? 0;
    if (bonus <= 0) return raw;
    return `Ranged ${base + bonus}${rangedMatch[2] ?? ''}`;
  }

  // Burst / Cube / Wall / Line / Aura / Self / other — pass through.
  return raw;
}
