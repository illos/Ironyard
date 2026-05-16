# B1 Core Rules — manual verification checklist

A walk-through of every individual rule in the **B1 Core Rules** bucket of `combat-rules-roadmap.md`, scoped to the engine machinery shared by all content. Source markdown: `.reference/data-md/Rules/Chapters/{The Basics,Tests,Combat}.md`, `.reference/data-md/Rules/Conditions/`, `.reference/data-md/Rules/Movement/`, plus the engine-core sections of `Chapters/Classes.md` (potencies, surges, crits, save ends, stacking, effect duration — these live in B4 by file but are core engine machinery the rest of the rules call into). Page numbers (`PDF p. N`) come from the glossary index in `core-rules/Draw_Steel_Heroes_v1.01.pdf` (heroes-flat.txt lines 474–940) and from page-marker extraction over the same flat text — they reference the **printed** page numbers visible in the PDF, not absolute PDF pages.

## How to use this doc

Each rule is one line. Flip the gate icon as you verify it on the live site:

- `🔲` not yet verified
- `✅` verified on live site
- `🟥` verified that it is **broken** on live site (engine wrong, UI missing, or UI lies)
- `➖` out of scope for v1 — won't verify

The **status** column is my read on whether the rule is implemented in the engine + surfaced in the UI. Trust but verify:

- 🟢 **wired** — engine logic exists and is dispatched from the UI; the live site should exercise this
- 🟡 **partial** — engine logic exists but is stubbed, behind a flag, or has no UI surface yet
- ⚪ **manual-only** — no engine logic; the Director must adjudicate by hand (the canon may be drafted but the engine is silent)
- 🔴 **absent** — neither engine nor canon has touched this

The **source** column is `file:line` in `.reference/data-md/Rules/` (or `Classes.md` for engine-machinery rules that live there) so you can read the rule's exact wording in seconds.

The **status** cell also lists the codebase files that touch the rule — open them to see what to modify. Path prefixes used:

- `R/` → `packages/rules/src/`
- `RI/` → `packages/rules/src/intents/`
- `RCT/` → `packages/rules/src/class-triggers/`
- `S/` → `packages/shared/src/`
- `W/` → `apps/web/src/pages/combat/`

---

## Two cross-cutting concerns (verify first)

These touch every rule below. If they're wrong, everything downstream is wrong.

| Gate | Rule | Description | Source | Status |
|---|---|---|---|---|
| 🔲 | **Effect duration — `EoT`** | Effect ends at end of target's next turn (or end of *current* turn if applied during it) | Classes.md:400 · PDF p. 76 | 🟡 — `S/condition.ts` (`ConditionInstance.duration`); `RI/turn.ts` (`applyEndTurn` should expire EoT); `RI/set-condition.ts`; verify auto-expiry actually fires |
| 🔲 | **Effect duration — `save ends`** | At end of each of the target's turns, d10 ≥ 6 ends the effect | Classes.md:404 · PDF p. 76 | 🟡 — `RI/roll-resistance.ts`; `RI/turn.ts` (`applyEndTurn`); `W/detail/TurnFlowTab.tsx` (should prompt) |
| 🔲 | **Effect duration — end of encounter** | Effect lasts until encounter end (or 5 minutes if out of combat) | Classes.md:410 · PDF p. 76 | 🟢 — `RI/end-encounter.ts` |
| 🔲 | **Effect duration — creature ends as free maneuver** | The imposer can end their own effect on a target as a free maneuver | Classes.md:414 · PDF p. 76 | 🟡 — works via `RI/remove-condition.ts`; no dedicated "free-maneuver" intent surface |
| 🔲 | **End-of-combat cleanup** | All effects expire at encounter end unless the hero wants to keep them — except winded / unconscious / dying | Combat.md:722 · PDF p. 278, Classes.md:396 · PDF p. 76 | 🟢 — `RI/end-encounter.ts` (filters out winded/unconscious/dying) |
| 🔲 | **Stacking — same ability reused** | Most impactful effect wins; latest use sets duration | Classes.md:388 · PDF p. 75 | 🟡 — `RI/set-condition.ts` (dedupe by `source.id`); `S/condition.ts` |
| 🔲 | **Stacking — different abilities, same condition** | Condition applies once, not twice (no "weakened twice" → no double-bane via two casts) | Classes.md:388 · PDF p. 75 | 🟢 — `R/condition-hooks.ts` (`computeRollContributions` reads conditions by type); `RI/set-condition.ts` |
| 🔲 | **Stacking — different abilities, unique effects** | Combine if durations + targets overlap | Classes.md:388 · PDF p. 75 | 🟢 — `S/condition.ts` (distinct `source.id` allowed); `R/condition-hooks.ts` |
| 🔲 | **Specific beats general** | When two rules conflict, the more specific rule wins | The Basics.md:227 · PDF p. 6 | ⚪ — interpretation principle; no code |
| 🔲 | **Always round down** | Half-of-odd always rounds down | The Basics.md:233 · PDF p. 6 | 🟢 — `R/stamina.ts` (`windedValue`, `recoveryValue` use `Math.floor`) |

---

## A1. Encounter lifecycle

| Gate | Rule | Description | Source | Status |
|---|---|---|---|---|
| 🔲 | **When combat starts** | Combat begins as soon as one creature intends harm or an environmental effect is in position to damage someone — and heroic abilities cost Heroic Resource from that moment | Combat.md:66 · PDF p. 265 | 🟢 — `RI/start-encounter.ts`; `W/DirectorCombat.tsx` |
| 🔲 | **Surprise determination** | Creatures not ready at start are surprised until end of first round; surprised creatures can't take triggered/free-triggered actions, and ability rolls against them gain an edge | Combat.md:70 · PDF p. 266 | 🟡 — `RI/mark-surprised.ts`; **GAP**: `R/condition-hooks.ts` `computeRollContributions` does NOT yet read a Surprised flag to grant attackers an edge — verify by attacking a surprised target |
| 🔲 | **Determine who goes first** | If both sides have non-surprised creatures, d10: 6+ → players choose, else Director chooses. If one whole side is surprised, the other side goes first | Combat.md:76 · PDF p. 266 | 🟢 — `RI/roll-initiative.ts`; `W/initiative/RollInitiativeOverlay.tsx` |
| 🔲 | **Side-alternation turn order** | Sides alternate one creature/group at a time | Combat.md:80 · PDF p. 266 | 🟢 — `RI/pick-next-actor.ts`; `W/initiative/PickerAffordance.tsx` |
| 🔲 | **Remaining-side finishes the round** | When one side is fully acted, the other side resolves its remaining turns back-to-back | Combat.md:86 · PDF p. 266 | 🟢 — `RI/pick-next-actor.ts` |
| 🔲 | **Side that went first goes first next round** | Subsequent rounds inherit the round-1 initiative | Combat.md:111 · PDF p. 267 | 🟢 — `RI/turn.ts` (`applyStartRound` should preserve `firstSide`) |
| 🔲 | **Director-controlled creatures act in groups** | The Director picks one creature/squad at a time within a group | Combat.md:107 · PDF p. 267 | 🟡 — encounter math `initiative-groups` canon verified; `W/EncounterRail.tsx` — verify UI surfaces grouping |
| 🔲 | **Argument timer** | 30-second deliberation cap before Director picks for the players | Combat.md:96 · PDF p. 266 | ➖ — no code |
| 🔲 | **Alternative turn order (Agility-test)** | Optional Agility-test-based init system | Combat.md:99 · PDF p. 266 (sidebar) | ➖ — no code |
| 🔲 | **End of round** | Once all turns done, new round begins; same first-side ordering | Combat.md:109 · PDF p. 267 | 🟢 — `RI/turn.ts` (`applyEndRound`, `applyStartRound`) |
| 🔲 | **End of encounter — Victory awards** | Director awards Victories at encounter end | Combat.md:722 · PDF p. 278 | 🟢 — `RI/adjust-victories.ts`; `RI/end-encounter.ts` |
| 🔲 | **End of encounter — effect cleanup** | Effects end if hero wants (except winded/unconscious/dying) | Combat.md:722 · PDF p. 278 | 🟢 — `RI/end-encounter.ts` |
| 🔲 | **Knockout vs kill on the killing blow** | The attacker chooses knock-unconscious instead of kill on lethal damage | Combat.md:670 · PDF p. 278 | 🟢 — `R/damage.ts` (`applyKnockOut`); `RI/apply-damage.ts` (accepts `intent: 'knock-out'`); `RI/knock-unconscious.ts` |
| 🔲 | **Unconscious creature taking damage dies** | Any damage to an unconscious creature kills them | Combat.md:670 · PDF p. 278 | 🟢 — `R/damage.ts` `applyDamageStep` (kills outright) |
| 🔲 | **Objective endings (multiple kinds)** | Director can end combat once narrative objective is met (diminish, defeat-specific-foe, get-the-thing, etc.) | Combat.md:732 · PDF p. 279 | ⚪ — `RI/end-encounter.ts` accepts a reason string; no enum |
| 🔲 | **Dramatic finish / event ending** | Director-narrated wrap when victory is inevitable or a story trigger fires | Combat.md:782 · PDF p. 279 | ⚪ — narrative; no code |

