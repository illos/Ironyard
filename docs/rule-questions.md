# Rule questions log

Interpretive decisions, deferred ambiguities, and source contradictions we've encountered while building the rules canon. Every entry records the question, the source text we found, the options we considered, the call we made, and the reasoning — so we can revisit when new information arrives (a printed rulebook clarification, an MCDM erratum, a new SteelCompendium release).

## Why this doc exists

The rules canon (`docs/rules-canon.md`) records what the engine implements. This doc records **how we got there when the source was unclear**. The two-gate workflow (source check + manual review) catches mechanical mistakes; this doc catches *interpretive* drift.

Anywhere a `rules-canon.md` entry rests on a judgment call rather than a direct quote, the entry cites the relevant `Q#` here. If the call later turns out to be wrong, fixing it is a matter of: update the question's status to 🔄 superseded, write a new entry with the corrected interpretation, update the rules-canon entry that cited the old one, drop that canon entry's status back to 🚧 for re-verification.

## Status legend

- 🟢 **resolved** — call has been made; engine implements it
- 🟡 **open** — call deferred until we have more information or get to the relevant canon section
- 🔴 **contested** — multiple authoritative-looking sources disagree; needs a tiebreaker
- 🔄 **superseded** — a later entry replaces this one (kept for history)

## Index

| Q | Topic | Status | Cited from |
|---|-------|--------|------------|
| Q1 | Strained sub-effect timing — when does the "Strained:" rider fire? | 🟢 | rules-canon § 5.3 |
| Q2 | Strained as engine status vs Draw Steel "condition" | 🟢 | rules-canon § 5.3 |
| Q3 | Resolution order — natural 19/20 vs automatic-tier outcomes | 🟢 | rules-canon § 1.6, § 1.8 |
| Q4 | Voluntary downgrade applies after all overrides | 🟢 | rules-canon § 1.7, § 1.8 |
| Q5 | Is a natural 19/20 always a critical hit, or only on certain rolls? | 🟢 | rules-canon § 1.3, § 1.9, § 7.2 |
| Q6 | Multi-type damage from a single source — per-type or pooled? | 🟢 | rules-canon § 2.1, § 2.12 |
| Q7 | Winded value computed from base stamina max or effective max? | 🟢 | rules-canon § 2.7 |
| Q8 | Condition stacking — do multiple impositions compound, replace, or coexist as binary state? | 🟢 | rules-canon § 3.4, § 3.5 |
| Q9 | Saving throws — one roll per save-ends effect, or one roll per turn for all of them? | 🟢 | rules-canon § 3.3 |
| Q10 | Cross-side ordering of simultaneous triggered actions | 🟡 | rules-canon § 4.3, § 4.10 |
| Q11 | Does using a granted ability off-turn consume the recipient's triggered-action quota? | 🟢 | rules-canon § 4.8 |
| Q12 | Stability application — voluntary (target choice) or automatic up to cap? | 🟢 | rules-canon § 6.9, § 6.12 |
| Q13 | Opposed power rolls — simultaneous or sequential? | 🟢 | rules-canon § 7.5, § 7.8 |
| Q14 | Numeric Bleeding rating ("Bleeding 5") — flavor for canon §3.5.1 or per-instance damage? | 🟢 | (parser, not in canon yet) |
| Q15 | Default duration when a tier outcome names a condition with no marker | 🟢 | (parser, not in canon yet) |
| Q16 | Revenant Tough But Withered — inert state, fire-while-inert death, 12h Stamina recovery | 🟡 | rules-canon § 10.1 |
| Q17 | Ancestry signature-trait mechanics not modelled by §10.2 — data + engine gaps | 🟡 (A 🟢 / B 🟡) | rules-canon § 10.2 |
| Q18 | Class-feature choice slots (Conduit Prayers/Wards, Censor Domains) — pipeline gap | 🟡 | rules-canon § 10.11 |

---

## Q1. Strained sub-effect timing 🟢

**Cited from:** `rules-canon.md` § 5.3 (Talent — Clarity).

**The question.** A Talent ability with a `Strained:` sub-effect (rider) — when does the rider fire? Specifically: (a) only when the Talent was already strained *before* using the ability, or (b) also when using the ability *causes* clarity to drop below 0?

**Source.** `.reference/data-md/Rules/Classes/Talent.md` line 94:

> "Whenever you have clarity below 0, you are strained. Some psionic abilities have additional effects if you are already strained or **become strained when you use them**. Strained effects can still impact you even after you are no longer strained."

**Options considered.**

- **Option A:** Only-already-strained. The rider fires if `wasStrained === true` at the moment of use. Becoming strained from the use itself doesn't trigger it.
- **Option B:** Already-OR-becomes-strained. The rider fires if `wasStrained === true` at the start of the use OR if `isStrained === true` after the cost is paid.

**Call: Option B.** The phrase "become strained when you use them" reads as inclusive — using a clarity-cost ability that drops clarity below zero *also* triggers the rider.

**Reasoning.** Verbatim source supports this directly ("already strained or become strained when you use them"). Option A would require ignoring half the sentence. User confirmed by quoting the same line back: *"whenever you have clarity below 0, you are strained — Lets go with it."*

**Engine implication.** When a Talent dispatches a clarity-cost ability, the engine evaluates the Strained rider after the spend is applied. The check is: `(clarityBeforeSpend < 0) || (clarityAfterSpend < 0)`. Both timings produce the rider.

**Subtlety left open.** Strained sub-effects can persist after the Talent is no longer strained — the rider's own duration governs, not the Strained state. The engine applies the rider as a standalone effect with its own lifetime; it does not get cancelled when clarity returns to ≥ 0. This is consistent with the source ("can still impact you even after you are no longer strained") and is not in question, but worth noting alongside Q1 because it's the same line.

---

## Q2. Strained as engine status vs Draw Steel "condition" 🟢

**Cited from:** `rules-canon.md` § 5.3 (Talent — Clarity).

**The question.** Is "strained" a Draw Steel condition (in the formal conditions list with a save mechanic), or a class-specific status the engine tracks separately?

**Source.** Same Talent rule line 94. Notably, the rule does **not** describe a save mechanic for strained — clarity returns to ≥ 0 ends it, not a save. The rulebook's conditions list (not yet drafted in canon § 3) does not include "strained" as of the SteelCompendium pin.

