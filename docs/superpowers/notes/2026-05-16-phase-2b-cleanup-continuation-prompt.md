# Continuation prompt — Phase 2b cleanup (2b.15 + 2b.16)

Paste the block below into a fresh Claude Code session. Self-contained
brief; do not assume any memory from prior sessions.

---

## The task

Finish the 2-of-5 remaining cleanup epics from the
**2026-05-16 Phase 2b shipped-code audit**. The audit catalogued **34
distinct bugs** in already-shipped Phase 2b code; 13 are already fixed
across `2b.12`, `2b.13`, `2b.14`. **Remaining: `2b.15` (damage-engine
cleanup) and `2b.16` (other class-trigger bugs).**

Read these first, in order:

1. `docs/superpowers/notes/2026-05-16-phase-2b-shipped-code-audit.md` —
   the canonical bug catalog (B1-B39) with severity, location, canon
   citation, and ✅ marker on the 13 already-fixed bugs. Clusters 1/2/3/5
   are done (✅); **clusters 1 (damage-engine, 7 bugs) and 6 (other
   class-trigger bugs, 13 items) are open**. Note: Cluster 1 is partially
   done via 2b.14 (bug B3) and partially via prior B1/B2 reframing — read
   the latest version of the file.
2. `docs/phases.md` § Phase 2b sub-epic table — rows `2b.15` and `2b.16`
   carry the per-cluster bug lists and recommended fix surfaces.
3. `docs/superpowers/notes/2026-05-16-phase-2b-canon-audit.md` — the
   companion audit of UNSHIPPED Phase 2b work; informs Phase 2e item
   carve-out, slice 2c reframing, and other context.
4. `CLAUDE.md` — project conventions.
5. `~/.claude/projects/-Users-jim-Documents-Claude-Projects-Ironyard/memory/MEMORY.md` —
   auto memory; includes the rules-canon two-gate workflow, parallel-agents
   convention, items-engine-canon-audit-gate, etc.

Recent commits for git context:

```
2c940d1 fix(rules): targeting-relations end-clauses (Phase 2b 2b.14 cleanup)
ea1cf4e fix(rules): heroic-resource level scaling (Phase 2b 2b.13 cleanup)
9b833a4 fix(rules,api): victories→XP pipeline (Phase 2b 2b.12 cleanup)
0a28fc8 docs(phases): 2026-05-16 canon audit — Phase 2e carve-out + Phase 2b dual audit + cleanup epic taxonomy
178adb3 docs(phases): add proposed shipping grouping for remaining Phase 2b work
```

## Cleanup epic 2b.15 — Damage-engine cleanup (estimated ~10 items)

Per audit cluster 1 + the open 2b.5 punch-list. Files: `stamina.ts`,
`damage.ts`, `apply-damage.ts`, `condition-hooks.ts`, `roll-power.ts`,
`stamina-override.ts`, `claim-open-action.ts`, `apply-heal.ts`.

Order suggestion (each is small, TDD-friendly):

| # | Bug | Where | Fix shape |
|---|---|---|---|
| B1 | Inert override fires at `stamina ≤ 0` (dying threshold) | `stamina.ts:53` | Per canon Revenant.md:91, inert should replace dying at `stamina ≤ -winded` (dead threshold). Move the override-substitution to the `→ dead` branch, not `→ dying`. |
| B2 | Inert state doesn't add `Prone` condition | `stamina.ts` `applyTransitionSideEffects` | KO path adds Prone explicitly via `applyKnockOut`; mirror that in the inert path. Canon: *"You fall prone and can't stand."* |
| B3 | Already ✅ from 2b.14? No — verify. The audit says "Bloodless suppression of dying-Bleeding" — only the cross-PC sweep landed in 2b.14, not Bloodless. | `stamina.ts` `applyTransitionSideEffects` | Revenant ancestry with Bloodless purchased trait: don't apply the unconditional dying-Bleeding instance. Read `participant.purchasedTraits` for `'bloodless'`. |
| B30 | `title-doomed-opt-in` claim handler is `break;` no-op | `claim-open-action.ts:87-91` | Claim should emit `ApplyParticipantOverride { kind: 'doomed', source: 'title-doomed', canRegainStamina: false, autoTier3OnPowerRolls: true, staminaDeathThreshold: 'staminaMax', dieAtEncounterEnd: true }`. Verify the shape exists in `ApplyParticipantOverride` reducer. |
| B31 | Hakaan rubble + Revenant inert overrides lack `canRegainStamina: false`; heal restores stamina freely | `stamina-override.ts` schema; `apply-heal.ts` gate | Add `canRegainStamina: boolean` to the rubble + inert variants in `ParticipantStateOverride` discriminated union (default `false`); `applyApplyHeal` should reject heals when `participant.staminaOverride?.canRegainStamina === false`. |
| B33 | RollPower fires Bleeding-d6 on every ability roll regardless of characteristic | `roll-power.ts:181` | Canon Classes.md:448 narrows to *"make a test or ability roll using Might or Agility"*. Gate the `bleedingDamageHook` call on `ability.characteristic === 'might' || 'agility'`. Find the characteristic on the ability data. |
| B34 | 3 `BleedingTrigger` discriminants (`main_action`, `triggered_action`, `might_or_agility_test`) have zero call sites | `condition-hooks.ts:165-169` | Under-firing. May need to wire `MarkActionUsed` to emit `main_action` Bleeding-trigger when actor is bleeding; ditto triggered-action use. `might_or_agility_test` needs a `RollTest` intent that doesn't exist yet — defer to a sub-slice or document as 2b.X carry-over. |
| KO wake | KO 1-hour wake clock | new intent / extend `ClearParticipantOverride` | Canon Combat.md:669-679: heroes wake after 1h spending a Recovery; director creatures wake after 1h gaining 1 Stamina. Director-triggered (no engine timer). Add `WakeFromUnconscious { participantId }` intent (or extend `ClearParticipantOverride`). |
| Double-edge | Double-edge against unconscious target | `roll-power.ts` edge-stack consumer | Canon Combat.md:677: *"Ability rolls against you have a double edge."* Find the edge-stacking code path in RollPower; check target `staminaState === 'unconscious'` and add `edge: 2`. |
| Speed=0 | `speed=0` while unconscious derivation review | grep `participant.speed`, audit consumers | Slice 1 spec says set 'speed: 0' derived flag (not stored). Verify no consumer reads `participant.speed` directly without checking `staminaState`. |
| Permissive-alive | 2b.0 permissive `currentStamina > -windedValue` alive-check sweep | grep callers of `aliveHeroes` / direct `currentStamina > -windedValue` | Lift to `staminaState !== 'dead'`. Slice-1 ships the formal state machine; old call sites still use the permissive predicate. |