---

## A2. Action economy on a turn

| Gate | Rule | Description | Source | Status |
|---|---|---|---|---|
| 🔲 | **Turn = 1 main + 1 maneuver + 1 move** | Three slots per turn, any order, breakable around movement | Combat.md:115 · PDF p. 267 | 🟢 — `RI/turn.ts` (`applyStartTurn`/`applyEndTurn`); `S/encounter.ts` `turnState`; `W/detail/TurnFlowTab.tsx` |
| 🔲 | **Main → maneuver/move conversion** | A player can spend their main as a second maneuver or a second move | Combat.md:115 · PDF p. 267 | 🟡 — `RI/mark-action-used.ts` (action-tracker); `W/detail/TurnFlowTab.tsx`; no convert intent |
| 🔲 | **Triggered action — 1 per round** | Each creature can take one triggered action per round, on or off their turn | Combat.md:119 · PDF p. 267 | 🟡 — `RI/set-participant-flag.ts` (per-round flags); `RI/turn.ts` (reset on round end); `W/triggers/CrossSideTriggerModal.tsx` |
| 🔲 | **Free triggered action — unlimited per round** | Doesn't count against the per-round limit | Combat.md:122 · PDF p. 267 | 🟡 — `RI/set-participant-flag.ts`; verify the per-round latch isn't tripped by free-triggered |
| 🔲 | **"Effect that prevents triggered also prevents free triggered"** | Surprise + Dazed both block free-triggered too | Combat.md:127 · PDF p. 267 | 🟢 — `R/condition-hooks.ts` `gateActionForDazed`; **GAP** for Surprised (verify) |
| 🔲 | **Free maneuver — unlimited** | Simple stuff (open door, draw weapon, pick up an item) is free, unlimited | Combat.md:129 · PDF p. 267 | ⚪ — no code; verify the Director can dispatch any number |
| 🔲 | **No-action activities (off-turn)** | Shouting a warning, dropping an item — Director discretion | Combat.md:139 · PDF p. 267 | ⚪ — adjudication-only |
| 🔲 | **Triggered-action resolution order — players first, then Director** | When multiple triggers fire on the same event, players collectively decide order, then Director | Combat.md:124 · PDF p. 267 | 🟢 — `RI/resolve-trigger-order.ts`; `W/triggers/CrossSideTriggerModal.tsx`, `W/triggers/TriggersPendingPill.tsx` |
| 🔲 | **Opportunity attack — free triggered melee free strike** | Adjacent enemy moves away without shifting → free melee free strike against them | Combat.md:553 · PDF p. 275 | ⚪ — no code (needs spatial state) |
| 🔲 | **OA blocked if you have a bane vs the enemy** | If you'd attack at a bane, you can't OA | Combat.md:557 · PDF p. 275 | ⚪ — no code |
| 🔲 | **Canonical maneuver list — Aid Attack** | Choose adjacent enemy; next ally ability roll against them gets an edge | Combat.md:422 · PDF p. 273 | ⚪ — `R/condition-hooks.ts` `computeRollContributions` would need an Aid-Attack flag |
| 🔲 | **Canonical maneuver list — Catch Breath** | Spend a recovery; regain recovery value in stamina; can't use while dying | Combat.md:426 · PDF p. 273 | 🟢 — `RI/spend-recovery.ts`; `W/detail/FullSheetTab.tsx` (Spend button); dying-gate enforced |
| 🔲 | **Canonical maneuver list — Escape Grab** | Power Roll + Might/Agility; ≤11 nothing, 12-16 escape but grabber free strikes, 17+ escape clean; bane if smaller | Combat.md:432 · PDF p. 273 | 🟡 — `RI/roll-power.ts` (generic ladder); `RI/remove-condition.ts`; no dedicated EscapeGrab intent |
| 🔲 | **Canonical maneuver list — Grab** | Melee 1; Power Roll + Might; tier ladder; one creature at a time; size-gate by Might | Combat.md:453 · PDF p. 273 | 🟡 — `RI/roll-power.ts`; `RI/set-condition.ts`; no dedicated Grab intent |
| 🔲 | **Canonical maneuver list — Hide** | Hide from non-observing creatures while having cover/concealment | Combat.md:476 · PDF p. 273 | ⚪ — no code |
| 🔲 | **Canonical maneuver list — Knockback** | Melee 1; Power Roll + Might; push 1/2/3; size-gate by Might | Combat.md:480 · PDF p. 273 | ⚪ — no code (needs forced-movement) |
| 🔲 | **Canonical maneuver list — Make / Assist a Test** | Most in-combat tests are maneuvers; some are free maneuvers or main actions | Combat.md:499 · PDF p. 273 | ⚪ — no test-difficulty intent |
| 🔲 | **Canonical maneuver list — Search for Hidden Creatures** | Opposed Intuition/Search vs Agility/Hide within 10 squares | Combat.md:505 · PDF p. 273 | ⚪ — no code |
| 🔲 | **Canonical maneuver list — Stand Up** | End own prone, or stand a willing adjacent prone ally | Combat.md:509 · PDF p. 274 | 🟡 — `RI/remove-condition.ts` (Prone); no dedicated StandUp intent |
| 🔲 | **Canonical maneuver list — Use Consumable** | Activate a potion etc., or administer to adjacent willing creature | Combat.md:513 · PDF p. 274 | 🟢 — `RI/use-consumable.ts` |
| 🔲 | **Canonical main action — Charge** | Move up to speed in a straight line, then melee free strike (or Charge-keyword ability) | Combat.md:525 · PDF p. 274 | ⚪ — no code (needs spatial) |
| 🔲 | **Canonical main action — Defend** | Double bane on ability rolls against you until start of next turn; double edge on environmental tests; no benefit while taunter is taunted | Combat.md:531 · PDF p. 274 | ⚪ — `R/condition-hooks.ts` would need a Defend flag |
| 🔲 | **Canonical main action — Free Strike** | Use a free strike with a main action (rare; usually OA-only) | Combat.md:535 · PDF p. 275 | ⚪ — `RI/roll-power.ts` can run the ladder manually |
| 🔲 | **Canonical main action — Heal** | Adjacent ally spends a recovery OR saves vs one effect | Combat.md:539 · PDF p. 274 | 🟡 — `RI/apply-heal.ts`; `RI/spend-recovery.ts`; `RI/roll-resistance.ts`; verify the "OR save" branch in UI |
| 🔲 | **Canonical move action — Advance** | Move up to speed | Combat.md:404 · PDF p. 272 | ⚪ — no code |
| 🔲 | **Canonical move action — Disengage** | Shift 1 square (more with class/kit) | Combat.md:408 · PDF p. 272 | ⚪ — no code |
| 🔲 | **Canonical move action — Ride** | Mounted-only; mount moves, rider goes with; once per round per mount | Combat.md:412 · PDF p. 272 | ⚪ — no code |
| 🔲 | **Free strikes — Melee Weapon Free Strike** | Melee 1; Power Roll + Might/Agility; 2/5/7 + M-or-A damage | Combat.md:565 · PDF p. 275 | ⚪ — `R/derive-character-runtime.ts` (`freeStrikeDamage`); `RI/roll-power.ts` can compute if dispatched manually |
| 🔲 | **Free strikes — Ranged Weapon Free Strike** | Ranged 5; Power Roll + Might/Agility; 2/4/6 + M-or-A damage | Combat.md:577 · PDF p. 275 | ⚪ — same as melee free strike |

