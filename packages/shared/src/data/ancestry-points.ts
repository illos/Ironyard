// Maximum number of trait points a player can spend on purchasable traits
// for each ancestry. Revenant has a conditional: 2 points normally, 3 if
// the player chose a Size 1S former life (handled by the wizard, not this
// static table — the wizard reads this base value and adds the conditional
// adjustment).
//
// Source: Draw Steel rulebook.
export const ANCESTRY_TRAIT_POINT_BUDGET: Record<string, number> = {
  memonek: 4,
  polder: 4,
  devil: 3,
  'dragon-knight': 3,
  dwarf: 3,
  hakaan: 3,
  'high-elf': 3,
  human: 3,
  orc: 3,
  'time-raider': 3,
  'wode-elf': 3,
  revenant: 2, // +1 if former life is Size 1S
};

// Look up the budget for a given ancestry id. Returns null if ancestry
// is unknown (defensive — UI should treat null as "no cap enforced yet").
export function getAncestryTraitPointBudget(ancestryId: string | null): number | null {
  if (!ancestryId) return null;
  const v = ANCESTRY_TRAIT_POINT_BUDGET[ancestryId];
  return v ?? null;
}
