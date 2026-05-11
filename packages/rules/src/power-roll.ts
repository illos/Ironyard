// Power roll resolution per rules-canon.md §1.8 (slice 3 subset — no
// critical hits, no auto-tier outcomes, no voluntary downgrade, no
// bonuses/penalties).

export type Tier = 1 | 2 | 3;

export function tierFromTotal(total: number): Tier {
  if (total >= 17) return 3;
  if (total >= 12) return 2;
  return 1;
}

// Edge/bane cancellation per §1.4. Returns (netEdges, netBanes) where one of
// them is always 0 after cancellation.
export function cancelEdgesAndBanes(
  edges: number,
  banes: number,
): { netEdges: number; netBanes: number } {
  // Per the cancellation table:
  //   1e/1b → 0/0   2+e/2+b → 0/0   2+e/1b → 1e   1e/2+b → 1b
  //   ne/0  → ne    0/nb    → nb
  if (edges === 0 && banes === 0) return { netEdges: 0, netBanes: 0 };
  if (edges === banes) return { netEdges: 0, netBanes: 0 };
  if (edges >= 2 && banes === 1) return { netEdges: 1, netBanes: 0 };
  if (banes >= 2 && edges === 1) return { netEdges: 0, netBanes: 1 };
  if (edges > 0 && banes === 0) return { netEdges: Math.min(edges, 2), netBanes: 0 };
  if (banes > 0 && edges === 0) return { netEdges: 0, netBanes: Math.min(banes, 2) };
  // Defensive: edges and banes differ but neither is 0; treat by net magnitude.
  if (edges > banes) {
    return { netEdges: Math.min(edges - banes, 2), netBanes: 0 };
  }
  return { netEdges: 0, netBanes: Math.min(banes - edges, 2) };
}

export type PowerRollOutcome = {
  natural: number;
  total: number;
  tier: Tier;
  netEdges: number;
  netBanes: number;
};

// Resolve a power roll per §1.8 steps 1-7 + 9 (nat-19/20 override). Crits,
// auto-tier, and downgrade are not in this slice.
export function resolvePowerRoll(args: {
  d10: [number, number];
  characteristic: number;
  edges: number;
  banes: number;
}): PowerRollOutcome {
  const { d10, characteristic, edges, banes } = args;
  const natural = d10[0] + d10[1];
  let total = natural + characteristic;

  const { netEdges, netBanes } = cancelEdgesAndBanes(edges, banes);
  if (netEdges === 1) total += 2;
  if (netBanes === 1) total -= 2;

  const baseTier = tierFromTotal(total);
  let tier: Tier = baseTier;
  if (netEdges >= 2) tier = Math.min(3, baseTier + 1) as Tier;
  else if (netBanes >= 2) tier = Math.max(1, baseTier - 1) as Tier;

  if (natural === 19 || natural === 20) tier = 3;

  return { natural, total, tier, netEdges, netBanes };
}