---

## A3. Power roll engine

| Gate | Rule | Description | Source | Status |
|---|---|---|---|---|
| 🔲 | **2d10 + characteristic** | Two ten-sided dice plus a characteristic score (−5 to +5) | The Basics.md:124 · PDF p. 4 | 🟢 — `R/power-roll.ts` (`resolvePowerRoll`); `RI/roll-power.ts`; `W/DirectorCombat.tsx` (`tierEffectFromOutcome`) |
| 🔲 | **Tier 1 (≤11) / Tier 2 (12–16) / Tier 3 (17+)** | Three outcome tiers | The Basics.md:130 · PDF p. 4 | 🟢 — `R/power-roll.ts` (`tierFromTotal`) |
| 🔲 | **Natural 19/20 → auto tier 3** | Two-die total before mods of 19 or 20 always lands tier 3 regardless of penalties | The Basics.md:144 · PDF p. 5, Classes.md:353 · PDF p. 75 | 🟢 — `R/power-roll.ts` (final clause in `resolvePowerRoll`) |
| 🔲 | **Critical hit — natural 19/20 on a main-action ability roll → extra main action** | Granted even off-turn and even while dazed; ability rolls made as a maneuver can't crit | Classes.md:353 · PDF p. 75 | 🟡 — `RI/grant-extra-main-action.ts` exists; `R/power-roll.ts` header says "no critical hits" — `RI/roll-power.ts` needs to detect nat 19/20 on main-action and auto-dispatch the extra main |
| 🔲 | **Edge = +2** | Single edge: +2 to total | The Basics.md:155 · PDF p. 5 | 🟢 — `R/power-roll.ts` (`resolvePowerRoll`) |
| 🔲 | **Bane = −2** | Single bane: −2 to total | The Basics.md:161 · PDF p. 5 | 🟢 — `R/power-roll.ts` |
| 🔲 | **Double edge = +1 tier (max t3)** | 2+ edges, no math bonus, automatic tier shift up | The Basics.md:158 · PDF p. 5 | 🟢 — `R/power-roll.ts` |
| 🔲 | **Double bane = −1 tier (min t1)** | 2+ banes, no math penalty, automatic tier shift down | The Basics.md:164 · PDF p. 5 | 🟢 — `R/power-roll.ts` |
| 🔲 | **Edge/bane cancellation — 1e/1b → none** | One of each cancels | The Basics.md:170 · PDF p. 5 | 🟢 — `R/power-roll.ts` (`cancelEdgesAndBanes`) |
| 🔲 | **Edge/bane cancellation — 2+e/2+b → none** | Double-each cancels | The Basics.md:170 · PDF p. 5 | 🟢 — `R/power-roll.ts` |
| 🔲 | **Edge/bane cancellation — 2+e/1b → 1 edge** | Double edge minus one bane resolves to one edge | The Basics.md:171 · PDF p. 5 | 🟢 — `R/power-roll.ts` |
| 🔲 | **Edge/bane cancellation — 1e/2+b → 1 bane** | One edge minus double bane resolves to one bane | The Basics.md:172 · PDF p. 5 | 🟢 — `R/power-roll.ts` |
| 🔲 | **Cap edges and banes at 2 each** | Even if many circumstances pile on, the max contribution is double | The Basics.md:158, 164 · PDF p. 5 | 🟢 — `R/power-roll.ts` (`Math.min(..., 2)` in `cancelEdgesAndBanes`) |
| 🔲 | **Bonuses and penalties — added before edges/banes** | Skills (+2 etc.) sum independently, applied to the total before edge/bane math | The Basics.md:185 · PDF p. 5 | 🟡 — `R/power-roll.ts` header says "no bonuses/penalties"; `S/intents/roll-power.ts` payload would need a `bonuses` field |
| 🔲 | **Bonuses/penalties — no cap, no stacking limit** | Unlimited count, always summed | The Basics.md:185 · PDF p. 5 | 🟡 — same as above |
| 🔲 | **Automatic tier outcomes supersede edges/banes/bonuses/penalties** | An effect that says "treat this as tier 2" overrides everything | The Basics.md:191 · PDF p. 5 | 🟡 — `R/power-roll.ts` header says "no auto-tier"; `S/intents/roll-power.ts` payload would need an `autoTier` field |
| 🔲 | **Auto-tier — different tiers cancel** | Multiple effects giving different auto-tiers all wash | The Basics.md:195 · PDF p. 5 | 🟡 — same as above |
| 🔲 | **Auto-tier — same tier from multiple effects applies** | Same auto-tier from two sources → still that tier | The Basics.md:195 · PDF p. 5 | 🟡 — same as above |
| 🔲 | **Voluntary downgrade** | Player can take a lower-tier outcome (e.g. trade restrained for slowed) | The Basics.md:138 · PDF p. 4 | 🟡 — `R/power-roll.ts` header says "no downgrade"; `W/RollOverflowPopover.tsx` would expose the choice |
| 🔲 | **Downgrade preserves crit bonus** | Downgrading a crit still grants the extra main action | The Basics.md:142 · PDF p. 4 | 🟡 — depends on downgrade wiring above + `RI/grant-extra-main-action.ts` |
| 🔲 | **Opposed rolls use +4/−4 (not tier shifts) for double e/b and auto-tier** | Opposed power rolls compare totals, so doubles and auto-tier translate to ±4 numeric mods | Tests.md:232 · PDF p. 253 | ⚪ — no code; `R/power-roll.ts` would need a `mode: 'opposed'` branch |
| 🔲 | **Opposed-roll tie → state unchanged** | A tie means nothing happens / state of scene doesn't change | Tests.md:238 · PDF p. 253 | ⚪ — no code |
| 🔲 | **Multi-target — one power roll applied per target with per-target edges/banes** | Single roll, but different edges/banes can flip the per-target tier | Classes.md:359 · PDF p. 75 | 🟡 — `RI/roll-power.ts` (`RollPower` accepts `targetIds[]`); `R/condition-hooks.ts` `computeRollContributions` returns aggregate — needs per-target slot |
| 🔲 | **Natural roll definition** | Sum of the two d10s *before* any modifier | The Basics.md:144 · PDF p. 5 | 🟢 — `R/power-roll.ts` (`natural` field on `PowerRollOutcome`) |

---

## A4. Abilities, strikes & damage

