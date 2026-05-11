---
name: Phase 1 — EndEncounter + SetStamina + DO RollPower.source fix
description: Close Phase 1 gaps surfaced by slices 7 and 11. Adds the EndEncounter combat-lifecycle intent (resets resources, surges, malice, clears end-of-encounter conditions); adds SetStamina as the client-dispatchable manual HP override (ApplyDamage is server-only); fixes the DO's unconditional `source = 'manual'` rewrite so client-supplied `auto` survives the round trip.
type: spec
---

# Phase 1 — EndEncounter + SetStamina + DO RollPower.source fix

## Goal

Land three small engine cleanups that close the loop on prior slices:

1. **`EndEncounter` intent** — the combat-lifecycle gap flagged in slice 7. Resets every per-encounter mutable: heroic resources → 0, extras → 0, surges → 0, malice → 0, clears `end_of_encounter`-duration conditions, drops `activeEncounter` to `null`. Idempotent if no encounter is active.
2. **`SetStamina` intent** — the client-dispatchable manual HP override flagged in slice 11. The director long-presses HP to edit but `ApplyDamage` is server-only; players can't reach it. SetStamina is the canonical override path.
3. **DO `RollPower.source` fix** — `apps/api/src/session-do.ts` overwrites `clientIntent.source` to `'manual'` unconditionally. Slice 11 worked around this by typing rolls manually even when auto-rolled. Fix: honor the client-supplied `source` (`'auto' | 'manual'`).

## Required reading

1. `docs/intent-protocol.md` — intent shape, derived intents, undo, optimistic UI.
2. `docs/rules-engine.md` — `requireCanon`, reducer purity, derived-intent contract.
3. `docs/rules-canon.md` — verify the slugs cited below before flipping any auto-apply branch.
4. `docs/superpowers/specs/2026-05-10-phase-1-slice-7-heroic-resources-design.md` — line 323-325 explicitly punts the end-of-encounter reset to a future EndEncounter intent. This spec closes that loop.
5. `docs/superpowers/specs/2026-05-10-phase-1-slice-11-combat-run-design.md` — line 31 documents the SetStamina gap and explains why `ApplyDamage` isn't usable as a manual HP override.
6. `docs/superpowers/specs/2026-05-10-phase-1-slice-5-conditions-design.md` — line 176 notes that Phase-1 trust gates are deliberately lax; director/player gates land later.

## Non-goals

