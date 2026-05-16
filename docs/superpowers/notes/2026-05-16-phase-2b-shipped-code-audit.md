# Phase 2b shipped-code audit — 2026-05-16

## Purpose

After the [2026-05-16 unshipped-2b canon audit](2026-05-16-phase-2b-canon-audit.md) surfaced 5 real bugs (B1-B5) in already-shipped slice 1 / 2a code, the user asked for the same exhaustive treatment applied to the *already-shipped* portions of Phase 2b — sub-epic 2b.0 (resource framework), 2b.0.1 (Pass 3 Slice 2a — class-δ triggers across 9 classes), Pass 3 Slice 2b (targeting relations), and Pass 3 Slice 1's unchecked surface (Hakaan / Title Doomed / CoP overrides, KO interception details, nat 19/20, Bleeding-d6, ResolveTriggerOrder details, bodyIntact, triggeredActionUsedThisRound).

Triggered by the same general principle the items carve-out + unshipped-2b audit established: umbrella one-liners drift from canon, and shipped code following them can ship the drift. Verify against canon.

Dispatched 6 parallel general-purpose agents by disjoint bucket:
- **Agent F** — 2b.0 substrate (resources + Malice + Victories + per-turn gain + EndEncounter resets + HEROIC_RESOURCES table)
- **Agent G** — 2b.0.1 Censor / Conduit / Elementalist
- **Agent H** — 2b.0.1 Fury / Null / Shadow
- **Agent I** — 2b.0.1 Tactician / Talent / Troubadour
- **Agent J** — Pass 3 Slice 2b targeting relations
- **Agent K** — Slice 1 unchecked surface

This document records the synthesized findings and triage recommendation. Bugs are renumbered B6-B39 (continuing from B1-B5 in the prior audit notes) since the agents used overlapping local numbering.

## Headline findings

1. **34 distinct bugs surfaced** across 6 audit buckets (after dedup; 2 bugs found independently by 2 agents corroborate). Three are HIGH severity (broken Victories→XP pipeline = F-cluster).
2. **No discovered bug is a slice-1/2a/2b design failure** — every one is either (a) a missing-but-deferred feature the spec acknowledged, (b) a level-scaling stop-gap that worked at the time of ship but rots with content additions, or (c) a canon edge-case the umbrella one-liner didn't surface clearly enough.
3. **Clusters fall into 6 thematic groups** with distinct fix surfaces. The Victories/XP cluster is shippable alone in <½ day; the level-scaling cluster is one chokepoint refactor + per-trigger amount-aware passes; the targeting-relations end-clause cluster is one centralized helper for two distinct root causes.
4. **Spec-vs-canon-drift confirmed in two places:** spec line 58 of 2b.0 design says respite *increments* victories (canon: *resets*); spec Q5 of slice 1 design picked foes-first default for CrossSideTriggerModal (canon Combat.md:125 reads heroes-first). Both spec docs need correction alongside the code fix.
5. **Triage recommendation: standalone cleanup epic** (not folds into existing 2b sub-epics). Volume warrants it; thematic clusters give bisect-friendly sub-slices. Proposed shape: Phase 2b — 5 cleanup sub-epics under one umbrella, with the Victories/XP cluster shipping first (HIGH severity, playtest-visible).

## Renumbered bug catalog (B6–B39)

Numbers are continuous and unique across the prior + this audit. Severity rubric: **P0 HIGH** = visible-in-playtest broken behavior; **P1** = canon mismatch with real in-game consequence; **P2** = latent / edge-case / low-blast-radius; **P3** = framing/UX/cosmetic.

### Cluster 1 — Damage engine cleanup (7 bugs, mostly from prior audit + Agent K)