| Gate | Rule | Description | Source | Status |
|---|---|---|---|---|
| 🔲 | **Keyword: Area** | Area abilities target a region; not strikes; ignored by strike-specific features | Classes.md:92 · PDF p. 70 | 🟡 — `S/ability.ts` keyword enum; `RI/use-ability.ts`; verify strike-vs-area discrimination in triggers |
| 🔲 | **Keyword: Charge** | Usable as part of the Charge main action | Classes.md:96 · PDF p. 70 | ⚪ — no Charge action wired |
| 🔲 | **Keyword: Magic** | Identifies magic abilities | Classes.md:100 · PDF p. 70 | 🟢 — `S/ability.ts` |
| 🔲 | **Keyword: Melee** | Requires bodily contact / weapon / implement | Classes.md:104 · PDF p. 71 | 🟢 — `S/ability.ts` |
| 🔲 | **Keyword: Psionic** | Identifies psionic abilities | Classes.md:108 · PDF p. 71 | 🟢 — `S/ability.ts` |
| 🔲 | **Keyword: Ranged** | Targets distant creatures | Classes.md:112 · PDF p. 71 | 🟢 — `S/ability.ts` |
| 🔲 | **Keyword: Strike** | Targets specific creatures/objects with damage or harmful effect | Classes.md:116 · PDF p. 70 | 🟢 — `S/ability.ts` |
| 🔲 | **Keyword: Weapon** | Uses a blade/bow/etc., or unarmed strike | Classes.md:125 · PDF p. 71 | 🟢 — `S/ability.ts` |
| 🔲 | **Distance: Self** | Originates from / affects the user | Classes.md:159 · PDF p. 71 | 🟢 — `S/ability.ts` `distance` field |
| 🔲 | **Distance: Melee X** | Can affect creatures within X squares | Classes.md:144 · PDF p. 71 | 🟡 — `S/ability.ts` declares it; no enforcement (no positions) |
| 🔲 | **Distance: Ranged X** | Can affect creatures up to X squares away | Classes.md:147 · PDF p. 71 | 🟡 — same as Melee X |
| 🔲 | **Ranged-while-adjacent bane** | If you make a ranged strike with any enemy adjacent, you take a bane | Classes.md:151 · PDF p. 71 | ⚪ — no code (needs adjacency state) |
| 🔲 | **Distance: Melee or Ranged** | Some abilities support either; you pick at use time | Classes.md:153 · PDF p. 71 | 🟡 — `S/ability.ts` |
| 🔲 | **Area shape: Aura** | "X aura" — radius X around you, moves with you | Classes.md:173 · PDF p. 71 | ⚪ — no code |
| 🔲 | **Area shape: Burst** | "X burst" — radius X around you, instantaneous | Classes.md:177 · PDF p. 71 | ⚪ — no code |
| 🔲 | **Area shape: Cube** | "X cube" — cube of side length X | Classes.md:181 · PDF p. 71 | ⚪ — no code |
| 🔲 | **Area shape: Line** | "A × B line" — length A, width/height B | Classes.md:185 · PDF p. 71 | ⚪ — no code |
| 🔲 | **Area shape: Wall** | "X wall" — X contiguous squares; blocks line of effect | Classes.md:189 · PDF p. 71 | ⚪ — no code |
| 🔲 | **Origin square + line-of-effect to it** | Areas must originate at a square within distance, and you need LoE to that square | Classes.md:165 · PDF p. 71 | ⚪ — no code |
| 🔲 | **Areas don't pass through solid barriers or around corners (default)** | Walls and ceilings block; corners block | Classes.md:169 · PDF p. 71 | ⚪ — no code |
| 🔲 | **Ability roll vs effect-only** | Some abilities roll, others just have a flat effect entry | Classes.md:376 · PDF p. 76 | 🟢 — `RI/use-ability.ts`; `RI/roll-power.ts`; `W/AbilityCard.tsx` |
| 🔲 | **Signature vs heroic vs spend-to-enhance** | Signatures free; heroic cost Heroic Resource; some spend-X to amplify | Classes.md:384 · PDF p. 76 | 🟢 — `RI/spend-resource.ts`; `RI/use-ability.ts`; `W/AbilityCard.tsx` |
| 🔲 | **Spend Heroic Resource on enhancement** | "Spend X" or "Spend X+" entries | Classes.md:384 · PDF p. 76 | 🟢 — `RI/spend-resource.ts` |
| 🔲 | **Spend-resource refund on resisted potency-only effect** | If the only thing the spend bought was a potency and the target resisted it, the resource isn't spent | Classes.md:345 · PDF p. 74 | 🟡 — `RI/spend-resource.ts`; `RI/roll-resistance.ts`; verify the refund branch |
| 🔲 | **Rolled vs unrolled damage** | Variable damage (from a power roll) vs flat damage; triggers that key on "rolled damage" only fire on the former | Classes.md:289 · PDF p. 74 | 🟢 — `R/damage.ts`; `RCT/action-triggers.ts` (reads rolled-damage hook) |
| 🔲 | **Damage type — untyped (default)** | Most weapon/falling/trap damage has no type | Combat.md:614 · PDF p. 277 | 🟢 — `S/damage.ts` `DamageType` enum |
| 🔲 | **Damage types — 9 elemental/supernatural** | acid, cold, corruption, fire, holy, lightning, poison, psychic, sonic | Combat.md:617 · PDF p. 277 | 🟢 — `S/damage.ts` `DamageType` enum |
| 🔲 | **Damage pipeline: rolled → external mods → weakness → immunity → temp Stamina → Stamina** | Strict ordering; immunity last; temp Stamina absorbs first | Combat.md:619 · PDF p. 277, Classes (canon §2) | 🟡 — `R/damage.ts` (`applyDamageStep` does weakness→immunity); **GAP**: step 5 (temp Stamina) is explicit TODO in `R/damage.ts` |
| 🔲 | **Damage immunity — reduce damage by X, min 0** | "fire immunity 5" → subtract 5 from incoming fire | Combat.md:619 · PDF p. 277 | 🟢 — `R/damage.ts` (`sumMatching` + `Math.max(0, ...)`) |
| 🔲 | **Damage immunity — "all" → ignore that type entirely** | A creature with "poison immunity all" takes no poison damage | Combat.md:623 · PDF p. 277 | 🟢 — `R/damage.ts` (value handled) |
| 🔲 | **Damage immunity — only highest applies** | Don't stack a type-immunity and a damage-immunity-X; take the larger | Combat.md:627 · PDF p. 277 | 🟡 — `R/damage.ts` `sumMatching` currently SUMS same-type — change to `Math.max` |
| 🔲 | **Damage weakness — +X to incoming** | "fire weakness 5" → take 5 extra | Combat.md:629 · PDF p. 277 | 🟢 — `R/damage.ts` |
| 🔲 | **Weakness applies before immunity** | If both apply, weakness first, then immunity reduces | Combat.md:635 · PDF p. 277 | 🟢 — `R/damage.ts` (steps 3 then 4) |
| 🔲 | **Multiple weaknesses — only highest applies** | Don't double-up | Combat.md:637 · PDF p. 277 | 🟡 — `R/damage.ts` `sumMatching` SUMS — change to `Math.max` |
| 🔲 | **Stamina — vitality, not literal HP** | Reduced by damage; "graze of energy" not physical wounds | Combat.md:639 · PDF p. 277 | 🟢 — `S/participant.ts` `currentStamina`; `R/stamina.ts` |
| 🔲 | **Temporary Stamina — decreases first** | Temp absorbed before real Stamina | Combat.md:681 · PDF p. 278 | 🟡 — **GAP** — `R/damage.ts` step 5 TODO; `S/participant.ts` needs a `temporaryStamina` field |
| 🔲 | **Temp Stamina — max-of, not sum** | Gaining more temp while you already have some → take the larger; not additive | Combat.md:685 · PDF p. 278 | 🟡 — same gap |
| 🔲 | **Temp Stamina — expires at end of encounter** | Same as most effects | Combat.md:687 · PDF p. 278 | 🟡 — same gap; `RI/end-encounter.ts` would clear it |
| 🔲 | **Temp Stamina — does not affect recovery value or winded** | Recovery value = ⅓ max *Stamina*, not max + temp | Combat.md:683 · PDF p. 278 | 🟡 — same gap; `R/stamina.ts` already uses `maxStamina` only |
| 🔲 | **Object Stamina — glass 1 / wood 3 / stone 6 / metal 9 per square** | Material-based object durability | Combat.md:691 · PDF p. 278 | ⚪ — no code (no object-as-target model) |
| 🔲 | **Objects immune to poison and psychic** | Default | Combat.md:691 · PDF p. 278 | ⚪ — no code |
| 🔲 | **Knockout vs kill choice** | See A1; goes here too because it's tied to damage resolution | Combat.md:670 · PDF p. 278 | 🟢 — `R/damage.ts` (`applyKnockOut`, `wouldHitDead`); `RI/knock-unconscious.ts` |

---

## A5. Conditions, effects & potencies

### The 9 conditions