- No UI wiring (DetailPane long-press for SetStamina, EncounterBuilder "End encounter" button) — that's a slice 11/10 follow-up after merge.
- No new Q-entries to `rule-questions.md` (no rule judgments here — all behavior is either canon-cited or a Phase-1-trust-model punt).
- No changes to `packages/data/` (parallel agent's lane).
- No changes to `Participant.extras.persistent` schema — none currently exists; this spec resets *all* `extras`.
- No `inverse()` for either intent. Phase 1 undo is bounded to the current round (`docs/intent-protocol.md` → Undo), and EndEncounter logically *ends* the round-undo window. SetStamina is a manual override and doesn't compose with the void-and-replay flow used by current undo — slice 8's undo flow already only inverts derived chains from non-void primary intents. Future slices can add inverses if needed.

## Trust model & permissions

Phase 1 keeps the lax precedent set by `SetCondition` and the other slice-5/7 intents: any connected member can dispatch any non-server-only intent (the DO already stamps `actor` server-side from the WS headers, so impersonation isn't possible). The full `canDispatch(intent, actor, state)` permission module (`docs/rules-engine.md`) lands in Phase 2 alongside the character-claim mechanism.

For SetStamina specifically the brief calls for "Director-anyone, player-self-only." Player-self-only requires a participant-ownership claim that doesn't exist in the schema yet (`Participant` has no `claimedBy` / `ownerUserId` field; `JoinSession` payload has `userId` but no `characterId`). The reducer therefore:

- **Accepts** SetStamina from any actor in Phase 1, matching the SetCondition precedent.
- **Logs** the actor explicitly (`source` + `actor.userId` from the stamped intent) so the session log shows who overrode whom.
- **Punts** the ownership gate to Phase 2. Surfaced in the return summary as a follow-up.

This is the most defensible Phase-1 move: no false sense of security (we don't pretend to gate something we can't gate), no regression vs the rest of Phase 1, no production code that fakes a check.

## Scope

### 1. `EndEncounter` intent

**Payload schema** (`packages/shared/src/intents/end-encounter.ts`):

```ts
export const EndEncounterPayloadSchema = z.object({
  encounterId: z.string().min(1),
});
export type EndEncounterPayload = z.infer<typeof EndEncounterPayloadSchema>;
```

**Reducer** (`packages/rules/src/intents/end-encounter.ts`):

Behavior, in order:

1. Validate payload (Zod). Reject with `invalid_payload` on parse failure (matches every other intent).
2. **Idempotent no-op** if `state.activeEncounter === null`. Bump `seq` (so the intent is logged) but make no other changes. Log: `"no active encounter to end (idempotent)"`. No error.
3. **Reject** if `state.activeEncounter.id !== encounterId` with `wrong_encounter` — defends against stale clients dispatching a stale id. Matches the StartEncounter "another encounter is already running" precedent.
4. Apply the reset:
   - For each participant `p` in `state.activeEncounter.participants`:
     - `heroicResources`: each entry → `{ ...entry, value: 0 }`. Canon citation: `heroic-resources-and-surges.other-classes` ✅ (canon §5.4: "Lifecycle: encounter-scoped. Resource resets to 0 at end of encounter."). Talent's Clarity (`heroic-resources-and-surges.talent-clarity` ✅) explicitly resets both positive and negative clarity to 0 per canon §5.3.
     - `extras`: each entry → `{ ...entry, value: 0 }`. **No `persistent` flag exists on `ExtraResourceInstance` today**, so all extras reset. When the flag lands (10th-level epic secondaries — Censor Virtue, Conduit Divine Power) the reducer adds a `persistent: true` skip. Documented in the return summary as a tiny Phase-2 follow-up.
     - `surges`: → 0. Canon citation: `heroic-resources-and-surges.surges` ✅ (canon §5.6: "any unspent surges are lost at the end of combat").
     - `conditions`: filter out entries where `c.duration.kind === 'end_of_encounter'`. This is data-driven — no canon citation needed beyond the slice-5 condition data model. All other condition durations (EoT, save_ends, until_start_next_turn, trigger) survive — they're either round-internal (which is irrelevant once the encounter ends, but harmless) or persistent until the next encounter. (In practice EndEncounter dropping `activeEncounter` means participants leave the state tree entirely until a fresh StartEncounter; this filter is belt-and-braces.)
     - `recoveries.current`: **NOT reset.** Canon §2.13 says recoveries only restore on respite. EndEncounter must not touch them.
   - Encounter-scoped state:
     - `malice`: → `{ current: 0, lastMaliciousStrikeRound: null }`. Canon citation: `heroic-resources-and-surges.directors-malice` ✅ (canon §5.5: "Encounter-scoped pool; reset at the start of every encounter; lost at end of encounter").
     - `turnState`: → `{}` (clear all per-turn flags — there's no turn in progress once the encounter ends).
     - `currentRound` / `activeParticipantId` / `turnOrder`: don't matter — they go away with `activeEncounter`.
   - `state.activeEncounter`: → `null`.
5. Increment `state.seq`.
6. Emit a single info log: `"encounter ${encounterId} ended; resources/surges/malice reset"`.
7. **No derived intents.** Resource resets are direct state mutations, not derived `SpendResource`/`SetResource` cascades. Reason: derived intents would explode the log (5 chars × ~3 resources × N participants) and would each need their own `inverse()`; treating EndEncounter as one atomic state-machine transition is cleaner and matches StartEncounter's shape.

**Reducer + index wiring:**

- Add `EndEncounter: 'EndEncounter'` to `IntentTypes` in `packages/shared/src/intents/index.ts`.
- Re-export `EndEncounterPayloadSchema` + `EndEncounterPayload`.
- Add `applyEndEncounter` to `packages/rules/src/intents/index.ts` and to the `reducer.ts` switch.

### 2. `SetStamina` intent

**Payload schema** (`packages/shared/src/intents/set-stamina.ts`):

```ts
export const SetStaminaPayloadSchema = z
  .object({
    participantId: z.string().min(1),
    currentStamina: z.number().int().optional(),
    maxStamina: z.number().int().min(1).optional(),
  })
  .refine((v) => v.currentStamina !== undefined || v.maxStamina !== undefined, {
    message: 'at least one of currentStamina / maxStamina must be supplied',
  });
export type SetStaminaPayload = z.infer<typeof SetStaminaPayloadSchema>;
```

Note: `currentStamina` allows any integer (positive, zero, or negative). Canon §2.8 explicitly permits heroes to go negative when dying; the reducer keeps `currentStamina` as an `int` here to support that. The reducer additionally enforces `currentStamina <= effectiveMax` at apply time (see below) — the schema-level `min(0)` constraint that lives on `Participant.currentStamina` is a *baseline* contract that this manual-override intent is allowed to relax (with a logged warning if it goes negative; future tightening can rule it out).

Wait — `Participant.currentStamina` is `z.number().int().min(0)` per the current schema. The reducer cannot produce a participant that fails its own schema or D1 serialization round-trip will break. Decision: the SetStamina reducer **clamps `currentStamina` at 0** (does not permit negative via this intent). Dying-but-alive negative stamina is reached via the normal ApplyDamage pipeline (which today also clamps at 0 — the canon §2.8 dying-below-0 surface area is a Phase 2 schema migration, see slice 7 design line 19-22). This keeps SetStamina aligned with the existing schema contract.

**Reducer** (`packages/rules/src/intents/set-stamina.ts`):

Behavior:

1. Validate payload (Zod). Reject with `invalid_payload` on parse failure.
2. **Reject** if `state.activeEncounter === null` with `no_active_encounter` (matches every other participant-targeting intent — same precedent as `ApplyDamage`/`SetCondition`).
3. Locate `target = participants.find(p => p.id === participantId)`. Reject with `target_missing` if not present.
4. Compute the new values:
   - `nextMax = payload.maxStamina ?? target.maxStamina`. Already validated `≥ 1` by Zod.
   - `nextCurrent = payload.currentStamina ?? target.currentStamina`.
5. Validate the combined values:
   - `nextCurrent >= 0` — reject with `invalid_value` (`currentStamina must be ≥ 0`).
   - `nextCurrent <= nextMax` — reject with `invalid_value` (`currentStamina ${nextCurrent} > maxStamina ${nextMax}`).
   - `nextMax >= 1` — already enforced by Zod, but defensive double-check.
6. Apply: replace the target participant with `{ ...target, currentStamina: nextCurrent, maxStamina: nextMax }`. Increment `state.seq`.
7. Log: `"director override: ${target.name} stamina ${old} → ${new}/${nextMax}"` (with both deltas if both supplied; just whichever changed otherwise). Include `actor.userId` in the log message so attribution is visible. (LogEntry's existing fields already capture `intentId`; the actor is recovered from the intent record at display time.)
8. **No derived intents.** Manual override — no Bleeding hook, no condition triggers, no death/dying transitions. This is by design per the brief: "no derived damage events; no condition triggers; no Bleeding hook firing."

**Reducer + index wiring:**

- Add `SetStamina: 'SetStamina'` to `IntentTypes`.
- Re-export `SetStaminaPayloadSchema` + `SetStaminaPayload`.
- Add `applySetStamina` to `packages/rules/src/intents/index.ts` and to the reducer switch.

### 3. DO `RollPower.source` fix

**Site:** `apps/api/src/session-do.ts:247-255`. The current code:

```ts
const intent: Intent & { timestamp: number } = {
  ...clientIntent,
  actor: { userId: attached.userId, role: attached.role },
  timestamp: Date.now(),
  sessionId: this.sessionId,
  source: 'manual',  // ← unconditional override
};
```

**Fix:** drop the `source: 'manual'` line. `...clientIntent` already preserves the client-supplied `source` (`'auto' | 'manual'`, validated by `ClientMsgSchema` → `IntentSchema` → `IntentSourceSchema` enum). The four server-stamped fields (`actor`, `timestamp`, `sessionId`) prevent impersonation; `source` is informational ("did the engine roll this, or did the user type it?") and is not a security concern.

**Why this matters:** the slice 11 spec line 119-121 documents that the workaround was to leave `source: 'manual'` on auto-rolls. That means every auto-rolled ability in the session log says "manual" — UX bug. Slice 6's condition-hook tests and slice 7's resource-spend log entries also implicitly rely on `source` for log filtering ("show only auto entries"); preserving the client's value fixes that downstream.

**Test approach:** the DO is hard to harness with miniflare; instead, extract the `Intent` build step into a tiny pure helper `buildServerStampedIntent(clientIntent, attached, sessionId, now)` and unit-test it. This is a 5-line refactor — the helper takes the four pieces of context that the DO knows and produces the stamped intent, with the source fix baked in. Test asserts `source` round-trips, `actor`/`timestamp`/`sessionId` are server-stamped.

## Files

### New

| Path | Purpose |
|---|---|
| `packages/shared/src/intents/end-encounter.ts` | EndEncounter payload schema |
| `packages/shared/src/intents/set-stamina.ts` | SetStamina payload schema |
| `packages/rules/src/intents/end-encounter.ts` | `applyEndEncounter` reducer handler |
| `packages/rules/src/intents/set-stamina.ts` | `applySetStamina` reducer handler |
| `packages/rules/tests/reducer-end-encounter.spec.ts` | EndEncounter coverage |
| `packages/rules/tests/reducer-set-stamina.spec.ts` | SetStamina coverage |
| `apps/api/tests/session-do-source.spec.ts` | DO source-preservation unit test |

### Modified

| Path | Change |
|---|---|
| `packages/shared/src/intents/index.ts` | Re-export EndEncounter + SetStamina schemas; add to `IntentTypes` |
| `packages/rules/src/intents/index.ts` | Export `applyEndEncounter` + `applySetStamina` |
| `packages/rules/src/reducer.ts` | Add cases for `EndEncounter` + `SetStamina` |
| `apps/api/src/session-do.ts` | Extract `buildServerStampedIntent` helper, drop the unconditional `source: 'manual'` |

## Canon citations (verified before flipping the auto-apply)

| Behavior | Slug | Status |
|---|---|---|
| Heroic resource reset to 0 at end of encounter | `heroic-resources-and-surges.other-classes` | ✅ |
| Talent Clarity reset (positive + negative → 0) | `heroic-resources-and-surges.talent-clarity` | ✅ |
| Surges reset to 0 at end of combat | `heroic-resources-and-surges.surges` | ✅ |
| Malice reset to 0 at end of encounter | `heroic-resources-and-surges.directors-malice` | ✅ |
| End-of-encounter condition clearing | data-driven (slice-5 `ConditionDuration.kind === 'end_of_encounter'`) | n/a |
| Recoveries do NOT reset at end of encounter | `damage-application.recoveries` (negative — canon §2.13 restricts to respite) | ✅ |

No new manual-override punts. Every auto-apply branch in EndEncounter is backed by a ✅ slug; the reducer wraps each in a `requireCanon` check to preserve the canon-gate idiom, even though all four are verified today (drop-back-to-🚧 on edit is automatic and we want the engine to fall back to a manual-override log if any of these regress).

## Test plan

Tests added (Vitest, fixture pattern matching `reducer-encounter.spec.ts`):

### `packages/rules/tests/reducer-end-encounter.spec.ts`

1. **Idempotent no-op on null activeEncounter.** Empty state → dispatch → seq bumps, no errors, activeEncounter still null, log entry says "no active encounter to end".
2. **Rejects wrong encounter id.** Start `e1`, dispatch EndEncounter with `e2` → error `wrong_encounter`, state unchanged.
3. **Drops activeEncounter on the happy path.** Start `e1`, dispatch EndEncounter `e1` → `state.activeEncounter === null`.
4. **Resets all heroicResources on every participant.** Set wrath = 7, clarity = -2, drama = 4 on three different participants; EndEncounter → all values 0; `floor` / `name` preserved.
5. **Resets all extras on every participant.** Set extras `{ name: 'virtue', value: 5 }` on a participant; EndEncounter → value 0.
6. **Resets surges on every participant.** Set surges = 3 on Alice, 1 on Bob; EndEncounter → both 0.
7. **Resets malice.** Start encounter with malice {current: 12, lastMaliciousStrikeRound: 3}; EndEncounter → current 0, lastMaliciousStrikeRound null.
8. **Clears `end_of_encounter`-duration conditions only.** Participant has Bleeding (EoT) + Frightened (end_of_encounter); EndEncounter → Bleeding survives (well, it doesn't matter since participants go away, but we filter to assert behavior on the participant snapshot we capture in the log); Frightened gone. Test against the participants array recorded in the log entry, since `activeEncounter` is null after.

   **Revised approach:** assert by running EndEncounter, then re-dispatching StartEncounter with same id and re-checking the (separately reconstructed) participants. Too brittle. Better: split the participant filter into a pure helper `clearEndOfEncounterConditions(participants)` and unit-test it; the integration test only asserts `activeEncounter === null` after EndEncounter.
9. **Recoveries are NOT reset.** Participant with `recoveries.current = 1`; EndEncounter — verify via the helper test in (8) that the test fixture surfaces `recoveries.current === 1` post-reset (before the participant is dropped with activeEncounter).
10. **Invalid payload → `invalid_payload` error.**

### `packages/rules/tests/reducer-set-stamina.spec.ts`

1. **Rejects with no_active_encounter.** Empty state → dispatch → `no_active_encounter`.
2. **Rejects unknown participant.** Encounter active, no Alice → dispatch SetStamina for `pc_alice` → `target_missing`.
3. **Sets currentStamina only.** Alice at 20/30; SetStamina `{currentStamina: 15}` → 15/30.
4. **Sets maxStamina only.** Alice at 20/30; SetStamina `{maxStamina: 40}` → 20/40.
5. **Sets both.** Alice at 20/30; SetStamina `{currentStamina: 25, maxStamina: 50}` → 25/50.
6. **Rejects currentStamina > maxStamina (using new max).** Alice at 20/30; SetStamina `{currentStamina: 40}` → `invalid_value`.
7. **Rejects currentStamina > maxStamina (using existing max when new max not supplied).** Alice 20/30; SetStamina `{currentStamina: 35}` → `invalid_value`.
8. **Rejects negative currentStamina.** Alice 20/30; SetStamina `{currentStamina: -3}` → `invalid_value`.
9. **Rejects maxStamina = 0.** Alice 20/30; SetStamina `{maxStamina: 0}` → schema rejects with `invalid_payload` (Zod `min(1)`).
10. **Rejects neither field supplied.** Empty payload `{participantId: 'pc_alice'}` → `invalid_payload` (Zod refine).
11. **No derived intents.** Even when stamina drops to 0, no derived Bleeding/death intents fire (manual override contract).
12. **Log includes the actor + delta.** Run with `actor.userId = 'alice'`; assert log entry text includes both stamina values.

### `apps/api/tests/session-do-source.spec.ts`

Test the new `buildServerStampedIntent` helper in isolation:

1. **`source: 'auto'` from client is preserved.** Input intent with `source: 'auto'` → output `source === 'auto'`.
2. **`source: 'manual'` from client is preserved.** Input `source: 'manual'` → output `source === 'manual'`.
3. **actor, timestamp, sessionId are server-stamped.** Client tries to set bogus actor/timestamp/sessionId → output uses the server-supplied values.

## Verification

Standard gates per `CLAUDE.md`:

```bash
pnpm -F @ironyard/rules test
pnpm -F @ironyard/api test
pnpm test
pnpm typecheck
pnpm lint
pnpm canon:gen   # no drift; we don't touch rules-canon.md
```

All must pass with no regressions.

## Follow-ups (for the merge orchestrator)

1. **UI wiring for SetStamina.** DetailPane's long-press HP affordance currently shows "Edit not yet supported" (slice 11 spec line 31). After merge, swap it for a dispatcher that builds a SetStamina intent.
2. **UI wiring for EndEncounter.** EncounterBuilder needs an "End encounter" button. Tiny — one button + one dispatcher.
3. **Player-self-only gate for SetStamina.** Requires participant ownership in the schema (`Participant.ownerUserId` or a session-level `claims` map). Phase 2.
4. **`Participant.extras.persistent` flag.** When Censor Virtue / Conduit Divine Power 10th-level features land, add a `persistent: boolean` field and skip persistent extras in EndEncounter.
5. **`inverse()` for EndEncounter / SetStamina.** Phase 2 if we extend undo past round boundaries or if SetStamina-derived chains need to compose with undo.