Plus three slice-1 PS#2 deferred items (read slice 1 spec line ~PS#2):
- heal-from-unconscious clears Unconscious / Prone
- engine-generated conditions get `appliedAtSeq: 0`
- `ClaimOpenAction { title-doomed-opt-in }` applies the override automatically (this is B30 above — same fix)

## Cleanup epic 2b.16 — Other class-trigger bugs (13 mixed items)

Per audit cluster 6. Mix of small per-bug fixes + a couple medium
architectural changes. Order by quick-wins → bigger items:

**Small (per-bug code edits, similar TDD pattern as 2b.12-14):**

| # | Bug | Where | Fix shape |
|---|---|---|---|
| B17 | Null side-check uses `actor.kind !== 'monster'` instead of side check | `class-triggers/per-class/null.ts:80` | Replace with `participantSide(actor) !== participantSide(nullPc)`. Brittle once neutral/summoned creatures land. |
| B18 | `main-action-used` event fires on any `MarkActionUsed { slot: 'main', used: true }` slot toggle | `mark-action-used.ts:75-83` | Should fire only when caused by actual ability use (RollPower). Differentiate via the dispatcher: RollPower-derived MarkActionUsed has `source: 'server'`, director-toggled has `source: 'manual'`. Gate the event on source. |
| B19 | Shadow Insight fires on computed tier damage, not delivered | `roll-power.ts:282` | Move the surge-spent-with-damage emission to ApplyDamage where `result.delivered > 0` can be verified. Or: pass the post-immunity delivered amount through to the trigger. |
| B20 | Dead-code `spatial-trigger-null-field` OA branch | `claim-open-action.ts:129-145` | Remove the branch entirely; the spatial-OA path was replaced by direct auto-apply. Document the removal. |
| B21 | Troubadour state-transition triggers lack `bodyIntact`/eligibility filter | `stamina-transition.ts:138-209` | Add `canGainDrama` predicate to the Troubadour winded + hero-dies triggers (action-trigger path already has it). Latent until ablation events ship — fix preemptively. |
| B23 | Troubadour any-hero-winded `cause === 'damage'` filter stricter than canon | `stamina-transition.ts:140` | Canon "any hero is *made* winded" reads cause-agnostic. Widen the filter to also accept `cause: 'override-application'`. Verify by re-reading canon. |
| B25 | Tactician marked-damage trigger fires on ANY dealer | `class-triggers/per-class/tactician.ts` | Canon "you or any ally" — restrict to dealer kind === 'pc' (excludes enemy-dealt damage). |
| B26 | Psion-only toggles accepted from any PC (trust violation) | `use-ability.ts` payload validation | Reject `talentClarityDamageOptOutThisTurn` + `talentStrainedOptInRider` toggles when the actor isn't a 10th-level Psion Talent. Trust-model violation per CLAUDE.md. |
| B29 | WS-mirror missing optimistic SetTargetingRelation cascade reflect | `apps/web/src/ws/useSessionSocket.ts:705-728` | The UseAbility mirror writes only `psionFlags`; doesn't mirror the derived SetTargetingRelation cascade. Functional convergence works via broadcast but there's a brief UI desync. Add cascade-aware mirror logic. |
| B32 | `bodyIntact` never flipped to false | (deferred per slice-1 spec) | Field exists, read in 2 sites, but no ablation hook. Document as deferred-to-future-slice; not a bug per se. Or stub a `SetParticipantBodyIntact { participantId, value: false }` server-only intent for future use. |