**Call: engine-tracked status, not a Draw Steel condition.** The engine maintains a per-Talent flag `isStrained = clarity < 0` and applies it where needed; it does **not** put strained through the conditions subsystem.

**Reasoning.**

- No save mechanic — Draw Steel conditions in the rulebook have explicit `EoT` / `EoEnc` / "save to end" mechanics. Strained doesn't.
- Class-specific — it applies only to Talents. Conditions in the rulebook are creature-agnostic.
- Deriving from another resource — `isStrained` is purely a function of clarity. A condition would be a stand-alone tracked state.

**Engine implication.** § 3 (Conditions) does not need a `Strained` entry. The Talent resource model in § 5 carries the flag. If the rulebook later adds Strained to the conditions list, this entry becomes 🔄 superseded and § 3 picks it up.

**Confirm-when-drafting-§3.** When we draft § 3 against the rulebook's conditions chapter, verify that "strained" is indeed absent. If present there, supersede.

---

## Q3. Resolution order — natural 19/20 vs automatic-tier outcomes 🟢

**Cited from:** `rules-canon.md` § 1.6, § 1.8.

**The question.** Take a character under an effect that grants an automatic tier 1 outcome on their next power roll. They roll a natural 20. What tier do they get — t1 (auto-tier supersedes) or t3 (natural 19/20 always wins)? And what happens to the crit's extra-action benefit?

**Source.**

- `.reference/data-md/Rules/Chapters/The Basics.md` line 148 (Natural Roll):
  > "When you roll a natural 19 or 20 on a power roll, it is always a tier 3 result **regardless of any modifiers**, and on certain types of power rolls, this is a critical hit."

- Same file line 193 (Automatic Tier Outcomes):
  > "Such effects supersede any edges, banes, bonuses, or penalties that might affect the roll. **If you obtain an automatic tier outcome and the power roll would have an additional effect if you get a specific roll, such as scoring a critical hit in combat, you can still make the roll to determine if you obtain the additional effect in addition to the automatic outcome.**"

**Options considered.**

- **Option A:** Auto-tier wins on the tier value. Nat-19/20's *additional effect* (the crit's bonus-action benefit) still fires alongside, but the tier stays at the auto-tier's value.
- **Option B:** Nat-19/20 wins. Tier becomes 3 and the auto-tier is overridden entirely.

**Call: Option A.** Auto-tier supersedes; nat-19/20's tier-3 override is blocked, but the crit's side effects still fire if the roll lands on 19/20.

**Reasoning.** The second sentence of the auto-tier rule (line 193) is *exactly this case* — automatic tier outcome plus an "additional effect if you get a specific roll, such as scoring a critical hit." It resolves the case explicitly: "you can still make the roll to determine if you obtain the additional effect **in addition to the automatic outcome**." That phrasing only makes sense if the auto-tier outcome stays in place and the nat-19/20 contributes its *side* effects (not its tier override). Under Option B that sentence would be redundant — the rule would just say "natural 19/20 supersedes auto-tier."

The nat-19/20 rule's phrase "regardless of any modifiers" is read in the rulebook's taxonomy: a "modifier" is an edge, bane, bonus, or penalty. Auto-tier is its own category and isn't bound by that phrase.

**Engine implication.** `rules-canon.md` § 1.8: step 7 forces tier to 3 on nat-19/20, then step 8 applies auto-tier and overrides if present. So the *final* tier under auto-tier is the auto-tier value. Separately, when the engine drafts the Crit section (currently TBD), the crit's extras need to fire on `natural ∈ {19,20}` independently of whatever the final tier is — i.e., a forced-t1 character who rolls a nat 20 still gets the crit's bonus-action benefit. § 1.8 has the tier ordering right; this Q3 entry records *why* that order was chosen and flags the separate crit-extras dispatch as a load-bearing detail for the Crit section.

---

## Q4. Voluntary downgrade applies after all overrides 🟢

**Cited from:** `rules-canon.md` § 1.7, § 1.8.

**The question.** When the rule says "you can always downgrade your power roll to a lower tier" (line 140), is that a roller's choice applied at the very end of resolution (after auto-tier and natural-19/20), or is it interleaved with the resolution math?

**Source.** `Rules/Chapters/The Basics.md` line 140:

> "Whenever you make a power roll, you can downgrade it to select the outcome of a lower tier."

And line 142:

> "If you downgrade a critical hit, you still get the extra action benefit of the critical hit."

**Call: voluntary downgrade is the final step.** It applies *after* all tier-shifts, natural-19/20, and auto-tier resolution.

**Reasoning.** Line 142 explicitly contemplates downgrading a crit, which means the downgrade has to be able to operate on a tier that was *forced* by another rule (a crit is one of the cases where natural 19/20 gives an unstoppable t3). If downgrade weren't last, you couldn't downgrade a forced-t3 crit.

**Engine implication.** § 1.8 step 9 is the downgrade application. Critical-hit detection happens before downgrade and the "extra action" benefit survives the downgrade.

---

## Q5. Is a natural 19/20 always a critical hit, or only on certain rolls? 🟢

**Cited from:** `rules-canon.md` § 1.3, § 1.9, § 7.2.

**The question.** Two earlier-encountered source texts disagreed on whether natural 19/20 is *always* a crit or only on certain rolls. The user's printed Heroes Book quote (2026-05-10) resolves the question.

**Source — definitive rule (user, from printed rulebook):**

> "**Critical Hit:** When you roll a natural 19 or 20 on a Strike or ability power roll on an ability that uses an action, you can immediately take another action."

And from `.reference/data-md/Rules/Chapters/Tests.md:125`:

> "Whenever you get a natural 19 or 20 on the power roll for a test... you score a critical success. This critical success automatically lets you succeed on the task with a reward..."

**Call.** Natural 19/20 has three distinct effects depending on roll type:

| Roll type | Effect |
|-----------|--------|
| **Test** (any difficulty) | **Critical success** — always success with a reward. (§ 7.2) |
| **Strike or ability power roll** for an ability that **uses an action** | **Critical hit** — tier 3 result (per § 1.3) **plus** the actor can immediately take another action. (§ 1.9) |
| **Strike or ability power roll** for an ability used as a **maneuver, free action, etc.** (not "an action") | **Tier 3 only.** Natural 19/20 still forces tier 3 per § 1.3, but does NOT grant the crit-hit "another action" benefit. |