| Gate | Rule | Description | Source | Status |
|---|---|---|---|---|
| 🔲 | **Bleeding** | On main / triggered / Might-or-Agility test or ability roll, lose `1d6 + level` Stamina; can't be prevented; once per action | Conditions/Bleeding.md:17 · PDF p. 77 | 🟢 — `R/condition-hooks.ts` (`bleedingDamageHook`); `RI/roll-power.ts` (invokes hook); `S/condition.ts` |
| 🔲 | **Dazed** | Only one of {main, maneuver, move} per turn; no triggered / free-triggered / free maneuvers | Conditions/Dazed.md:17 · PDF p. 77 | 🟢 — `R/condition-hooks.ts` (`gateActionForDazed`); `RI/roll-power.ts` (gate call site); `S/encounter.ts` `turnState.dazeActionUsedThisTurn` |
| 🔲 | **Frightened** | Bane against the source, source gets edge against you, can't willingly approach the source; replaces prior Frightened from a different source | Conditions/Frightened.md:17 · PDF p. 77 | 🟢 — `R/condition-hooks.ts` (`computeRollContributions` — both bane and edge sides); `RI/set-condition.ts` |
| 🔲 | **Grabbed** | Speed 0; no force-move except by the grabber; no Knockback; bane on abilities not targeting the grabber; grabber drags target; grabber's speed halves if target ≥ grabber's size; ends on teleport or force-move-apart | Conditions/Grabbed.md:17 · PDF p. 77 | 🟢 — `R/condition-hooks.ts` (`computeRollContributions` for bane; `removeTriggerEndedConditions` for teleport / force-move-apart); speed-0 / drag are data-only |
| 🔲 | **Prone** | Strike bane; melee against you gets edge; crawl-only; can't climb/jump/swim/fly while prone | Conditions/Prone.md:17 · PDF p. 77 | 🟢 — `R/condition-hooks.ts`; movement restrictions N/A (no spatial) |
| 🔲 | **Restrained** | Speed 0; can't Stand Up; can't be force moved; bane on rolls + Might/Agility tests; attackers get edge; ends on teleport | Conditions/Restrained.md:17 · PDF p. 77 | 🟢 — `R/condition-hooks.ts` (bane/edge + teleport end) |
| 🔲 | **Slowed** | Speed 2 (unless already lower); can't shift | Conditions/Slowed.md:17 · PDF p. 77 | ⚪ — `RI/set-condition.ts` can apply the condition; no speed/shift engine consumes it |
| 🔲 | **Taunted** | Double bane on abilities not targeting the taunter when LoE exists; new Taunt from a different source replaces the old | Conditions/Taunted.md:17 · PDF p. 77 | 🟢 — `R/condition-hooks.ts` (double-bane); LoE check assumed |
| 🔲 | **Weakened** | Bane on power rolls | Conditions/Weakened.md:17 · PDF p. 77 | 🟢 — `R/condition-hooks.ts` (`computeRollContributions`) |

### Potencies and saves

| Gate | Rule | Description | Source | Status |
|---|---|---|---|---|
| 🔲 | **Weak / Average / Strong potency values** | Derived from your highest characteristic as −2 / −1 / 0 | Classes.md:299 · PDF p. 74 | 🟢 — `R/derive-character-runtime.ts` (computes weak/avg/strong) |
| 🔲 | **Potency notation `M < value`** | The target's characteristic must be ≥ the value to resist | Classes.md:305 · PDF p. 74 | 🟢 — `RI/roll-resistance.ts`; `S/intents/roll-resistance.ts` |
| 🔲 | **Potency adjustment by abilities** | Null Field, Judgment, etc. can shift potencies up/down for a target | Classes.md:341 · PDF p. 74 | 🟡 — `RCT/per-class/null.ts`, `RCT/per-class/censor.ts`; verify they actually mutate the potency check at use-ability time |
| 🔲 | **Surge → +1 potency** | Spend 2 surges to bump a potency by 1 for one target; capped at +1 per target | Classes.md:365 · PDF p. 75 | 🟢 — `RI/spend-surge.ts` with `reason: 'surge_burst'` and potency target |
| 🔲 | **Spend-resource refund when sole effect is a resisted potency** | (Same rule listed in A4 — applies to potency layer) | Classes.md:345 · PDF p. 74 | 🟡 — `RI/spend-resource.ts` + `RI/roll-resistance.ts` |
| 🔲 | **Saving throw — d10 ≥ 6 at end of each of target's turns** | Removes a `save ends` effect | Classes.md:404 · PDF p. 76 | 🟢 — `RI/roll-resistance.ts`; `RI/turn.ts` (`applyEndTurn`); `W/detail/TurnFlowTab.tsx` should prompt |
| 🔲 | **Hero token can auto-succeed a save** | Spend hero token to succeed instead of rolling | The Basics.md:215 · PDF p. 5 | 🟢 — `RI/spend-hero-token.ts` (auto-succeed mode); `W/detail/FullSheetTab.tsx` |
| 🔲 | **Saving throw applies only to `save ends` effects** | Other durations (EoT, end-of-encounter, manual) ignore it | Classes.md:404 · PDF p. 76 | 🟢 — `RI/roll-resistance.ts`; `S/condition.ts` `duration.kind` filter |

---

## A6. Resources