**Medium (architectural changes):**

| # | Bug | Where | Fix shape |
|---|---|---|---|
| B13 | Elementalist Persistent Magic "5×Reason damage in one turn → drop all maintenances" never fires | new event-source hook | Canon Elementalist.md:147. Add `damageTakenThisTurn` numeric perTurn accumulator (key already declared in `per-encounter-flags.ts:10`). Fire `damage-applied` event observer; if accumulator crosses `5 * reason`, emit `StopMaintenance` for all entries. Reset on EndTurn. |
| B14 | Maintenance multi-target cardinality not modelable | `maintained-ability.ts` schema; `start-maintenance.ts:63` | Add optional `targetId` to `MaintainedAbility` schema. Relax reducer dedup to `(abilityId, targetId)` tuple. Canon: Elementalist can maintain same ability on multiple targets simultaneously. |
| B15 | Spatial-OA over-fire when multiple events queue before claim | `claim-open-action.ts:93-108`; cross-cutting pattern | Latch checked at raise time only. Check at claim time: if the per-round latch is already true, short-circuit the claim with a log line and no GainResource. Probably affects Tactician + Troubadour spatial OAs too — verify and fix all. |

May split B13+B14 into a sub-slice if it's getting too big. The
small-items batch should ship first as a quick PR; medium items either
in the same PR (one logical commit each) or as a follow-up.

## How to work (the pattern from 2b.12-14)

1. **TDD per bug**: write the failing test first against canon; verify
   RED; implement minimal GREEN; refactor; verify all tests + repo-wide.
2. **One commit per cleanup epic** (or per logical sub-slice if the
   epic is big). Format follows the existing commit style — see
   `git log --oneline -5`. Commit message: `fix(rules,...): <subject>
   (Phase 2b 2b.X cleanup)` + body with bug references, canon
   citations, and TDD note + Co-Authored-By trailer.
3. **Update the audit notes file** to mark fixed bugs ✅ (alongside the
   commit, in the same commit).
4. **Update phases.md** row for the epic to reflect ✅ status.
5. **Stop at clean checkpoints** — don't push past 75% context if you
   can avoid it. Two commits with clear shipping notes beats one
   uncommitted half-finished batch.
6. **Don't touch the preexisting untracked files**: `.claude/`,
   `docs/encounter-model.md`, `docs/b2-monster-features-checklist.md`,
   `docs/rules-canon.md` modifications. These are from prior sessions
   and out of scope for cleanup.

## Verification gates (per commit)

```
pnpm test            # all 1736+ tests pass
pnpm typecheck       # clean repo-wide
pnpm lint            # pre-existing errors in unrelated files are OK;
                     # check that files YOU touched have no new lint issues
```

## Stopping criteria

- All 13 remaining cleanup bugs (per `docs/phases.md` 2b.15 + 2b.16
  rows + audit cluster 6) are either ✅ or explicitly deferred with
  reasoning in the audit notes.
- All tests + typecheck pass.
- All cleanup commits pushed (or held locally, depending on user
  direction).

If you hit context limits mid-epic, commit what's done, update the
audit notes with the current state, and write a follow-up continuation
prompt at `docs/superpowers/notes/2026-MM-DD-phase-2b-cleanup-continuation-prompt-N.md`.

## Tips that saved time on 2b.12-14

- **`.reference/core-rules/heroes-flat.txt` is grep-friendly** (2.9MB
  text dump of the printed Heroes Book v1.01). Use it for cross-reference
  alongside the `.reference/data-md/Rules/...` markdown.
- **Audit agents are appropriate for canon verification** but not for
  this cleanup work — the audit's already done. You're implementing
  known fixes, so direct tool use is faster than parallel agents.
- **`pnpm exec vitest run <path>` works from inside a package dir** —
  pnpm-workspace-aware. From the repo root, prefix with `pnpm
  --filter @ironyard/<pkg>` (but the test path passes weirdly; cd
  in is cleaner).
- **Renumbered bugs use the audit's B1-B39 numbering** — the agents
  used overlapping local numbering, the audit notes is the canonical
  catalog.

## Where to start

Read the 5 files in the order above (audit notes, phases.md,
companion canon-audit notes, CLAUDE.md, MEMORY.md). Then pick the
**smallest, highest-clarity bug** in 2b.15 (likely **B2 — inert state
should add Prone condition**, ~5 lines of test + 1 line of fix) to
warm up the cycle. Then **B30 — title-doomed-opt-in apply override**.
Then work down the table.

Auto mode is fine — execute autonomously, but commit at clean
checkpoints and surface real ambiguities. Don't enter plan mode.

---

End of continuation prompt.
