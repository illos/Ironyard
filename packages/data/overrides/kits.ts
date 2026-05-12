import type { KitOverride } from './_types';

// Hand-authored kit effect overrides.
//
// Phase 2 Epic 2B Slice 4 sweep findings:
// -----------------------------------------------------------------------
// The task description called out "kit-keyword-gated leveled-treasure
// bonuses (e.g. 'if your kit has the heavy-armor keyword, +N stability
// when wearing a leveled-armor treasure')" as a target. After surveying
// `Rules/Chapters/Kits.md`, `Rules/Chapters/Rewards.md`, and every leveled
// treasure markdown file, NO such pattern exists in the SteelCompendium
// data.
//
// The canonical rule that involves both kits and leveled treasures is in
// Rewards.md:
//
//   "A weapon's damage bonus only adds to melee abilities if your kit has
//    a melee damage bonus. A weapon's damage bonus only adds to ranged
//    abilities if your kit has a ranged damage bonus."
//
// and:
//
//   "If your hero doesn't use a kit, they can't gain benefits from using
//    armor or weapon treasures unless they have a feature that says
//    otherwise..."
//
// These are conditional gates on the LEVELED-TREASURE side of the
// attachment fold, not flat bonuses produced by the kit. They will be
// modelled (Slice 5+) by per-item attachments carrying an
// AttachmentCondition such as `kit-has-keyword: heavy-weapon` or by an
// equivalent kit-damage-bonus check at apply time — neither of which
// belongs in KIT_OVERRIDES.
//
// Kit stat bonuses themselves (staminaBonus, stabilityBonus,
// meleeDamageBonus, speedBonus) are already structured fields on the
// Kit schema and emitted by `collectFromKit` directly — see
// `packages/rules/src/attachments/collectors/kit.ts`. They do not need
// override entries.
//
// Result: KIT_OVERRIDES ships empty. The map remains as a structural
// placeholder for any future kit-level effects the parser can't capture
// from kit markdown (none identified in this sweep).
//
// All future entries here must omit `requireCanonSlug` until Slice 6 adds
// the matching canon registry entries.
export const KIT_OVERRIDES: Record<string, KitOverride> = {};
