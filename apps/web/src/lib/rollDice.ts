// The one place in apps/web that calls Math.random for game rolls.
// Per CLAUDE.md trust model: "swap to server-side rolling later is just
// changing where Math.random() is called." Keep it surgical.

export function rollD10(rng: () => number = Math.random): number {
  // 1..10 inclusive.
  return 1 + Math.floor(rng() * 10);
}

export function roll2d10(rng: () => number = Math.random): [number, number] {
  return [rollD10(rng), rollD10(rng)];
}

// For "manual" / pre-rigged outcomes the director picks a tier and the
// caller passes in canned d10 values that land at that tier. These pairs
// match the slice-3 tier table (canon §1.3):
//   t1 ≤ 11, t2 = 12..16, t3 ≥ 17 (chars added on top). With characteristic 0
//   these land cleanly in each band.
export const TIER_RIGGED_ROLLS = {
  t1: [1, 1] as [number, number],
  t2: [6, 6] as [number, number],
  t3: [10, 10] as [number, number],
} as const;