The earlier-cited SteelCompendium markdown said crits happen "on certain types of power rolls" — directionally correct, but vague. The user's first paraphrased quote (treating nat 19/20 itself as a Critical Hit) was a simplification that conflated the natural-19/20-forces-tier-3 rule with the more specific crit-hit benefit. The printed rulebook text resolves both: tier-3 force is universal; the extra-action benefit is conditional.

**Engine implication.** § 1.9 spells out the conditions and benefit. The reducer detects nat 19/20 in step 7 of § 1.8 (forces tier 3 — though auto-tier overrides per Q3), and separately dispatches a `GrantExtraAction` derived intent if the conditions in § 1.9 are met (Strike or ability power roll, ability category is "action"). The extra-action benefit fires alongside auto-tier (per Combat.md:193) and survives a voluntary downgrade (per Combat.md:142).

**One sub-call left inline in § 1.9 (not formal Q-worthy):** when an ability normally categorized as a main action is used through a different mechanism (e.g. Melee Weapon Free Strike used as an opportunity attack — a free triggered action), does crit-hit still trigger? **Engine call: yes** — the ability's category is the property, not how it's currently being triggered. This is the natural reading of "an ability that uses an action" and preserves the excitement of a nat-19/20 opp attack. Inline in § 1.9; revisit if a table case contradicts.

**Resolved:** 2026-05-10, user-quoted printed rulebook.

---

## Q6. Multi-type damage from a single source — per-type or pooled? 🟢

**Cited from:** `rules-canon.md` § 2.1, § 2.12.

**The question.** An ability deals "8 fire damage and 4 cold damage" in a single hit. The target has `fire weakness 5` and `cold immunity 3`. Do weakness and immunity apply per-type (fire and cold computed independently, then summed), or to a pooled total?

**Source.** Combat.md is silent on the multi-type case. It addresses single-type-with-multiple-modifiers explicitly (lines 627, 637 — "if multiple immunities apply, only the highest applies"), but doesn't describe what counts as "a source of damage" when one source carries two typed clauses.

**Options considered.**

- **Option A: Per-type, independent then sum.** Fire: `8 + 5 = 13` (no fire immunity) → 13. Cold: `4 - 3 = 1` (no cold weakness) → 1. Total to stamina: 14.
- **Option B: Pooled.** Pool to 12 untyped, apply the *highest* applicable weakness and immunity once. Weakness 5 (fire only) — doesn't apply to "pooled". Result: 12. Or — apply the strongest match: 12 → no weakness applies (no "all" weakness), no immunity applies (no "all" immunity), 12 to stamina.
- **Option C: Treat the typed-but-mixed source as untyped.** Pool to 12 with no type interaction. 12 to stamina.

**Call: Option A (per-type, independent, then sum).**

**Reasoning.**

- Each typed clause has its own type, so "the damage type" is well-defined per clause but not for the bundle.
- Weakness and immunity are explicitly type-keyed ("fire weakness 5", "cold immunity 3"). Pooling discards information the rule needs.
- Option A is the natural interpretation of "apply weakness/immunity for matching damage type" when there are two types — apply each to the matching portion.
- This matches conventions in most TTRPGs that explicitly support multi-type damage (e.g. D&D 5e).
- Option B/C would let a creature with fire weakness *avoid* the weakness simply because the attack also dealt 1 cold damage. Counterintuitive and likely not intended.

**Engine implication.** § 2.12: for a multi-type source, the engine runs the modifier pipeline (steps 1–4) independently per typed clause, then sums the final amounts before draining temp stamina and applying to stamina. Each clause's "highest applicable" weakness/immunity is selected independently — a fire-typed clause picks the highest matching fire-or-universal weakness/immunity; a cold-typed clause picks the highest matching cold-or-universal weakness/immunity.

**Edge case.** A universal `damage immunity 5` is a candidate for the "highest applicable immunity" on *every* typed clause within a multi-type source. So the universal value gets a chance to apply to each clause independently (and may be higher than a clause's type-specific immunity). This is a direct consequence of Option A and is the engine behavior.

**To revisit if:** the printed rulebook or an MCDM erratum addresses the multi-type case explicitly. If they choose pooling or untyped-collapse, supersede this entry and drop § 2 back to 🚧.

---

## Q7. Winded value computed from base stamina max or effective max? 🟢

**Cited from:** `rules-canon.md` § 2.7.

**The question.** Effects can reduce a character's stamina maximum (Combat.md:643). The winded value is defined as "half your Stamina maximum" (Combat.md:651). When stamina max has been reduced — say from base 30 down to effective 24 — is the winded value `floor(30/2) = 15` (base) or `floor(24/2) = 12` (effective)?

**Source.** Combat.md:651:
> "Your winded value equals half your Stamina maximum."

The text doesn't distinguish between base and effective max. The reduction rule (line 643) also doesn't say whether derived values like winded value or recovery value should track the reduction.

**Options considered.**

- **Option A: Base max.** Winded value is computed once from the base stamina maximum and doesn't change when effects reduce the max. Reduction only affects the cap on regained stamina.
- **Option B: Effective max.** Winded value recomputes whenever the effective max changes. A character whose max is reduced from 30 to 24 becomes winded sooner (at ≤12 instead of ≤15).

**Call: Option A (base max).** User confirmation, 2026-05-10.

**Reasoning.** "Stamina maximum" in the rulebook generally refers to the character's printed value — the class-determined number on the sheet. The "reduction" rule reads as a constraint on regain rather than a redefinition of the maximum. Option A keeps winded-value behavior predictable across an encounter (it doesn't shift mid-fight as reductions come and go), and matches the natural reading of "your stamina maximum" as a fixed character attribute.

**Engine implication.** § 2.7: `windedValue = floor(staminaMax / 2)`, where `staminaMax` is the base value, **not** `staminaMax - staminaMaxReduction`. Same logic applies (consistent reading) to `recoveryValue = floor(staminaMax / 3)` in § 2.10 — base, not effective.

**To revisit if:** an MCDM clarification or printed erratum says "effective max" governs. Note that this would change the windedness threshold dynamically and the engine would need to recompute and emit `BecameWinded` / `NoLongerWinded` log entries on every max change.

---

## Q8. Condition stacking 🟢

**Cited from:** `rules-canon.md` § 3.4, § 3.5.

**The question.** A creature is Bleeding from Source A. Source B (a different ability) also imposes Bleeding on them. Do they take damage from Bleeding twice per qualifying action? Once? And what about Slowed — does Slowed twice → speed 1 (Slowed-2 stacked) or still speed 2?