| Gate | Rule | Description | Source | Status |
|---|---|---|---|---|
| 🔲 | **Stamina max — class-determined** | Each class has a base + level scaling | Combat.md:639 · PDF p. 277 | 🟢 — `R/derive-character-runtime.ts`; `S/participant.ts` `maxStamina` |
| 🔲 | **Winded threshold = ½ max Stamina** | At-or-below half stamina = winded (mechanically inert by itself, but features key on it) | Combat.md:649 · PDF p. 278 | 🟢 — `R/stamina.ts` (`windedValue`, `deriveNaturalState`) |
| 🔲 | **Dying — Stamina ≤ 0** | Hero can still act; can't Catch Breath; is Bleeding (un-removable while dying) | Combat.md:655 · PDF p. 278 | 🟢 — `R/stamina.ts` (`deriveNaturalState`, `applyTransitionSideEffects` adds non-removable Bleeding); `RI/spend-recovery.ts` blocks while dying |
| 🔲 | **Dead — Stamina ≤ −winded value** | The hero is dead; resurrection requires a special item | Combat.md:655 · PDF p. 278 | 🟢 — `R/stamina.ts` (`deriveNaturalState`) |
| 🔲 | **Recoveries — class-determined max** | Each class sets the count | Combat.md:645 · PDF p. 277 | 🟢 — `R/derive-character-runtime.ts`; `S/participant.ts` `recoveries` |
| 🔲 | **Recovery value = ⅓ Stamina max, rounded down** | The heal-on-Catch-Breath amount | Combat.md:645 · PDF p. 277 | 🟢 — `R/stamina.ts` (`recoveryValue`); `R/derive-character-runtime.ts` |
| 🔲 | **Catch Breath maneuver — spend 1 recovery → regain recovery value** | The in-combat way to heal yourself | Combat.md:646 · PDF p. 277, Combat.md:426 · PDF p. 273 | 🟢 — `RI/spend-recovery.ts`; `W/detail/FullSheetTab.tsx`; `W/rails/HeroRecoveriesCell.tsx` |
| 🔲 | **Out of combat — spend recoveries freely** | No maneuver gate outside combat | Combat.md:300 · PDF p. 7 | 🟢 — `RI/spend-recovery.ts`; verify it doesn't require an active encounter |
| 🔲 | **Recoveries refresh on respite** | Full reset | The Basics.md:308 · PDF p. 7 | 🟢 — `RI/respite.ts`; `W/RespiteConfirm.tsx` |
| 🔲 | **Heroic Resources — class-specific** | 9 different ones, each with class-specific generation rules | Classes.md (class sections) · PDF p. 7 + class chapters | 🟢 — `RI/gain-resource.ts`, `RI/spend-resource.ts`, `RI/set-resource.ts`; `R/heroic-resources.ts`; `RCT/per-class/*.ts`; `W/rails/HeroResourceCell.tsx` |
| 🔲 | **Heroic Resources earned only by overcoming worthy challenges** | "Bags of rats" doesn't generate | The Basics.md:255 · PDF p. 6 (sidebar) | ⚪ — adjudication; no code |
| 🔲 | **Surges — earned during combat from class features/abilities** | Class-specific generation | Classes.md:365 · PDF p. 75 | 🟢 — `RI/gain-resource.ts` (kind=surge); `RCT/per-class/*.ts` |
| 🔲 | **Surges — up to 3 per damage instance, each = highest-characteristic extra damage** | Spend on a rolled-damage ability | Classes.md:365 · PDF p. 75 | 🟢 — `RI/spend-surge.ts` (`reason: 'surge_burst'`); `W/detail/FullSheetTab.tsx` |
| 🔲 | **Surges — 2 → +1 potency for one target** | Spend pattern for potency bump | Classes.md:365 · PDF p. 75 | 🟢 — `RI/spend-surge.ts` |
| 🔲 | **Surges lost at end of combat** | Don't carry between encounters | Classes.md:365 · PDF p. 75 | 🟢 — `RI/end-encounter.ts` clears |
| 🔲 | **Hero tokens — party pool, starts each session = party size** | New session resets to PC count | The Basics.md:203 · PDF p. 5 | 🟢 — `RI/start-session.ts`; `S/campaign.ts` `heroTokens` field |
| 🔲 | **Hero tokens — spend modes** | 2 surges / auto-succeed save / reroll test / 2 tokens for recovery-value of Stamina (no action) | The Basics.md:213 · PDF p. 5 | 🟢 — `RI/spend-hero-token.ts` (mode-discriminated payload); `W/detail/FullSheetTab.tsx` |
| 🔲 | **Hero tokens — one benefit per turn or per test** | Anti-spamming rule | The Basics.md:220 · PDF p. 5 | 🟡 — `RI/spend-hero-token.ts`; verify the per-turn latch via `S/encounter.ts` `turnState` |
| 🔲 | **Hero tokens — expire at session end (default rule)** | Optional rule lets them carry | The Basics.md:220 · PDF p. 5 | 🟢 — `RI/end-session.ts` clears |
| 🔲 | **Victories — 1 per combat encounter won** | Trivial encounters can be skipped at Director discretion; tough ones can pay 2 | Combat.md:722 · PDF p. 278, The Basics.md:270 · PDF p. 7 | 🟢 — `RI/adjust-victories.ts`; `S/campaign.ts` `victories` |
| 🔲 | **Victories — earned for non-combat challenges** | Hard tests, montage successes, etc. | The Basics.md:276 · PDF p. 7 | 🟢 — `RI/adjust-victories.ts` (Director-dispatched) |
| 🔲 | **Victories convert to XP on respite** | Then reset to 0 | The Basics.md:280 · PDF p. 7 | 🟢 — `RI/respite.ts` |
| 🔲 | **Malice — Director-side combat resource** | Generated each round; spent on monster features | Combat.md (Monsters PDF) · Monsters PDF | 🟢 — `RI/gain-malice.ts`, `RI/spend-malice.ts`; `S/encounter.ts` `malice` |
| 🔲 | **Bags-of-rats prevention** | Trivial fights/foes don't generate Heroic Resource or Victories | The Basics.md:255 · PDF p. 6 (sidebar) | ⚪ — adjudication; no code |

---

## A7. Geometry — movement, positioning, forced movement

⚠️ **None of A7 is implemented in the runtime.** The data model has no positions / grid / map. Everything in this section is **manual-only adjudication** on the live site today. The canon (`docs/rules-canon.md §6`) is fully drafted, but no engine wires consume it. Verify "manual-only" means the live site doesn't pretend to enforce these — i.e. the Director can dispatch any state change and no spurious validation fires.

**Codebase note:** Implementing spatial rules would require a new `position: { x, y, z? }` field on `S/participant.ts`, a new `MoveParticipant` intent in `RI/`, and (likely) a new `R/spatial.ts` module with LoE / adjacency / shape helpers. The Stability field is the only spatial-adjacent thing already wired (`S/participant.ts` `stability`, `R/attachments/collectors/kit.ts`).

### Movement primitives

| Gate | Rule | Description | Source | Status |
|---|---|---|---|---|
| 🔲 | **Size and space** | Size N → N×N×N cube; size 1 subdivided 1T/1S/1M/1L | Combat.md:30 · PDF p. 265 | 🟡 — `S/participant.ts` `size`; no rules consume it |
| 🔲 | **Squeeze penalty** | Sharing space with a creature of size within 1 → bane on rolls/tests | Combat.md:155 · PDF p. 268 | ⚪ — no code |
| 🔲 | **Speed — base from ancestry, usually 5** | Modified by kit / abilities | Combat.md:148 · PDF p. 267 | 🟡 — `S/participant.ts` `speed`; `R/attachments/collectors/kit.ts` (kit speed bonus); data-only |
| 🔲 | **Can't exceed speed** | A single move/effect never moves more than current speed (unless rule says otherwise) | Combat.md:157 · PDF p. 268 | ⚪ — no code |
| 🔲 | **Can't cut corners** | No diagonal through a wall corner | Combat.md:161 · PDF p. 268 | ⚪ — no code |
| 🔲 | **Move through ally — free** | Allies don't block | Combat.md:153 · PDF p. 268 | ⚪ — no code |
| 🔲 | **Move through enemy — difficult terrain** | Enemy spaces count as difficult terrain to move through | Combat.md:153 · PDF p. 268 | ⚪ — no code |
| 🔲 | **Difficult terrain — +1 cost per square** | Mud, rubble, etc. | Combat.md:301 · PDF p. 270 | ⚪ — no code |
| 🔲 | **Damaging terrain — damage on entry or while inside** | Per-effect | Combat.md:305 · PDF p. 270 | ⚪ — no code |
| 🔲 | **Shift** | No opportunity-attack provocation; can't enter difficult/damaging terrain; can't combine with regular movement | Combat.md:165 · PDF p. 268 | ⚪ — no code |
| 🔲 | **Advance move action** | Move up to your speed | Combat.md:404 · PDF p. 272 | ⚪ — no code |
| 🔲 | **Disengage move action** | Shift 1 (or more with class/kit) | Combat.md:408 · PDF p. 272 | ⚪ — no code |
| 🔲 | **Ride move action** | Mount-only; once per round per mount | Combat.md:412 · PDF p. 272 | ⚪ — no code |

### Eight movement types

