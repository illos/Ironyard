# Rules canon

The engine's source of truth for Draw Steel mechanics. Every mechanical claim cites a location in `.reference/data-md/` (a local clone of [github.com/SteelCompendium/data-md](https://github.com/SteelCompendium/data-md), which mirrors the Heroes Book published by MCDM). When the rulebook and this doc disagree, **the rulebook wins** — fix this doc.

Versioning: this doc tracks the SteelCompendium pin recorded in `packages/data/sources.json`. Bumping the pin is also a chance to re-verify this doc.

Interpretive decisions, deferred ambiguities, and source contradictions are logged in [`rule-questions.md`](rule-questions.md). Any canon entry that rests on a judgment call rather than a verbatim rule cites the relevant `Q#`.

## Workflow — how rules enter and change in this doc

Every entry passes two gates before it is in canon. A rule is **not** authoritative until both have cleared.

1. **Gate 1 — Source check.** The drafter (often Claude) reads the cloned source at `.reference/data-md/`, cites the exact file path and line numbers, and quotes or faithfully paraphrases the rulebook. Citations must be reproducible — no "I remember it works this way," no web summarizers, no rulebook reconstruction from class examples alone.
2. **Gate 2 — Manual review.** A human reads the entry against the rulebook and confirms. Only after that explicit confirmation does the entry's status flip to ✅.

**Editing an existing ✅ entry resets it to 🚧 and re-runs gate 2.** Same rules, no shortcuts. A previously-verified rule that gets touched must be re-verified.

**The engine respects the gate.** Code in `packages/rules` may automate behavior only for ✅ entries. Anything 🚧 or ⛔ is manual-override only — the reducer surfaces a question to the user instead of guessing. This is enforced by reading the section status from this doc (or a derived registry) rather than by trusting the engine author to remember.

### Section status legend

- ✅ **verified** — passed both gates; engine may automate
- 🚧 **drafted, awaiting verification** — passed gate 1, not gate 2; engine treats as manual-override
- ⛔ **TBD** — not drafted; engine treats as manual-override

| § | Topic | Status |
|---|-------|--------|
| 1 | Power rolls (resolution) | ✅ |
| 2 | Damage application | ✅ |
| 3 | Conditions | ✅ |
| 4 | Action economy | ✅ |
| 5 | Heroic resources & surges | ✅ |
| 6 | Forced movement | ✅ |
| 7 | Saves, resistances, tests | ✅ |
| 8 | Encounter math (victories, EV) | ✅ |
| 9 | Character derivation (Phase 2) | ✅ |
| 10 | Character attachment activation (Phase 2 Epic 2B) | 🚧 |

---

## 1. Power rolls (resolution) ✅

> **Source:** `.reference/data-md/Rules/Chapters/The Basics.md` lines 109–195. Sections quoted: **Power Rolls**, **Edges and Banes**, **Bonuses and Penalties**, **Automatic Tier Outcomes**, **Downgrade**, **Natural Roll**.

### 1.1 The roll

A power roll is `2d10 + characteristic`. The characteristic is one of `Might | Agility | Reason | Intuition | Presence`, score range `−5..+5`. The two d10s are numbered 1–10 (some dice number 0–9, where 0 counts as 10) — the engine treats each die as `1..10` inclusive.

Two flavors:
- **Ability roll** — using an ability with a tier ladder. In intents: `RollPower`.
- **Test** — attempting an uncertain task outside an ability. In intents: `RollTest`.

### 1.2 Tier thresholds

| Total | Tier |
|-------|------|
| ≤ 11  | t1   |
| 12–16 | t2   |
| ≥ 17  | t3   |

### 1.3 Natural 19/20