**Source.** The rulebook is explicit about stacking for two conditions:

- **Frightened** (Classes.md:458): "If a creature gains the frightened condition from one source while already frightened by a different source, the new condition replaces the old one."
- **Taunted** (Classes.md:490): "If a creature gains the taunted condition from one source while already taunted by a different source, the new condition replaces the old one."

For the other seven (Bleeding, Dazed, Grabbed, Prone, Restrained, Slowed, Weakened), the rulebook does **not** specify stacking behavior.

Bleeding does, however, contain a strong hint about its own intended behavior: Classes.md:448 says the Stamina loss "only happens once per action." This suggests Bleeding is binary regardless of source count — you don't take damage once per source per action.

**Options considered.**

- **Option A: Binary per creature.** Each condition is either on or off. Multiple impositions from different sources don't compound; they just contribute their own duration. The creature is in the condition while *any* source is still active.
- **Option B: Stack effects.** Two Bleeding sources → two damage rolls per qualifying action. Two Slowed → speed reduced further. Could match D&D-style stacking but contradicts Bleeding's "once per action" rule.
- **Option C: Replace-all.** New imposition from a different source always replaces the prior, full stop. Generalizes the Frightened/Taunted rule.

**Call: Option A (binary per creature) for the seven silent conditions; Option C (replace) for Frightened and Taunted per the rulebook.**

**Reasoning.**

- Bleeding's "only happens once per action" is direct rulebook evidence against Option B.
- Option C as a universal rule would mean Bleeding from a low-level source could replace Bleeding from a higher-level source (with a longer duration), which is counterintuitive and isn't supported by any rulebook text outside Frightened/Taunted.
- Option A respects the rulebook's explicit Frightened/Taunted handling (which becomes a special case), preserves per-source durations (so a save can end Source A's contribution without ending Source B's), and matches Bleeding's once-per-action constraint by treating the condition as a binary gate.

**Engine implication.** § 3.6: the engine stores condition instances per-source so durations track independently, but the condition's *effect* is computed from "any active instance exists." The condition's textual effect is evaluated once, not per instance. For Frightened and Taunted, the reducer additionally clears any prior instance from a different source before applying a new one.

**Edge cases the call leaves clean:**

- Bleeding from EoT + Bleeding from save-ends → creature is Bleeding while at least one is active. EoT's instance ends at end of next turn; save-ends instance persists until a successful save. Damage triggers once per qualifying action throughout.
- Slowed from a 1-turn effect + Slowed from a longer effect → speed is 2 throughout. The shorter ends first; once both end, speed returns to normal.
- Grabbed by two creatures: the rulebook says a creature can grab only one creature at a time (Classes.md:470), but doesn't address being grabbed by multiple. Under Option A: the engine tracks each grabber separately, the creature is grabbed (effect binary), and *each* grabber gets the per-grab rules (moving the grabbed creature, releasing, etc.). Each grabber can independently end their own grab. The grabbed creature escapes either grab via Escape Grab; escaping one doesn't escape the other.

**To revisit if:** an MCDM clarification specifies a different stacking rule for any of the silent conditions, or if play reveals an edge case Option A handles poorly.

---

## Q9. Saving throws — per-effect or per-turn? 🟢

**Cited from:** `rules-canon.md` § 3.3.

**The question.** A character ends their turn with two `save_ends` effects on them — say, Bleeding (save ends) and Slowed (save ends). Do they roll **one** saving throw against both, or **two** independent saves (one per effect)?

**Source.** The rulebook's primary save text uses singular phrasing throughout:

- Classes.md:406: "If an effect has '(save ends)' at the end of its description, a creature suffering **the effect** makes a saving throw at the end of each of their turns to remove **the effect**."
- Classes.md:408: "To make a saving throw, a creature rolls a d10. On a 6 or higher, **the effect** ends. Otherwise, it continues."
- Introduction.md:485: "An effect noted as '(save ends)' lasts until the creature affected by it succeeds on a saving throw, or until a combat encounter ends."
- Combat.md:541 (Heal main action): "...can make a saving throw against **one effect** they are suffering that is ended by a saving throw."

**Options considered.**

- **Option A: Per-effect, independent.** Each `save_ends` effect prompts its own d10 saving throw at end of turn. With two effects, the creature rolls twice; each succeeds or fails independently.
- **Option B: One roll per turn.** The creature rolls a single d10; on a 6+ they choose one effect to end. Or on a 6+ all save-ends effects end.

**Call: Option A (per-effect, independent).**

**Reasoning.**