| Gate | Rule | Description | Source | Status |
|---|---|---|---|---|
| 🔲 | **Walk** | Default ground-based movement | Movement/Walk.md · PDF p. 268 | ⚪ — no code |
| 🔲 | **Burrow — dirt horizontal at full speed** | Requires "burrow" in speed entry; can't burrow through stone unless stated | Movement/Burrow + Combat.md:179 · PDF p. 268 | ⚪ — no code |
| 🔲 | **Dig maneuver — vertical burrow up to size** | Special maneuver to dig down/up | Movement/Dig Maneuver · PDF p. 268 | ⚪ — no code |
| 🔲 | **Targeting burrowing creatures — cover + LoE rules** | Creature underground gets cover; surface↔underground LoE rules | Movement/Targeting Burrowing Creatures · PDF p. 268 | ⚪ — no code |
| 🔲 | **Burrowing forced movement — horizontal blocked, vertical passes through dirt** | Non-vertical force-move just deals 1 dmg per square; vertical works as if air | Movement/Burrowing Forced Movement · PDF p. 268 | ⚪ — no code |
| 🔲 | **Claw Dirt — burrow without the speed entry** | Power-roll-laddered maneuver for non-burrowers | Combat.md:205 · PDF p. 268 | ⚪ — no code |
| 🔲 | **Non-burrowing pull-up** | Surface creature can pull an adjacent willing burrowing creature up 1 square as a maneuver | Movement/Non Burrowing Creatures · PDF p. 268 | ⚪ — no code |
| 🔲 | **Climb — auto full speed if "climb" in speed entry; else 2 squares cost per climbed square** | Might test for difficult surfaces | Combat.md:221 · PDF p. 269 | ⚪ — no code |
| 🔲 | **Swim — same shape as climb** | Auto full speed with "swim", else 2x cost | Combat.md:221 · PDF p. 269 | ⚪ — no code |
| 🔲 | **Climbing other creatures** | Willing → free; unwilling → opposed test; edge on melee against the climbed creature; knock-off test | Combat.md:227 · PDF p. 269 | ⚪ — no code |
| 🔲 | **Jump — baseline = Might-or-Agility long, height 1** | Free as part of any move; ladder for going farther via test | Combat.md:247 · PDF p. 269 | ⚪ — no code |
| 🔲 | **Jump — can't from difficult/damaging terrain** | Restriction | Combat.md:259 · PDF p. 269 | ⚪ — no code |
| 🔲 | **Crawl — prone-only, +1 movement cost per square** | Fall-prone or stand-up as free maneuver | Combat.md:261 · PDF p. 269 | ⚪ — no code |
| 🔲 | **Fly — vertical/horizontal at full speed, stays aloft** | If speed 0 or knocked prone, fall | Combat.md:265 · PDF p. 269 | ⚪ — no code |
| 🔲 | **Hover** | Overlay on fly/teleport — doesn't fall when prone or speed 0 | Combat.md:269 · PDF p. 269 | ⚪ — no code |
| 🔲 | **Teleport — instantaneous; ignores OA; LoE to destination; destination unoccupied** | All the teleport sub-rules | Combat.md:273 · PDF p. 269 | ⚪ — no code |
| 🔲 | **Teleport — ends Grabbed/Restrained on the teleporter** | Wired in conditions hook ✓ | Combat.md:284 · PDF p. 269 | 🟢 — `R/condition-hooks.ts` (`removeTriggerEndedConditions`); caller would dispatch with `event: { kind: 'teleport' }` |
| 🔲 | **Teleport — can stand if prone** | Free choice on arrival | Combat.md:283 · PDF p. 269 | ⚪ — no code |
| 🔲 | **Teleport — same-space teleport forbidden** | Must leave and re-enter a different space | Combat.md:285 · PDF p. 269 | ⚪ — no code |

### Falling

| Gate | Rule | Description | Source | Status |
|---|---|---|---|---|
| 🔲 | **Falling — 2 damage per square fallen, cap 50, land prone** | Standard fall damage | Combat.md:287 · PDF p. 269 | ⚪ — no code |
| 🔲 | **Falling — Agility score reduces effective height (min 0)** | High-Agi heroes shrug off short falls | Combat.md:288 · PDF p. 269 | ⚪ — no code |
| 🔲 | **Falling — liquid 1 square+ deep reduces height by 4 (min 0)** | Water cushions | Combat.md:289 · PDF p. 269 | ⚪ — no code |
| 🔲 | **Falling onto another creature — both take fall damage** | Cushion, sort of | Movement/Falling Onto Another Creature + Combat.md:293 · PDF p. 269 | ⚪ — no code |
| 🔲 | **Falling onto a creature — larger faller's size > target's Might → target knocked prone** | Big-on-small knockdown | Combat.md:295 · PDF p. 269 | ⚪ — no code |
| 🔲 | **Falling far — 100 squares first round, 100 per subsequent round** | For very long falls | Combat.md:297 · PDF p. 269 | ⚪ — no code |

### Targeting & visibility

| Gate | Rule | Description | Source | Status |
|---|---|---|---|---|
| 🔲 | **Line of effect — corner-to-corner; solid blocks** | Standard LoE rule | Classes.md:422 · PDF p. 76 | ⚪ — no code |
| 🔲 | **Cover — ≥ ½ form blocked → bane on damage abilities against target** | Half-cover-equivalent | Combat.md:597 · PDF p. 276 | ⚪ — no code |
| 🔲 | **Concealment — fog/darkness/invisibility → bane on strikes** | Distinct from cover (full obscure, no physical protection) | Combat.md:601 · PDF p. 276 | ⚪ — no code |
| 🔲 | **Concealment — can't be single-targeted if also hidden** | Hidden + concealed is untargetable | Combat.md:601 · PDF p. 276 | ⚪ — no code |
| 🔲 | **Invisible creatures — always concealed** | Default | Combat.md:605 · PDF p. 276 | ⚪ — no code |
| 🔲 | **Invisible creatures — Search test against them takes a bane** | Searching is harder | Combat.md:605 · PDF p. 276 | ⚪ — no code |
| 🔲 | **Hidden creatures — Hide maneuver auto-succeeds in combat with cover/concealment + unobserved** | Default Hide path in combat | Tests.md:528 · PDF p. 258 | ⚪ — no code |
| 🔲 | **Hidden — Search for Hidden Creatures uses opposed Intuition/Search vs Agility/Hide within 10 squares** | Reveal mechanic | Tests.md:539 · PDF p. 259 | ⚪ — no code |
| 🔲 | **Hidden — can't single-target through ability (areas still OK)** | Until revealed | Tests.md:533 · PDF p. 258 | ⚪ — no code |
| 🔲 | **Hidden — edge on ability rolls against the creature you're hidden from, through end of revealing turn** | Hidden striker bonus | Tests.md:535 · PDF p. 258 | ⚪ — no code |
| 🔲 | **High ground — fully above target's space → edge on power rolls against** | Standing-on-elevation bonus | Combat.md:309 · PDF p. 270 | ⚪ — no code |
| 🔲 | **High ground while climbing — only with "climb" speed or auto-climb** | Climbing creatures only get it under that condition | Combat.md:313 · PDF p. 270 | ⚪ — no code |
| 🔲 | **Flanking — opposite sides of an enemy → edge on melee strikes** | LoE + triggered-actions-available required | Combat.md:589 · PDF p. 276 | ⚪ — no code |

### Forced movement

| Gate | Rule | Description | Source | Status |
|---|---|---|---|---|
| 🔲 | **Push X — straight line away; each square must increase distance** | Per-square monotonicity | Combat.md:319 · PDF p. 270 | ⚪ — no code |
| 🔲 | **Pull X — straight line toward; each square must decrease distance** | Per-square monotonicity | Combat.md:320 · PDF p. 270 | ⚪ — no code |
| 🔲 | **Slide X — any direction (not vertical), no straight-line requirement** | Free routing | Combat.md:321 · PDF p. 270 | ⚪ — no code |
| 🔲 | **Vertical variant — allows up/down on any of the three** | "vertical push 5" etc. | Combat.md:332 · PDF p. 271 | ⚪ — no code |
| 🔲 | **Big vs little — larger force-mover w/ melee weapon → +1 square distance** | Bigger pushes harder; small→large doesn't change | Combat.md:341 · PDF p. 271, Movement/Big Versus Little · PDF p. 271 | ⚪ — no code |
| 🔲 | **Stability — reduces forced-move distance** | Heroes start 0 | Combat.md:387 · PDF p. 272, Movement/Stability · PDF p. 272 | 🟡 — `S/participant.ts` `stability`; `R/derive-character-runtime.ts`; `R/attachments/collectors/kit.ts` (`stabilityBonus`); **GAP**: no force-move flow consumes it |
| 🔲 | **Forced movement ignores difficult terrain** | But damaging terrain still triggers | Combat.md:323 · PDF p. 271 | ⚪ — no code |
| 🔲 | **Forced movement never provokes opportunity attacks** | Default | Combat.md:323 · PDF p. 271 | ⚪ — no code |
| 🔲 | **Forced movement into damaging-terrain effect — applies as if entered willingly** | The damage / trigger fires | Combat.md:323 · PDF p. 271 | ⚪ — no code |
| 🔲 | **Multi-target forced movement — order chosen by mover; one finishes before the next starts** | Sequential resolution | Combat.md:327 · PDF p. 271 (sidebar) | ⚪ — no code |
| 🔲 | **Slamming into creatures — 1 dmg/remaining square to both** | Symmetric collision damage | Combat.md:344 · PDF p. 271, Movement/Slamming into Creatures · PDF p. 271 | ⚪ — no code |
| 🔲 | **Slam — one large creature into multiple small → large takes damage once total** | Anti-chain-collision | Combat.md:348 · PDF p. 271 | ⚪ — no code |
| 🔲 | **Slam — pull/slide into self** | Can pull/slide another creature into your own square | Combat.md:352 · PDF p. 271 | ⚪ — no code |
| 🔲 | **Slamming into objects — 2 dmg + 1/remaining-square; downward into ground → also fall damage with Agility 0** | Object collision rules | Combat.md:354 · PDF p. 271, Movement/Slamming Into Objects · PDF p. 271 | ⚪ — no code |
| 🔲 | **Object force-move damage (optional) — wood 3 / stone 6 / metal 9 per square** | Sturdy object durability | Combat.md:362 · PDF p. 271 (sidebar) | ⚪ — no code |
| 🔲 | **Hurling through objects — glass 1sq → 3dmg, wood 3sq → 5, stone 6sq → 8, metal 9sq → 11** | Break-through cost and damage | Combat.md:371 · PDF p. 272, Movement/Hurling Through Objects · PDF p. 272 | ⚪ — no code |
| 🔲 | **Hurling — remaining squares continue if object destroyed** | Carry-through | Combat.md:380 · PDF p. 272 | ⚪ — no code |
| 🔲 | **Forced into a fall — finish horizontal first, then fall** | Order of resolution | Combat.md:382 · PDF p. 272, Movement/Forced Into a Fall · PDF p. 272 | ⚪ — no code |
| 🔲 | **Death effects + forced movement — forced movement resolves first, then death triggers** | Ordering | Combat.md:396 · PDF p. 272, Movement/Death Effects and Forced Movement · PDF p. 272 | ⚪ — no code |
| 🔲 | **"When a creature moves..." triggers — forced movement triggers these unless stated otherwise** | Default interpretation | Combat.md:392 · PDF p. 272, Movement/When a Creature Moves · PDF p. 272 | ⚪ — no code |
| 🔲 | **Stability can't go below 0 even with penalties** | Floor | Movement/Stability · PDF p. 272 | 🟡 — `S/participant.ts` `stability`; no decrement path yet |

