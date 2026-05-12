// Hand-authored title effect overrides.
//
// Coverage policy (Slice 5 of Phase 2 Epic 2B): one canonical example per
// effect category — stat-mod and grant-ability — just enough to prove the
// title collector path works end-to-end. Comprehensive title population is
// deferred to Epic 2C.
//
// ── Caveat: multi-choice titles ────────────────────────────────────────────
// Most titles in v1 give the player a "choose one of the following benefits"
// menu. The character schema currently stores only `titleId` — there is no
// per-title benefit-selection field. The override entries below therefore
// implicitly assume the player picked the modeled benefit; if they picked
// a different sub-benefit the runtime will overstate the effect.
//
// Resolving this gap is tracked alongside the analogous level-pick issue:
// a future schema slice adds a `titleBenefitId` (or similar) and the
// collector switches to a benefit-id lookup. Until then, only canonical-
// example overrides ship.
//
// requireCanonSlug intentionally omitted on every entry here — Slice 6 adds
// canon entries for the effect categories used.

import type { TitleOverride } from './_types';

export const TITLE_OVERRIDES: Record<string, TitleOverride> = {
  // ── stat-mod ───────────────────────────────────────────────────────────
  // "Knight" (2nd echelon), "Knightly Aegis" benefit:
  //   "Your Stamina maximum increases by 6."
  // The other two benefits — "Heraldic Fame" (+1 Renown) and "Knightly
  // Challenge" (a granted ability) — are NOT modeled by this entry. See the
  // multi-choice caveat above.
  knight: {
    attachments: [
      {
        source: { kind: 'title', id: 'knight' },
        effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 6 },
      },
    ],
  },
};