- The Heal action specifically says "one effect" — implying that in the normal end-of-turn flow, the creature can save against *more than one* effect (otherwise the carve-out would be redundant; you'd never need to single out "one").
- Classes.md:406 uses "the effect" (singular) in the per-creature loop, which is most naturally read as "for each save-ends effect, run this loop" rather than "across all save-ends effects, run this loop once."
- Option B's variant ("on a 6+ all effects end") would make stacking multiple save-ends effects on a creature trivial to clear and is the least plausible reading.
- Option B's other variant ("on a 6+, end one of them") creates a tactical layer (which effect to end?) that isn't explained anywhere in the rulebook — if it were the rule, it would be described.

**Engine implication.** § 3.3: at the end of the affected creature's turn, the reducer iterates over all `save_ends` effects on that creature and dispatches a `RollResistance` intent for each, in order by `appliedAtSeq` (so logs read chronologically). Each save resolves independently. The dispatcher provides one d10 per effect.

**Edge case.** If a `save_ends` effect has an additional condition on its end (e.g. an ability that says "and the creature is no longer adjacent to you"), the save and the additional condition both need to be satisfied to end the effect. The engine handles this by recording an `additionalEndCondition` on the instance; the save succeeding only ends the effect if the additional condition is also met at the moment of the save.

**User confirmation:** "I think this is right but log in rule questions doc." (2026-05-10)

**To revisit if:** an MCDM clarification or printed erratum specifies a one-roll-per-turn rule for saves.

---

## Q10. Cross-side ordering of simultaneous triggered actions 🟡

**Cited from:** `rules-canon.md` § 4.3, § 4.10.

**The question.** A trigger fires that prompts both a player-controlled creature and a Director-controlled creature to use triggered actions in response. The PC side has decided the order among their own queue; the Director has decided the order among theirs. **Which side's queue resolves first?**

**Source.** Combat.md:125:

> "If multiple triggered actions occur in response to the same trigger, any heroes and other player-controlled creatures taking a triggered action or a free triggered action decide among themselves which of those triggered actions are resolved first. Then the Director decides the same for creatures they control."

The rulebook describes intra-side ordering for both sides, but the cross-side ordering is not specified.

**Options considered.**

- **Option A: PC side resolves first, then Director side.** A natural reading of the order of clauses in the rulebook sentence: PCs decide their order ("first"), then the Director decides theirs.
- **Option B: Director side resolves first, then PC side.** Mirror of A.
- **Option C: The trigger's owner (the side responsible for the action that caused the trigger) is reactive — the *other* side's responses resolve first.** I.e., if a hero's movement triggered the responses, Director-side responses resolve first; if a Director-controlled creature's action triggered them, PC-side responses resolve first.
- **Option D: Strict round-robin by initiative position, ignoring sides.** Both queues are interleaved by some objective ordering.
- **Option E: Director decides cross-side order at the table.** Defer to the Director as the rules judge.

**Status: 🟡 open.** No call made yet.

**Engine implication (until resolved).** The reducer surfaces the trigger-resolution moment as a `ResolveTriggerOrder` intent. By default, the engine presents both queues to the Director and lets the Director sequence them — Option E as a safe fallback. The engine *also* records the trigger's "side of origin" so we have the data needed to implement Option C if that's the call. Switching to Option A or B is a one-line change.

**Why this isn't urgent.** This case is genuinely rare at the table — most encounters won't have simultaneous PC + Director triggered actions firing on the same trigger. The engine's "ask the Director" fallback is non-broken for v1; we can resolve formally when an instance comes up at the table.

**To resolve:** print-rulebook check (does an erratum or a later printing clarify?), or by table convention if we'd rather lock a rule than wait.

Searched PDFs 2026-05-12, no additional rule text found — Heroes Book p.267 (extract line 19815) reproduces the SteelCompendium markdown verbatim. The PDF likewise stops at "any heroes ... decide among themselves ... Then the Director decides the same for creatures they control" and is silent on cross-side ordering.

---

## Q11. Granted-ability quota 🟢

**Cited from:** `rules-canon.md` § 4.8.

**The question.** A tactician uses Strike Now (a triggered action) to let an ally use a signature ability off-turn. The ally takes the granted ability use. **Does that ally also spend their once-per-round triggered action?**

**Source.** Combat.md:549–551:

> "Some abilities, such as the tactician's Strike Now or I'll Open and You'll Close abilities, allow another creature to use a signature ability or heroic ability when it isn't their turn. Unless otherwise stated, a creature can always use a free strike instead of a granted signature ability or heroic ability."

The rulebook describes the mechanic but doesn't specify whether the granted use counts against the recipient's action-economy quotas.

**Options considered.**

- **Option A: Granted use does not consume the recipient's triggered-action quota.** The granter's ability is the triggered action; the recipient is simply executing what the granter enabled. The recipient still has their own triggered action available later in the round.
- **Option B: Granted use consumes the recipient's quota.** The recipient is the one using the ability, so it counts as their off-turn action use.

**Call: Option A.**

**Reasoning.**

- The granter's triggered action *is* the action being spent. The recipient acting off-turn is the *effect* of the granter's ability, not a separate triggered action from the recipient.
- The rulebook gives no signal that a granted ability use consumes the recipient's quota. Such a meaningful constraint would be stated.
- Design intent: the value proposition of granting abilities (Strike Now, Hesitation Is Weakness etc.) is that they provide *additional* effective action economy. Under Option B, an ally who's already used their triggered action that round simply can't be granted anything — making these abilities much weaker than they appear and creating bookkeeping noise the rulebook doesn't acknowledge.
- The "substitute a free strike for the granted ability" rule (Combat.md:551) further supports A: it would be strange to require the recipient to "spend their triggered action" to use a free strike that they didn't pick — the free strike is just a fallback path for the granted ability.

**Engine implication.** § 4.10 turn state machine: the recipient's `triggeredActionUsedThisRound` flag is **not** set when they use a granted ability. The granter's flag *is* set (the granter spent their triggered action by using the granting ability).

**Edge case — does Dazed or Surprised block a granted ability use on the recipient?** The rulebook says these states block the affected creature's triggered and free triggered actions. Since a granted ability use is *not* the recipient's own triggered action (per the call above), a literal reading is that Dazed/Surprised wouldn't block it. **Engine call:** for play sensibility, treat the recipient as still subject to Dazed/Surprised — a Dazed character can't be granted off-turn ability use even if it technically isn't their triggered action. Flag for revisit if the table feels this differently in practice.

**User confirmation:** "I think you are right but add to rule questions." (2026-05-10)

**To revisit if:** an erratum or printed rulebook explicitly addresses the quota question, or the Dazed/Surprised edge-case interpretation needs tightening.

---

## Q12. Stability application — voluntary or automatic? 🟢

**Cited from:** `rules-canon.md` § 6.9, § 6.12.

**The question.** When a creature with stability is force-moved, does their stability **automatically** reduce the distance up to its cap, or do they **choose** how many squares of stability to apply (0 to stability value)?

The distinction matters when the target *wants* to be force-moved — e.g. a hero with stability 2 wants to be pushed off a cliff away from a stronger threat, or a Talent wants to be force-moved so an ally gains 1 clarity (§ 5.3 gain trigger). Under automatic, stability fires whether useful or not. Under voluntary, the target picks.

**Source.** Combat.md:388:

> "When a creature is force moved, they can reduce that movement up to a number of squares equal to their stability."

"They can reduce ... up to" is naturally read as discretionary, but the rulebook doesn't address the choice explicitly.

**Options considered.**

- **Option A: Voluntary.** Target decides per force-move how much stability to apply (0 to stability). Requires a decision-point in the engine.
- **Option B: Automatic up to cap.** Stability always applies fully. Simpler. Slightly off the natural reading of "can reduce."
- **Option C: Automatic but with an explicit "drop stability" override.** Always applies unless the target uses a no-action ability to suppress it for one force-move.

**Call: Option A (voluntary).** User confirmation, 2026-05-10.

**Reasoning.** "They can reduce ... up to" reads naturally as discretionary — the target *can* invoke stability, and the upper bound is their stability score. Voluntary is the natural-language reading; it also preserves a real tactical choice (intentionally being pushed off a cliff away from a stronger threat, taking the push to gain clarity per § 5.3, etc.).

**Engine implication.** § 6.9 / § 6.12: on any force-move targeting a creature with `stability > 0`, the engine prompts the target's controller for how many squares of stability to apply (0 ≤ n ≤ stability). UI defaults: PC side, default n = stability with a "use less" affordance; Director side, default n = stability (Director can override per creature). The prompt is the engine's only synchronous decision-point inside the force-move pipeline.

**To revisit if:** play reveals the prompt is too noisy (e.g. nearly every force-move uses full stability, making the choice perfunctory). In that case we could ship a "auto-apply full stability unless I say otherwise" per-character preference.

---

## Q13. Opposed power rolls — simultaneous or sequential? 🟢

**Cited from:** `rules-canon.md` § 7.5, § 7.8.

**The question.** In an opposed power roll (e.g. hero sneaks past demon: hero's Agility test vs demon's Intuition test), are both rolls made **simultaneously** (neither party knows the other's result), or **sequentially** (the second party rolls knowing the first's total)?

The distinction matters because hero-tokens (Tests.md:97) let a player re-roll a test they don't like. If the hero rolls first and the demon rolls second, the demon doesn't get to spend a "monster token" to re-roll, but the hero might want to wait to see the demon's roll before deciding to re-roll. If they're simultaneous, the hero must decide before knowing the result.

**Source.** Tests.md:232–238 describes opposed power rolls but doesn't specify simultaneity:

> "When two creatures are engaged in a particularly dramatic struggle that requires them both to make tests, the Director can have all the creatures involved make a test. The creature with the highest power roll wins."

**Options considered.**

- **Option A: Simultaneous.** Both creatures' rolls are made at the same time. Players can't choose to re-roll based on knowing the opposed total.
- **Option B: Sequential, hero first.** Hero rolls, then NPC rolls; re-roll decisions are made before the NPC's roll.
- **Option C: Sequential, NPC first.** NPC rolls (Director may do so secretly), hero rolls knowing the bar to beat.

**Call: Option A (simultaneous).**

**Reasoning.**

- Dramatic equality. The "particularly dramatic struggle" framing of opposed power rolls in the rulebook is symmetric — both creatures' fates hang on the joint outcome. Sequential resolution would break that symmetry.
- Hero-token re-rolls (Tests.md:97) work the same way for opposed and non-opposed tests: the player decides to re-roll based on their own roll, not on what they're rolling against. The simultaneous model preserves this consistency.
- Engine implementation is cleaner — the dispatcher pre-rolls both sides in one intent shape (`{ rolls: [d10, d10], opposedRolls: [d10, d10] }` per the dispatcher-pre-rolls model from § 1).
- "Sequential, NPC first" (Option C) would also force the Director to roll for monsters, which contradicts the general "heroes make tests, NPCs do not" rule (Tests.md:208) — opposed rolls are themselves an exception, but minimizing further exception layering is cleaner.

**Engine implication.** § 7.8: opposed power rolls dispatch as a single `RollOpposedTest` intent with both sets of d10 values in the payload. The reducer computes both totals independently (each with their own characteristic, bonuses, edges/banes per § 1) and emits the winner. The hero-token re-roll path operates on one side's roll, decided before the simultaneous comparison; the same mechanism applies to both sides if both have access to re-roll currency (rare).

**To revisit if:** an MCDM clarification specifies a turn-order for opposed rolls, or if the table finds simultaneous resolution removes interesting tactical decisions.

---

## Q14. Numeric Bleeding rating ("Bleeding 5") 🟢

**Question.** Some monster ability tier text reads `… is Bleeding 5 (save ends)` (canon-equivalent form). Is the `5` a per-instance damage rating that *replaces* the canon §3.5.1 default (`1d6 + level`)? Or is it ornamental flavor, with the Bleeding hook firing canonical damage regardless?

**Source.** Zero occurrences of `Bleeding \d+` in the current pinned SteelCompendium snapshot. Mentioned in the brief and observed in informal community homebrew, but not in pinned data today.

**Options.**
- **A.** Ornamental — engine ignores `N`. Bleeding fires canonical `1d6 + level` per §3.5.1.
- **B.** Per-instance damage — the rating overrides canonical for that instance.
- **C.** Stacking source — the rating adds to canonical damage.

**Call.** **A.** Confirmed by PDF search 2026-05-12: zero occurrences of `Bleeding \d+` in either `/tmp/heroes.txt` or `/tmp/monsters.txt`. Heroes Book glossary (line 544): "Bleeding: A condition that causes a creature to take 1d6 + level damage whenever they use a maneuver or triggered actions, or make a power roll using Might or Agility." Bleeding has no rating mechanic in canonical Draw Steel — the canonical formula always governs. The parser still preserves any `N` it sees in `ConditionApplicationOutcome.note` for director visibility (homebrew-friendly), but the engine never reads it.

**Engine implication.** Today: no engine impact. Bleeding always uses canonical `1d6 + level` per §3.5.1.

**Resolved:** 2026-05-12, PDF source check.

**To revisit if:** future SteelCompendium snapshots or an MCDM erratum introduces `Bleeding N` as a first-class mechanic.

---

## Q15. Default duration when a tier outcome names a condition with no marker 🟢

**Question.** When a tier reads `the target is Slowed` (no `(save ends)`, no `(EoT)`, no `until …` marker), what duration does the engine apply?

**Source.** Canon §3.2 textual default is `end_of_encounter`. But empirically, tier-outcome strings in SteelCompendium consistently read as ephemeral (action-scoped) effects — applying a until-encounter-end Slowed on every unmarked roll would lock conditions on for whole encounters and almost certainly be wrong for table play.

**Options.**
- **A.** Default to `EoT` (until end of next turn) — the most common explicit form, matches table intuition.
- **B.** Default to `end_of_encounter` — matches canon §3.2 literal.
- **C.** Default to `save_ends` — never end automatically; force the director to dispatch saves.

**Call.** **B (end_of_encounter).** PDF source check 2026-05-12 resolves the question. Heroes Book p.76 "Ending Effects" (extract lines 6244–6256):

> "When a creature suffers a lasting effect, whatever ability, feature, hazard, or other mechanic imposed the effect specifies how long the effect lasts. **Unless otherwise noted, all effects and conditions that are imposed on heroes during a combat encounter end when the encounter is over** if the hero wants them to, except for being winded, unconscious, or dying. After combat, effects and conditions imposed on other creatures end when it’s convenient for the heroes…"

The rulebook is explicit: the default duration for an unmarked effect/condition is end-of-encounter. Markers (`(EoT)`, `(save ends)`, `until …`) override the default, as canon §3.2 already specifies.

This **reverses the earlier provisional Call A** (EoT default). The intuition that "unmarked → ephemeral" doesn't survive the source text; Draw Steel's design genuinely is that unmarked conditions persist until the encounter ends unless the affected creature chooses to drop them when the encounter is over.

**Engine implication.** Parser default flips from `EoT` to `end_of_encounter` to match canon §3.2 and the rulebook. Existing markers still override. Engine behavior is unchanged — it consumes whatever the parser emits.

**TODO for rules-canon.md.** Canon §3.2 already documents `end_of_encounter` as the default; no edit needed there. **But** any parser code (or canon entry citing the parser) that currently states the unmarked default is `EoT` needs to be updated to `end_of_encounter`. Search points: §3.2 parser-default note in `rules-canon.md`, and the parser source in `packages/rules/src/conditions/` (or equivalent). Author of the next canon-touching task should verify the parser default matches and patch if not.

**Resolved:** 2026-05-12, PDF source check (Heroes Book p.76 "Ending Effects").

**To revisit if:** playtest finds end-of-encounter defaults cause confusion at the table (e.g. directors forgetting to clear conditions between rooms), or an MCDM erratum reverses the default.

---

## Q16. Revenant Tough But Withered — out-of-scope mechanics 🟡

**Cited from:** `rules-canon.md` § 10.1.

**Question.** Revenant's signature trait *Tough But Withered* (printed Heroes Book) grants four immunities + fire weakness 5 (handled in § 10.1) but ALSO carries several mechanics that don't fit the `CharacterAttachment` shape:

1. **Inert state replaces dying.** When Revenant's Stamina reaches `-winded`, they become **inert** instead of dying. Inert = prone, can't stand, can't speak, no main / maneuver / move / triggered actions; otherwise observes surroundings.
2. **Fire-while-inert insta-death.** Any fire damage taken while inert destroys the body and kills the Revenant.
3. **12-hour Stamina recovery from inert.** After 12 hours inert (without dying to fire), regain Stamina equal to recovery value (presumably exiting inert).
4. **No suffocation / no eat-or-drink.** Narrative; no runtime effect — engine ignores.

**Source.** `.reference/data-md/Rules/Ancestries/Revenant.md` Signature Trait block (printed Heroes Book confirmed by user 2026-05-12).

**Engine implication today.** None of these are auto-applied. The engine's damage pipeline currently stops at "Slice 3 subset" (weakness → immunity → stamina; see `packages/rules/src/damage.ts:3-5`). Winded / dying / dead transitions are deferred to a later slice — and Revenant's *inert* state is a per-ancestry override that has to layer on top of whatever dying transition the engine ends up modeling. Until that lands, a Revenant at negative-winded must be narrated manually.

**Why this isn't a § 10 (CharacterAttachment) concern.** § 10 models stat/effect folding into derived runtime (`maxStamina`, `immunities`, etc.). The Revenant mechanics above are *behavioral changes* to game-mechanic state transitions, not runtime stat mods. Trying to encode "replaces dying with inert" as an `AttachmentEffect` variant would require modeling state machines in attachments, which would be the wrong abstraction.

**Right homes (when those engine sections exist):**
- Inert / fire-death / 12-h recovery → `rules-canon.md § 2.7-2.9` (winded / dying transitions) once those sections land in the damage engine. Revenant's ancestry id will gate per-character override behavior.
- Suffocation / no eat-drink → out of scope for the engine; narrative only.

**Status.** 🟡 open. No action required for Epic 2B close; revisit when § 2.7+ (winded/dying transitions) lands.

**To revisit if:** the damage engine grows past its Slice 3 subset to handle winded/dying transitions, OR a Revenant character actually hits negative-winded in a real session and the table needs engine support.

Searched PDFs 2026-05-12, no additional rule text found — Heroes Book Revenant Signature Trait (extract lines 4061–4072) reproduces the same mechanics already cited in this entry (inert state replaces dying, fire-while-inert insta-death, 12-h Stamina recovery, no suffocation / no eat-drink). The question is an engine-gap question (no current `winded/dying` pipeline to host these mechanics), not a source-text ambiguity, so the PDFs don't resolve it.

---

## Q17. Ancestry signature-trait mechanics not modelled by § 10.2 🟡 (A 🟢 / B 🟡)

**Cited from:** `rules-canon.md` § 10.2.

**Question.** § 10.2 handles ancestry signature traits whose mechanic is an invocable ability (Human *Detect the Supernatural* maneuver; Polder *Shadowmeld* magic maneuver). The remaining signature traits fall into two categories of gaps:

### A — Data gaps (engine path exists; data missing) 🟢 RESOLVED 2026-05-13

Both abilities are now hand-authored in `packages/data/overrides/synthetic-abilities.ts` (the markdown parser doesn't walk ancestry files, so they're injected at build time) and the matching `signatureTraitAbilityId` entries in `ANCESTRY_OVERRIDES` are wired.

**Implementation note — narrative-tag pattern.** Neither ability has structured mechanical effects the engine can auto-apply ("you know the location of supernatural creatures" / "you flatten into a shadow with bane on strikes/searches"). The design call (user, 2026-05-13): model these as **active-ability tags** rather than ad-hoc state machines. New shared schema `ActiveAbilityInstance` on `Participant.activeAbilities`; new `UseAbility` intent appends to the array; the `EndTurn` reducer drains `EoT` entries for the ending creature; `EndEncounter` drains all entries. The sheet renders a violet chip per active entry and an "Activate" button on maneuver-typed ability cards. The director / player adjudicates the effect at the table.

This pattern is reusable for any future ability whose effect is too narrative to encode — class features, items, kits all have `ActiveAbilitySource` values reserved.

- **Human *Detect the Supernatural*** — done.
- **Polder *Shadowmeld*** — done.

### B — Engine gaps (no current mechanism)

These signature traits use rules patterns the current engine doesn't model:

- **Orc *Relentless*** — "Whenever a creature deals damage to you that leaves you dying, you can make a free strike against any creature. If the creature is reduced to 0 Stamina by your strike, you can spend a Recovery." Triggered-passive on entering `dying` state. Belongs in § 2 damage-pipeline once dying transitions land.
- **Dwarf *Runic Carving*** — choose one of three rune effects (Detection / Light / Voice) after 10 min of work; changeable. Effectively a choice-of-three sub-abilities, each with non-stat narrative effects. Needs a `runicCarving: 'detection' | 'light' | 'voice' | null` choice on `AncestryChoicesSchema` + an engine path for non-stat narrative abilities.
- **Wode Elf / High Elf *Glamor*** — both grant edges on specific test types (hide/sneak, Flirt/Persuade) and Wode Elf imposes a bane on enemy searches. Test-time edge modifiers, not runtime stat folds. Needs a "test-edge override" mechanism in the test resolution path (`packages/rules/src/power-roll.ts` or its test-roll cousin).
- **Devil *Silver Tongue* (edge component)** — "edge on tests when attempting to discover an NPC's motivations and pitfalls during a negotiation." Same shape as Glamor edges — test-time edge modifier.

**Engine implication today.** None of these auto-apply. A player whose character has Orc Relentless must narrate the free strike manually when they hit `dying`. Edges from Glamor / Silver Tongue must be added by the director or player as ad-hoc edge intents at roll time.

**Status.** 🟡 open. No action required for Epic 2B close. The data gaps (A) are small one-line override edits once the abilities are ingested. The engine gaps (B) are larger work that lands in future engine sections (damage pipeline for triggered passives, test-edge override for Glamor-class traits, ancestry-choices schema extension for Dwarf rune system).

**To revisit if:** any of those engine sections grow to cover the relevant mechanic, or a table hits one of these traits in play and wants engine support.

Searched PDFs 2026-05-12, no additional rule text found — Heroes Book ancestry sections confirm the trait mechanics already enumerated (Human *Detect the Supernatural*, Polder *Shadowmeld*, Orc *Relentless*, Dwarf *Runic Carving*, Wode Elf / High Elf *Glamor*, Devil *Silver Tongue*). The question is an engine-gap question (data-pipeline + test-edge-override + ancestry-choices-schema all need work), not a source-text ambiguity, so the PDFs don't resolve it.

---

## Q18. Class-feature choice slots — pipeline gap 🟡

**Cited from:** `rules-canon.md` § 10.11.

**Question.** Several classes have "choose one from a list of class-feature options" structures whose options carry static runtime stats that the engine should fold into the derived character. The current pipeline can't model them because three upstream pieces are missing simultaneously:

1. **Schema slot.** `LevelChoicesSchema` has `abilityIds`, `subclassAbilityIds`, `perkId`, `skillId` — but no `prayerId` / `wardId` / `domainFeatureId` / etc. Players have no way to record which class-feature option they picked.
2. **Parser path.** These options live as inline prose in `Rules/Classes By Level/<Class>/<Level>.md` (e.g. Conduit's `1st-Level Features` block lists *Prayer of Destruction* / *Distance* / *Soldier's Skill* / *Speed* / *Steel* as in-line h4 sub-blocks). They are NOT shaped like the standard Ability statblock (no action-type, no power roll, no tier ladder) so `parseAbilityMarkdown` returns null for them.
3. **Override-map shape.** Even with a schema slot and a parser, today's `ABILITY_OVERRIDES` is keyed by ability id — wrong shape for class-feature-choice ids that aren't abilities.

**Known instances** (printed Heroes Book confirmed 2026-05-12):

- **Conduit Prayers** (5 options, all granting static effects): *Prayer of Destruction* (+1 rolled damage with magic abilities), *Prayer of Distance* (+2 distance on ranged magic abilities), *Prayer of Soldier's Skill* (+3 Stamina per echelon, +1 damage with weapon abilities, kit-bypass for light armor/weapons), *Prayer of Speed* (+1 speed, +1 Disengage distance), *Prayer of Steel* (+6 Stamina per echelon, +1 stability).
- **Conduit Wards** — parallel 5-option block, similar shape (verify when populating).
- **Censor 1st-Level Domain Features** — choose-one-domain-from-12 with paired feature + skill grants (Creation/Death/Fate/Knowledge/Life/Love/Nature/Protection/Storm/Sun/Trickery/War). E.g. *Blessing of Compassion* (Love domain): "edge on any test made to assist another creature with a test"; *Inner Light* (Sun domain), etc.
- Likely more across the other 7 classes — fully cataloguing is part of resolving this Q.

**Engine implication today.** A Conduit hero with Prayer of Steel gets +6 Stamina in the rulebook but the engine doesn't apply it. The character is mechanically incorrect on the sheet. Same for every Conduit prayer/ward and every Censor domain feature with a static effect.

**Right shape (sketch).** Three coordinated changes:

1. Extend `LevelChoicesSchema` (or add a top-level `classFeatureChoices: Record<string, string>` slot on `CharacterSchema`) so the picked feature ids can be recorded.
2. Either (a) extend the parser to emit class-feature *options* as a new shape (`ClassFeatureOption` records) alongside `Ability` records — keyed by `{classId}.{slotName}.{optionId}`, OR (b) hand-author the options in a new override file `packages/data/overrides/class-features.ts` (faster to land, less ambitious).
3. Add a `collectFromClassFeatureChoices` collector (or extend `collectFromClassFeatures`) to read the choice slots + override map and emit attachments.

**Status.** 🟡 open. No action required for Epic 2B close. The mechanism is well-bounded once the schema slot lands; the long tail of cataloguing every class-feature option is the bulk of the work.

**To revisit if:** a table actually plays a Conduit/Censor/Talent/etc. character and notices the missing stat bonuses, OR a future epic specifically targets class-feature completeness.

Searched PDFs 2026-05-12, no additional rule text found — Heroes Book Conduit Prayers (extract lines 7866–7886) and Censor Domain Features (extract lines 6486–6495) confirm the mechanics already enumerated. The question is an engine-gap question (schema slot + parser path + override-map shape all missing), not a source-text ambiguity, so the PDFs don't resolve it.

---

## Adding new entries

When you face an interpretive call while drafting or reviewing a rule:

1. Look for an existing 🟡 entry on the same question — extend it if found.
2. Otherwise add a new `Q<n>` with the structure above: question, source quote(s), options, call, reasoning, engine implication.
3. Cite the entry from the rules-canon section that depends on it.
4. If superseding an older entry, mark the old one 🔄 with a one-line pointer to the new one.
