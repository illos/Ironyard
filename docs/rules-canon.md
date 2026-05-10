# Rules canon

The engine's source of truth for Draw Steel mechanics. Every mechanical claim cites a location in `.reference/data-md/` (a local clone of [github.com/SteelCompendium/data-md](https://github.com/SteelCompendium/data-md), which mirrors the Heroes Book published by MCDM). When the rulebook and this doc disagree, **the rulebook wins** — fix this doc.

The rules engine in `packages/rules` is the only consumer; UI must not re-implement mechanics. If a section here is missing or marked TBD, the engine treats that area as manual-override only.

Versioning: this doc tracks the SteelCompendium pin recorded in `packages/data/sources.json`. Bumping the pin is also a chance to re-verify this doc.

Section status: ✅ verified · 🚧 drafted, awaiting verification · ⛔ TBD

| § | Topic | Status |
|---|-------|--------|
| 1 | Power rolls (resolution) | 🚧 |
| 2 | Damage application | ⛔ |
| 3 | Conditions | ⛔ |
| 4 | Action economy | ⛔ |
| 5 | Heroic resources & surges | ⛔ |
| 6 | Forced movement | ⛔ |
| 7 | Saves, resistances, tests | ⛔ |
| 8 | Encounter math (victories, EV) | ⛔ |

---

## 1. Power rolls (resolution) 🚧

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

The **natural roll** is the sum of the two d10s before any modifiers. A natural 19 or 20 is **always tier 3**, regardless of modifiers. On certain rolls this is also a critical hit (see § TBD).

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

Some effects grant an automatic tier 1, 2, or 3. They **supersede** edges, banes, bonuses, and penalties. The roll is still made — natural-19/20 detection and crit detection still run — but the *tier* is forced.

If multiple automatic outcomes apply:
- **Different tiers** from different effects → all cancel, ignore them.
- **Same tier** from multiple effects → that tier applies.

### 1.7 Downgrade

The roller may always *choose* a lower tier than the one rolled (e.g. take t2 instead of t3) if the lower-tier effect is preferable. A downgraded critical hit still grants the crit's extra-action benefit (see § TBD).

### 1.8 Engine resolution order

The engine resolves a power roll in this fixed order. Implementations must match:

1. `natural = d10[0] + d10[1]`
2. `total = natural + characteristic + sum(bonuses) − sum(penalties)`
3. Cancel edges and banes per § 1.4 to produce `netEdges ∈ {0,1,2}` and `netBanes ∈ {0,1,2}` (one of them is always 0 after cancellation).
4. If `netEdges == 1`: `total += 2`. If `netBanes == 1`: `total -= 2`.
5. Determine `baseTier` from `total` per § 1.2.
6. If `netEdges >= 2`: `tier = min(t3, baseTier + 1)`. Else if `netBanes >= 2`: `tier = max(t1, baseTier - 1)`. Else: `tier = baseTier`.
7. If `natural ∈ {19, 20}`: `tier = t3` (overrides step 6).
8. If an automatic tier is in play (§ 1.6): replace `tier` with that, applying the multi-effect rules.
9. If the roller chooses to downgrade (§ 1.7): replace `tier` with the chosen lower tier.

Critical-hit detection is orthogonal and runs alongside this — covered in § TBD.

---

## 2. Damage application ⛔
TBD — order of operations from "ability hits at tier N" to a stamina change, including immunities, weaknesses, condition modifiers, temp stamina, and what happens at and below 0 stamina.

## 3. Conditions ⛔
TBD — full list with triggers, durations, save mechanics.

## 4. Action economy ⛔
TBD — actions, maneuvers, triggers, free strikes, free triggered actions, per-turn caps.

## 5. Heroic resources & surges ⛔
TBD — generation, spend rules, max caps, per-class differences.

## 6. Forced movement ⛔
TBD — push/pull/slide, what stops them, terrain interaction.

## 7. Saves, resistances, tests ⛔
TBD — Draw Steel's "10+" save mechanic specifics; difficulty for tests; what counts as a save vs. a test.

## 8. Encounter math ⛔
TBD — victories, scaling, EV/encounter budget for the encounter builder.
