// Hand-authored item effect overrides.
//
// Coverage policy
// ───────────────────────────────────────────────────────────────────────────
// 2B Slice 5 shipped one canonical example per category (lightning-treads,
// color-cloak-yellow) to prove the items collector path worked end-to-end.
// 2C Slice 5 (this file) extends that to a "static-stat-fold" sweep across
// every item whose effect is modelable by today's AttachmentEffect variants.
//
// Coverage matrix: docs/superpowers/notes/2026-05-12-2c-slice-5-coverage.md
//
// Categories considered (from items.json):
//   - artifact            → SKIPPED-DEFERRED (all 3 are aura/triggered/turn-economy)
//   - leveled-treasure    → 16 entries (7 weapon, 8 armor, 1 other)
//   - trinket             → 4 entries (2 from 2B Slice 5, 2 new in 2C Slice 5)
//   - consumable          → out of scope for the static derivation pass;
//                           consumables apply through intents at use-time,
//                           not as equipped attachments.
//
// ── Artifacts: SKIPPED-DEFERRED (carried from 2B Slice 5) ───────────────────
// All three artifacts shipping in v1 — Blade of a Thousand Years, Encepter,
// Mortal Coil — have only conditional / area-effect / triggered mechanics
// that don't map onto the current AttachmentEffect variants. See § 10.16
// carry-overs for the engine-shape work blocking these.
//
// ── Kit-keyword gating (weapon/armor leveled treasures) ────────────────────
// Per canon § 10.10 (Heroes Book *Rewards → Treasures and Kits*), a hero only
// benefits from a weapon or armor leveled treasure if the treasure's
// weapon/armor keyword appears in the wielder's kit `keywords` field. We gate
// each such attachment with:
//
//   condition: { kind: 'kit-has-keyword', keyword: '<keyword>' }
//
// Keywords are kebab-cased lowercase as they appear in kits.json: heavy-armor,
// light-armor, medium-armor, shield, bow, heavy-weapon, medium-weapon,
// light-weapon, polearm, whip, unarmed-strike. Body-slot trinkets (e.g.
// 'Head, Magic' on Hellcharger Helm, 'Feet, Magic' on Lightning Treads) are
// NOT subject to this gate.
//
// ── Per-tier scaling ──────────────────────────────────────────────────────
// Armor +Stamina scales by level (L1 +6 / L5 +12 / L9 +21; shields use
// +3/+6/+9). Today's `stat-mod` has no per-tier shape, so we author the L1
// baseline. The under-fold at character-level 5+ is a § 10.16 carry-over.
// Weapon per-tier damage ([1, 2, 3]) uses the existing `weapon-damage-bonus`
// per-tier-by-power-roll-outcome axis — see canon § 10.8.
//
// ── requireCanonSlug ──────────────────────────────────────────────────────
// Per § 10.12 (verified), item-grant attachments cite
// `character-attachment-activation.item-grant-attachments`. Kit-keyword-gated
// treasure-side bonuses additionally satisfy § 10.10 — both citations are
// equally valid; we use the item-grant slug to keep the audit consistent.
// The kit-has-keyword CONDITION evaluator itself is verified by
// `character-attachment-activation.kit-keyword-condition`.

import type { ItemOverride } from './_types';

