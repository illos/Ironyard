# Phase 2b canon audit — 2026-05-16

## Purpose

Verify every remaining Phase 2b sub-epic description against canon
(`.reference/data-md/Rules/*` + printed Heroes Book v1.01 via
`.reference/core-rules/heroes-flat.txt`) before resuming the
slice-2c brainstorm. Triggered by the Encepter audit, which showed
that umbrella one-liners can be imprecise enough to derail
architecture decisions ("Encepter aura" was actually a player-managed
lasso relation + a separate Shining Presence power-roll floor).

Dispatched 5 parallel general-purpose agents by disjoint bucket:
- **Agent A** — ancestry traits (2b.1 + 2b.4 ancestry subset + 2b.8)
- **Agent B** — kit mechanics (2b.3)
- **Agent C** — damage engine (2b.5 audit + 2b.6)
- **Agent D** — class-feature pipeline (2b.7)
- **Agent E** — cross-side trigger ordering (2b.9 / §4.10)

This document records the synthesized findings. The
`docs/phases.md` Phase 2b sub-epic table has been updated per the
"Recommended row revision" entries below.

## Headline findings (the parts that force row revisions)

1. **2b.4 Revenant Bloodless description is WRONG.** Canon says
   *"You can't be made bleeding even while dying"* — a flat
   **condition immunity**, identical in shape to Dwarf Great
   Fortitude, Polder Fearless, Orc Nonstop, etc. NOT a save
   modifier. (The save-modifier traits are Devil *Impressive Horns*,
   High/Wode Elf *Otherworldly Grace*, Dragon Knight *Remember Your
   Oath* — "succeed on 5/4+".)
2. **2b.4 Devil Wings** is not a simple "while flying" condition.
   Flying is a movement-mode state with a hard duration (Might-score
   rounds aloft) + fall-on-prone/speed=0 + an echelon-1-only weakness
   5. Identical mechanic in Dragon Knight Wings — design must support
   both. A naive boolean `isFlying` flag misses every load-bearing piece.
3. **2b.5 row text "Death-save flow"** is a D&D-flavored misnomer
   inherited from old planning. Draw Steel has no death-save
   mechanic. Slice 1 already corrected the umbrella; the Phase 2b
   row predates the patch. The actual open punch-list is much
   smaller and more concrete than the row implies.