### Special environments

| Gate | Rule | Description | Source | Status |
|---|---|---|---|---|
| 🔲 | **Underwater — fully submerged: fire immunity 5, lightning weakness 5; bane on power rolls if can't auto-swim** | Submerged combat | Combat.md:702 · PDF p. 278 | ⚪ — no code |
| 🔲 | **Suffocating in combat — hold breath Might rounds, then 1d6/round** | Per-round damage when out of air | Combat.md:706 · PDF p. 278 | ⚪ — no code |
| 🔲 | **Suffocating out of combat — Might minutes, then stress sets in** | Slower scale | Combat.md:706 · PDF p. 278 | ⚪ — no code |
| 🔲 | **Mounted — Ride move; mount + rider each have a turn; force-move knocks rider off** | Mount rules | Combat.md:712 · PDF p. 279 | ⚪ — no code |
| 🔲 | **Mount dies → falls prone; rider falls and lands prone in adjacent unoccupied space** | Death cascade | Combat.md:718 · PDF p. 279 | ⚪ — no code |
| 🔲 | **Riders and mounts teleport separately** | Don't aggregate | Combat.md:716 · PDF p. 279 | ⚪ — no code |

---

## Tests (out-of-combat resolution layer)

Tests are technically *Chapter 9*, but they share the power-roll engine with combat ability rolls so they belong in B1. Below is the test-specific machinery beyond §A3.

| Gate | Rule | Description | Source | Status |
|---|---|---|---|---|
| 🔲 | **Test difficulty — easy/medium/hard with the standard outcome tables** | ≤11 / 12–16 / 17+ map differently per difficulty | Tests.md:86 · PDF p. 250 | ⚪ — no test-difficulty intent (would extend `RI/roll-power.ts` or add `RI/roll-test.ts`) |
| 🔲 | **Nat 19/20 on test → success with reward regardless of difficulty** | Critical success | Tests.md:123 · PDF p. 251 | ⚪ — `R/power-roll.ts` detects nat 19/20 but no test-outcome layer |
| 🔲 | **Failure with consequence — Director picks** | Pick a setback (or +2 Malice) | Tests.md:131 · PDF p. 251 | ⚪ — no code |
| 🔲 | **Success with reward — Director picks (or +1 hero token)** | Pick a benefit | Tests.md:170 · PDF p. 252 | ⚪ — `RI/gain-hero-token.ts` exists; no outcome wiring |
| 🔲 | **Skill applies — +2 bonus, not an edge** | Skill stacks with edges | Tests.md:265 · PDF p. 254 | ⚪ — same as A3 bonuses/penalties gap |
| 🔲 | **Only one skill per test** | Pick one | Tests.md:270 · PDF p. 254 | ⚪ — no code |
| 🔲 | **Hero token reroll** | Spend a token to reroll a test | Tests.md:97 · PDF p. 250 | 🟢 — `RI/spend-hero-token.ts` (reroll mode) |
| 🔲 | **Assist a Test — ≤11 bane / 12–16 edge / 17+ double edge** | Helping mechanic | Tests.md:511 · PDF p. 257 | ⚪ — no code |
| 🔲 | **Opposed power roll — highest total wins, no tier outcomes, ±4 for double e/b** | Resolution rule for both sides rolling | Tests.md:232 · PDF p. 253 | ⚪ — no code (would extend `R/power-roll.ts`) |
| 🔲 | **Reactive tests** | Director-prompted, often secret, no skill modification on some kinds | Tests.md:242 · PDF p. 253 | ⚪ — no code |
| 🔲 | **NPC rolls for deceptive tasks** | Optional flip where the NPC rolls instead of the hero | Tests.md:222 · PDF p. 253 | ⚪ — no code |
| 🔲 | **Group test — half-or-more succeeds → group succeeds; half-or-more reward → collective reward** | Aggregation rule | Tests.md:566 · PDF p. 260 | ⚪ — no code |
| 🔲 | **Montage test — success/failure limits per difficulty (5/5, 6/4, 7/3)** | Multi-round, multi-test scenario | Tests.md:636 · PDF p. 261 | ⚪ — no code |
| 🔲 | **Montage test — 2-round limit by default** | Cap | Tests.md:626 · PDF p. 261 | ⚪ — no code |
| 🔲 | **Montage test — total / partial / total failure outcomes** | 3-way result table | Tests.md:649 · PDF p. 262 | ⚪ — no code |
| 🔲 | **Hide outside combat — Hide skill test** | Director sets difficulty | Tests.md:530 · PDF p. 258 | ⚪ — no code |
| 🔲 | **Sneak — Agility/Sneak test, half speed while sneaking** | Stealth in motion | Tests.md:552 · PDF p. 259 | ⚪ — no code |

---

## Notes for verification

- **Where to start**: Verify A3 (power roll engine) first. If edges/banes/tiers compute wrong, every other check is unreliable.
- **The temp-Stamina hole**: `damage.ts` step 5 is explicitly TODO. Any test that involves temp Stamina absorption should fail today — flag those as 🟥 if the live site doesn't say "manual override required."
- **The spatial hole**: Anywhere I marked ⚪, the live site should *not* enforce the rule, and the Director should be able to dispatch through it freely. If the UI blocks the Director with a spurious "can't do that — no LoE" error, that's a 🟥.
- **Canon vs engine**: `packages/rules/src/canon-status.generated.ts` says ~everything is "verified" — but that's verified-against-SRD, not implemented-in-engine. Cross-check your verifications against `docs/rules-canon.md` text, not against the status enum.
- **Skill-based +2 bonus**: `power-roll.ts` header comment says "no bonuses/penalties." If you see a skill granting an edge instead of +2, that's the simplification — flag it 🟥 once bonuses are wired.
- **End-of-encounter cleanup**: A common verification — apply a `save ends` effect, end the encounter, confirm it cleared.
- **Bleeding-while-dying loop**: Knock a hero into dying state, take a main action, and the d6+level damage should fire automatically (engine should ask for the d6 if not provided).
