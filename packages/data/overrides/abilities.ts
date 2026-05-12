import type { AbilityOverride } from './_types';

// Hand-authored ability effect overrides.
//
// Phase 2 Epic 2B Slice 4 sweep findings:
// -----------------------------------------------------------------------
// Class features in Draw Steel are encoded two ways in SteelCompendium:
//
//   (a) As individual ability markdown files under `Rules/Abilities/<class>/
//       <level>-Level Features/<Name>.md` (`feature_type: ability`). These
//       are the abilities the wizard picks per-level and stores in
//       `levelChoices[lvl].abilityIds`. Almost all of them describe combat
//       actions whose effects fire WITHIN an encounter (power rolls,
//       damage, conditions, triggered movement). None of them grant a
//       static runtime stat (maxStamina, recoveries, speed, stability,
//       immunity) at the character level — they modify per-encounter
//       behaviour, not the derived sheet.
//
//   (b) As inline prose sections in `Rules/Classes By Level/<class>/
//       <level> Level Features.md` (e.g. Conduit's "Prayer of Speed",
//       "Prayer of Steel", "Prayer of Soldier's Skill", and the various
//       Domain blessings). These ARE stat-touching (+1 speed, +6 Stamina,
//       wear light armor without a kit, etc.) but they are NOT emitted as
//       individual Ability records — there's no ability id to key an
//       override against. The wizard does not yet model these as
//       per-level picks; `LevelChoicesSchema` only carries `abilityIds`,
//       `subclassAbilityIds`, `perkId`, and `skillId`. When the pipeline
//       grows a "blessing"/"prayer"/"domain feature" pick slot, those
//       stat-mods will fold in here (or in a new domain/prayer override
//       map). For Slice 4, they remain out of scope.
//
// Result: no class-feature abilities ship with attachments today. The map
// remains empty as a structural placeholder. The collector
// (`collectFromClassFeatures`) is already wired to consult this map for
// any future entries.
//
// All future entries here must omit `requireCanonSlug` until Slice 6 adds
// the matching canon registry entries — the requireCanon gate silently
// drops attachments with unverified slugs.
export const ABILITY_OVERRIDES: Record<string, AbilityOverride> = {};
