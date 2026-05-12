// Hand-authored item effect overrides.
//
// Coverage policy (Slice 5 of Phase 2 Epic 2B): one canonical example per
// item category, just enough to prove the items collector path works
// end-to-end. Comprehensive item population is deferred to Epic 2C.
//
// Categories considered (from items.json):
//   - artifact            → SKIPPED-DEFERRED (see note below)
//   - leveled-treasure    → populated in Task 5.2
//   - trinket             → populated in Task 5.3
//   - consumable          → out of scope for the static derivation pass;
//                           consumables apply through intents at use-time,
//                           not as equipped attachments.
//
// ── Artifacts: SKIPPED-DEFERRED ─────────────────────────────────────────────
// All three artifacts shipping in v1 — Blade of a Thousand Years, Encepter,
// Mortal Coil — have only conditional / area-effect / triggered mechanics
// that don't map onto the current AttachmentEffect variants:
//   - Blade of a Thousand Years: damage bonus is weapon-ability-conditional;
//     "Rally the Righteous" affects ALLIES in a 1-mile aura, not the wielder.
//   - Encepter: "Shining Presence" forces a tier-3 outcome on Presence-based
//     power rolls — needs a new effect kind (`power-roll-floor` or similar)
//     not yet present in AttachmentEffectSchema.
//   - Mortal Coil: a penumbra-of-effect artifact; the wielder's benefit
//     ("additional main action per turn") is an encounter-time turn-economy
//     modifier, not a static runtime stat.
// Revisit when Slice 6+ extends AttachmentEffect with power-roll-floor and
// turn-economy variants, or when Epic 2C lands area/aura mechanics.
//
// requireCanonSlug intentionally omitted on every entry here — Slice 6 adds
// canon entries for the effect categories used.

import type { ItemOverride } from './_types';

export const ITEM_OVERRIDES: Record<string, ItemOverride> = {
  // Artifact entries: none — see header note above.

  // ── Leveled treasures ──────────────────────────────────────────────────
  // "Lightning Treads" (1st-level effect, Other Leveled Treasures):
  //   "While you wear these boots, ... you gain a +2 bonus to speed."
  // The lightning-damage rider on unarmed strikes is an ability-keyword-
  // conditional damage bonus we can't yet express. The +2 speed is a clean
  // static stat-mod when the boots are equipped.
  //
  // SKIPPED-DEFERRED-PARTIAL — extra-lightning-damage-on-unarmed-strike
  //   rider and 5th/9th-level scaling not yet modellable.
  'lightning-treads': {
    attachments: [
      {
        source: { kind: 'item', id: 'lightning-treads' },
        effect: { kind: 'stat-mod', stat: 'speed', delta: 2 },
      },
    ],
  },
};