4. **2b.6 is functionally CLOSED.** Q16 is already ✅ in
   `docs/rules-canon.md`. One real bug surfaced (see "Bugs
   uncovered"); otherwise just minor cleanup items that fold into 2b.5.
5. **2b.7 covers 5 classes, not 2.** Conduit (Prayers/Wards), Censor
   (Domains), Elementalist (Enchantments/Wards), Talent
   (Augmentations/Wards), Null (Augmentations) — same prose-block
   feature-slot shape with different vocabulary. Per-class slot
   namespace required from day one.
6. **2b.9 🟡 status is generous.** The cross-side
   resolution mechanism (modal + `ResolveTriggerOrder`) exists, but
   the entire trigger-cascade pipeline is missing: no event
   producer, `ExecuteTrigger` is a no-op stub, 1-per-round cap
   unenforced, no `actionType` discriminant in ability data, no
   dazed/surprised gating.
7. **2b.3 ranged-damage emission is already done** at parser +
   collector layer. The "silent" wording in the row is misleading —
   the gap is downstream at the RollPower read site for the ranged
   branch. Distance bonus has TWO flavors (melee + ranged) and is
   greenfield. Disengage bonus is fully greenfield (no Disengage
   code in the repo at all).
8. **2b.8 surfaced a new engine-shape family** not in any current
   Phase 2b row: **condition-immunity** (Bloodless, Great Fortitude,
   Fearless ×2, Nonstop ×2, Unstoppable Mind, Unphased — 6+ traits
   across 6 ancestries). Plus `grant-skill-edge` (Wode + High Elf
   Glamors). Both small and high-leverage.

## Bugs uncovered (independent of Phase 2b row revisions)

These are real shipped-code bugs that the audit incidentally found.
Each is small. Folding them into the eventual damage-engine cleanup
slice (Group C) is the natural home; flagging here so they don't
get lost.

| # | Where | Bug | Canon |
|---|---|---|---|
| B1 | `packages/rules/src/stamina.ts:53` | Inert override fires at `currentStamina ≤ 0` (dying threshold) | Revenant.md:91 + heroes-flat.txt:4066-72 say inert replaces dying *at the dead threshold* (`stamina ≤ -windedValue`). Slice 1 spec said "intercept the dying transition" but canon is explicit: a Revenant with `0 ≥ stamina > -winded` should be dying (with Bleeding unless Bloodless), and only become inert at `-winded`. |
| B2 | `packages/rules/src/stamina.ts` (`applyTransitionSideEffects`) | Inert state doesn't add `Prone` condition | Canon: *"You fall prone and can't stand."* KO path adds Prone explicitly via `applyKnockOut`; inert path doesn't. |
| B3 | `packages/rules/src/stamina.ts` (`applyTransitionSideEffects`) | Dying-induced Bleeding is applied unconditionally to PCs | Revenant Bloodless (canon: *"can't be made bleeding even while dying"*) needs a suppression check. Today a Bloodless Revenant in dying state would (incorrectly) carry the Bleeding instance until removed. |
| B4 | `packages/rules/src/intents/turn.ts` (`applyEndRound`) | `triggeredActionUsedThisRound` flag is reset but **never set** | The 1-triggered-action-per-round cap from Combat.md:121 is therefore unenforced — a player could spam triggered abilities every event with no engine objection. The set point belongs inside `ExecuteTrigger`'s body (currently a no-op stub) gated on an `actionType` discriminant the ability schema doesn't yet carry. |
| B5 | `packages/data/src/parse-class.ts:419-420` | Conduit `subclasses` parses to `['Piety:', 'Prayer Effect:', 'Piety:']` | Bullet-filter only catches the literal words `piety` and `prayer effect`; actual bullets read `**Piety:** ...` so malformed Subclass records leak out. Censor's `Order` parse is correct. Conduit's actual "subclass" is a *pair* of Domains, which the schema (`CharacterSchema.subclassId: string`) can't represent regardless. |

## Detailed findings per sub-epic

### 2b.1 — ancestry-trait schema gaps

#### Dwarf *Spark Off Your Skin* — description accurate

Canon (Dwarf.md:149): *"Your stone skin affords you potent
protection. You have a +6 bonus to Stamina, and that bonus
increases by 6 at 4th, 7th, and 10th levels."* Confirmed against
heroes-flat.txt:2940-2943. Total: +6/+12/+18/+24 at levels
1/4/7/10. Current override at `ancestry-traits.ts:88` ships the
level-1 +6 only (SKIPPED-DEFERRED-PARTIAL).

**Implementation shape:** thresholds are the canonical Draw Steel
**echelons** (1/4/7/10), not arbitrary per-level scaling. Cleanest
generalization: `{ kind: 'stat-mod', stat, perEchelon: [l1, l4, l7, l10] }`
or `{ delta, scalesPerEchelon: true }`. The same shape also unblocks
Wyrmplate (Dragon Knight) and Psychic Scar (Time Raider) which today
ship only their L1 baseline value.

#### Polder *Corruption Immunity* — description misleading

Canon (Polder.md:161): *"Your innate shadow magic grants you
resilience against the unnatural. You have corruption immunity
equal to your level + 2."* Confirmed against
heroes-flat.txt:3919-3924.

**"level+N" implies a variant axis that doesn't exist.** N is
hardcoded to 2 in canon (no level+1 or level+3 ancestry trait
anywhere). The abstraction *should* be parameterised by offset
because items use it too (heroes-flat.txt:12839 — corruption
immunity = `5 + level` for an item effect, same algebraic shape,
different offset), but for the ancestry trait specifically only +2
exists.

**Implementation shape:** extend `immunity.value` from `number |
'level'` to `number | 'level' | { kind: 'level-plus', offset:
number }`. Current override (`ancestry-traits.ts:145-153`) ships
`value: 'level'`, underestimating by 2.

### 2b.3 — kit completeness (kit-side only)

#### Ranged damage bonus — not "silent at the data layer"

All 6 named kits (Arcane Archer, Cloak and Dagger, Raider, Ranger,
Rapid-Fire, Sniper) have `Ranged Damage Bonus` lines in canon that
the parser already reads (`parse-kit.ts:120` →
`rangedDamageBonusPerTier`) and the collector already emits as
`weapon-damage-bonus { appliesTo: 'ranged' }` (`collectors/kit.ts:43-49`).

| Kit | Per-tier tuple |
|---|---|
| Arcane Archer | `[2,2,2]` |
| Cloak and Dagger | `[1,1,1]` |
| Raider | `[1,1,1]` |
| Ranger | `[1,1,1]` |
| Rapid-Fire | `[2,2,2]` |
| Sniper | `[0,0,4]` |

**The actual gap is downstream**: the `RollPower` handler that
folds `runtime.weaponDamageBonus` into outcome damage may be gated
by a melee-only check that doesn't fire on the ranged branch.
Verify and fix at the read site, not in parser/collector.

#### Distance bonus — TWO flavors, AoE exclusion

Canon (Kits.md:132-136): *"A kit's melee distance bonus increases
the distance of abilities with the Melee and Weapon keywords... A
distance bonus doesn't increase the size of any ability's area of
effect."* Same line, swap "Melee" → "Ranged" for ranged distance.

Always-on flat, not per-tier. Both must NOT add to burst/cube/wall
sizes (canon-explicit).

Plus an important caveat (Kits.md:142-146): *"signature abilities
whose distance and damage already include the kit's bonuses"* —
don't double-add for signature abilities.

| Kit | Melee | Ranged |
|---|---|---|
| Arcane Archer | — | +10 |
| Cloak and Dagger | — | +5 |
| Guisarmier | +1 | — |
| Raider | — | +5 |
| Ranger | — | +5 |
| Rapid-Fire | — | +7 |
| Retiarius | +1 | — |
| Sniper | — | +10 |
| Stick and Robe | +1 | — |
| Whirlwind | +1 | — |

**Greenfield.** No schema field, no parser extraction, no runtime.
Needs `{ kind: 'weapon-distance-bonus', appliesTo: 'melee' |
'ranged', delta: number }` effect kind + targeting-layer read site
that adds `delta` to `Melee N` / `Ranged N` distances for non-signature
weapon abilities only.

#### Disengage bonus — greenfield, well-defined

Canon (Kits.md:138-141 + Combat.md:408-410): the Disengage move
action grants a 1-square shift; a disengage bonus adds extra squares
to it. Formula: `disengage_shift = 1 + sum(disengage_bonus_from_all_sources)`.

**13 of 22 v1 kits carry +1 disengage bonus**: Arcane Archer, Cloak
and Dagger, Dual Wielder, Martial Artist, Raider, Ranger,
Rapid-Fire, Retiarius, Sniper, Stick and Robe, Swashbuckler, Sword
and Board, Whirlwind. (Phase 2b row shouldn't quote a count; just
gate on `disengageBonus > 0`.)

**Greenfield.** `grep -i "disengage" packages/rules/src` returns
zero hits. Needs (a) `Kit.disengageBonus: number`, (b) parser
regex, (c) `runtime.disengageBonus: number`, (d) new `Disengage`
intent (or extend `Shift` with a disengage flag), (e) move-action
engine that consumes the runtime field, (f) suppression of OA
triggers (Disengage's whole canonical point).

#### Recommended row revision

Three explicit sub-slices rather than one umbrella:

- **2b.3.a**: ranged-damage-bonus RollPower read-site fix (parser
  + collector are already done; verify the ranged branch isn't
  gated melee-only)
- **2b.3.b**: `weapon-distance-bonus` effect kind + parser + collector
  + targeting-layer read site (melee + ranged, AoE-excluded,
  signature-aware)
- **2b.3.c**: `disengage-bonus` effect kind + parser + collector +
  new `Disengage` intent + move-action handler (full greenfield)

### 2b.4 — ancestry-trait conditional/triggered (post-items carve-out)

#### Devil *Wings* — movement-mode, not a simple condition

Canon (Devil.md:159; identical text in Dragon Knight.md:165):
*"You possess wings powerful enough to take you airborne. While
using your wings to fly, you can stay aloft for a number of rounds
equal to your Might score (minimum 1 round) before you fall. While
using your wings to fly at 3rd level or lower, you have damage
weakness 5."*

The general Fly movement-mode rule (heroes-flat.txt:666-672):
*"Fly: A movement mode available to creatures with 'fly' in their
speed entry, or who gain the capability to temporarily fly... If a
flying creature is made prone or has their speed reduced to 0, they
fall."*

**Load-bearing pieces "while flying" elides:**
- Player-elected start (you activate it; not passive)
- Hard duration = Might score rounds, after which you fall (forced
  movement / falling damage event)
- Level-3-or-lower weakness 5 is itself echelon-gated (echelon-1
  only)
- Fall trigger on `prone OR speed=0`
- Identical mechanic on Dragon Knight Wings (design must serve both)

**Implementation shape:** new `MovementMode` state on Participant
(`'ground' | 'flying' | 'shadow'`) with a `roundsRemaining`
countdown driven by `EndRound`. Or, equivalently, an
`AttachmentCondition` variant `{ kind: 'movement-mode', mode:
'flying' }` plus a participant `movementMode: { mode: 'flying',
roundsRemaining: N }` field the player toggles.

Note: this same shape covers Polder *Shadowmeld* (mode = shadow)
surfaced in the 2b.8 audit.

#### Orc *Bloodfire Rush* — first-damage-only, until-end-of-round

Canon (Orc.md:153): *"The magic coursing through your veins makes
you run faster in the heat of battle. The first time in any combat
round that you take damage, you gain a +2 bonus to speed until the
end of the round."*

**"round you took damage" understates:**
- Triggers the **first time** damage is taken (self-limiting; can't
  chain for +4)
- Lasts **until the end of the round** (not end of turn, not end of
  next turn) — round-scoped duration, distinct from anything
  currently modeled

**Implementation shape:** new participant flag with round scope:
`bloodfireActive: boolean` cleared at round start, set on damage
receipt iff not already set, contributes `+2 speed` while set.
Needs a hook in the damage pipeline + EndRound reset.

#### Revenant *Bloodless* — condition immunity, not save modifier

Canon (Revenant.md:99): *"For you, an open wound is
indistinguishable from a scratch. You can't be made bleeding even
while dying."*

**The current Phase 2b row's "save modifier" is wrong.** This is
the same shape as Dwarf *Great Fortitude* (can't be weakened),
Polder *Fearless* (can't be frightened), Orc *Nonstop* (can't be
slowed), Memonek *Nonstop* (can't be slowed), High Elf *Unstoppable
Mind* (can't be dazed), Memonek *Unphased* (can't be surprised) —
a flat **condition immunity**.

The "even while dying" clause is narrative emphasis: dying state
normally applies Bleeding automatically; this clause says it doesn't
apply *here*. (Cross-ref bug B3 above — slice 1 ships dying-Bleeding
unconditionally, ignoring this exception.)

**Implementation shape:** new effect kind `{ kind:
'condition-immunity', condition: ConditionType }`. This is the
highest-fanout shape in the ancestry-trait corpus (6+ traits across
6 ancestries). Once shipped, Bloodless is one line of override.

The actual save-modifier family is separate and not in scope for
2b.4: Devil *Impressive Horns*, High/Wode Elf *Otherworldly Grace*,
Dragon Knight *Remember Your Oath*. Different shape: `{ kind:
'save-bonus', minSuccess: number }` (canon: "you succeed on a roll
of 5/4 or higher").

### 2b.5 — damage-engine state transitions (audit)

Slice 1 shipped the state-machine substrate and it is canon-correct.
The "Death-save flow + KO/unconscious surface still open" wording
predates slice 1's correction. **Replace with the actual punch-list:**

#### Actual open items (concrete)

1. **KO 1-hour wake clock** — canon (Combat.md:669-679): heroes
   wake after 1 hour if undisturbed, spending a Recovery; director
   creatures wake after 1 hour gaining 1 Stamina. No
   `WakeFromUnconscious` intent today; same shape as inert/rubble
   12h (director-triggered cleanup is fine).
2. **Double-edge against unconscious target** — canon: *"Ability
   rolls against you have a double edge."* No consumer wiring in
   `RollPower` reads target conditions to add edge/bane tiers.
3. **Bloodless × dying-Bleeding suppression** (bug B3 above) —
   Revenant Bloodless prevents Bleeding even in dying; current code
   applies it unconditionally.
4. **`speed = 0` while unconscious** derivation review — slice 1
   note (line 90): set 'speed: 0' derived flag (not stored). Verify
   no consumer is still reading `participant.speed` directly without
   checking `staminaState === 'unconscious'`.
5. **2b.0 permissive `currentStamina > -windedValue` alive-check
   sweep** — phases.md line 166 calls this out. Grep + replace with
   `staminaState !== 'dead'`.
6. **Slice-1 PS#2 deferred items** — heal-from-unconscious clears
   Unconscious/Prone; `appliedAtSeq: 0` on engine-generated
   conditions; `ClaimOpenAction { kind: 'title-doomed-opt-in' }`
   applies the override automatically.
7. **Explicit "no death saves"** doc note in the row (canon §2.7-2.9
   are explicit: no save mechanic).

Group C is "one cleanup audit slice", not "design + ship two
sub-epics".

### 2b.6 — Q16 Revenant inert / 12h Stamina recovery

**Functionally CLOSED.** Q16 already ✅ in `docs/rules-canon.md`.
Slice 1 shipped:
- `ParticipantStateOverride { kind: 'inert', source: 'revenant',
  instantDeathDamageTypes: ['fire'], regainHours: 12, regainAmount:
  'recoveryValue' }`
- Fire-while-inert instant death
- Inert state derivation in `recomputeStaminaState`

Only 3 cleanup items, all folding into the 2b.5 audit slice:
- **Bug B1**: inert threshold should be `≤ -windedValue`, not `≤ 0`
- **Bug B2**: inert should add Prone condition
- 12h regain remains director-triggered via `ClearParticipantOverride`
  + derived `ApplyHeal { recoveryValue }` (Respite is the wrong home —
  Respite is 24h with kit-change activity; 12h regain is a different
  in-fiction event)

Recommended row revision: flip 🚧 → ✅ with cleanup-items-fold-into-2b.5.

### 2b.7 — class-feature choice pipeline (5 classes, not 2)

The current row names Conduit + Censor only. The audit found the
same shape in **5 classes total**:

| Class | Slot 1 | Slot 2 | Pattern |
|---|---|---|---|
| Conduit | Prayer (pick 1; pick up to 3 at L10) | Conduit Ward (pick 1) | 5 options + 4 options |
| Censor | Domain (pick 1 of 12) — drives 3 auto-fold features at L1/L4/L7 | — | Choice cascades into 3 derived features |
| Elementalist | Enchantment (pick 1) | Elementalist Ward (pick 1) | 5 options + 4 options |
| Talent | Psionic Augmentation (pick 1) | Talent Ward (pick 1) | 5 options + 4 options |
| Null | Psionic Augmentation (pick 1) | — | 3 options, no paired Ward |

**Verified gaps:**
- **No schema slot**: `LevelChoicesSchema` is `{ abilityIds,
  subclassAbilityIds, perkId, skillId }` — nowhere for
  `prayerId / wardId / domainId / augmentationId / enchantmentId`.
- **Most prose-only features are absent from `abilities.json`**:
  zero hits for *Prayer of Steel*, *Prayer of Distance*, *Prayer of
  Destruction*, *Prayer of Speed*, *Prayer of Soldier's Skill*,
  *Bastion Ward*, *Quickness Ward*, *Sanctuary Ward*, *Spirit
  Ward*, *Inner Light*, *Inspired Deception*, *Sanctified Weapon*,
  *Blessing of Compassion*, *Revitalizing Ritual*, *Protective
  Circle*, *Oracular Visions*, *Blessing of Comprehension*,
  *Blessing of Fortunate Weather*. Only the 4 Domain features
  SteelCompendium happens to wrap in `> ###### Name` statblock
  callouts (*Faithful Friend*, *Grave Speech*, *Hands of the Maker*,
  *Blessing of Secrets*) make it through. This is consistent with the
  `packages/data/overrides/abilities.ts` header comment.
- **Conduit "subclass" is a pair**: canon explicitly *"pick two
  domains from their portfolio. The two domains you pick make up
  your subclass"*. Current `CharacterSchema.subclassId: string`
  can't represent the pair.
- **Conduit subclass parser bug B5 above.**

**Recommended row revision:** rewrite to enumerate all 5 classes
and call out per-class slot namespace requirement.

Shape mix matters: most Prayers/Wards/Augmentations/Domain features
are **static-fold-shaped** (passive stat-mods like *Prayer of Steel*
= +6 Stamina + +1 stability) but some are **triggered/ability-shaped**
(*Quickness Ward* = shift on damage taken). The override map and the
schema slot need to support both.

### 2b.8 — ancestry signature-trait engine gaps

Walking all 12 ancestries' signature traits and classifying:

| Ancestry | Signature trait | Status today | Classification |
|---|---|---|---|
| Human | Detect the Supernatural | Narrative ability registered; engine has no detection logic | (d) permanent-defer |
| Dragon Knight | Wyrmplate | Special-cased in `ancestryChoices` path | (a) modelable today ✓ |
| Polder | Shadowmeld | Narrative ability registered only | (c) **new shape** — movement-mode mechanic (same as Wings, mode=shadow) |
| Polder | Small! | `defaultSize: '1S'` | (a) modelable today ✓ |
| Wode Elf | Glamor | Not folded | (c) **new shape** — `grant-skill-edge` |
| Revenant | Former Life | Mostly works via `formerAncestryId` | (a) modelable today (modulo cross-ancestry trait inheritance TODO) |
| Revenant | Tough But Withered | Immunities fold; fire weakness 5 special-cased; inert handled by slice 1 | (a) modelable today ✓ |
| Orc | Relentless | Not folded | (b) needs 2b.4 runtime-eval seam — triggered on entering dying |
| Dwarf | Runic Carving | Not folded | (d) permanent-defer (out-of-combat utility) |
| Devil | Silver Tongue | Skill grant supported; player-pick UX may be missing | (a) modelable today (minor UX) |
| High Elf | Glamor | Not folded | (c) **new shape** — `grant-skill-edge` (one skill-group only) |
| Hakaan | Big! | `defaultSize: '1L'` | (a) modelable today ✓ |
| Memonek | Fall Lightly | Not folded | (b) needs 2b.4 runtime-eval seam — triggers on falling event |
| Memonek | Lightweight | Not folded | (b) needs 2b.4 runtime-eval seam — size substitution in forced-move resolution |
| Time Raider | Psychic Scar | `grantedImmunities` in ANCESTRY_OVERRIDES | (a) modelable today ✓ |

**Bucket totals:**
- (a) modelable today / shipped: 7
- (b) needs 2b.4 runtime-eval seam: 3 (Relentless, Fall Lightly, Lightweight)
- (c) needs a new effect/condition shape not in any current 2b row: 3 (Polder Shadowmeld movement-mode; Wode + High Elf Glamors `grant-skill-edge`)
- (d) permanent-defer: 2 (Detect Supernatural, Runic Carving)

**Newly surfaced engine shapes not in any current Phase 2b row:**

1. **`condition-immunity`** — 6+ traits across 6 ancestries
   (Bloodless, Great Fortitude, Fearless ×2, Nonstop ×2, Unstoppable
   Mind, Unphased). Highest-fanout shape in the corpus.
2. **`grant-skill-edge`** — 2 traits (Wode + High Elf Glamors).
3. **`movement-mode`** — covers Devil/Dragon Knight Wings AND
   Polder Shadowmeld. Same primitive, different mode values.

All three are small effects with clear semantics; their absence from
the Phase 2b row table is the gap, not the engine work itself.

### 2b.9 — cross-side trigger ordering audit (§4.10)

**Canon (Combat.md:119-127)** is silent on cross-side ordering. It
only specifies intra-side: PCs decide among themselves, then
Director decides among Director-controlled creatures. Slice 1's
Q10 ruling ("Director picks cross-side") is canon-defensible, not
contradicting.

**Engine state today** is dramatically less than "🟡 partially shipped":

- **Cross-side modal is DEAD CODE.** `encounter.pendingTriggers` is
  never set to a non-null value anywhere in `packages/`. No event
  producer ever queries which creatures have an applicable triggered
  ability and constructs a `PendingTriggerSet`. The modal exists
  but never renders in production.
- **`ExecuteTrigger` is a no-op STUB** (`packages/rules/src/intents/execute-trigger.ts`) — logs only, doesn't dispatch the underlying ability effect. Even if a tie surfaced today, the picked order would resolve to log lines.
- **1-triggered-action-per-round cap unenforced** (bug B4 above) — flag declared, reset at EndRound, but never SET to true.
- **Free vs costly discriminant doesn't exist in ability data** — only `raw` markdown carries the "Triggered" / "Free Triggered" tag. The schema gap blocks the gate.
- **Dazed/surprised/unconscious gating not enforced** — canon: dazed prevents triggered actions. No consumer.
- **Opportunity attacks** consume free-triggered-action quota per canon (Combat.md:555); no OA reducer exists in `packages/rules/src/intents/`.
- **Chained triggers** untested because cascade entry is missing.

Three practical canon-trigger examples (Fury *Lines of Force* vs
Hakaan *Lightning Nimbleness*; Shadow *In All This Confusion* vs
free-triggered half-damage; Tactician *Word of Judgment* vs Censor
*Word of Guidance*) all confirmed: **engine silently does nothing,
director must manually dispatch the underlying abilities.**

**Recommended row revision:** reframe from "audit needed to confirm
full §4.10 coverage" to "cascade producer + 1/round cap + `actionType`
discriminant + dazed/surprised gating + `ExecuteTrigger` body — all
missing; what's shipped is the resolution mechanism for a flow that
does not yet trigger."

Cleanest sequencing: ability-data `actionType` discriminant first,
then `ExecuteTrigger` body + 1/round set point, then trigger emitter
in the relevant event reducers, then dazed/surprised gating consumer.

## What changes in the shipping grouping

Pre-audit:
- **A** (slice 2c): 2b.4 ancestry-trait subset (Wings, Bloodfire, Bloodless)
- **B**: 2b.1 + 2b.3 + 2b.8 (schema completeness batch)
- **C**: 2b.5 + 2b.6 damage engine
- **D**: 2b.7 class-feature pipeline
- **F**: 2b.9 trigger ordering audit

Post-audit recommendation:
- **A** (slice 2c): 2 attachments needing runtime-eval seam (Wings,
  Bloodfire) — Bloodless reclassifies as a trivial
  `condition-immunity` effect kind belonging in Group B
- **B**: 2b.1 + 2b.3 (three sub-slices: ranged-fix, distance, disengage)
  + 2b.8 (now concrete: condition-immunity, grant-skill-edge,
  movement-mode shapes + the three Group-A-overlap traits + the two
  modelable-today traits Bloodless slots into) — meaningfully bigger
- **C**: shrinks to "one damage-engine cleanup slice" with bugs B1-B3 + open punch-list
- **D**: expands to 5 classes, per-class slot namespace from day one
- **F**: expands significantly — full trigger-cascade producer + cap-enforcer + actionType discriminant + dazed/surprised gating, not just an audit

Whether to actually move Bloodless out of slice 2c into Group B is
a design call: it doesn't need the runtime-eval seam (it's static),
but it shares the ancestry-trait theme. Leaving the call to the
slice-2c brainstorm resumption.

## Files referenced

Phase docs:
- `docs/phases.md` — Phase 2b sub-epic table (updated 2026-05-16 per
  this audit)
- `docs/rules-canon.md` — §2.7-2.9, §3.5.1, §4.10, §10.16, Q16 entry
- `docs/rule-questions.md` — Q10, Q11, Q16, Q18
- `docs/superpowers/specs/2026-05-15-pass-3-slice-1-damage-state-machine-design.md`
- `docs/superpowers/specs/2026-05-15-pass-3-slice-2a-class-delta-and-open-actions-design.md`

Canon sources read:
- `.reference/data-md/Rules/Chapters/Combat.md` (§§ 2.7-2.9, §3.5.1, §4.10)
- `.reference/data-md/Rules/Chapters/Kits.md`
- `.reference/data-md/Rules/Ancestries/*.md` (all 12)
- `.reference/data-md/Rules/Classes/{Censor,Conduit,Elementalist,Null,Talent}.md`
- `.reference/core-rules/heroes-flat.txt` (printed Heroes Book v1.01)

In-repo code touched (read-only audit):
- `packages/shared/src/{participant,character,condition}.ts`
- `packages/shared/src/data/{attachment,kit}.ts`
- `packages/rules/src/{stamina,attachments/apply}.ts`
- `packages/rules/src/intents/{turn,resolve-trigger-order,execute-trigger,apply-damage}.ts`
- `packages/data/src/{parse-kit,parse-class}.ts`
- `packages/data/overrides/{ancestry-traits,ancestries,items,abilities}.ts`
- `packages/rules/src/attachments/collectors/kit.ts`
- `apps/web/src/pages/combat/triggers/CrossSideTriggerModal.tsx`
- `apps/web/public/data/abilities.json` (verified parser output)
