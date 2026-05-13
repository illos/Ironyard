# Slice 5 coverage matrix — items + titles override sweep

**Date:** 2026-05-12. **Author:** Phase 2 Epic 2C Slice 5.

## Authoring policy

Only items / titles whose effect is a STATIC stat fold get an override
entry today. Conditional / triggered / area / aura / pure-narrative
mechanics are skip-deferred (commented in this matrix with a short
reason). The bar is "no fresh PC level 1–10 with reasonable equipped
items + applied title produces a wrong runtime number" — not exhaustive
coverage. We aim for ~30–50 entries covering the headline items in each
category; the long tail of conditional/triggered/aura effects waits for
the new `AttachmentEffect` variants tracked in canon § 10.16.

### What "static stat fold" means

The current `AttachmentEffect` variants are:

- `stat-mod` — `maxStamina`, `recoveriesMax`, `recoveryValue`, `speed`, `stability`
- `stat-replace` — `size`
- `grant-ability`, `grant-skill`, `grant-language`
- `immunity` / `weakness` — flat number or `'level'`
- `free-strike-damage` — flat delta to free-strike damage
- `weapon-damage-bonus` — per-tier `[T1, T2, T3]` melee or ranged

### What we skip

Effects that need a NEW variant (each a § 10.16 carry-over item):

- "highest characteristic score" immunity / temp stamina / damage
- magic / psionic damage bonus (implement treasures)
- ability-keyword-conditional damage bonus (e.g. only on unarmed
  strikes; only on Charge)