| # | Severity | Where | Bug | Canon |
|---|---|---|---|---|
| B1 | P1 | `stamina.ts:53` | Revenant inert override fires at `currentStamina ≤ 0` (dying threshold) | Revenant.md:91 — inert replaces dying *at the dead threshold* `stamina ≤ -windedValue` |
| B2 | P2 | `stamina.ts` `applyTransitionSideEffects` | Inert state doesn't add `Prone` condition | Canon: *"You fall prone and can't stand."* KO path adds Prone; inert doesn't |
| B3 | P1 | `stamina.ts` `applyTransitionSideEffects` | Dying-induced Bleeding applied unconditionally to PCs | Revenant Bloodless: *"can't be made bleeding even while dying"* — suppression missing |
| B30 | P1 | `claim-open-action.ts:87-91` | `title-doomed-opt-in` claim handler is `break;` no-op; claim has zero mechanical effect | Doomed.md:22 — claim should apply the `doomed { source: 'title-doomed' }` override |
| B31 | P1 | `stamina-override.ts:17-22` (rubble) + Revenant inert | Override schemas lack `canRegainStamina:false` / `canBeUndone:false`; heal restores stamina freely | Hakaan.md:135 / Revenant.md — *"can't regain Stamina or have this effect undone in any way"* |
| B33 | P1 | `roll-power.ts:181` (Bleeding-d6 emission) | RollPower fires Bleeding-d6 on every ability roll regardless of characteristic | Classes.md:448 — only Might/Agility ability rolls trigger Bleeding |
| B34 | P2 | `condition-hooks.ts:165-169` | 3 BleedingTrigger discriminants (`main_action`, `triggered_action`, `might_or_agility_test`) have zero call sites | Under-firing: non-roll main actions, free triggered abilities, standalone Might/Agility tests all skip the hook |

Plus minor: KO-resurrects-corpses edge case (KO on `dead` state target flips to `unconscious`); BecomeDoomed permission allows from any non-dead state vs canon path (b) "while you are dying" (spec acknowledges; acceptable as designed).

### Cluster 2 — Victories / XP pipeline (3 bugs, HIGH severity; F-cluster) ✅ FIXED 2026-05-16

| # | Severity | Where | Bug | Canon | Status |
|---|---|---|---|---|---|
| B6 | **P0** | `respite.ts:60,68` | `applyRespite` grants +1 victory per attending PC instead of resetting to 0 | heroes-flat:1417-1419 — *"your Victories are converted into Experience"*; 1443-1445 — *"gain XP equal to your Victories, then your Victories reset to 0"* | ✅ fixed |
| B7 | **P0** | `respite.ts:40` (post-reducer side effect) | Respite uses `state.partyVictories` (always 0 post-refactor) as XP-award; per-PC `xp` field never incremented | Pipeline is broken end-to-end | ✅ fixed |
| B8 | **P0** | `end-encounter.ts` (no grant) | `EndEncounter` doesn't award victories | heroes-flat:1396-1398 + Combat.md:722 — *"At the end of combat, the Director determines if the heroes earn any Victories"* | ✅ fixed |

**Fix shipped via Phase 2b sub-epic 2b.12** (canon-audit cleanup; TDD): EndEncounter grants +1 victory to each PC with `staminaState !== 'dead'` after the dieAtEncounterEnd flip; Respite resets attending PCs' victories to 0 and computes per-PC XP from each PC's own pre-respite victories; side-effect handler writes per-PC `data.xp += own victories` + `data.victories = 0` to D1 (no longer reads `stateBefore.partyVictories`). Spec line 58 of 2b.0 design corrected — original wording said respite *increments*, canon says *resets*.

### Cluster 3 — Level-scaling for heroic resources (6 bugs across 4 classes)