export const ITEM_OVERRIDES: Record<string, ItemOverride> = {
  // ────────────────────────────────────────────────────────────────────────
  // Leveled treasures — WEAPON (7 entries)
  // ────────────────────────────────────────────────────────────────────────

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Weapon Treasures/Authoritys End.md L31 ("+1 damage bonus")
  //         scaling L5→+2, L9→+3 (perTier [1, 2, 3] by power-roll outcome).
  // Heroes Book — Rewards chapter, Leveled Weapon Treasures. Kit-keyword gate
  // per § 10.10. Effect: +N rolled damage; appliesTo melee (Whip keyword).
  'authoritys-end': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'authoritys-end',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'whip' },
        effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: [1, 2, 3] },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Weapon Treasures/Blade of Quintessence.md L31
  //         ("+1 damage bonus") scaling L5→+2, L9→+3.
  // Keywords: Medium Weapon. Note: 9th level adds 4-type immunity-10 which
  // is a static stat layer in principle, but it's a multi-element batch
  // we'd over-fold today (no compound-immunity shape; would emit 4 separate
  // immunities). DEFERRED-PARTIAL — only the damage bonus is authored.
  'blade-of-quintessence': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'blade-of-quintessence',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'medium-weapon' },
        effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: [1, 2, 3] },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Weapon Treasures/Blade of the Luxurious Fop.md L31
  //         ("+1 damage bonus") scaling L5→+2, L9→+3. Keywords: Light Weapon.
  // The +1 NPC interest rider is a narrative effect — not modeled.
  'blade-of-the-luxurious-fop': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'blade-of-the-luxurious-fop',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'light-weapon' },
        effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: [1, 2, 3] },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Weapon Treasures/Displacer.md L31 ("extra 1 psychic")
  //         scaling L5→2, L9→3. Keywords: Medium Weapon, Psionic.
  // Maneuver-teleport rider is encounter-time; not modeled.
  displacer: {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'displacer',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'medium-weapon' },
        effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: [1, 2, 3] },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Weapon Treasures/Icemaker Maul.md L31 ("extra 1 cold")
  //         scaling L5→2, L9→3. Keywords: Heavy Weapon.
  // Ice-field maneuver is encounter-time; not modeled.
  'icemaker-maul': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'icemaker-maul',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'heavy-weapon' },
        effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: [1, 2, 3] },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Weapon Treasures/Lance of the Sundered Star.md L31
  //         ("extra 1 holy") scaling L5→2, L9→3. Keywords: Magic, Polearm.
  // Flying-charge / push-vertical riders are encounter-time; not modeled.
  'lance-of-the-sundered-star': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'lance-of-the-sundered-star',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'polearm' },
        effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: [1, 2, 3] },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Weapon Treasures/Onerous Bow.md L31 ("extra 1 poison")
  //         scaling L5→2, L9→3. Keywords: Bow.
  // Tier-3 weakened rider is power-roll-conditional, not static.
  'onerous-bow': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'onerous-bow',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'bow' },
        effect: { kind: 'weapon-damage-bonus', appliesTo: 'ranged', perTier: [1, 2, 3] },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Weapon Treasures/Third Eye Seeker.md L31 ("extra 1
  //         psychic") scaling L5→2, L9→3. Keywords: Bow, Psionic.
  'third-eye-seeker': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'third-eye-seeker',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'bow' },
        effect: { kind: 'weapon-damage-bonus', appliesTo: 'ranged', perTier: [1, 2, 3] },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Weapon Treasures/Thunderhead Bident.md L31 ("extra 1
  //         sonic") scaling L5→2, L9→3. Keywords: Magic, Medium Weapon.
  // L5+ ranged-weapon usage is a usage mode, not a static fold.
  'thunderhead-bident': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'thunderhead-bident',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'medium-weapon' },
        effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: [1, 2, 3] },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Weapon Treasures/Wetwork.md L31 ("extra 1 psychic")
  //         scaling L5→2, L9→3. Keywords: Polearm, Psionic.
  // Drop-to-0-Stamina trigger is encounter-time, not static.
  wetwork: {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'wetwork',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'polearm' },
        effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: [1, 2, 3] },
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // Leveled treasures — ARMOR (8 entries)
  // ────────────────────────────────────────────────────────────────────────
  // All armor treasures share the +6 / +12 / +21 Stamina scale by character
  // level. We author the L1 baseline; the §10.16 carry-over tracks per-tier
  // scaling. Shield variants use +3 / +6 / +9 (King's Roar) or +2 / +5 / +9
  // (Telekinetic Bulwark).

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Armor Treasures/Adaptive Second Skin of Toxins.md L31.
  // Keywords: Light Armor, Magic. "+6 Stamina" baseline. The "immunity to
  // acid and poison equal to your highest characteristic score" rider is a
  // characteristic-scaled immunity — § 10.16 shape gap; DEFERRED-PARTIAL.
  'adaptive-second-skin-of-toxins': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'adaptive-second-skin-of-toxins',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'light-armor' },
        effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 6 },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Armor Treasures/Chain of the Sea and Sky.md L31.
  // Keywords: Heavy Armor, Magic. L1 +6 Stamina. L5 adds cold-5 immunity;
  // not authored (per-tier immunity scaling not yet modelable — § 10.16).
  'chain-of-the-sea-and-sky': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'chain-of-the-sea-and-sky',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'heavy-armor' },
        effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 6 },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Armor Treasures/Grand Scarab.md L31. Keywords:
  //         Medium Armor, Magic. L1 +6 Stamina. Fly maneuver not modeled.
  'grand-scarab': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'grand-scarab',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'medium-armor' },
        effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 6 },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Armor Treasures/Kings Roar.md L31. Keywords: Shield.
  // L1 +3 Stamina (shield baseline). Roar maneuver not modeled.
  'kings-roar': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'kings-roar',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'shield' },
        effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 3 },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Armor Treasures/Kuranzoi Prismscale.md L31. Keywords:
  //         Medium Armor, Psionic. L1 +6 Stamina. Triggered-slow not modeled.
  'kuranzoi-prismscale': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'kuranzoi-prismscale',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'medium-armor' },
        effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 6 },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Armor Treasures/Paper Trappings.md L31. Keywords:
  //         Light Armor, Magic. L1 +6 Stamina. Paper-thin maneuver not modeled.
  'paper-trappings': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'paper-trappings',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'light-armor' },
        effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 6 },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Armor Treasures/Shrouded Memory.md L31. Keywords:
  //         Light Armor, Psionic. L1 +6 Stamina. L5+ teleport rider is
  //         encounter-time; the L1 edge-on-deception-tests is a test-edge
  //         shape we don't yet model. Static stamina is authored.
  'shrouded-memory': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'shrouded-memory',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'light-armor' },
        effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 6 },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Armor Treasures/Spiny Turtle.md L31. Keywords: Heavy
  //         Armor, Magic. L1 +6 Stamina. Wall-deploy main action not modeled.
  'spiny-turtle': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'spiny-turtle',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'heavy-armor' },
        effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 6 },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Leveled Armor Treasures/Star Hunter.md L31. Keywords: Heavy
  //         Armor, Psionic. L1 +6 Stamina. Invisibility maneuver, concealment
  //         sense, "magic ability gains edge against you" debuff: all skipped
  //         (the debuff is a "bonus to enemy" shape we don't have either).
  'star-hunter': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'star-hunter',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'heavy-armor' },
        effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 6 },
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // Leveled treasures — OTHER (1 NEW + 1 preexisting)
  // ────────────────────────────────────────────────────────────────────────

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Other Leveled Treasures/Bloodbound Band.md L31. Keywords: Magic,
  //         Ring. Body-slot (Ring) — NOT kit-keyword-gated.
  // L1 +6 Stamina (baseline). Bond / damage-share mechanic not modeled.
  'bloodbound-band': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'bloodbound-band',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 6 },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Other Leveled Treasures/Bloody Hand Wraps.md L31. Keywords:
  //         Hands, Psionic. Unarmed-strike-conditional ("any weapon ability
  //         using your unarmed strikes"). Authored as kit-keyword-gated to
  //         `unarmed-strike` since that's the kit keyword that triggers the
  //         unarmed-strike combat path. +1 damage bonus → perTier [1, 2, 3]
  //         (scaling L5→2, L9→3 per md L33-35).
  'bloody-hand-wraps': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'bloody-hand-wraps',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        condition: { kind: 'kit-has-keyword', keyword: 'unarmed-strike' },
        effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: [1, 2, 3] },
      },
    ],
  },

  // "Lightning Treads" (preexisting, 2B Slice 5):
  // Source: .reference/data-md/Rules/Treasures/Leveled Treasures/
  //         Other Leveled Treasures/Lightning Treads.md L31.
  // Keywords: Feet, Magic — body-slot, NOT gated. +2 speed at L1.
  // 5th/9th-level scaling and unarmed-lightning rider deferred (§10.16).
  'lightning-treads': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'lightning-treads',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        effect: { kind: 'stat-mod', stat: 'speed', delta: 2 },
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // Trinkets (2 NEW + 2 preexisting)
  // ────────────────────────────────────────────────────────────────────────
  // Trinkets are body-slot items; not kit-keyword-gated.

  // "Color Cloak (Yellow)" (preexisting, 2B Slice 5):
  // Source: .reference/data-md/Rules/Treasures/Trinkets/1st Echelon Trinkets/
  //         Color Cloak.md (Yellow variant). +N lightning immunity = level.
  // The triggered immunity-to-weakness conversion is not modeled.
  'color-cloak-yellow': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'color-cloak-yellow',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        effect: { kind: 'immunity', damageKind: 'lightning', value: 'level' },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Trinkets/2nd Echelon Trinkets/
  //         Bastion Belt.md L31. Keywords: Magic, Waist. Body-slot.
  // "+3 bonus to Stamina and a +1 bonus to Stability." Text explicitly notes
  // "This Stamina bonus adds to the Stamina bonus granted by other treasures"
  // — additive, matches the engine's current sum-everything behavior.
  'bastion-belt': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'bastion-belt',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 3 },
      },
      {
        source: {
          kind: 'item',
          id: 'bastion-belt',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        effect: { kind: 'stat-mod', stat: 'stability', delta: 1 },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Treasures/Trinkets/3rd Echelon Trinkets/
  //         Bracers of Strife.md L31. Keywords: Arms, Magic. Body-slot.
  // "+2 damage bonus for any weapon ability that deals rolled damage" — a
  // FLAT +2 across all power-roll tiers (unlike weapon treasures which
  // scale [1,2,3]). Authored as perTier [2, 2, 2]. Adds to other treasures
  // per text. The "+1 push distance" rider is a force-move distance mod
  // (no shape today) — deferred.
  'bracers-of-strife': {
    attachments: [
      {
        source: {
          kind: 'item',
          id: 'bracers-of-strife',
          requireCanonSlug: 'character-attachment-activation.item-grant-attachments',
        },
        effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: [2, 2, 2] },
      },
    ],
  },
};