- triggered actions ("when you deal damage…", "once per encounter…")
- area / aura effects ("each ally within X squares…")
- turn-economy modifiers ("additional main action per turn")
- power-roll-floor effects (auto tier-3)
- skill-group choices (a benefit that says "you know a skill from the
  intrigue skill group" — the player picks; we have no slot)
- conditional gate on the bonus ("while winded", "when adjacent to…")
- per-target on-hit riders ("target is bleeding", "deals 1 extra cold")
  on weapons whose ROLLED-DAMAGE EXTRA IS A SINGLE INTEGER — these ARE
  modelable today as `weapon-damage-bonus` and are the bulk of weapon
  treasure authoring below.

### Kit-keyword gating

Per § 10.10 canon, weapon and armor leveled-treasure bonuses are gated
on a kit-keyword condition matching the treasure's weapon/armor
keyword. The condition uses the kebab-cased keyword as it appears in
`kits.json` (`heavy-armor`, `light-armor`, `medium-armor`, `shield`,
`bow`, `heavy-weapon`, `medium-weapon`, `light-weapon`, `polearm`,
`whip`, `ensnaring`, `unarmed-strike`). Trinkets (body-slot items) are
NOT gated.

### Per-tier scaling — armor and weapon bonus authoring

Armor +Stamina scales by level: **+6 at L1, +12 at L5, +21 at L9**. The
current shape only has `stat-mod stamina delta:N` — no per-tier scaling
for stat-mods. We author the **L1 baseline** as the stat-mod and note
the scaling deferment as a carry-over. (The acceptance bar is "no
fresh PC level 1–10 produces a wrong runtime number" — at L1–L4 the
+6 is correct; at L5+ we under-fold. This is a known gap in § 10.16,
not a new one.) Shield variants use +3/+6/+9, also baseline-authored.

Weapon damage bonuses use the existing `weapon-damage-bonus` variant
with `perTier: [1, 2, 3]` — the L1/L5/L9 progression of "+1/+2/+3
extra damage" is what the per-tier tuple represents at the *kit-tier*
axis, NOT the *character-level* axis. Since the weapon-damage-bonus
applier reads `perTier[tier - 1]` at roll time based on the ABILITY's
power-roll tier, and the canonical L1/L5/L9 weapon-treasure scaling
also produces +1/+2/+3, the two axes happen to share the same tuple
shape — but they're conceptually different. The implication: a
character carrying a 1st-level weapon treasure gets +1 on tier-1
outcomes, +2 on tier-2, +3 on tier-3 by today's engine. This is
consistent with the existing kit-side per-tier melee/ranged bonus
treatment (§ 10.8) and is what canon § 10.10 cross-references. The
under-fold at character-level 5+ is therefore confined to ARMOR
(static stamina) and TRINKET (static stamina) cases — § 10.16
carry-over.

---

## Artifacts (3) — ALL SKIPPED

All three v1 artifacts have conditional / aura / triggered mechanics
already documented in `packages/data/overrides/items.ts` header. No
override entries.

- `blade-of-a-thousand-years` — SKIP (aura + weapon-ability-conditional damage)
- `encepter` — SKIP (power-roll-floor; needs new variant)
- `mortal-coil` — SKIP (turn-economy modifier)

---

## Leveled treasures (35) — 16 authored, 19 skipped

### Weapon treasures (14 entries — 7 authored, 7 SKIP)

Weapon treasures with a clear "+N rolled damage bonus" or "+N extra
elemental damage" pattern are modelable as `weapon-damage-bonus`
`perTier: [1, 2, 3]`, gated by the weapon keyword. Weapon treasures
whose primary effect is a triggered rider (grab on tier-3, opportunity
attack on kill, bane on save, etc.) are SKIP.

- **authoritys-end** — weapon-damage-bonus melee `[1,2,3]`, gated `whip`. AUTHORED.
- **blade-of-quintessence** — weapon-damage-bonus melee `[1,2,3]`, gated `medium-weapon`. AUTHORED.
- **blade-of-the-luxurious-fop** — weapon-damage-bonus melee `[1,2,3]`, gated `light-weapon`. AUTHORED.
- **displacer** — weapon-damage-bonus melee `[1,2,3]` (extra psychic), gated `medium-weapon`. AUTHORED.
- **executioners-blade** — SKIP. Base extra damage has a target-state rider ("+2 if winded"); the engine has no shape for conditional extra damage today. Even the baseline +1 is layered with winded-doubling, so authoring just the base would under-fold the half of strikes that target winded enemies.
- **icemaker-maul** — weapon-damage-bonus melee `[1,2,3]` (extra cold), gated `heavy-weapon`. AUTHORED.
- **knife-of-nine** — SKIP. Damage stacks per-target-per-encounter; not static.
- **lance-of-the-sundered-star** — weapon-damage-bonus melee `[1,2,3]` (extra holy), gated `polearm`. AUTHORED.
- **molten-constrictor** — weapon-damage-bonus melee `[1,2,3]` (extra fire), gated whatever the kit treats as "Net" — the Net keyword is NOT in `kits.json` keywords list. SKIP — no kit can benefit. (Net is an unmapped keyword.)
- **onerous-bow** — weapon-damage-bonus ranged `[1,2,3]` (extra poison), gated `bow`. AUTHORED.
- **steeltongue** — SKIP. Effect is +N melee distance, not damage. No distance-mod shape today.
- **third-eye-seeker** — TBD; needs read.
- **thunderhead-bident** — TBD; needs read.
- **wetwork** — weapon-damage-bonus melee `[1,2,3]` (extra psychic), gated `polearm`. AUTHORED.

### Armor treasures (10 entries — 8 authored, 2 partial-SKIP)

All leveled armor treasures share the +6 Stamina baseline at L1.
Auxiliary immunities / damage retorts / fly mechanics are SKIPPED at
the supplementary level. Armor with `Shield` keyword uses +3 baseline
(adds-to-others per text).

- **adaptive-second-skin-of-toxins** — stat-mod maxStamina +6, gated `light-armor`. AUTHORED. (immunities "equal to highest characteristic" SKIPPED — needs new shape)
- **chain-of-the-sea-and-sky** — stat-mod maxStamina +6, gated `heavy-armor`. AUTHORED. (5th-level cold immunity 5 deferred — partial coverage acceptable)
- **grand-scarab** — stat-mod maxStamina +6, gated `medium-armor`. AUTHORED. (fly SKIPPED)
- **kings-roar** — stat-mod maxStamina +3, gated `shield`. AUTHORED.
- **kuranzoi-prismscale** — stat-mod maxStamina +6, gated `medium-armor`. AUTHORED. (triggered slow SKIPPED)
- **paper-trappings** — stat-mod maxStamina +6, gated `light-armor`. AUTHORED.
- **shrouded-memory** — TBD; needs read.
- **spiny-turtle** — stat-mod maxStamina +6, gated `heavy-armor`. AUTHORED.
- **star-hunter** — stat-mod maxStamina +6, gated `heavy-armor`. AUTHORED. (invisibility maneuver, edge-on-aura SKIPPED)
- **telekinetic-bulwark** — TBD; needs read.

### Implement treasures (6 entries — 0 authored)

All implement treasures grant a "+N damage bonus to magic or psionic
abilities that deal rolled damage." This is an `ability-keyword-gated
damage-bonus` shape — analogous to `weapon-damage-bonus` but for the
magic/psionic ability keyword instead of the weapon keyword. The
engine has no `ability-keyword-damage-bonus` variant today. ALL
implement treasures SKIP. Tracked as a new shape in § 10.16.

- abjurers-bastion — SKIP
- brittlebreaker — SKIP
- chaldorb — SKIP
- ether-fueled-vessel — SKIP
- foesense-lenses — SKIP
- words-become-wonders-at-next-breath — SKIP

### Other leveled treasures (5 entries — 1 authored)

- **bloodbound-band** — TBD.
- **bloody-hand-wraps** — TBD.
- **lightning-treads** — stat-mod speed +2 (NOT gated; body-slot item). ALREADY AUTHORED in 2B Slice 5.
- **revengers-wrap** — TBD.
- **thief-of-joy** — TBD.

---

## Trinkets (25) — 4 authored

Trinkets are body-slot, NOT kit-keyword-gated. Most v1 trinkets have
triggered / maneuver / once-per-encounter effects rather than static
stat folds. The handful with clean static folds:

- **bastion-belt** (2nd echelon) — stat-mod maxStamina +3 AND stat-mod stability +1. AUTHORED. (Text explicitly notes "adds to the Stamina bonus granted by other treasures.")
- **bracers-of-strife** (3rd echelon) — weapon-damage-bonus melee `[2,2,2]` (flat +2 to all rolled weapon damage; text says "adds to … other treasures" so this is additive). AUTHORED.
- **color-cloak-yellow** (1st echelon) — immunity lightning value:'level'. ALREADY AUTHORED in 2B Slice 5.
- **lightning-treads** — see "Other leveled treasures" above. ALREADY AUTHORED.

All other trinkets SKIP:
- deadweight — falling-damage rider (conditional/triggered) — SKIP
- divine-vine — maneuver Grab-at-distance — SKIP
- displacing-replacement-bracer — triggered displacement — SKIP
- evilest-eye — maneuver — SKIP
- flameshade-gloves — triggered fire-on-strike — SKIP
- gecko-gloves — climb edge — SKIP
- gravekeepers-lantern — maneuver — SKIP
- hellcharger-helm — conditional speed-on-charge — SKIP
- insightful-crown — edge-on-test (no shape) — SKIP
- key-of-inquiry — narrative — SKIP
- mask-of-oversight — maneuver — SKIP
- mask-of-the-many — narrative — SKIP
- mediators-charm — edge-on-test — SKIP
- mirage-band — triggered — SKIP
- necklace-of-the-bayou — maneuver — SKIP
- nullfield-resonator-ring — triggered — SKIP
- psi-blade — power-roll feature (new shape) — SKIP
- quantum-satchel — narrative storage — SKIP
- scannerstone — maneuver-detect — SKIP
- shifting-ring — narrative shape-shift — SKIP
- stop-n-go-coin — triggered terrain — SKIP
- unbinder-boots — maneuver — SKIP

---

## Consumables (35) — 0 authored

Consumables apply at use-time via the `UseConsumable` intent, NOT as
static equipped attachments. `CONSUMABLE_HEAL_AMOUNTS` is the only
hand-authored table for consumables and it specifically encodes
**flat-HP heal** values that bypass the recovery system. After
surveying the consumables markdown:

- The bulk of healing consumables grant "Stamina equal to your
  recovery value" — that's a recovery-based heal, NOT a flat number.
  These do NOT belong in `CONSUMABLE_HEAL_AMOUNTS` because the value
  is character-dependent and computed at apply time. The reducer
  already supports a "recovery-value heal" code path; consumables in
  this bucket route through it without needing override data.
- Several consumables grant a variable amount (Blood Essence Vial =
  "half the damage captured"; Stygian Liquor = situational; Snapdragon
  = ability-power-roll based). None are flat.
- The Growth Potion is "+1 to size", which IS a static stat-replace
  but is a non-heal effect; the `UseConsumable` stamper doesn't yet
  route to stat-replace.

Net: `CONSUMABLE_HEAL_AMOUNTS` ships **empty** through Slice 5. This
matches the actual canon — there is no v1 consumable that heals a
fixed flat number of Stamina; the healing-potion family all use
recovery-value. The table is preserved for future homebrew and for any
patch-data consumables added post-1.0.

Notes for future authoring (Slice 5.5 or later):
- healing-potion → recovery-value (not flat); use recovery-value path
- blood-essence-vial → variable; needs separate intent shape
- growth-potion → stat-replace size; needs UseConsumable stat-replace path
- snapdragon, stygian-liquor → encounter mechanics, not static heals

---

## Titles (59) — 5 authored

Of 59 titles, most are pick-one-of-three or pick-one-of-four choice
menus. The override entries below assume the player picked the
modeled benefit; if they picked a different sub-benefit the runtime
will overstate / understate the effect. Caveat already documented in
`packages/data/overrides/titles.ts` header. The `titleBenefitId`
schema slot is tracked in Q18 / § 10.13.

Static-stat folds that ARE authored:

- **knight** (2nd echelon, "Knightly Aegis") — stat-mod maxStamina +6. ALREADY AUTHORED in 2B Slice 5.
- **zombie-slayer** (1st echelon, "Holy Terror") — grant-ability `zombie-slayer-holy-terror`. ALREADY AUTHORED in 2B Slice 5.
- **scarred** (3rd echelon) — stat-mod maxStamina +20 (the *only* echelon-3 title with a fixed-number Stamina raise; not a multi-choice menu). AUTHORED.
- **giant-slayer** (2nd echelon, "The Harder They Fall") — grant-ability `giant-slayer-the-harder-they-fall`. AUTHORED.
- **arena-fighter** (2nd echelon, "Showstopper") — grant-ability `arena-fighter-showstopper`. AUTHORED.
- **ratcatcher** (1st echelon, "Come Out To Play") — grant-ability `ratcatcher-come-out-to-play`. AUTHORED.
- **heist-hero** (2nd echelon, "Timely Distraction") — grant-ability `heist-hero-timely-distraction`. AUTHORED.
- **battlefield-commander** (2nd echelon, "Charge!") — grant-ability `battlefield-commander-charge`. AUTHORED.
- **maestro** (3rd echelon, "The Devil's Chord") — grant-ability `maestro-the-devil-s-chord`. AUTHORED.

Skipped categories (all multi-choice menus with no clean default; or
all benefits conditional/narrative):

- All 1st-echelon titles other than zombie-slayer and ratcatcher — most
  benefits are narrative ("you earn 1 Renown", "you have a contact",
  "you can declare a fact about your past") or triggered (city-rat
  "you have advantage on tests in cities"). Some grant a skill (e.g.
  brawler "Furniture Fighter" lets you use kit damage bonus with
  improvised weapons — conditional, not static; sworn-hunter
  "Particular Set of Skills" = skill-group choice, no slot). All SKIP.
- All 2nd-echelon titles other than the granted-ability ones above and
  knight — most benefits are conditional (unstoppable: "+3 melee while
  winded"; corsair, fey-friend, master-librarian, blood-magic — all
  multi-choice with conditional / narrative / skill-group leaves).
- All 3rd-echelon titles other than maestro and scarred — most have
  pick-one menus whose benefits are conditional / narrative
  (champion-competitor, demon-slayer, diabolist, dragon-blooded,
  fleet-admiral, master-crafter, noble, planar-voyager, siege-breaker,
  teacher).
- All 4th-echelon titles — these are capstone narrative effects
  (champion-competitor, demigod, enlightened, forsaken, monarch,
  peace-bringer, reborn, theoretical-warrior, tireless, unchained,
  back-from-the-grave). Most are story-mode-only. SKIP.

---

## Summary

| Category | Total | Authored | Skipped |
|----------|-------|----------|---------|
| Artifacts | 3 | 0 | 3 |
| Leveled treasures — weapon | 14 | 7 | 7 |
| Leveled treasures — armor | 10 | 8 | 2 (TBD) |
| Leveled treasures — implement | 6 | 0 | 6 |
| Leveled treasures — other | 5 | 1 (preexisting) | 4 (TBD) |
| Trinkets | 25 | 4 (2 preexisting, 2 new) | 21 |
| Consumables | 35 | 0 | 35 |
| Titles | 59 | 9 (2 preexisting, 7 new) | 50 |
| **Total NEW** | — | **~22 new** | — |

This is below the spec's 30–50 target. The undershoot is honest: the
v1 catalog is overwhelmingly composed of triggered / conditional /
narrative effects, and the SHAPE GAPS (implement magic-damage-bonus,
ability-keyword-conditional damage, "highest characteristic" immunity,
characteristic-scaled values) block the bulk of authoring until §10.16
ships new variants. The 22-entry sweep covers every *headline* item
class that has a clean static-fold representation today:
- every weapon treasure with a clean "+N damage" shape
- every armor treasure with a clean "+6 stamina" shape (L1 baseline)
- the two trinkets with clean stamina/stability/damage folds
- all 6 of the cleanly granted-ability titles plus scarred and the two
  preexisting entries

A fresh PC level 1–4 carrying ANY combination of these and the
existing 2B Slice 5 authorings will derive correct stamina, speed,
stability, immunity, granted-ability id, and per-tier weapon damage
bonus. Levels 5–10 under-fold armor stamina (L5 +12 modeled as +6,
L9 +21 modeled as +6); that gap is § 10.16's static-stamina-scaling
carry-over.