| # | Severity | Where | Bug | Canon |
|---|---|---|---|---|
| B9 | P1 | `heroic-resources.ts:32` (Censor wrath per-turn) | Hardcoded +2; canon ramps to +3 at L7 (Focused Wrath) and +4 at L10 (Wrath of the Gods) | Censor.md:1114-1116, 1374-1376 |
| B10 | P1 | `class-triggers/per-class/censor.ts:72` | Hardcoded +1 on "you damage judged-target" branch; canon ramps to +2 at L4 (Wrath Beyond Wrath) | Censor.md:708-710 |
| B11 | P1 | `heroic-resources.ts:44` + `claim-open-action.ts:98` (Elementalist) | Per-turn hardcoded +2; spatial-OA claim hardcoded +1. Canon: +3/+2 at L7 (Surging Essence) and +2 at L4 (Font of Essence) | Elementalist.md:925-927, 1180-1182 |
| B12 | P1 | `heroic-resources.ts:38` (Conduit piety per-turn) | Hardcoded `d3`; canon ramps to `d3+1` at L7 (Faithful's Reward); `d3-plus` variant exists but only wired for Talent/Psion | Conduit.md:1313-1315 |
| B22 | P1 | `class-triggers/per-class/talent.ts` (force-move broadcast) | Hardcoded +1 clarity; canon ramps to +2 at L4 (Mind Recovery), +3 at L10 (Clear Mind) | Talent.md (level-feature blocks) |
| BONUS | P1 | `heroic-resources.ts:?` (Tactician focus per-turn) | Hardcoded +2; canon ramps to +3 at L7 (Heightened Focus), +4 at L10 (True Focus) | Tactician.md |

Same fix surface for B9, B11, B12, BONUS (`getResourceConfigForParticipant` chokepoint for per-turn gains; level-aware factor). B10, B22 are per-trigger and need the trigger-amount to consume the same level-aware factor. One refactor closes all six.

### Cluster 4 — Trigger cascade substrate (in 2b.9 / Group E)

| # | Severity | Where | Bug | Canon |
|---|---|---|---|---|
| B4 | P1 | `turn.ts:138-170` reset + nowhere set | `triggeredActionUsedThisRound` flag is reset but never set → 1-triggered-action-per-round cap unenforced | Combat.md:121 — *"You can use one triggered action per round"* |
| B5 | P2 | `parse-class.ts:419-420` | Conduit `subclasses` parses to `['Piety:', 'Prayer Effect:', 'Piety:']`; bullet-filter doesn't catch `**Piety:**` markdown wrap | Cosmetic but leaks malformed Subclass records |

**Already framed under 2b.9 / Group E in [phases.md] post the prior audit.** Plus the canon-mismatch on the CrossSideTriggerModal default ordering (`apps/web/src/pages/combat/triggers/CrossSideTriggerModal.tsx:22-26` defaults foes-first; Combat.md:125 reads heroes-first). Spec Q5 of slice 1 design chose foes-first explicitly — could be intentional house-rule or spec error. Worth a one-line clarification in the cleanup work.

### Cluster 5 — Targeting relations end-clauses (4 bugs, 2 root causes)

| # | Severity | Where | Bug | Canon |
|---|---|---|---|---|
| B16 | P1 | `null.ts`, `tactician.ts`, `set-targeting-relation.ts` (no dying hook) | Null Field + Tactician Mark do not clear when the source enters dying state | Null.md:116 *"It ends only if you are dying"*; Tactician.md:229 *"until you are dying"* |
| B24 | P2 | `use-ability.ts:264-279` (cross-PC sweep missing) | "Another tactician marks creature → your mark ends" — `mode: 'replace'` only clears acting tactician's own list | Tactician.md:229 *"if another tactician marks a creature, your mark on that creature ends"* |
| B27 | P1 | same as B16, Tactician side | Tactician Mark "until you are dying" specifically | (subset of B16; called out separately because cited canon text is on a different page from Null Field) |
| B28 | P1 | same as B24, Censor side | "Another censor judges target → your judgment ends" | Censor.md:118 *"another censor judges the target"* |

**Two root causes, four bugs:**
- B16/B27 → `StaminaTransitioned → dying` hook that clears the source's own `targetingRelations` arrays (or specifically `marked` + `nullField`).
- B24/B28 → `use-ability.ts` cascade emitter sweep: when emitting `mode: 'replace'` with `relationKind: 'judged' | 'marked'`, also emit `SetTargetingRelation { present: false }` against every *other* participant whose same-kind array contains the new target.

One spec covering both shapes.

### Cluster 6 — Other class-trigger bugs (13 mixed items)

| # | Severity | Where | Bug | Source |
|---|---|---|---|---|
| B13 | P1 | Elementalist Persistent Magic; no code path | "5×Reason damage in one turn → drop all maintenances" never fires | Elementalist.md:147; G-cluster |
| B14 | P1 | `maintained-ability.ts` schema + `start-maintenance.ts:63` | Maintenance schema can't represent same ability on multiple targets (canon-allowed but reducer rejects duplicate `abilityId`) | Elementalist.md:145; G-cluster |
| B15 | P1 | `claim-open-action.ts:93-108` (Elementalist spatial OA) + cross-cutting pattern | Spatial-OA over-fire: multiple qualifying damage events queue multiple OAs before any claim; latch checked at raise time only, not at claim time | G-cluster; cross-cutting (Tactician ally-heroic + Troubadour LoE may have same shape — verify) |
| B17 | P2 | `null.ts:80` | Null side-check uses `actor.kind !== 'monster'` instead of "side ≠ Null's side"; brittle once neutral/summoned creatures land | H-cluster |
| B18 | P1 | `mark-action-used.ts:75-83` | `main-action-used` event fires on any `MarkActionUsed { slot: 'main', used: true }` — including director-toggled slot flips with no ability use. Mints Discipline on toggles | H-cluster |
| B19 | P1 | `roll-power.ts:282` | Shadow Insight fires on tier-damage-computed not damage-delivered; full-resist still grants gain | H-cluster |
| B20 | P3 | `claim-open-action.ts:129-145` | Dead-code OA branch `spatial-trigger-null-field` (replaced by direct auto-apply); raise-side never used but claim handler still grants discipline + flips latch | H-cluster |
| B21 | P2 | `stamina-transition.ts:138-209` | Troubadour winded/dies triggers lack `bodyIntact` / eligibility filter (state-transition path differs from action-trigger path which has `canGainDrama`) | I-cluster; latent until ablation events ship |
| B23 | P2 | `stamina-transition.ts:140` | Troubadour any-hero-winded trigger has `cause === 'damage'` filter; canon "any hero is *made* winded" reads cause-agnostic | I-cluster; verify against canon nuance |
| B25 | P1 | Tactician marked-damage trigger | Fires on ANY dealer; canon "you or any ally" excludes enemy-dealt damage | I-cluster |
| B26 | P1 | `talentClarityDamageOptOutThisTurn` + `talentStrainedOptInRider` toggles | Accepted from any PC without Psion-feature check; trust-model violation | I-cluster |
| B29 | P3 | `useSessionSocket.ts:705-728` | WS-mirror missing optimistic `SetTargetingRelation` cascade reflect from `UseAbility` | J-cluster; functional convergence works via broadcast, brief desync |
| B32 | P2 | `gain-resource.ts:119` + nowhere writes-false | `bodyIntact` never flipped to false (no ablation hooks); `canGainDrama` check effectively constant-true | K-cluster; deferred per slice 1 spec line 88 |

## Patterns and recommended fix shape

| Cluster | # bugs | Fix shape | Effort | Severity peak |
|---|---|---|---|---|
| 1 Damage engine cleanup | 7 | Targeted per-bug fixes; mostly already-flagged | Small-Medium | P1 |
| 2 Victories/XP pipeline | 3 | Move grant to EndEncounter (+1 per surviving PC); rewrite Respite to convert+reset; drop `state.partyVictories` read; update spec line 58 | Small | **P0** |
| 3 Level-scaling for heroic resources | 6 | One chokepoint refactor in `getResourceConfigForParticipant` for per-turn; level-aware factor passed to per-trigger amount calls | Small-Medium | P1 |
| 4 Trigger cascade substrate | 2 (here) + the unbuilt cascade | Already framed under 2b.9 / Group E in phases.md | Medium-Large | P1 |
| 5 Targeting end-clauses | 4 | Two helpers: `StaminaTransitioned → dying` clears `targetingRelations`; `use-ability.ts` cascade sweep over other participants' lists | Small | P1 |
| 6 Other class-trigger bugs | 13 | Mostly per-bug small fixes; B13 (5×Reason auto-drop) is the biggest at "new event-source hook" complexity | Medium | P1 |

**Total:** ~5 small-medium PRs to close 33 of the 34 bugs (cluster 4's full substrate ship belongs in 2b.9 anyway).

## Triage recommendation: standalone cleanup epic

The volume (34 distinct bugs, 3 P0) and the thematic clustering both argue against folding into existing sub-epics. Recommendation: **add a new Phase 2b sub-epic group — "Shipped-slice cleanup" — comprising 5 sub-slices, one per cluster (excluding cluster 4 which is already 2b.9)**.

Recommended shipping order:
1. **2b.cleanup.A — Victories/XP pipeline** (cluster 2, 3 bugs, P0) — ship first, broken playtest experience.
2. **2b.cleanup.B — Level-scaling for heroic resources** (cluster 3, 6 bugs, P1) — one config refactor, affects 4 classes at L4+, makes high-level play actually high-level.
3. **2b.cleanup.C — Targeting relations end-clauses** (cluster 5, 4 bugs, P1) — two centralized helpers; small surface.
4. **2b.cleanup.D — Damage engine cleanup** (cluster 1, 7 bugs, P1) — folds into the existing 2b.5 audit slice (the "Group C" in the prior audit's grouping); merge them.
5. **2b.cleanup.E — Other class-trigger bugs** (cluster 6, 13 bugs, P1) — biggest by item count; can split if needed (e.g. Elementalist Maintenance gaps as their own sub-slice).

Cluster 4 stays in 2b.9 / Group E as already scoped.

If you want a single mega-PR, that's defensible too (everything is small per-item), but bisect-friendliness suggests the 5-PR shape.

## What this audit didn't cover

- **Item-related shipped code** — Color Cloak Yellow (lightning immunity) is shipping; the audit didn't re-verify it against canon. Phase 2e covers items behind a canon-audit gate, so item engine cleanup folds there.
- **UI-only behaviors** — the audit was engine-focused. UI bugs (button-state bugs, render glitches, etc.) need their own pass.
- **Performance / WS reliability** — out of canon-correctness scope.
- **Integration test coverage gaps** — the audit found behaviors that lack tests (e.g. cross-Censor judgment, Null dying-field), but didn't catalog all missing tests.
- **Phase 2c (advanced monster mechanics) — minion squads / captains / initiative groups** — not yet shipped, no code to audit.
- **Phase 2 epic 2C shipped surface** — kit damage bonus, weapon attachment fold, etc. Pre-Phase-2b; audit out of scope.

## Files referenced (the read set across all 6 agents)

Canon:
- `.reference/data-md/Rules/Chapters/Combat.md` (§§2.7-2.9, §3.5.1, §4.10, §8.1, §5)
- `.reference/data-md/Rules/Chapters/Classes.md` (§ Bleeding lines 448; § Crits lines 355-357)
- `.reference/data-md/Rules/Classes/*.md` (all 9; per-class Heroic Resource + δ trigger sections)
- `.reference/data-md/Rules/Ancestries/{Hakaan,Revenant}.md` (Doomsight, Bloodless, Tough But Withered, inert)
- `.reference/data-md/Rules/Titles/1st Echelon/Doomed.md`
- `.reference/data-md/Rules/Complications/Curse of Punishment.md`
- `.reference/core-rules/heroes-flat.txt` (printed Heroes Book v1.01)

In-repo code (audit targets):
- `packages/rules/src/stamina.ts`, `damage.ts`, `condition-hooks.ts`, `state-helpers.ts`, `heroic-resources.ts`
- `packages/rules/src/class-triggers/per-class/{censor,conduit,elementalist,fury,null,shadow,tactician,talent,troubadour}.ts`
- `packages/rules/src/class-triggers/{stamina-transition,ability-targeting-effects,action-triggers}.ts`
- `packages/rules/src/intents/{apply-damage,become-doomed,claim-open-action,end-encounter,execute-trigger,gain-resource,grant-extra-main-action,mark-action-used,resolve-trigger-order,respite,roll-power,set-targeting-relation,start-encounter,start-maintenance,turn,use-ability}.ts`
- `packages/shared/src/{character,condition,maintained-ability,open-action,open-action-copy,participant,per-encounter-flags,psion-flags,stamina-override}.ts`
- `packages/shared/src/data/attachment.ts`
- `packages/data/src/{parse-class,parse-kit}.ts`
- `apps/web/src/pages/combat/triggers/CrossSideTriggerModal.tsx`
- `apps/web/src/components/TargetingRelationsCard.tsx`
- `apps/web/src/ws/useSessionSocket.ts`
- Spec docs: `docs/superpowers/specs/2026-05-13-phase-2b-0-resource-framework-foundation-design.md`, `2026-05-15-pass-3-slice-1-damage-state-machine-design.md`, `2026-05-15-pass-3-slice-2a-class-delta-and-open-actions-design.md`, `2026-05-15-pass-3-slice-2b-targeting-relations-design.md`