The **natural roll** is the sum of the two d10s before any modifiers. A natural 19 or 20 is **always tier 3**, regardless of modifiers (but see [Q3](rule-questions.md#q3-resolution-order--natural-1920-vs-automatic-tier-outcomes-) for the interaction with automatic-tier outcomes — auto-tier wins on the tier value). A nat 19/20 on a **test** is a critical success (§ 7.2); on a **Strike or ability power roll for an ability that uses an action**, it is a critical hit and grants the actor an extra main action (§ 1.9). See [Q5](rule-questions.md#q5-is-a-natural-1920-always-a-critical-hit-or-only-on-certain-rolls-) for the rule resolution.

### 1.4 Edges and banes

Edges and banes each cap at 2. Cancellation runs first; the *net* result determines the effect:

| Net edges | Net banes | Resolves to |
|-----------|-----------|-------------|
| 1         | 1         | none |
| 2+        | 2+        | none |
| 2+        | 1         | one edge |
| 1         | 2+        | one bane |
| n (1 or 2)| 0         | n edges |
| 0         | n (1 or 2)| n banes |

Effects:

| Net result   | Effect |
|--------------|--------|
| **One edge** | +2 to the total |
| **One bane** | −2 to the total |
| **Double edge** (2+ net) | No bonus to total. After the tier is determined, **bump up one tier** (max t3). |
| **Double bane** (2+ net) | No penalty to total. After the tier is determined, **drop one tier** (min t1). |

> **Engine note:** double edge/bane is a *tier shift*, not a ±4 modifier. This is the load-bearing correction over the previous spec draft.

### 1.5 Bonuses and penalties

Distinct from edges and banes:
- Numeric. No cap on count. Always sum.
- Applied to the total **before** edges and banes.
- Sources are specified by the rule that imposes them; skills are the most common.

### 1.6 Automatic tier outcomes

Some effects grant an automatic tier 1, 2, or 3. They **supersede** edges, banes, bonuses, and penalties — and per [Q3](rule-questions.md#q3-resolution-order--natural-1920-vs-automatic-tier-outcomes-) they also win on the tier value against a natural 19/20. The roll is still made — natural-19/20 detection and crit detection still run, and the crit's side effects (e.g. bonus action) fire on a nat 19/20 even when auto-tier forces a different tier — but the *tier* is the auto-tier value.

If multiple automatic outcomes apply:
- **Different tiers** from different effects → all cancel, ignore them.
- **Same tier** from multiple effects → that tier applies.

### 1.7 Downgrade

The roller may always *choose* a lower tier than the one rolled (e.g. take t2 instead of t3) if the lower-tier effect is preferable. A downgraded critical hit still grants the crit's extra-action benefit (§ 1.9). Voluntary downgrade is applied **after** every other tier-setting rule, including auto-tier and natural-19/20 — see [Q4](rule-questions.md#q4-voluntary-downgrade-applies-after-all-overrides-).

### 1.8 Engine resolution order

The engine resolves a power roll in this fixed order. Implementations must match:

1. `natural = d10[0] + d10[1]`
2. `total = natural + characteristic + sum(bonuses) − sum(penalties)`
3. Cancel edges and banes per § 1.4 to produce `netEdges ∈ {0,1,2}` and `netBanes ∈ {0,1,2}` (one of them is always 0 after cancellation).
4. If `netEdges == 1`: `total += 2`. If `netBanes == 1`: `total -= 2`.
5. Determine `baseTier` from `total` per § 1.2.
6. If `netEdges >= 2`: `tier = min(t3, baseTier + 1)`. Else if `netBanes >= 2`: `tier = max(t1, baseTier - 1)`. Else: `tier = baseTier`.
7. If `natural ∈ {19, 20}`: `tier = t3` (overrides step 6).
8. If an automatic tier is in play (§ 1.6): replace `tier` with the auto-tier value per its multi-effect rules. Per [Q3](rule-questions.md#q3-resolution-order--natural-1920-vs-automatic-tier-outcomes-), auto-tier wins over step 7's nat-19/20 tier override — but the crit's *side effects* still fire (see step below).
9. If the roller chooses to downgrade (§ 1.7): replace `tier` with the chosen lower tier. Per [Q4](rule-questions.md#q4-voluntary-downgrade-applies-after-all-overrides-), this is always the final step.

Critical-hit detection runs alongside steps 7–9 and is orthogonal to the final tier: when the conditions in § 1.9 are met, the crit's side effects (extra-action benefit) fire on `natural ∈ {19, 20}` regardless of whether auto-tier or downgrade changed the final tier.

### 1.9 Critical hits ✅

> **Source:** user-quoted printed Heroes Book (recorded conversation 2026-05-10); see [Q5](rule-questions.md#q5-is-a-natural-1920-always-a-critical-hit-or-only-on-certain-rolls-) for the rule text and the resolution process. Cross-references: `Combat.md:142` (downgrading a crit), `Combat.md:193` (additional effects alongside auto-tier).

**Rule.** "When you roll a natural 19 or 20 on a Strike or ability power roll on an ability that uses an action, you can immediately take another action."

#### 1.9.1 What is a critical hit (vs. critical success)

Natural 19/20 has three different consequences depending on roll type:

| Roll type                                                                  | Effect on tier | Crit-hit "another action"? | Term         |
|----------------------------------------------------------------------------|----------------|----------------------------|--------------|
| **Test** (easy / medium / hard)                                            | Always success-with-a-reward (§ 7.2) | No | **Critical success** |
| **Strike or ability power roll** — ability **uses an action**              | Tier 3 (or auto-tier if applicable, per Q3) | **Yes** | **Critical hit** |
| **Strike or ability power roll** — ability used as maneuver / free action  | Tier 3 (or auto-tier if applicable)    | No | (no special term) |

The tier-3 force is universal (§ 1.3). The "extra action" benefit is *conditional* on (a) it being a Strike or ability power roll and (b) the ability being used as "an action."

#### 1.9.2 What "an ability that uses an action" means

In Draw Steel's action-economy vocabulary (§ 4), "action" generally refers to a **main action** specifically — distinct from a maneuver, a move action, a triggered action, a free triggered action, or a free maneuver.

So crit-hit applies when the underlying ability's category is **Main action**, including:

- Class abilities used as main actions (e.g. conduit's Judgment's Hammer).
- Strikes (the Melee Weapon Free Strike, Ranged Weapon Free Strike, and class strike abilities — all categorized as Main action).
- The Charge main action's free strike at the end of the move.

It does **not** apply when:

- The roll is for an ability whose category is Maneuver (Grab, Knockback, Escape Grab, Aid Attack, etc.).
- The roll is for a test (§ 7).

**Engine sub-call on opportunity attacks.** An opportunity attack uses a Melee Weapon Free Strike (a Main action ability) but is dispatched as a free triggered action via the opp-attack rule (§ 4.8). The ability's *category* is still Main action, so a nat-19/20 on an opp attack **does** trigger crit-hit. Reasoning: "an ability that uses an action" naturally reads as "an ability whose category is action," not "an ability currently being paid for with a main action." This is also the higher-fun reading (nat-20 off-turn opp attacks should feel exciting). Flag for revisit if play contradicts.

#### 1.9.3 Benefit — "take another action"

The crit-holder may **immediately take another action**. Engine reads this as:

- Another **main action**, granted as a bonus on top of the actor's normal turn budget (or, if off-turn, as a bonus main action they would not otherwise have).
- "Immediately" — dispatched as a derived intent before the current ability's downstream effects finish or before turn order resumes. The actor takes the extra action as soon as the current ability's effects resolve.
- The benefit is **voluntary** — the actor may decline. Engine surfaces it as an option; default UI presents the choice.

If the off-turn case applies (e.g. nat-19/20 on an opp attack), the actor takes their bonus main action immediately, then the original turn order resumes after that action completes.

#### 1.9.4 Interactions

- **Auto-tier (§ 1.6 / Q3).** An auto-tier-1 effect overrides the tier-3 force on a nat 19/20. But Combat.md:193 specifically says additional effects fire alongside auto-tier outcomes ("you can still make the roll to determine if you obtain the additional effect in addition to the automatic outcome"). The crit-hit "extra action" is one such additional effect, and fires even when auto-tier locks the tier to 1.
- **Voluntary downgrade (§ 1.7 / Combat.md:142).** Downgrading a critical hit preserves the extra-action benefit. The downgrade only changes the *tier* of the effect, not whether the crit-hit fires.
- **Recursion.** A crit on the extra main action grants *another* extra action. The rule is unrestricted as written. Engine: track each extra-action chain; surface to the table if it goes more than a couple deep (a nat-20 chain of 3+ extras is dramatic enough to want the table seeing it loud).

#### 1.9.5 Engine dispatch

After resolving a `RollPower` per § 1.8:

1. Detect: `natural ∈ {19, 20}` AND ability is a Strike or ability power roll AND ability category is `MainAction`.
2. If detected, after dispatching the tier's effects, emit a derived `GrantExtraAction { actorId, source: <thisIntentId>, kind: 'crit-hit' }` intent.
3. The actor's controller decides whether to use the extra action. If used, it's a normal main-action dispatch but flagged in the log as crit-extra.

---

## 2. Damage application ✅

> **Source:** `.reference/data-md/Rules/Chapters/Combat.md` lines 609–700 (Damage, Stamina, Recoveries, Winded, Dying, Knock-out, Temporary Stamina, Object Stamina). Rounding rule from `.reference/data-md/Rules/Chapters/The Basics.md` lines 233–235.

### 2.1 Damage types

Damage is either **typed** or **untyped**.

- **Untyped** ("Typical damage" — weapons, falling, traps, claws). The default. No type interactions.
- **Typed**, drawn from this closed set: `acid · cold · corruption · fire · holy · lightning · poison · psychic · sonic`.

Plus `untyped` as a sentinel, the engine enum is 10 values. This matches `data-pipeline.md`'s declared enum (Q6 covers the interaction model when a single source deals more than one type).

### 2.2 The damage modifier pipeline

Order of operations on a single damage source, per rulebook:

1. **Base damage.** Comes from the ability's tier outcome (`8 fire`, `5 untyped`, etc.).
2. **External modifiers.** Triggered actions and effects that reduce or modify the raw amount — e.g. a tactician's `Parry` halves incoming damage. Apply these *before* weakness/immunity. (Combat.md:625 example.)
3. **Weakness.** If the target has weakness of the matching type, add the highest applicable value. (Combat.md:635.)
4. **Immunity.** If the target has immunity of the matching type, subtract the highest applicable value, minimum 0. If immunity is `all` for that type, the result is 0. **Immunity is always the last step.** (Combat.md:625.)
5. **Apply to stamina.** Drain temporary stamina first, then current stamina (§ 2.5).

**Rounding.** Whenever a step halves an odd number, round down (The Basics.md:233–235; rulebook example: 7 halved by Parry → 3, not 3.5 and not rounded up).

### 2.3 Damage immunity

Combat.md:619–627.

- May be typed (`fire immunity 5`) or universal (`damage immunity 5`).
- Numeric value: reduces matching damage by that amount, min 0.
- Special value `all`: target ignores all damage of the indicated type (e.g. `psychic immunity all`).
- Universal immunity applies to *every* damage type, including typed damage; if a typed-specific immunity is also present, only the **higher of the two values applies** (not both). Rulebook example: `damage immunity 5` + `fire immunity 10`, taking 12 fire → reduce by 10.
- Immunity is the last reduction in the pipeline (§ 2.2 step 4).

### 2.4 Damage weakness

Combat.md:629–637.

- May be typed (`fire weakness 5`) or universal (`damage weakness 5`).
- Numeric value: adds to matching damage.
- If multiple weaknesses apply to one source, only the highest applies (parallel to immunity).
- Weakness is applied **before** immunity (Combat.md:635). When a creature has both for a single source, the order is: base → external modifiers → weakness → immunity.

### 2.5 Temporary stamina

Combat.md:681–689.

- Separate pool from stamina. Not included in stamina maximum.
- **Doesn't count toward** recovery value or winded value calculations (§ 2.7).
- **Doesn't change** winded, dying, or dead states. If you have 0 stamina and gain 10 temp stamina, you are still dying.
- **Damage drains temp stamina first.** Excess overflows to stamina. Example: 10 temp + 16 incoming → 0 temp, -6 stamina.
- **No max** on temp stamina amount, but does not stack: gaining more temp stamina takes the higher of the two values, not the sum.
- **Cannot be restored** by regaining stamina — only granted explicitly by abilities/items.
- **Disappears at end of encounter** unless otherwise specified.

### 2.6 Stamina state

A character has, conceptually:

- `staminaMax` — the base maximum, class-determined.
- `currentStamina` — the present value, can go negative (heroes only, until death).
- `staminaMaxReduction` — accumulated reductions to the cap. Effective max = `staminaMax - staminaMaxReduction`. Regained stamina cannot exceed effective max.
- `tempStamina` — separate pool, see § 2.5.

Combat.md:643: "Some effects can also reduce your Stamina maximum, limiting the amount of Stamina you can regain." The base max is fixed; the reduction is a separate tracked quantity that effects can apply and remove.

### 2.7 Winded

Combat.md:649–653.

- `windedValue = floor(staminaMax / 2)`.
- The character is **winded** while `currentStamina ≤ windedValue` and `currentStamina > 0` (heroes), or `currentStamina ≤ windedValue` and `currentStamina > 0` for any creature. (Dying is a separate state for stamina ≤ 0; see § 2.8.)
- Winded itself has **no inherent effect**. It's a flag that other abilities key on ("when winded, …").
- Winded state is **visible** to other creatures.
- Winded value uses **base** `staminaMax`, not the effective max after reduction — see [Q7](rule-questions.md#q7-winded-value-computed-from-base-stamina-max-or-effective-max-). Same applies to recovery value in § 2.10.

### 2.8 Dying and death

Combat.md:655–667.

**For heroes:**

- `currentStamina ≤ 0` → **dying.**
  - Cannot use Catch Breath in combat.
  - Has the **Bleeding** condition (cannot be negated or removed by any means while dying).
  - Can still act on their turn; allies can help them spend Recoveries in combat; can spend Recoveries out of combat.
- `currentStamina ≤ -windedValue` → **dead.**
  - Cannot be revived without a special item (e.g. Scroll of Resurrection).
  - Example: hero with staminaMax 30 → windedValue 15 → death at stamina ≤ -15.

**For Director-controlled creatures:**

- Default: die / destroyed at `currentStamina ≤ 0`.
- They don't have Recoveries (Combat.md:667). If an ability lets them spend a Recovery anyway, they regain `floor(staminaMax / 3)` instead.

### 2.9 Knock-out / unconscious

Combat.md:669–679.

- When damage would kill a creature, the attacker can **choose** to knock them unconscious instead.
- Unconscious creature:
  - Cannot take main actions, maneuvers, triggered actions, free triggered actions, or free maneuvers.
  - `speed = 0`.
  - Unaware of surroundings.
  - Is **prone**.
  - Ability rolls against them have a **double edge** (which means a tier shift up per § 1.4 — engine note).
  - If they take damage while unconscious in this way, they die.
- Duration: 1 hour if no one wakes them.
  - **Hero:** after 1 hour, can spend a Recovery to wake; if no Recoveries, can't wake until respite.
  - **Director creature:** after 1 hour, gains 1 stamina and wakes.
- Waking up: can stand from prone as a free maneuver.

### 2.10 Recoveries

Combat.md:645–647.

- `recoveryCount` — class-determined per-character pool.
- `recoveryValue = floor(staminaMax / 3)`.
- **Catch Breath maneuver** in combat: spend 1 Recovery, regain `recoveryValue` stamina.
- **Out of combat:** can spend as many Recoveries as remain.
- Some abilities allow spending a Recovery for `recoveryValue + bonus`, or regaining stamina without spending a Recovery. These are per-ability and not the default.

### 2.11 Object stamina

Combat.md:691–700. (Engine-relevant for destructible terrain in Phase 4+; not load-bearing for Phase 1.)

- Objects have stamina based on material. Per size-1 square: glass 1, wood 3, stone 6, metal 9.
- At stamina 0, the object is destroyed.
- Default immunities: `poison immunity all`, `psychic immunity all` (Director can remove for living objects like plants).

### 2.12 Engine resolution order

For a single damage source applied to one target:

1. `base = <ability's damage at the rolled tier>` (e.g. tier 2 outcome of the ability)
2. Apply pre-immunity external modifiers in dispatch order (e.g. ally's Parry halves: `amount = floor(amount / 2)`)
3. If `damageType` matches a weakness on the target: `amount += highestApplicableWeakness.value`
4. If `damageType` matches an immunity on the target:
   - If `immunity.value === 'all'`: `amount = 0`
   - Else: `amount = max(0, amount - highestApplicableImmunity.value)`
5. If `amount > 0` and `target.tempStamina > 0`:
   - `tempDrain = min(target.tempStamina, amount)`
   - `target.tempStamina -= tempDrain`
   - `amount -= tempDrain`
6. `target.currentStamina -= amount`
7. **Recompute target's stamina state:**
   - If hero and `currentStamina ≤ -windedValue`: dead. Emit `Died` log.
   - Else if `currentStamina ≤ 0`: dying. Apply Bleeding (if hero) or Destroyed (if director creature).
   - Else if `currentStamina ≤ windedValue`: winded.

Multi-type single source (e.g. ability deals `8 fire + 4 cold`) — engine call per [Q6](rule-questions.md#q6-multi-type-damage-from-a-single-source-): run steps 1–4 independently per typed clause, then sum results, then proceed to step 5.

Damage applied to an object: skip steps 5–7 (objects have no temp stamina); on `currentStamina ≤ 0`, dispatch `ObjectDestroyed`.

## 3. Conditions ✅

> **Source:** `.reference/data-md/Rules/Chapters/Classes.md` lines 442–494 (the canonical list). Per-condition files at `.reference/data-md/Rules/Conditions/<Condition>.md` mirror the same text. Duration and saving-throw mechanics: `.reference/data-md/Rules/Chapters/Introduction.md` lines 267, 485, 487 and `Classes.md` lines 404–408.

### 3.1 What a condition is

A **condition** is a named, formally-defined negative effect that abilities and effects can apply to a creature. There are exactly **9 conditions** in the closed set:

`Bleeding · Dazed · Frightened · Grabbed · Prone · Restrained · Slowed · Taunted · Weakened`

A condition is binary: a creature either has it or doesn't (see § 3.4 on stacking). Each condition is independent of the others — a creature can be Slowed and Weakened simultaneously.

Conditions are distinct from class-specific statuses like the Talent's **Strained** state — see [Q2](rule-questions.md#q2-strained-as-engine-status-vs-draw-steel-condition-). The engine treats those as separate state, not as members of the conditions registry.

### 3.2 Durations

A condition is applied with a duration. The four observed forms:

- **`EoT` (end of next turn).** "An effect that lasts until the end of the affected creature's next turn." (Introduction.md:267.) Engine: ends at the *end* of the affected creature's *next* turn. If the affected creature has already finished their current turn when the condition is applied, "next turn" means the following round's turn.
- **`save_ends` ("(save ends)").** Lasts until the affected creature succeeds on a saving throw or the encounter ends, whichever first. (Introduction.md:485.) See § 3.3.
- **`until_start_next_turn`.** "Until the start of [someone]'s next turn." Used by Defend and similar effects (Combat.md:533). The relevant "someone" is named by the imposing ability.
- **`end_of_encounter`.** Default if no other duration is specified for the imposition. Any condition still on a creature at end of encounter ends automatically.

Conditions can also end via specific in-game triggers (e.g. Grabbed ends if either creature teleports or is force-moved apart, § 3.5). These trigger-driven ends are condition-specific and listed in § 3.5.

### 3.3 Saving throws

Classes.md:404–408 and Introduction.md:485, 487.

- A `save_ends` effect prompts the affected creature to make a saving throw **at the end of each of their turns** while the effect is on them.
- Mechanic: roll **1d10**. On a **6 or higher**, the effect ends. Otherwise it continues.
- The save is per-effect: each `save_ends` effect rolls its own d10 at end of turn — see [Q9](rule-questions.md#q9-saving-throws--per-effect-or-per-turn-).
- Saves are not power rolls — no characteristic, no edges/banes, just a d10 with a fixed DC of 6.
- Some abilities (e.g. Heal action) let a creature attempt an out-of-cycle saving throw. The same d10 ≥ 6 mechanic applies.

> **Engine note.** Saves are dispatched as a `RollResistance` intent per the intent taxonomy. The `rolls` payload carries the d10 value (per § 1's dispatcher-pre-rolls model). The reducer checks ≥ 6 and ends the effect on success.

### 3.4 Stacking

The rulebook explicitly addresses stacking for **Frightened** (Classes.md:458) and **Taunted** (Classes.md:490): a new imposition from a *different source* **replaces** the old one. The other seven conditions have no explicit stacking rule.

**Engine call (see [Q8](rule-questions.md#q8-condition-stacking-)):** all 9 conditions are **binary per creature**. Multiple impositions from different sources don't compound the effect. Per-source duration tracking does still happen — see below.

What "binary" means concretely:

- A creature is either Bleeding or not. Bleeding from two sources still causes the 1d6 + level damage **once per qualifying action**, because the source rule explicitly says "only happens once per action" (Classes.md:448).
- Same for Slowed (speed becomes 2; you don't speed-cap to 1 if two sources slow you), Weakened (one bane on power rolls, not two), etc.
- Per-source duration tracking: if Source A imposes Bleeding (EoT) and Source B imposes Bleeding (save ends), the creature is Bleeding while *any* source is still active. Source A ends at end-of-next-turn; Source B persists until a save succeeds. Bleeding ends when no source remains.
- For Frightened and Taunted, the rulebook explicit rule ("new replaces old") overrides the per-source tracking. New imposition replaces all prior tracking, full stop.

### 3.5 The 9 conditions

#### 3.5.1 Bleeding

While Bleeding, whenever the creature uses a **main action**, uses a **triggered action**, or makes a **test or ability roll using Might or Agility**, they lose Stamina equal to **`1d6 + their level`** after the action / roll is resolved. The Stamina loss cannot be prevented in any way, and only fires **once per action** even if multiple triggering events would qualify. (Classes.md:448.)

Damage triggers even off-turn (e.g. a signature ability used as a free triggered action via tactician's Strike Now triggers Bleeding damage). (Classes.md:450.)

**Special case — dying:** When a hero reaches `currentStamina ≤ 0` they automatically gain Bleeding (see § 2.8). This instance of Bleeding **cannot be negated or removed by any means** until the hero is no longer dying. (Combat.md:657.) Engine: this instance carries a `removable: false` flag; the standard removal paths (save, encounter end, ally action) skip it.

#### 3.5.2 Dazed

A Dazed creature can do **only one** of the following on their turn: a main action, a maneuver, or a move action. They cannot use triggered actions, free triggered actions, or free maneuvers. (Classes.md:454.)

Engine: the action-economy gate (§ 4 TBD) consults the Dazed flag to constrain available actions.

#### 3.5.3 Frightened

Has a **source** (the creature or effect that imposed it). While Frightened:

- The Frightened creature's ability rolls **against** the source take a bane.
- If the source is a creature, that creature's ability rolls **against the Frightened creature** gain an edge.
- The Frightened creature **cannot willingly move closer** to the source if they know the source's location.
- **Replace-not-stack:** new Frightened from a different source replaces the old one. (Classes.md:458.)

Engine: condition state includes `sourceId` (the imposer). Edge/bane application reads `sourceId` when computing edges/banes for the affected creature's rolls.

#### 3.5.4 Grabbed

Has a **grabber** (the creature, object, or effect that has the creature grabbed). While Grabbed:

- `speed = 0`.
- Cannot be force-moved **except** by the grabber.
- Cannot use the **Knockback** maneuver.
- Takes a **bane** on abilities that don't target the grabber.

The grabber:

- Can move the grabbed creature into an adjacent unoccupied space by spending a maneuver. (Classes.md:464.)
- If the grabber moves, the grabbed creature moves with them.
- If the grabber's size ≤ the grabbed creature's size, **grabber's speed is halved** while the grab is maintained.

The grabber can release the grabbed creature at any time, no action required. The grabbed creature can attempt to escape via the **Escape Grab** maneuver (§ 4 TBD).

**Trigger-driven end:** the Grabbed condition ends if the grabbed creature teleports, or if either creature is force-moved such that they're no longer adjacent. (Classes.md:466.)

**Imposing the grab:** a creature can only grab creatures of their size or smaller. With Might ≥ 2, they can grab a larger creature up to size equal to their Might score. (Classes.md:468.) A creature can grab at most **one** creature at a time unless otherwise indicated. (Classes.md:470.)

#### 3.5.5 Prone

While Prone:

- The creature's **strikes** take a bane.
- **Melee abilities used against them** gain an edge.
- They must crawl: each square of movement on the ground costs **1 additional square**.
- They cannot climb, jump, swim, or fly.
- If they were climbing/flying/jumping when knocked Prone, they **fall**.

Standing up: the **Stand Up** maneuver (unless the imposing ability says otherwise). An adjacent willing creature can use Stand Up to lift a willing Prone creature. (Classes.md:476.)

#### 3.5.6 Restrained

While Restrained:

- `speed = 0`.
- Cannot use the **Stand Up** maneuver.
- Cannot be force-moved.
- Takes a **bane** on ability rolls and on Might and Agility tests.
- Abilities used against them **gain an edge**.

**Trigger-driven end:** Restrained ends if the affected creature teleports. (Classes.md:482.)

#### 3.5.7 Slowed

While Slowed: `speed = 2` unless their speed is already lower (then no change). The creature **cannot shift**. (Classes.md:486.)

Engine note: the "cannot shift" component is an action-economy gate, not a speed reduction — a Slowed creature with a shift move action available cannot use it. (See § 4 TBD for shift mechanics.)

#### 3.5.8 Taunted

Has a **taunter** (the creature who applied the condition). While Taunted, with **line of effect** to the taunter:

- The creature takes a **double bane** on ability rolls for any ability that **doesn't target** the taunter. (Per § 1.4 cancellation rules, the engine resolves this as a 2-bane contribution from one source.)
- **Replace-not-stack:** new Taunted from a different source replaces the old one. (Classes.md:490.)

If line of effect to the taunter is broken, the bane suspends but the condition itself doesn't end (the LoE check is part of the bane's trigger, not the condition's duration).

#### 3.5.9 Weakened

While Weakened: the creature takes a **bane** on **power rolls** (both ability rolls and tests). (Classes.md:494.)

### 3.6 Engine implications

The engine maintains, per creature, a set of active condition instances. Each instance carries:

```
{
  type: 'Bleeding' | 'Dazed' | ... ,  // 9-value enum
  source: { kind: 'creature' | 'effect', id: string },
  duration: { kind: 'EoT' | 'save_ends' | 'until_start_next_turn' | 'end_of_encounter' | 'trigger', ... },
  appliedAtSeq: number,
  removable: boolean,  // false only for the dying-induced Bleeding
}
```

For binary conditions (the default per Q8), the engine still tracks instances per-source so per-source durations work, but the *effect* is computed from "any active instance exists." For Frightened and Taunted, applying a new instance from a different source removes any prior instance from a different source (per the rulebook's replace rule).

**Lifecycle hook taxonomy.** Condition handlers fire at engine-defined hook points:

- `onTurnStart(affected)` / `onTurnEnd(affected)`
- `onMainAction(affected)` / `onTriggeredAction(affected)` / `onAbilityRoll(affected, characteristic)` / `onTest(affected, characteristic)` — used by Bleeding
- `onRollResolution(affected, intent)` — edge/bane contributors (Frightened, Grabbed, Prone, Restrained, Taunted, Weakened)
- `onMove(affected)` — Slowed (speed cap), Prone (crawl cost), Grabbed (forbid except by grabber)
- `onCheckTrigger(affected, event)` — trigger-driven ends (Grabbed on teleport / force-move-apart; Restrained on teleport)

The previous `rules-engine.md` ConditionDef sketch (with only `startTurn` and `endsOn`) was a placeholder; the real hook surface is broader.

**Edge/bane gathering.** When the reducer resolves any power roll, it queries all conditions on the actor and target (and source-relationship conditions like Frightened/Taunted that compare the source to the target of the roll), sums their edge/bane contributions, then runs the § 1.4 cancellation rules. A Taunted-against-non-taunter roll contributes 2 banes from one source; cancellation caps the net at 2.

**Saving throws.** At the end of an affected creature's turn, the reducer dispatches a `RollResistance` intent for each `save_ends` condition on them. The dispatcher (rolling client) provides the d10. The reducer checks ≥ 6 and ends the effect on success. Saves are independent and ordered by `appliedAtSeq` for log readability.

## 4. Action economy ✅

> **Source:** `.reference/data-md/Rules/Chapters/Combat.md` lines 62–587 (Combat Round, Taking a Turn, Movement, Move Actions, Maneuvers, Main Actions, Free Strikes).

### 4.1 Round structure

A combat encounter is a sequence of **combat rounds**. In each round, every creature in the battle takes one turn. (Combat.md:64.)

**Surprise.** At the start of combat, the Director marks any creature not ready for combat as **surprised**. A surprised creature **cannot take triggered actions or free triggered actions**, and ability rolls against them **gain an edge**. Surprise lasts until the **end of the first combat round**. (Combat.md:72.)

**First side.** If one side is fully surprised and the other isn't, the non-surprised side acts first. Otherwise the Director rolls 1d10: on a 6+ the players' side chooses which side goes first; otherwise the Director chooses. (Combat.md:78.) Whichever side wins this roll continues to act first in **every subsequent round**. (Combat.md:111.)

**Alternation.** Sides alternate picking a creature (or group of creatures, Director-side) to act. Once a side has run out of creatures who haven't acted yet, the other side finishes the round consecutively. (Combat.md:82–86.)

**Director groups.** Director-controlled creatures act in groups defined by the Bestiary. When a group's turn comes up, the Director chooses creatures from that group consecutively until all members of the group have acted. (Combat.md:107.)

**End of round.** Once every creature has acted, the round ends; a new round begins with the side that went first in round 1 going first again. Any creature can act only once per round unless an ability or special rule grants an extra turn. (Combat.md:84, 109.)

### 4.2 Turn budget and conversion

Each creature's turn budget per round (Combat.md:115):

- 1 **main action**
- 1 **maneuver**
- 1 **move action**

The three can be performed in any order; the move action can be split before, between, or after the main action and maneuver.

**Conversion.** The main action can be converted into a second maneuver **or** a second move action. So the valid turn shapes are:

| Main | Maneuvers | Move actions |
|------|-----------|--------------|
| 1    | 1         | 1            |
| —    | 2         | 1            |
| —    | 1         | 2            |

A maneuver **cannot** be converted to a move action or vice versa. Only the main action is convertible.

The rulebook doesn't constrain *when* in the turn the conversion is declared; the engine should let the player resolve their slots in any order and treat an unused main action at end-of-turn as equivalent to declared-as-converted (only matters if the player wants to use it as a maneuver mid-turn).

### 4.3 Triggered actions and free triggered actions

Combat.md:119–127.

A **triggered action** is an ability with a specified trigger. The owner can use it on their own turn or on another creature's turn, but only when the trigger occurs.

- **Limit: one triggered action per round per creature**, on or off their turn.
- A **free triggered action** uses the same trigger mechanic but does **not** count against the 1/round limit.
- Any effect that prevents triggered actions also prevents free triggered actions (e.g. Dazed, Surprised).

**Same-trigger resolution.** If multiple triggered actions fire on the same trigger, the player-controlled creatures decide their internal order among themselves; the Director decides the order among Director-controlled creatures. (Combat.md:125.) Cross-side ordering is not specified in the rulebook — see [Q10](rule-questions.md#q10-cross-side-ordering-of-simultaneous-triggered-actions-).

### 4.4 Free maneuvers and no-action activities

**Free maneuvers** (Combat.md:131): simple on-turn activities like opening an unlocked door, picking up an item, drawing a weapon, giving an object to an adjacent ally. Follow normal maneuver rules but have no per-turn cap. Director can require a regular maneuver if circumstances make a free maneuver implausible (e.g. picking up an item during an earthquake). Any effect preventing maneuvers also prevents free maneuvers (e.g. Dazed).

**No-action activities** (Combat.md:141): even simpler activities allowed when it's not your turn — shouting a warning, dropping an item. Director-discretion as to what qualifies.

### 4.5 Move actions

Combat.md:400–414.

- **Advance.** Move up to your `speed` squares. Movement may be broken up with your maneuver and main action.
- **Disengage.** Shift 1 square (a shift doesn't trigger opportunity attacks). Class features, kits, etc. can let you shift more than 1 with a Disengage. Movement may be broken up.
- **Ride.** Only usable while mounted. Causes the mount to move up to the mount's `speed`, carrying the rider. *Alternative:* spend the Ride to make the mount Disengage as a **free triggered action**. Limited to **once per round per rider**, and **once per round per mount** (a mount can only have Ride applied to it once per round).

### 4.6 Maneuvers (standard list)

Combat.md:422–515. Each is a maneuver-action; class features can grant additional maneuvers.

| Maneuver | Effect (summary) | Source line |
|----------|------------------|-------------|
| Aid Attack | Choose adjacent enemy; next ally ability roll against that enemy before the start of your next turn gains an edge. | 424 |
| Catch Breath | Spend a Recovery, regain `recoveryValue` stamina (§ 2.10). Not usable while dying. | 428–430 |
| Escape Grab | Power roll + Might or Agility against the grab. Tier ladder: ≤11 no effect / 12–16 escape but grabber free-strikes / 17+ no longer grabbed. Bane if smaller than grabber. | 437–449 |
| Grab | Power roll + Might. Tier ladder: ≤11 no effect / 12–16 grab but target free-strikes / 17+ target grabbed. Size restrictions (§ 3.5.4). | 458–472 |
| Hide | See § 7 (Tests) for full mechanic. | 478 |
| Knockback | Power roll + Might. Push 1/2/3 by tier. Size restrictions. | 485–497 |
| Make or Assist a Test | Most in-combat tests are maneuvers. Director can elevate to main action or demote to free maneuver. | 499–503 |
| Search for Hidden Creatures | See § 7. | 507 |
| Stand Up | End your Prone condition. Or make a willing adjacent Prone creature stand up. | 511 |
| Use Consumable | Activate a potion or similar; can administer to self or willing adjacent creature. | 515 |

Engine note: Escape Grab, Grab, and Knockback are themselves power-roll-driven abilities. They use the same `RollPower` intent shape and tier resolution as class abilities — the action-economy layer just constrains *when* they can be used.

### 4.7 Main actions (standard list)

Combat.md:517–541. Most main actions are class/kit/treasure abilities. The standard main actions every creature can use:

| Main action | Effect (summary) | Source line |
|-------------|------------------|-------------|
| Use an ability | Use a unique ability from your class, kit, or treasure. The default path. | 519 |
| Charge | Move up to `speed` in a straight line, then make a melee free strike against a target at your destination. If you have a Charge-keyword ability, you can use it instead of the free strike. No movement through difficult terrain; no shift; no climb/swim unless automatic. | 525–529 |
| Defend | Until the start of your next turn: ability rolls against you have **double bane**; you have **double edge** on tests to resist environmental effects / creature traits / creature abilities. No benefit while a creature you have Taunted is still affected by your taunt. | 533 |
| Free Strike (as main action) | Make a standard free strike (§ 4.8). | 537 |
| Heal | Target adjacent creature spends a Recovery (regain stamina) **or** makes a saving throw against one save-ends effect on them. | 541 |

### 4.8 Free strikes and opportunity attacks

Combat.md:543–587.

**Standard free strikes.** Every hero has two:

- **Melee Weapon Free Strike** — Melee 1; power roll + Might or Agility; damage ladder `2 / 5 / 7 + M_or_A`.
- **Ranged Weapon Free Strike** — Ranged 5; power roll + Might or Agility; damage ladder `2 / 4 / 6 + M_or_A`.

Classes can grant additional free strike options; kits can improve the standard options.

**When free strikes happen:**

- Voluntarily on your turn as a main action.
- Off-turn when a rule grants you one (e.g. opportunity attack, Charge, Grab/Escape Grab tier-2 free strikes).
- "Granted abilities" path: when an ability lets another creature use a signature ability or heroic ability off-turn, that creature can substitute a free strike if they prefer. (Combat.md:551.) Granted use does **not** consume the recipient's triggered-action quota — see [Q11](rule-questions.md#q11-granted-ability-quota-).

**Opportunity attacks.** Combat.md:553–557.

- Trigger: an enemy adjacent to you **willingly moves** to a non-adjacent square **without shifting**.
- Effect: you can make a **melee free strike** as a **free triggered action**.
- **Gate:** if your power roll against that enemy would have a bane or double bane, you **cannot** make the opportunity attack. (The engine evaluates net edge/bane at the moment of the trigger.)

### 4.9 Condition interactions with action economy

The conditions in § 3 that touch the action-economy gate, and where:

| Condition | Action-economy effect |
|-----------|------------------------|
| **Dazed** | Per turn: only **one** of main action, maneuver, OR move action. No triggered/free triggered actions, no free maneuvers. (§ 3.5.2.) |
| **Slowed** | `speed = 2` (unless lower); **cannot shift** — so the Disengage move action loses its shift, and any other shift-granting ability is blocked. (§ 3.5.7.) |
| **Grabbed** | `speed = 0`; **cannot use Knockback**; bane on abilities not targeting the grabber. (§ 3.5.4.) |
| **Restrained** | `speed = 0`; **cannot use Stand Up**; cannot be force-moved. (§ 3.5.6.) |
| **Prone** | Must crawl; cannot climb/jump/swim/fly. (§ 3.5.5.) |
| **Surprised** | No triggered actions or free triggered actions until end of round 1. (§ 4.1.) |

### 4.10 Engine turn state machine

For each creature's turn the reducer maintains:

```
{
  mainSpent: false,
  maneuversSpent: 0,    // increments per maneuver; cap depends on conversions
  moveActionsSpent: 0,  // same
  mainConvertedTo: null | 'maneuver' | 'move',
  triggeredActionUsedThisRound: false,
  // free maneuvers and free triggered actions are not counted
}
```

Gates:
- **Main action available** while `!mainSpent && mainConvertedTo === null`.
- **Maneuver available** while `maneuversSpent < (mainConvertedTo === 'maneuver' ? 2 : 1)` — and not Dazed-out (§ 4.9).
- **Move action available** while `moveActionsSpent < (mainConvertedTo === 'move' ? 2 : 1)` — and not Dazed-out.
- **Free maneuver** always available unless Dazed.
- **Triggered action** available only while `!triggeredActionUsedThisRound` and not Dazed/Surprised.
- **Free triggered action** available unless Dazed/Surprised — does not consume the round budget.

**Round-tick reset.** At round end, the engine clears `triggeredActionUsedThisRound` for every participant and the per-turn slot trackers.

**Same-trigger resolution.** When the engine detects a trigger that fires multiple triggered actions, it dispatches a `ResolveTriggerOrder` intent that gathers the player-side queue (resolved by PC dispatch order or explicit reorder) and the Director-side queue (similar). Cross-side ordering is resolved per [Q10](rule-questions.md#q10-cross-side-ordering-of-simultaneous-triggered-actions-).

## 5. Heroic resources & surges 🚧

> **Source:** Each class's `Heroic Resource` section in `.reference/data-md/Rules/Classes/<Class>.md`. Talent's Clarity (the load-bearing exception that breaks the "always ≥ 0" assumption) is fully drafted below; the other eight are noted with name + source location and are TBD.

### 5.1 The nine resources

| Class | Resource | Source | Status |
|-------|----------|--------|--------|
| Censor | Wrath (+ Virtue epic) | `Classes/Censor.md` | ✅ § 5.4.1 — primary encounter-scoped; Virtue is 10th-level epic, persists |
| Conduit | Piety (+ Divine Power epic) | `Classes/Conduit.md` | ✅ § 5.4.2 — primary encounter-scoped; Divine Power is 10th-level epic, persists |
| Elementalist | Essence | `Classes/Elementalist.md` | ✅ § 5.4.3 — encounter-scoped; maintenance abilities drop if turn-start would go negative |
| Fury | Ferocity | `Classes/Fury.md` | ✅ § 5.4.4 — encounter-scoped |
| Null | Discipline | `Classes/Null.md` | ✅ § 5.4.5 — encounter-scoped; one trigger keyed on Malice spends |
| Shadow | Insight | `Classes/Shadow.md` | ✅ § 5.4.6 — encounter-scoped; ability cost reduces by 1 if edge present |
| Tactician | Focus | `Classes/Tactician.md` | ✅ § 5.4.7 — encounter-scoped |
| Talent | Clarity | `Classes/Talent.md` | ✅ verified (§ 5.3) |
| Troubadour | Drama | `Classes/Troubadour.md` | ✅ § 5.4.8 — encounter-scoped; posthumous gain enables auto-revive at 30 drama |

### 5.2 Engine model (per-resource fields)

A resource definition has, conceptually:

- `name` — display name.
- `floor` — minimum value. Default 0; can be a formula referencing character stats. Talent's Clarity uses `-(1 + Reason)`.
- `ceiling` — maximum, if any. Most appear uncapped within an encounter; verify per class.
- `gainTriggers` — events that grant the resource (start of turn, force-moving a creature, ally action, etc.).
- `spendRules` — abilities that cost N of the resource; some abilities have variable cost (`spend 1 or more`, `spend 2+`).
- `ongoingEffects` — automatic effects triggered while the resource is in a given state (e.g. "while < 0, take 1 damage per negative point at end of your turn").
- `lifecycle` — does the resource reset, and on what event? Three observed shapes so far:
  - **Encounter-scoped, soft-reset:** resets to 0 at end of encounter (Talent).
  - **Persistent (epic-resource only, 10th level):** does not reset between encounters until spent. Examples: Censor's Virtue, Conduit's Divine Power. The eight primary resources are all encounter-scoped.
- `secondaryResources` — some classes have more than one pool (Conduit: Piety + Divine Power).

The Director's **Malice** is structurally the same shape but scoped to the encounter, not to a character. It can go negative as a result of certain abilities (e.g. Elementalist `Sap Strength`).

### 5.3 Talent — Clarity ✅

> **Source:** `Classes/Talent.md` lines 82–104, plus 10th-level feature at lines 1456–1457.

- **Floor:** `-(1 + Reason)`. The character can spend Clarity they don't have, going into negative numbers.
- **Ceiling:** none documented for the in-combat pool.
- **Gain triggers:**
  - Start of a combat encounter: gain Clarity equal to character's Victories.
  - Start of each of the character's turns during combat: gain `1d3` clarity.
  - First time each combat round that any creature is force-moved: gain 1 clarity.
- **Spend rules:** abilities cost clarity per their listed cost (3, 5, 7, 9, 11). Variable-cost abilities (e.g. "spend 2+ clarity") use the spent amount as a parameter.
- **Ongoing effects (while clarity < 0):**
  - **Strained.** Engine-tracked status, **not** a Draw Steel "condition" — see [Q2](rule-questions.md#q2-strained-as-engine-status-vs-draw-steel-condition-) (no save mechanic; not in conditions list; class-specific; derived from clarity). Ability "Strained:" sub-effects fire whenever `(clarityBeforeSpend < 0) || (clarityAfterSpend < 0)` — i.e., already-strained *or* the use itself drops clarity below 0. See [Q1](rule-questions.md#q1-strained-sub-effect-timing-) for the timing detail.
  - **End of each of the character's turns:** take 1 damage per negative point of clarity. Engine dispatches a derived `ApplyDamage` intent.
- **Lifecycle:** at end of encounter, remaining positive clarity is lost AND any negative clarity resets to 0.
- **Outside-of-combat rules:** can't gain clarity outside combat, but can use clarity-costing abilities without paying; cooldown until earning a victory or finishing a respite. Engine note: this is mostly a Phase 2+ surface area; the combat tracker can ignore it for Phase 1.
- **10th-level feature (Effortless Mind):** can opt out of taking damage from negative clarity, and can opt into a Strained sub-effect even when not strained. Engine note: per-character toggles that suppress the end-of-turn damage dispatch and allow a manual Strained-effect trigger.

### 5.4 Other classes ✅

> **Source:** Each class's `<Resource> in Combat` and `<Resource> Outside of Combat` sub-section in `.reference/data-md/Rules/Classes/<Class>.md`. Per-class line citations below.

**Common shape across all 8 primary resources.** Each follows the same broad pattern as Talent's Clarity (§ 5.3), but with different gain triggers and one-off mechanics:

- **Floor:** 0 (Talent's negative-floor is the lone exception across the 9 classes).
- **Ceiling:** not documented; effectively unbounded within an encounter.
- **Base gain triggers** (universal for all 9 classes):
  - **Start of combat encounter:** gain resource equal to character's Victories.
  - **Start of each of your turns during combat:** gain a class-specific amount.
- **Class-specific extra gain triggers:** vary per class (see entries below).
- **Spend:** the per-ability cost from the ability's stat block (e.g. a "5-Wrath Ability" costs 5 Wrath). Per § 7.7.3 the cost is refunded if the entire effect was potency-gated and the target resists.
- **Lifecycle:** **encounter-scoped.** Resource resets to 0 at end of encounter.

#### 5.4.1 Censor — Wrath

> **Source:** `Classes/Censor.md` lines 87–99.

- **Per-turn gain:** **2** wrath.
- **Class-specific gain triggers:**
  - First time per combat round that a creature judged by you (via the **Judgment** ability) deals damage to you: **+1 wrath**.
  - First time per combat round that you deal damage to a creature judged by you: **+1 wrath**.
- **Epic secondary — Virtue** (10th-level, `Censor.md:1367–1372`): gained at each respite equal to XP gained at that respite. **Persists until spent**. Spendable in place of wrath. Also: spend 3 virtue to access a non-default deity domain until next respite. Phase 1 surface area: low (a 10th-level feature); engine just needs to model the persistent pool and the spend-as-wrath substitution.

#### 5.4.2 Conduit — Piety (+ Divine Power)

> **Source:** `Classes/Conduit.md` lines 74–96.

- **Per-turn gain:** roll **1d3** piety. Optional **"pray to the gods"** mechanic before the roll (no action required):
  - On a 1: gain **+1** piety, but take **`1d6 + level`** psychic damage that cannot be reduced.
  - On a 2: gain **+1** piety.
  - On a 3: gain **+2** piety **and** activate a domain effect of your choice.
- **No other in-combat gain triggers** beyond the universal "Victories on encounter start, 1d3 per turn (+ pray)" pattern.
- **Epic secondary — Divine Power** (10th-level, `Conduit.md:1708–1713`): gained at each respite equal to XP gained. **Persists until spent**. Spendable in place of piety. **Bonus capability:** can spend 1 Divine Power to use a conduit ability you don't have (signature abilities cost 1, otherwise pay normal cost in divine power). Phase 1 surface area: low.

#### 5.4.3 Elementalist — Essence

> **Source:** `Classes/Elementalist.md` lines 98–110, plus maintenance rule line 143.

- **Per-turn gain:** **2** essence.
- **Class-specific gain trigger:** first time per combat round that you or a creature within 10 squares takes damage that **isn't untyped or holy**: **+1 essence**.
- **Maintenance constraint** (Elementalist.md:143): the Elementalist may have abilities being *maintained* across turns (a class mechanic where ongoing ability effects cost essence at start of each turn). **You cannot maintain an ability that would make you earn a negative amount of essence at the start of your turn.** Engine: maintenance cost is deducted at start of turn after the per-turn gain; if the result would be negative, the ability is dropped (maintenance ends, no negative essence).
- Director's Malice can also be driven negative by Elementalist's *Sap Strength* ability (§ 5.5).

#### 5.4.4 Fury — Ferocity

> **Source:** `Classes/Fury.md` lines 77–94.

- **Per-turn gain:** roll **1d3** ferocity.
- **Class-specific gain triggers:**
  - First time per combat round that **you take damage**: **+1 ferocity**.
  - First time per encounter that you become **winded** (§ 2.7) or are **dying** (§ 2.8): **+1d3 ferocity**.

#### 5.4.5 Null — Discipline

> **Source:** `Classes/Null.md` lines 77–89.

- **Per-turn gain:** **2** discipline.
- **Class-specific gain triggers:**
  - First time per combat round that an enemy in the area of your **Null Field** ability uses a main action: **+1 discipline**.
  - First time per combat round that the Director uses an ability that costs Malice: **+1 discipline**.

Engine note for the second trigger: requires the engine to log Malice spends and dispatch a per-Null hook when Malice is spent. Tractable since Malice spends are explicit intents.

#### 5.4.6 Shadow — Insight

> **Source:** `Classes/Shadow.md` lines 77–91.

- **Per-turn gain:** roll **1d3** insight.
- **Class-specific gain trigger:** first time per combat round that you deal damage **incorporating 1 or more surges** (§ 5.6): **+1 insight**.
- **Spend modifier (passive ability cost reduction):** when you use a heroic ability that uses a power roll, the ability costs **1 fewer insight** if you have an edge or double edge on the roll. If the ability has multiple targets, the cost reduction applies even if only one target gives you the edge. Engine: cost is computed at spend time, after edge/bane gathering, with a minimum cost of 0.

#### 5.4.7 Tactician — Focus

> **Source:** `Classes/Tactician.md` lines 77–89.

- **Per-turn gain:** **2** focus.
- **Class-specific gain triggers:**
  - First time per combat round that you or any ally damages a creature you have **Marked** (via the **Mark** ability): **+1 focus**.
  - First time per combat round that any ally within 10 squares uses a heroic ability: **+1 focus**.

#### 5.4.8 Troubadour — Drama

> **Source:** `Classes/Troubadour.md` lines 76–101.

- **Per-turn gain:** roll **1d3** drama.
- **Class-specific gain triggers** (in addition to the universal):
  - First time per encounter that **three or more heroes use an ability on the same turn**: **+2 drama**.
  - First time per encounter that **any hero becomes winded**: **+2 drama**.
  - Whenever a creature **within your line of effect rolls a natural 19 or 20**: **+3 drama**.
  - When **you or another hero dies**: **+10 drama**.
- **Posthumous gain (Troubadour.md:88–95):** when the Troubadour is dead, they **continue to gain drama** during combat as long as their body is intact. If the Troubadour reaches **30 drama** during the encounter in which they died, they can **come back to life** with 1 stamina and 0 drama (no action required). If still dead at the end of the encounter, they can't gain drama in future encounters.
- Engine implication: dead-but-not-departed Troubadours have a separate "still generating drama" flag; the auto-revive at 30 drama is a derived intent dispatched as soon as the threshold is met.

### 5.4.9 Engine summary

All eight primary resources share a generic config:

```ts
type HeroicResourceConfig = {
  name: 'wrath' | 'piety' | 'essence' | 'ferocity' | 'discipline' | 'insight' | 'focus' | 'drama' | 'clarity';
  floor: 0 | { formula: 'negative_one_plus_reason' };  // only Talent uses the formula
  ceiling: null;
  baseGain: {
    onEncounterStart: 'victories';      // all 9 classes
    onTurnStart: number | '1d3';        // class-specific
  };
  extraGainTriggers: GainTrigger[];     // class-specific
  lifecycle: 'encounter_scoped';        // resets to 0 at end of encounter
  ongoingEffects?: OngoingEffect[];     // Talent (strained/EoT damage), Troubadour (posthumous drama)
  secondary?: SecondaryResource;        // Censor (Virtue), Conduit (Divine Power)
};
```

The reducer instantiates one of these per character based on their class. Per-ability spend costs come from the ability data (parsed from SteelCompendium per `data-pipeline.md`); the reducer validates `current >= cost` and applies the § 7.7.3 refund rule when applicable.

### 5.5 Director's Malice ✅

> **Source:** `.reference/data-md/Bestiary/Monsters/Chapters/Monster Basics.md` lines 331–372 (Malice, Earning Malice, Spending Malice, Basic Malice Features).

The Director's equivalent of a heroic resource. **Encounter-scoped pool**; reset at the start of every encounter; lost at end of encounter.

**Generation:**

- **At start of combat:** Director gains Malice equal to the **average Victories per hero** in the party (rounded down per the global rounding rule, § 1 / The Basics.md:233).
- **At start of each combat round (including round 1):** Director gains Malice equal to **`heroes_alive + round_number`**.
  - Round 1 with 5 alive heroes → +6 Malice this round.
  - Round 2 with 5 alive heroes → +7 Malice this round.
- **Hero death stops generation for that hero.** A dead hero (currentStamina ≤ −windedValue, § 2.8) no longer counts toward future rounds' Malice generation. A *dying* hero (currentStamina ≤ 0 but still alive) still counts.

Worked example from the rulebook (Monster Basics.md:337): 5 heroes with 3 Victories average, round 1 → start with 3 (Victories) + 5 (heroes) + 1 (round) = 9 Malice. Round 2 (all heroes alive) → +7 (5+2). Round 3 → +8. Etc.

**Spending:**

- Monsters' ability stat blocks specify Malice costs for premium abilities (parallel to heroes' Heroic Resource costs).
- Some creature groups have **"[Creature] Malice"** features (in the monster's section header in the Bestiary) that the Director can activate once per turn — typically group-wide effects, extra actions, or encounter-environment events.
- **Basic Malice features** (Monster Basics.md:355–372) — available to all monsters at the start of any monster's turn:
  - **Brutal Effectiveness (3 Malice).** The next ability the monster uses with a potency has that potency increased by 1.
  - **Malicious Strike (5+ Malice).** The next strike deals extra damage to one target equal to the monster's highest characteristic score. Each additional Malice spent (up to 3× the monster's highest characteristic) adds 1 more damage. **Cannot be used two rounds in a row** even by different monsters.

**Negative Malice.** Some abilities (e.g. Elementalist's *Sap Strength*) can drive Malice below 0. The engine permits a negative pool; future Malice generation continues to add (so a -2 Malice pool with +9 generation becomes 7). No special floor.

**Engine model.**

```ts
type MaliceState = {
  current: number;            // may be negative; lost at end of encounter
  lastMaliciousStrikeRound: number | null;  // for the "not two rounds in a row" rule
};
```

Per-round tick: at start of round N, generate `aliveHeroes(state).length + N`. At start of encounter, additionally pre-load `floor(averageVictoriesAlive())`. End of encounter: reset to 0.

Visibility: Malice may be displayed to players or kept hidden per the Director's preference (Monster Basics.md:341). Engine note: the UI surfaces a Malice display the Director can toggle visibility on.

### 5.6 Surges ✅

> **Source:** `.reference/data-md/Rules/Chapters/Classes.md` lines 365–374.

Universal per-character pool, **separate from the heroic resource**. Many abilities grant surges; the holder spends them to enhance ability damage or potency on a per-roll basis.

**Generation:** any ability or effect that "grants N surges" adds to the holder's pool. No cap on count.

**Spending:** at the moment of using an ability:

- **Extra rolled damage.** Spend up to **3 surges per ability** to deal extra damage to **one** target of that ability. Each surge spent = extra damage equal to the holder's **highest characteristic score**.
- **Potency boost.** Spend **2 surges** to increase a potency by **+1** for one target of an ability. **Cap: +1 per target**, but you can spend additional 2-surge bundles to boost potency for *other* targets of the same ability. Same potency cannot be boosted by more than 1.

**Lifecycle:** lost as spent; **any unspent surges are lost at the end of combat** (Classes.md:374).

**Floor / ceiling:**

- Floor: 0. Surges cannot go negative.
- Ceiling: not documented; effectively unbounded during combat.

**Engine model.**

```ts
type SurgePool = {
  current: number;  // ≥ 0; reset to 0 at end of encounter
};
```

The two spend paths are intent-payload options on `RollPower`:

```ts
type RollPowerPayload = {
  // ...existing fields...
  surgeDamage?: { targetId: string; count: 1 | 2 | 3 };  // adds count × highestChar damage
  surgePotency?: { targetId: string }[];  // each entry spends 2 surges, boosts potency +1 for that target
};
```

Validation: total surge spend (`(surgeDamage?.count ?? 0) + 2 * (surgePotency?.length ?? 0)`) must be ≤ `current`. The reducer rejects an oversold intent and surfaces the cap.

## 6. Forced movement ✅

> **Source:** `.reference/data-md/Rules/Chapters/Combat.md` lines 315–398 (Forced Movement and its sub-sections).

### 6.1 Push, Pull, Slide

The three forced-movement primitives (Combat.md:319–321):

- **Push X.** Move the target up to X squares **away** from the source, in a **straight line**. Every square moved must increase the distance from the source.
- **Pull X.** Move the target up to X squares **toward** the source, in a **straight line**. Every square moved must decrease the distance from the source.
- **Slide X.** Move the target up to X squares **in any direction**. No straight-line requirement.

All three are **horizontal** by default — no vertical movement unless prefixed with "vertical" (§ 6.2).

The source may always **move the target fewer squares** than the max (Combat.md:323): a "push 3" can be applied as push 0, 1, 2, or 3 per target.

### 6.2 Vertical forced movement

Combat.md:332–338.

- Prefix "vertical" lets the force-move travel up/down too (still straight-line for Push/Pull).
- Target left in midair at end of vertical force-move **falls** if they can't fly.
- Force-move against a flying creature is **always vertical**, whether or not the effect specifies it.
- A non-vertical force-move may still traverse a **sloped surface** (hill, staircase) — each square in the path may differ by no more than 1 in elevation from the previous one.

### 6.3 General properties

Combat.md:325, 328–330.

- **Ignores difficult terrain.** The force-moved target doesn't pay extra squares for difficult terrain.
- **Doesn't provoke opportunity attacks.** Forced movement is never the trigger for an opportunity attack.
- **Damaging terrain and area effects still apply.** When forced into damaging terrain or terrain that produces an effect, the target is affected as if they entered it willingly.
- **Multi-target ordering** (sidebar, Combat.md:330): when one ability force-moves multiple targets, the source chooses the order. Each target completes their forced movement fully **before** the next target's force-move begins.

### 6.4 Size adjustment for melee weapon force-moves

Combat.md:340–342.

- **Larger source on smaller target** with a **melee weapon ability**: distance is increased by **+1**.
- **Smaller source on larger target** with a melee weapon ability: distance unchanged (no penalty).
- Non-weapon abilities (e.g. powers) are not affected by this rule.

### 6.5 Slamming into creatures

Combat.md:344–352.

When a force-moved target's path would collide with another creature, the movement **ends** at that collision. Damage applies:

- **Both creatures take damage**: 1 damage per **square remaining** in the original force-move distance (after stability reduction).
- If you force-move an **object** into a creature, the object's movement ends and the creature takes 1 damage per square remaining. (Object damage is at Director's discretion — see § 6.6 sidebar.)
- **Multi-collision size rule:** a larger creature/object slamming into several smaller creatures simultaneously takes damage **once total**, not once per smaller creature. The smaller creatures each take their own damage.
- **Death mid-slam:** if a creature is killed by the same ability that force-moves them, a second creature they are slammed into **still takes damage** unless the Director rules otherwise.
- **You as the target:** you can force-move a creature into **yourself** with a pull or a slide. Slam damage applies to you as it would for any creature.

### 6.6 Slamming into objects

Combat.md:354–358.

When a force-moved target hits a stationary object that is the target's size or larger and the object doesn't break (§ 6.7):

- Movement ends.
- Target takes **2 + 1 per square remaining** damage.
- If force-moved **downward** into a non-breaking object (including the ground), the target *also* takes falling damage as if they had fallen the force-moved distance with Agility 0 (see Falling, Combat.md:287).

Per the sidebar at Combat.md:361–369, objects force-moved into creatures or other objects may take damage at Director's discretion:

- Wood: 3 dmg per occupied square. Stone: 6/square. Metal: 9/square. Fragile objects destroyed by any damage.

### 6.7 Hurling through objects

Combat.md:371–380.

When a force-moved target encounters a mundane object in their path, the object may break per the table below. The "cost" is squares of remaining forced movement consumed; the damage is taken by the target hurled through:

| Object material | Cost (squares) to destroy 1 square | Damage to target |
|-----------------|-------------------------------------|-------------------|
| Glass           | 1                                   | 3                 |
| Wood            | 3                                   | 5                 |
| Stone           | 6                                   | 8                 |
| Metal           | 9                                   | 11                |

If forced-movement squares remain after the object is destroyed, the target continues moving the remaining distance. (Source chooses direction within the original constraint — straight line for Push/Pull.)

### 6.8 Forced into a fall

Combat.md:382–384.

A non-flying creature force-moved across a gap (cliff edge, pit) doesn't fall mid-move — they continue the total forced distance first. **Only after the forced movement ends** do they fall (if still over open space).

### 6.9 Stability

Combat.md:386–390.

- Each creature has a `stability` stat representing resistance to forced movement.
- When force-moved, the target **chooses** how many squares of stability to apply (0 ≤ n ≤ stability) — voluntary per [Q12](rule-questions.md#q12-stability-application--voluntary-or-automatic-). The target can decline some or all stability if they want to be moved further (e.g. away from a hazard, or to trigger a movement-based bonus like Talent clarity).
- Heroes start with `stability = 0`; ancestry, class, and kit options can raise it.
- `stability ≥ 0` always — penalties can't drive it negative.

### 6.10 "When a creature moves..." triggers

Combat.md:392–394.

- Effects that trigger when a creature moves into an area **fire on forced movement** unless the trigger explicitly says "willingly moves."
- Engine note: trigger events fire **per-square traversed**, not just at end of movement. A trap that triggers on entering a square activates as the target passes through it during a slide.

### 6.11 Death effects and forced movement ordering

Combat.md:396–398.

- If the same ability/effect both deals lethal damage **and** force-moves the target, the **forced movement happens first**, then the death-triggered effect.
- Engine: force-move resolves to final position before any `OnDeath` derived intents fire.

### 6.12 Engine resolution order for a force-move

For one source applying force-move to one target:

1. **Stability reduction.** Subtract up to `target.stability` from the distance (per § 6.9 / Q12).
2. **Size adjustment.** Apply § 6.4 (+1 if larger source on smaller target, melee weapon ability).
3. **Direction constraints.** Push: straight away. Pull: straight toward. Slide: source picks a path.
4. **Walk the path square-by-square.** For each square:
   - **Vertical check.** If the next square would put a non-flying target in midair: flag the "left airborne" state but continue (per § 6.8).
   - **Collision with creature/object.** If next square is occupied:
     - **Creature collision (§ 6.5):** end movement; apply slam damage to both creatures (or once for larger source) per remaining squares.
     - **Object collision:** check if breaks per § 6.7 — consume material cost, apply hurling damage, continue. Else (stationary, ≥ target size, doesn't break): end movement; apply § 6.6 damage; if downward, add falling damage.
   - **Damaging terrain.** Apply damage / effect as if willingly entered (§ 6.3).
   - **"When a creature moves" triggers.** Fire trigger events per § 6.10.
5. **Post-move state.** If left airborne over open space and can't fly: dispatch `Fall` per § 6.8 with distance = force-moved distance.

**For multi-target abilities (§ 6.3):** the source picks order; each target completes its full pipeline before the next.

**Death-effect ordering (§ 6.11):** if the force-move was part of the same ability instance that dealt lethal damage, the force-move pipeline completes before any `OnDeath` derived intents fire on the dead target.

## 7. Saves, resistances, tests ✅

> **Source:** `.reference/data-md/Rules/Chapters/Tests.md` lines 17–587 (tests, difficulty, skills, opposed rolls, reactive tests, assist, hide/sneak, group/montage). Potency mechanic from `Classes.md` lines 293–351. Saving-throw mechanic already covered in [§ 3.3](#33-saving-throws); cross-referenced below.

This section disambiguates three distinct mechanics that are easy to conflate:

| Mechanic | What it is | Used for | Engine intent |
|----------|------------|----------|---------------|
| **Test** | A power roll the actor makes to attempt an uncertain task. | Tasks outside of using an ability (climbing, lying, sneaking, recalling lore). | `RollTest` |
| **Saving throw** | A d10 roll, target ≥ 6 ends a `save_ends` effect. | Shaking off save-ends conditions/effects. | `RollResistance` (see § 3.3) |
| **Potency** | A *static* comparison: target's characteristic < potency value → effect applies. **Not a roll.** | Ability-imposed effects (impose Prone, Slowed, etc.) where the target's stat determines if the effect lands. | Resolved by the reducer during `RollPower` tier-effect application. |

The previous spec called the saving-throw mechanic "Draw Steel's '10+' mechanic" — that was wrong on two counts. Saves are **d10 ≥ 6**, and there is **no "10+" mechanic** in Draw Steel. The relevant mechanics are: 6+ on d10 (saving throws), and static comparison vs characteristic (potencies). The intent-protocol.md comment will be corrected when § 7 is verified.

### 7.1 Tests

A **test** is a power roll the hero makes when attempting a task with an uncertain outcome (Tests.md:19). Tests follow the same `2d10 + characteristic` math as ability rolls (§ 1) — they ARE power rolls, with the same edges/banes/bonuses/penalties/auto-tier rules.

Differences from ability rolls:

- The Director calls for a test, decides the **difficulty** (easy/medium/hard), and picks the **characteristic** that fits the task.
- The outcome maps to one of five qualitative results (Tests.md:88–93, § 7.3 below), not a tier-1/2/3 effect ladder defined by an ability.
- A **skill** the hero has, if applicable, adds a +2 bonus (§ 7.4).

#### Characteristics paired to common task types

Tests.md:49–67 — guidance for which characteristic the Director should call for:

| Characteristic | Typical tasks |
|---|---|
| **Might** | Breaking down structures; hurling heavy objects; climbing sheer walls; swimming against currents |
| **Agility** | Tumbling; sneaking; picking locks; sleight of hand |
| **Reason** | Recalling lore; solving puzzles; deducing; forgery; codebreaking; estimation |
| **Intuition** | Noticing hidden things; reading motives or honesty; calming others; animal handling |
| **Presence** | Earning trust; projecting confidence; influencing and leading |

These are guidance, not law — the Director can call for any characteristic that fits the situation.

### 7.2 Test difficulty

Tests.md:78–125. The Director picks one of three difficulty levels per test:

| Power roll total | Easy | Medium | Hard |
|------------------|------|--------|------|
| **≤ 11**         | Success with a consequence | Failure | Failure with a consequence |
| **12–16**        | Success | Success with a consequence | Failure |
| **17+**          | Success with a reward | Success | Success |
| **Natural 19/20**| Success with a reward | Success with a reward | Success with a reward |

Notes:

- A natural 19 or 20 is **always success with a reward** regardless of difficulty (Tests.md:125). This is the test-version of the § 1.3 nat-19/20 rule.
- The rulebook explicitly calls natural 19/20 on a test a "critical success" (Tests.md:125). This is a separate concept from the **critical hit** referenced in § 1.3 and Q5; "critical hit" is the term in combat/ability-roll contexts.
- "Success" as used in rules text means *any* success outcome (with consequence, plain, or with reward). "Failure" means plain failure or failure with consequence. (Tests.md:95.)
- The Director may share difficulty before the roll (faster interpretation) or keep it secret (for drama).

### 7.3 Test outcomes

Tests.md:127–187. Five possible qualitative results:

- **Failure with a consequence.** Don't accomplish the task; also suffer an impactful setback.
- **Failure.** Don't accomplish the task.
- **Success with a consequence.** Accomplish the task but pay a cost.
- **Success.** Accomplish the task clean.
- **Success with a reward.** Accomplish the task plus a small bonus benefit.

Engine note: the outcome is a *qualitative* label, not a mechanical effect. The specific consequence or reward is narrated by the Director. As a default, the Director may take **2 Malice** at the start of the next encounter in lieu of a narrative consequence on the player (Tests.md:148, 162), or grant **1 hero token** in lieu of a narrative reward (Tests.md:187).

Hero tokens (referenced) allow re-rolling a test the player doesn't like (Tests.md:97). The engine logs this as a `Reroll` intent type.

### 7.4 Skills

Tests.md:260–290.

- If a hero has a skill that applies to a test (Director's call), they gain **+2 to the roll**.
- The skill bonus is **not an edge** — they stack independently. A test can have both a +2 skill bonus and a +2 edge bonus.
- **Only one skill** can apply to a single test.
- The Director decides if the skill applies; player justifies in unclear cases.
- An edge granted "to a test using the X skill" applies to any test where the skill *would* apply, even if the hero doesn't have it (Tests.md:299 sidebar).

Engine note: skills are part of `RollTest` payload as `{ skillId: string | null }`. The reducer reads the skill's metadata and adds the +2 bonus during step 2 of § 1.8 (bonuses applied before edges/banes).

### 7.5 Who rolls

Tests.md:208–238. The defaults:

- **Heroes make tests; NPCs typically do not.** Heroes are the protagonists, and tests' outcomes have story stakes that should land on them.
- **Exception — deceptive tasks (Tests.md:222):** the Director can have an NPC roll a Presence test for deception so as not to tip off the players that subterfuge is afoot.
- **Exception — opposed power rolls (Tests.md:232):** for dramatic struggles, both creatures roll a test; **higher total wins**. No reward outcome; no tier ladder.

**Opposed power rolls** — see [Q13](rule-questions.md#q13-opposed-power-rolls--simultaneous-or-sequential-) for the engine's call on simultaneity (the rulebook doesn't specify whether rolls are made simultaneously or sequentially).

**Reactive tests** (Tests.md:242–253): the Director may ask a player to roll without context (e.g. for noticing a hidden creature or recalling lore). Mechanically identical to a normal test; just initiated by the Director without an explicit player declaration of intent.

### 7.6 Saving throws (cross-reference)

Already canonical in [§ 3.3](#33-saving-throws). Summary for completeness:

- Triggered at the **end of an affected creature's turn** for each `save_ends` effect on them.
- Mechanic: **1d10**, result **≥ 6 ends** the effect.
- **Per-effect** (see [Q9](rule-questions.md#q9-saving-throws--per-effect-or-per-turn-)), not per-turn.
- Saves are **not** power rolls — no characteristic, no edges/banes, no skills. Just the d10 against the fixed DC of 6.
- Some abilities (Heal main action, certain class features) grant out-of-cycle saves. Same mechanic.

Engine intent: `RollResistance` with payload `{ effectId, rolls: { d10: number } }`.

### 7.7 Potencies

Classes.md:293–351. **Not a roll.** A potency is a static check made by the reducer at the moment an ability applies its tier effect to a target.

#### 7.7.1 Notation

Effects with a potency are written as `<characteristic> < <value>`, e.g. `A < 1` (target's Agility is less than 1) or `M < WEAK` (target's Might is less than the source's weak potency value).

The named potencies for a hero are based on their **highest characteristic score**:

| Tier | Value |
|------|-------|
| **Weak**    | highest characteristic − 2 |
| **Average** | highest characteristic − 1 |
| **Strong**  | highest characteristic     |

Director-controlled creatures have potencies stated directly in their stat blocks.

#### 7.7.2 Check

For each effect on a tier outcome that has a potency:

1. Look up the target's relevant characteristic.
2. If `target.characteristic < potency.value`: the effect **applies**.
3. Else: the target **resists** that specific effect. Other effects in the tier outcome (e.g. the damage portion) still apply normally.

The check is done **once at application time**. Subsequent stat changes don't retroactively flip it.

#### 7.7.3 Refund for cost-only potency-gated effects

Classes.md:347–351. If a hero spends a Heroic Resource (or the Director spends Malice) on an effect that is **entirely** dependent on a potency, and the target resists, the resource is **not spent**. If the spend also produced any automatic effect (e.g. extra damage), the resource is spent regardless of the potency result.

#### 7.7.4 Adjusting potencies

Some abilities (e.g. censor's Judgment, null's Null Field) raise or lower potency values for specific targets or sources. Surges can increase potency by 1 for one target per 2 surges spent (with no stacking beyond +1 per target).

Engine model: a per-target potency-modifier registry consulted at the moment of the potency check.

### 7.8 Engine resolution patterns

**For `RollTest`:**

1. `total = sum(d10) + characteristic + (skill ? 2 : 0) + sum(bonuses) − sum(penalties)`
2. Apply edges/banes per § 1.4.
3. If natural 19/20: outcome = success with a reward (regardless of difficulty).
4. Else: walk the test-difficulty matrix (§ 7.2) to map `total` to a qualitative outcome.
5. Engine emits the outcome label; UI surfaces difficulty-appropriate text; Director narrates consequence/reward.

**For potency-gated ability effects:**

When the reducer dispatches the tier outcome of a `RollPower`:

1. Compute the source's relevant potency value (resolve `WEAK`/`AVERAGE`/`STRONG` to a number).
2. For each clause of the tier effect:
   - If it has a potency notation (`X < value`): read target's `X` characteristic, plus any modifiers (§ 7.7.4).
   - If `target.X < value`: apply the effect.
   - Else: skip the effect; if the spend was solely for this effect, refund.

**Opposed power rolls** (per Q13): dispatcher pre-rolls both sides simultaneously; reducer compares totals and emits the winner. No tier-ladder resolution; just total-vs-total.

**Reactive tests:** structurally identical to a normal test. The "secret" variant just doesn't surface the result to the player until the Director chooses.

## 8. Encounter math (victories, EV) ✅

> **Source:** Victories — `.reference/data-md/Rules/Chapters/The Basics.md` lines 268–282. Encounter building — `.reference/data-md/Bestiary/Monsters/Chapters/Monster Basics.md` lines 487–649.

### 8.1 Victories

A per-character resource that measures cumulative success during an adventure.

**Generation:**

- **Combat encounter survived with party objectives achieved:** +1 Victory per hero. The Director can award +1 additional for particularly challenging encounters, and may withhold the Victory for trivially easy encounters. (Basics.md:274.)
- **Noncombat challenge overcome** (deadly trap, negotiation, montage test, complex puzzle, clever combat-bypass): +1 Victory per hero, Director's discretion; harder challenges can grant more. (Basics.md:278.)
- **Hero-token-for-cleverness path** (Tests.md:97 / § 7.3.d): converting clever play that bypasses an encounter still grants the Victory equivalent to that encounter. (`For the Director.md:1358`.)

**Spending / conversion:**

- Victories are not "spent" directly during play.
- At end of each respite (§ TBD respite rules), Victories convert 1:1 to **Experience (XP)**, and the hero's Victories reset to 0. (Basics.md:282, 286.)

**Mechanical uses during an adventure:**

- **Talent's Clarity gain trigger** (§ 5.3): at start of combat, the Talent gains Clarity equal to their Victories.
- **Director's Malice generation** (§ 5.5): at start of combat, +Malice equal to average Victories per hero.
- **Encounter strength scaling** (§ 8.3 below): every 2 average Victories increases the party's encounter strength as if there were one more hero in the party.

**Engine model.**

```ts
type Victories = number;  // ≥ 0 during an adventure; resets to 0 at end of respite
```

A per-character counter on the participant record, displayed prominently in the UI.

### 8.2 Hero encounter strength

Each hero contributes a number to the party's **encounter strength (ES)** based on their level (Monster Basics.md:549):

> `heroStrength = 4 + 2 × heroLevel`

| Level | Hero ES |
|-------|---------|
| 1     | 6  |
| 2     | 8  |
| 3     | 10 |
| 4     | 12 |
| 5     | 14 |
| 6     | 16 |
| 7     | 18 |
| 8     | 20 |
| 9     | 22 |
| 10    | 24 |

Retainers and NPCs fighting alongside the heroes count as heroes for ES purposes; their level is the level used. (Monster Basics.md:551.)

### 8.3 Party encounter strength

**Base ES** = sum of `heroStrength` across all heroes (+ NPCs counting as heroes).

**Victories adjustment** (Monster Basics.md:570–574): for every 2 Victories the heroes have on average, increase the party's ES as if there were one **additional** hero in the party (using the heroes' current level). Truncate toward zero (so 0 or 1 average Victories = no adjustment; 2–3 = +1 hero equivalent; 4–5 = +2 hero equivalent; etc.).

Worked example: 4 third-level heroes with 3 Victories each → base ES = 4 × 10 = 40. Victories adjustment: 3 avg Victories → +1 hero equivalent at level 3 = +10. **Adjusted ES = 50.**

### 8.4 Encounter difficulty and budget

The Director chooses a difficulty level for the encounter (Monster Basics.md:511–541, 578–584). The budget is expressed in terms of ES and the strength of a single hero at the party's level (`heroAtParty = 4 + 2 × partyLevel`):

| Difficulty | EV budget |
|------------|-----------|
| **Trivial**  | `< (ES − heroAtParty)` |
| **Easy**     | `(ES − heroAtParty) ≤ budget < ES` |
| **Standard** | `ES ≤ budget ≤ ES + heroAtParty` |
| **Hard**     | `(ES + heroAtParty) < budget ≤ (ES + 3 × heroAtParty)` |
| **Extreme**  | `> (ES + 3 × heroAtParty)` |

The Director may exceed these recommendations — but Extreme is by definition above the Hard ceiling.

### 8.5 Spending the EV budget

Each Director-controlled creature has an **encounter value (EV)** noted in its stat block. Buying a creature for the encounter spends that creature's EV against the budget. (Monster Basics.md:602.)

Constraints:

- **Creature level cap:** creatures' level may be at most **+2 over the heroes' level**. With 6+ average Victories, the cap raises to **+3**. *Solo* creatures cap at **+1** over heroes' level. (Monster Basics.md:606–608.)
- **Minions** are purchased in groups of **4** (Monster Basics.md:614). Recommended to buy at least 2 sets of minions. Minions can be arranged into squads of any size up to 8.
- **Total creature count caps:** ≤ **8 creatures per hero** in any encounter. If the encounter has more than **3 creatures per hero**, at least half must be minions. (Monster Basics.md:624.)
- **Stat-block variety cap:** ≤ **6 different stat blocks** per encounter as a default; more is OK only when many of them are simple minion stat blocks. (Monster Basics.md:626.)
- **Star of the show:** for a creature meant to dominate the encounter, set up a Hard encounter and choose a leader or solo with EV ≥ 1/3 of the encounter budget. (Monster Basics.md:632.)
- **Dynamic terrain objects:** spend EV on dynamic terrain just like on creatures (Monster Basics.md:636).

### 8.6 Initiative groups

Once foes are bought, the Director partitions them into **initiative groups**. All creatures in a group act on the same turn (i.e. consecutively). Recommendations (Monster Basics.md:642–648):

- Each initiative group's total EV: between 1× and 2× `heroAtParty`.
- A single-creature group can exceed this. A group with lower-than-recommended EV is also fine.
- Total number of initiative groups in a battle: roughly the number of heroes, ±1 or 2 (in encounters without a solo).

Engine note: initiative groups are an encounter-builder concept distinct from the round-by-round alternation in § 4.1. The Director-side "groups" referenced in § 4.1.f are these initiative groups.

### 8.7 Engine model

```ts
type EncounterBuilder = {
  heroes: { id: string; level: number; victories: number }[];
  monsters: { id: string; ev: number; level: number; role?: string; isElite?: boolean; isSolo?: boolean; isMinion?: boolean }[];
  minionSquads: { minionId: string; count: number }[];  // count is multiple of 4
  dynamicTerrain: { id: string; ev: number }[];
  initiativeGroups: { members: string[] }[];
};

function partyEncounterStrength(heroes): number {
  const baseES = sum(heroes.map(h => 4 + 2 * h.level));
  const avgVictories = avg(heroes.map(h => h.victories));
  const partyLevel = avg(heroes.map(h => h.level));
  const extraHeroes = Math.floor(avgVictories / 2);
  return baseES + extraHeroes * (4 + 2 * partyLevel);
}

function classifyDifficulty(budget, es, partyLevel): Difficulty {
  const heroAtParty = 4 + 2 * partyLevel;
  // ...table from § 8.4
}
```

Validation rules at encounter-save time:

- Each creature's `level ≤ partyLevel + 2` (or `+ 3` if avg victories ≥ 6, or `+ 1` if solo).
- Each minion squad's `count % 4 === 0`.
- Total creatures ≤ `8 × heroes.length`.
- If `total > 3 × heroes.length`: at least half must be minions.
- Distinct stat blocks ≤ 6 (warning, not hard fail, per Monster Basics.md:626 wording).

---

## 9. Character derivation (Phase 2) ✅

Verified against the printed Draw Steel Heroes Book. Note: ancestry-trait,
item, and class-feature modifiers to these derived values are deferred to
Phase 2 Epic 2 (`CharacterAttachment` activation). Phase 2 Epic 1 derives
the *base* values from class/kit only.

### 9.1 Characteristics ✅

Pair the player's chosen characteristic array with the canonical characteristic
order `[might, agility, reason, intuition, presence]` to produce a
`Characteristics` map. Each position in the stored array maps to the
corresponding characteristic by index.

**Source.** Heroes Book character creation chapter, class characteristic-array
tables. Each class lists 2–3 valid arrays ordered M/A/R/I/P; the player picks
one. The `lockedCharacteristics` field on `ClassSchema` records which slots
are class-fixed (e.g. Fury locks Might), but derivation reads positionally
from the player's chosen array regardless.

### 9.2 Max-stamina ✅

`maxStamina = startingStamina + (level - 1) × staminaPerLevel + kit.staminaBonus`

No characteristic-based multiplier — stamina is a flat per-class progression.

**Source.** Heroes Book class advancement table. Per-class values:

| Class | Starting | Per Level (2nd+) |
|---|---|---|
| Censor | 21 | 9 |
| Conduit | 18 | 6 |
| Elementalist | 18 | 6 |
| Fury | 21 | 9 |
| Null | 21 | 9 |
| Shadow | 18 | 6 |
| Tactician | 21 | 9 |
| Talent | 18 | 6 |
| Troubadour | 18 | 6 |

Ancestry traits, items, and class features may modify the result — deferred
to Epic 2 (`CharacterAttachment`).

### 9.3 Recoveries ✅

`recoveriesMax = class.recoveries`. Fixed per-class base value; no per-level
scaling. Maps to `ClassSchema.recoveries`.

**Source.** Heroes Book class chapter Starting Stats. Per-class base values:

| Class | Recoveries |
|---|---|
| Censor | 12 |
| Fury | 10 |
| Null | 10 |
| Tactician | 10 |
| Conduit | 8 |
| Elementalist | 8 |
| Shadow | 8 |
| Talent | 8 |
| Troubadour | 8 |

Modifiers (Phase 2 Epic 2 territory): ancestry traits like Human's *Staying
Power* (+2 Recoveries) and Orc's *Glowing Recovery* (allows multi-Recovery
Catch Breath); class features and items may also modify the pool or change
how Recoveries are spent. Epic 1 derivation reads `class.recoveries` only.

### 9.4 Recovery-value ✅

`recoveryValue = floor(maxStamina / 3)`.

**Source.** Heroes Book "Recoveries and Recovery Value" rule:
> *Each hero has a number of Recoveries determined by their class. A hero
> also has a recovery value that equals one-third of their Stamina maximum,
> rounded down. When you use the Catch Breath maneuver in combat, you spend
> a Recovery and regain Stamina equal to your recovery value.*

Some abilities/items grant "recovery value plus a little extra" — those
flow through their dispatch payload's `amount` field (an `ApplyHeal` intent
derived from `SpendRecovery`), not through the base derivation.

## 10. Character attachment activation (Phase 2 Epic 2B) 🚧

The `CharacterAttachment` engine folds runtime modifications from ancestry,
class, kit, items, and titles into the derived character runtime. Each
attachment category corresponds to a canonical effect mechanic; the engine
applies them via `packages/rules/src/attachments/apply.ts` and assembles
them via the collectors in `packages/rules/src/attachments/collectors/`.
Hand-authored entries live in `packages/data/overrides/`.

Status note: this section as a whole is 🚧 (drafted) until Gate 2 review.
Once reviewed, individual sub-section status emoji are flipped to ✅ and
the collectors can then opt into `requireCanonSlug` gating per category.
Until then, every collector in `packages/rules/src/attachments/collectors/`
deliberately omits `requireCanonSlug` so attachments continue to apply —
preserving Slice 4/5 behavior.

### 10.1 Ancestry granted-immunity attachments ✅
<!-- Generated slug: character-attachment-activation.ancestry-granted-immunity-attachments -->

For each entry in `ancestry.grantedImmunities`, emit an `immunity`
attachment with the resolved damage kind and level-scaled value. The
`value` field is either a literal non-negative integer or the symbolic
`'level'` resolved against the character's level at apply time.

**Source.**
- `.reference/data-md/Rules/Ancestries/Time Raider.md` lines 113–115
  ("Signature Trait: Psychic Scar — psychic immunity equal to your
  level.")
- `.reference/data-md/Rules/Ancestries/Revenant.md` line 89
  ("Tough But Withered — immunity to cold, corruption, lightning, and
  poison damage equal to your level…")

**Override authoring.** Granted-immunity values come from the parsed
ancestry record, augmented in `packages/data/overrides/ancestries.ts`
(`ANCESTRY_OVERRIDES.<ancestryId>.grantedImmunities`) where the markdown
isn't structurally exposed (e.g. Time Raider, Revenant).

**Out-of-scope mechanics deferred to other sections** (cited 2026-05-12 user review):
- Revenant *Tough But Withered* fire weakness 5 — emitted as a
  `weakness` attachment in `collectFromAncestry` special-case (covered
  by this section conceptually, distinct from immunities).
- Revenant *inert state* (replaces dying at negative-winded), fire-while-
  inert insta-death, 12-hour Stamina recovery from inert — these are
  damage / state-transition mechanics, not stat folds; see
  [`rule-questions.md` Q16](rule-questions.md#q16-revenant-tough-but-withered--out-of-scope-mechanics-)
  and the future `§ 2.7+` winded/dying canon section.

### 10.2 Ancestry signature-trait ability attachments ✅
<!-- Generated slug: character-attachment-activation.ancestry-signature-trait-ability-attachments -->

When an ancestry has `signatureTraitAbilityId`, emit a `grant-ability`
attachment so the ability id appears on the character's derived
`abilityIds`. This engine path applies only to Signature Traits whose
mechanic IS an invocable ability with an action / maneuver cost.

**Applies to** (per printed Heroes Book, confirmed 2026-05-12 user review):
- Human — *Detect the Supernatural* (maneuver-action awareness ability)
- Polder — *Shadowmeld* (magic-maneuver hide ability)

**Does NOT apply to** (Signature Traits routed through other sections or deferred):
- Dragon Knight *Wyrmplate* — immunity-equal-to-level, see § 10.3.
- Hakaan *Big!* — size 1L, handled via `ANCESTRY_OVERRIDES.hakaan.defaultSize` + base derivation.
- Polder *Small!* — size 1S, handled via `ANCESTRY_OVERRIDES.polder.defaultSize`.
- Revenant *Former Life* — size inherits from former ancestry + speed 5, handled in base derivation.
- Revenant *Tough But Withered* — immunities (§ 10.1) + fire weakness (§ 10.1 footnote) + inert mechanics ([Q16](rule-questions.md#q16)).
- Time Raider *Psychic Scar* — psychic immunity = level (§ 10.1).
- Devil *Silver Tongue* (free skill component) — existing `ancestryChoices.freeSkillId` flow.
- Orc *Relentless* — triggered passive when dying; see [Q17](rule-questions.md#q17).
- Dwarf *Runic Carving* — multi-rune choose-and-activate system; see [Q17](rule-questions.md#q17).
- Wode Elf / High Elf *Glamor* — test-time edge modifier; see [Q17](rule-questions.md#q17).
- Devil *Silver Tongue* (negotiation edge component) — test-time edge modifier; see [Q17](rule-questions.md#q17).

**Source.** `.reference/data-md/Rules/Ancestries/Human.md` Signature Trait
*Detect the Supernatural*; `.reference/data-md/Rules/Ancestries/Polder.md`
Signature Trait *Shadowmeld* (printed Heroes Book confirmed by user
2026-05-12).

**Override authoring.** `ANCESTRY_OVERRIDES.<ancestryId>.signatureTraitAbilityId`
in `packages/data/overrides/ancestries.ts`. The collector
(`collectFromAncestry`) reads the resolved value off the static-data
bundle. **Data gap:** the Human and Polder ancestry records currently
ship with `signatureTraitAbilityId: null` — the corresponding ability
data (`human-detect-the-supernatural`, `polder-shadowmeld`) is not yet
ingested because these abilities are embedded in the ancestry markdown,
not the abilities markdown. Tracked in [Q17](rule-questions.md#q17).

### 10.3 Dragon Knight Wyrmplate attachment ✅
<!-- Generated slug: character-attachment-activation.dragon-knight-wyrmplate-attachment -->

The Dragon Knight signature trait *Wyrmplate* grants damage immunity
equal to level to one of six damage types (acid, cold, corruption, fire,
lightning, poison), chosen at character creation. Emit an `immunity`
attachment with `damageKind` taken from
`ancestryChoices.wyrmplateType` and `value: 'level'`.

**Source.**
- `.reference/data-md/Rules/Ancestries/Dragon Knight.md` line 107
  ("Your hardened scales grant you damage immunity equal to your level
  to one of the following damage types… You can change your damage
  immunity type when you finish a respite.")

**Override authoring.** No override required — the choice is stored on
the character record (`character.ancestryChoices.wyrmplateType`) and
read directly by `collectFromAncestry`.

**Respite-gating deferred.** The rulebook gates the *change* of
damage type on completing a respite. Today the data model allows
`wyrmplateType` to be edited at any time via the existing character-
update flow; the respite gate will land alongside the future Respite
intent (which also needs to handle Revenant 12h Stamina recovery —
see [Q16](rule-questions.md#q16) — and post-respite resource resets).
Derivation here is correct for any chosen value; the respite gate is
an intent-layer concern, not a derivation concern.

### 10.4 Dragon Knight Prismatic Scales attachment ✅
<!-- Generated slug: character-attachment-activation.dragon-knight-prismatic-scales-attachment -->

The purchased trait *Prismatic Scales* grants a second always-on damage
immunity equal to level, chosen from the same list as Wyrmplate. Same
emission shape as 10.3, sourced from
`ancestryChoices.prismaticScalesType`.

**Source.**
- `.reference/data-md/Rules/Ancestries/Dragon Knight.md` line 157
  ("Select one damage immunity granted by your Wyrmplate trait. You
  always have this immunity, in addition to the immunity granted by
  Wyrmplate.")

**Override authoring.** No override required — see 10.3.

**Same-type edge case.** The schema doesn't forbid picking the same
damage type for both Wyrmplate and Prismatic Scales — and if the
player did, `damage.ts`'s `sumMatching` would stack the two immunities
to 2× level. Canon clearly implies the second pick should be a
different type ("a second always-on" / "in addition to") but doesn't
explicitly forbid same-type. Constraint belongs in the wizard's
character-validation layer (alongside the existing rule that
`prismaticScalesType` must be non-null when the trait is taken), not
in derivation.

### 10.5 Ancestry purchased-trait attachments 🚧
<!-- Generated slug: character-attachment-activation.ancestry-purchased-trait-attachments -->

For each id in `character.ancestryChoices.traitIds`, the collector
consults `ANCESTRY_TRAIT_OVERRIDES[`${ancestryId}.${traitId}`]` and
folds in any attachments it finds. Coverage is incremental: only traits
whose effects map cleanly onto current `AttachmentEffect` variants are
authored; conditional / triggered / level-keyed shapes are skipped per
the policy comments in
`packages/data/overrides/ancestry-traits.ts`.

Currently authored (Slice 4 sweep):
- `human.staying-power` → `stat-mod recoveriesMax +2`
- `devil.beast-legs` → `stat-mod speed +1`
- `dwarf.grounded`, `orc.grounded` → `stat-mod stability +1`
- `dwarf.spark-off-your-skin` → `stat-mod maxStamina +6` (level-scaling
  partial — 4th/7th/10th echelon bumps deferred)
- `memonek.lightning-nimbleness` → `stat-mod speed +2`
- `polder.corruption-immunity` → `immunity corruption value: 'level'`
  (level+2 offset deferred — see schema gap note in 10.11)
- `wode-elf.swift` → `stat-mod speed +1`

Revenant's *Previous Life* purchased traits resolve to the FORMER
ancestry's trait id and are looked up against the same map keyed by
`${formerAncestryId}.${traitId}`; the emitted attachment's `source.id`
is re-attributed as `revenant.previous-life.<formerAncestryId>.<traitId>`
so the campaign log shows the correct origin.

**Source.**
- `.reference/data-md/Rules/Ancestries/Human.md` lines 67–85
  ("3 ancestry points… Staying Power (2 Points)…")
- `.reference/data-md/Rules/Ancestries/Devil.md` lines 131–137
  ("Beast Legs (1 Point)…")
- `.reference/data-md/Rules/Ancestries/Dwarf.md` lines 137–147
  ("Grounded (1 Point)… Spark Off Your Skin (2 Points)…")
- `.reference/data-md/Rules/Ancestries/Memonek.md` lines 119–129
  ("Lightning Nimbleness (2 Points)…")
- `.reference/data-md/Rules/Ancestries/Orc.md` lines 149–159
  ("Grounded (1 Point)…")
- `.reference/data-md/Rules/Ancestries/Polder.md` lines 157–159
  ("Corruption Immunity (1 Point)…")
- `.reference/data-md/Rules/Ancestries/Wode Elf.md` lines 109–127
  ("Swift (1 Point)…")

**Override authoring.** `ANCESTRY_TRAIT_OVERRIDES` in
`packages/data/overrides/ancestry-traits.ts`, keyed
`${ancestryId}.${traitId}`.

### 10.6 Kit stamina-bonus attachment 🚧
<!-- Generated slug: character-attachment-activation.kit-stamina-bonus-attachment -->

For each kit whose parsed record carries a non-zero `staminaBonus`,
emit a `stat-mod maxStamina +N` attachment. The kit parser reads the
"**Stamina Bonus:** +N per echelon" line from the kit markdown body and
applies the per-echelon scaling at parse time (final structural field
is the level-1 baseline + per-echelon increments resolved against the
character's level).

**Source.** "Stamina Bonus" sub-field of the *Kit Bonuses* block in
every kit markdown file under `.reference/data-md/Rules/Kits/`. Example:
- `Rules/Kits/Mountain.md` line 25 (**Stamina Bonus:** +9 per echelon)

**Override authoring.** None — this is a structural read off the parsed
kit. Engine plumbing lives in
`packages/rules/src/attachments/collectors/kit.ts`.

### 10.7 Kit stability-bonus attachment 🚧
<!-- Generated slug: character-attachment-activation.kit-stability-bonus-attachment -->

For each kit with non-zero `stabilityBonus`, emit a
`stat-mod stability +N` attachment. Flat (not per-echelon).

**Source.** "Stability Bonus" sub-field of the *Kit Bonuses* block.
Example:
- `Rules/Kits/Mountain.md` line 27 (**Stability Bonus:** +2)

**Override authoring.** None — structural read.

### 10.8 Kit melee-damage-bonus attachment 🚧
<!-- Generated slug: character-attachment-activation.kit-melee-damage-bonus-attachment -->

For each kit with a non-zero resolved `meleeDamageBonus`, emit a
`free-strike-damage +N` attachment. The kit markdown encodes a
three-echelon ladder ("+0/+0/+4") which the parser resolves to a
single integer for the character's current level. This is the bonus
that lands on the kit's *free strikes* — the wider rule
("a weapon's damage bonus only adds to melee abilities if your kit has
a melee damage bonus" — `Rules/Chapters/Rewards.md`) is a separate
gate that lives on leveled-treasure attachments, not here.

**Source.** "Melee Damage Bonus" sub-field of the *Kit Bonuses* block.
Example:
- `Rules/Kits/Mountain.md` line 29 (**Melee Damage Bonus:** +0/+0/+4)

**Override authoring.** None — structural read.

### 10.9 Kit speed-bonus attachment 🚧
<!-- Generated slug: character-attachment-activation.kit-speed-bonus-attachment -->

For each kit with non-zero `speedBonus`, emit a `stat-mod speed +N`
attachment. Flat (not per-echelon).

**Source.** "Speed Bonus" sub-field of the *Kit Bonuses* block.
Example:
- `Rules/Kits/Panther.md` line 27 (**Speed Bonus:** +1)

**Override authoring.** None — structural read.

### 10.10 Kit-keyword bonus attachments 🚧
<!-- Generated slug: character-attachment-activation.kit-keyword-bonus-attachments -->

Structural placeholder for kit-level effects the parser can't capture
from kit markdown body — typically conditional ("while wielding a kit
with the `<keyword>` keyword, +N <stat>") attachments emitted via
`KIT_OVERRIDES` in `packages/data/overrides/kits.ts`. After the Slice 4
sweep of `Rules/Chapters/Kits.md`, `Rules/Chapters/Rewards.md`, and
every leveled-treasure file, NO kit-side flat-bonus pattern of this
shape exists in the SteelCompendium markdown — the analogous rules
(weapon-bonus / armor-bonus conditional gating) live on the
*leveled-treasure* side as conditions, not on the kit side as bonuses.

**Source.** Negative-result sweep: searched `.reference/data-md/Rules/
Chapters/Kits.md`, `Rules/Chapters/Rewards.md`, and all of
`Rules/Treasures/Leveled Treasures/`. No matching rule found.

**Override authoring.** `KIT_OVERRIDES` is intentionally empty today;
kept as the structural seam for any future homebrew/expansion that
adds a kit-side keyword-conditional bonus.

### 10.11 Class-feature attachments 🚧
<!-- Generated slug: character-attachment-activation.class-feature-attachments -->

For each ability id in `character.levelChoices[lvl].abilityIds` and
`subclassAbilityIds`, the collector consults
`ABILITY_OVERRIDES[abilityId]` and folds in any attachments. This is
the seam for class features that modify static runtime stats.

After the Slice 4 sweep of `.reference/data-md/Rules/Abilities/` and
`Rules/Classes By Level/`, NO ability shipping in v1 grants a static
runtime stat: the per-level *ability* records all describe combat
actions (power rolls, conditions, triggered movement) whose effects
fire WITHIN an encounter, not statically on the sheet. Stat-touching
*class features* exist as inline prose in `Rules/Classes By Level/`
(Conduit prayers / domain blessings, Censor judgments) but they are
NOT addressable as ability ids — the parser doesn't emit them as
individual Ability records and `LevelChoicesSchema` has no slot for
them. When the pipeline grows a "blessing/prayer/domain feature"
pick slot, those entries will land here (or in a parallel override
map).

**Source.** Negative-result sweep: searched `.reference/data-md/Rules/
Abilities/<class>/` and `Rules/Classes By Level/<class>/`. No
ability-keyed entry produces a static stat-mod / immunity / grant-skill
effect in v1.

**Override authoring.** `ABILITY_OVERRIDES` in
`packages/data/overrides/abilities.ts` — intentionally empty today.

### 10.12 Item-grant attachments 🚧
<!-- Generated slug: character-attachment-activation.item-grant-attachments -->

For each equipped entry in `character.inventory` (`entry.equipped === true`),
the collector consults `ITEM_OVERRIDES[entry.itemId]` and folds in any
attachments it finds. Coverage policy (Slice 5): one canonical example
per applicable item category — leveled treasure, trinket — to prove
the items collector path works end-to-end. Comprehensive item population
is deferred to Epic 2C.

Currently authored:
- `lightning-treads` → `stat-mod speed +2` (1st-level Other Leveled
  Treasure). The lightning-damage rider on unarmed strikes is an
  ability-keyword-conditional damage bonus not yet modellable; 5th/9th
  level scaling deferred.
- `color-cloak-yellow` → `immunity lightning value: 'level'` (1st
  Echelon Trinket). The triggered "Additionally…" clause that converts
  the immunity to a one-round weakness after a lightning hit is a
  triggered-action shape we don't yet model.

Artifacts are skipped-deferred — the three v1 artifacts (Blade of a
Thousand Years, Encepter, Mortal Coil) have only
conditional/area-effect/triggered mechanics that don't map onto current
`AttachmentEffect` variants; see header comment in
`packages/data/overrides/items.ts` for the per-artifact breakdown.
Consumables are out of scope (they apply through intents at use-time,
not as equipped attachments).

**Source.**
- `.reference/data-md/Rules/Treasures/Leveled Treasures/Other Leveled
  Treasures/Lightning Treads.md` line 31 ("While you wear these boots,
  … you gain a +2 bonus to speed.")
- `.reference/data-md/Rules/Treasures/Trinkets/1st Echelon Trinkets/
  Color Cloak.md` line 31 ("While worn, a yellow Color Cloak grants
  you lightning immunity equal to your level.")

**Override authoring.** `ITEM_OVERRIDES` in
`packages/data/overrides/items.ts`, keyed by `item.id`.

### 10.13 Title-grant attachments 🚧
<!-- Generated slug: character-attachment-activation.title-grant-attachments -->

When `character.titleId` is set, the collector consults
`TITLE_OVERRIDES[titleId]` and folds in any attachments. Coverage
policy (Slice 5): one canonical example per applicable effect category
— `stat-mod` and `grant-ability`.

Currently authored:
- `knight` → `stat-mod maxStamina +6` (2nd echelon, "Knightly Aegis"
  benefit)
- `zombie-slayer` → `grant-ability zombie-slayer-holy-terror` (1st
  echelon, "Holy Terror" benefit)

Multi-choice caveat: most v1 titles offer a "choose one of the
following benefits" menu, and the character schema currently stores
only `titleId` — there is no per-title benefit-selection field. The
authored entries implicitly assume the player picked the modeled
benefit. A future schema slice will add `titleBenefitId` (or similar)
and the collector switches to a benefit-id lookup; until then, only
canonical-example overrides ship.

**Source.**
- `.reference/data-md/Rules/Titles/2nd Echelon/Knight.md` line 25
  ("Knightly Aegis: Your Stamina maximum increases by 6.")
- `.reference/data-md/Rules/Titles/1st Echelon/Zombie Slayer.md`
  lines 26–29 ("Holy Terror: You have the following ability, which
  can be paid for using the Heroic Resource of your class.")

**Override authoring.** `TITLE_OVERRIDES` in
`packages/data/overrides/titles.ts`, keyed by `title.id`.

### 10.14 Level-pick attachments

Level-pick ability grants (`character.levelChoices[lvl].abilityIds` and
`subclassAbilityIds`) emit `grant-ability` attachments with
`source.kind: 'level-pick'`. These have no canon slug because the
attachment is a direct mechanical read of the player's selection
recorded by the wizard — there is no rule interpretation involved,
just appending the chosen ability id to the runtime's `abilityIds`.
Class-feature *overrides* keyed against the same ability ids (see
10.11) DO need a canon slug; the bare grant does not.

**Engine plumbing.** `collectFromLevelPicks` in
`packages/rules/src/attachments/collectors/level-picks.ts`. No
overrides — sources are read directly from the character record.

### 10.15 Engine apply order and gating

`applyAttachments(base, attachments, ctx)` folds each
`CharacterAttachment` into a structuredClone of the base runtime:

1. Per-attachment **canon gate**: if `source.requireCanonSlug` is set,
   `requireCanon(slug)` must return true (slug verified ✅). Non-✅
   slugs cause the attachment to be silently skipped — preserving the
   two-gate workflow's invariant that the engine only automates
   verified rules.
2. Per-attachment **condition gate**: if `condition` is set, evaluate
   against `ctx` (`kit-has-keyword`, `item-equipped`). False ⇒ skip.
3. **Effect dispatch.** `stat-mod recoveryValue` is *deferred* (queued)
   so that all `stat-mod maxStamina` increments land first; the engine
   then re-derives `recoveryValue = floor(maxStamina / 3)` per §9.4,
   then applies the deferred `recoveryValue` mods on top of the
   re-derived baseline.
4. **Array-field dedupe.** `abilityIds`, `skills`, `languages` are
   passed through `new Set` at the end so duplicate grants from
   overlapping sources collapse to one.

**Source.** Engine implementation:
`packages/rules/src/attachments/apply.ts`. The behavior here matches
§9.4's derivation rule (recoveryValue is a function of maxStamina) so
the order matters: maxStamina-touching mods sequence correctly with
direct recoveryValue overrides.

### 10.16 Carry-overs and known shape gaps 🚧

Effects observed in source material that the current
`AttachmentEffect` / `AttachmentCondition` schema cannot model. These
are accepted Slice-6+ deferrals; the override files annotate each
skipped entry with `SKIPPED-DEFERRED` for traceability.

- **Per-echelon stat scaling.** Dwarf *Spark Off Your Skin* (+6
  Stamina at 1st echelon, +6 more at 4th/7th/10th). Today's
  `stat-mod.delta` is a flat integer. Needs an echelon-keyed variant.
- **Level+N immunity offsets.** Polder *Corruption Immunity* (level + 2).
  Today's `immunity.value` is `number | 'level'`; no `'level + N'` form.
- **Conditional / triggered attachments.** Devil *Wings* (only while
  flying), Orc *Bloodfire Rush* (the round you took damage), Revenant
  *Bloodless* (saving-throw modifier), Color Cloak triggered weakness
  conversion. Current `AttachmentCondition` only models
  `kit-has-keyword` and `item-equipped`; richer encounter-state
  predicates are out of scope for static derivation.
- **Power-roll floors and turn-economy modifiers.** Encepter's
  "tier-3 floor on Presence rolls", Mortal Coil's "+1 main action per
  turn". Need new `AttachmentEffect` variants.
- **Class-feature overrides via inline class prose.** Conduit prayers
  / blessings, Censor judgments. No ability id to key against;
  pipeline gap (see 10.11).
- **Kit-keyword leveled-treasure bonuses.** None present in
  SteelCompendium markdown (see 10.10).
