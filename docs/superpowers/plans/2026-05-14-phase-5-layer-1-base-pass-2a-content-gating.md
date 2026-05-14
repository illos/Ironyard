# Phase 5 Pass 2a — Content Gating + Turn Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Phase 5 Pass 2a — make the combat tracker role-asymmetric (player Turn-flow right pane, gated rails, tap-to-target, role-asymmetric Malice/Victories) and add engine-tracked per-turn action usage to support auto-collapsing Turn-flow sections.

**Architecture:** Two new intents (`MarkActionUsed`, `AdjustVictories`) + one new `Participant` field (`turnActionUsage`) added in `packages/shared` + `packages/rules`. `apps/web` decomposes the 746-line `DetailPane` into 9 focused files under `pages/combat/detail/` and extracts the 771-line `DirectorCombat`'s `InlineHeader` into `pages/combat/combat-header/`. Role-gating flows through three surfaces: rails (content + tap behavior), DetailPane (lock/focus + edit buttons), InlineHeader (Malice/Victories +/-). The active-director signal is sourced from the WS-mirrored `activeDirectorId` via a new `useIsActingAsDirector` hook that powers both `AppShell`'s Mode-B chrome and `DirectorCombat`'s role gates.

**Tech Stack:** TypeScript (strict), Zod, Vitest, React 18 + TanStack Router/Query, Tailwind 4, Hono Workers + D1 (Drizzle).

**Spec:** [`docs/superpowers/specs/2026-05-14-phase-5-layer-1-base-pass-2a-content-gating-design.md`](../specs/2026-05-14-phase-5-layer-1-base-pass-2a-content-gating-design.md)

---

## Phase A — Engine: action-usage tracking

### Task 1: Add `turnActionUsage` field to `ParticipantSchema`

**Files:**
- Modify: `packages/shared/src/participant.ts`
- Test: `packages/shared/tests/participant.spec.ts` (create if missing)

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/tests/participant.spec.ts
import { describe, expect, it } from 'vitest';
import { ParticipantSchema } from '../src/participant';

describe('ParticipantSchema.turnActionUsage', () => {
  it('defaults to all-false when omitted', () => {
    const parsed = ParticipantSchema.parse({
      id: 'p1',
      name: 'Mira',
      kind: 'pc',
      currentStamina: 10,
      maxStamina: 20,
      characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    });
    expect(parsed.turnActionUsage).toEqual({ main: false, maneuver: false, move: false });
  });

  it('preserves explicit values', () => {
    const parsed = ParticipantSchema.parse({
      id: 'p1',
      name: 'Mira',
      kind: 'pc',
      currentStamina: 10,
      maxStamina: 20,
      characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
      turnActionUsage: { main: true, maneuver: false, move: true },
    });
    expect(parsed.turnActionUsage).toEqual({ main: true, maneuver: false, move: true });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
pnpm --filter @ironyard/shared test participant.spec
```
Expected: FAIL — `turnActionUsage` is undefined.

- [ ] **Step 3: Add the field to `ParticipantSchema`**

Insert into `packages/shared/src/participant.ts` immediately after `victories` (around line 78):

```ts
  // Phase 5 Pass 2a — per-turn action-usage state for the Turn-flow UI.
  // Reset to all-false by applyStartTurn when this participant becomes the
  // turn-holder. RollPower auto-emits a derived MarkActionUsed based on
  // ability.type (action → main, maneuver → maneuver); Move has no engine
  // intent so it's set by the "Done moving" button only.
  turnActionUsage: z
    .object({
      main: z.boolean(),
      maneuver: z.boolean(),
      move: z.boolean(),
    })
    .default({ main: false, maneuver: false, move: false }),
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
pnpm --filter @ironyard/shared test participant.spec
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/participant.ts packages/shared/tests/participant.spec.ts
git commit -m "$(cat <<'EOF'
feat(shared): add ParticipantSchema.turnActionUsage for Pass-2a Turn flow

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2: Add `MarkActionUsed` intent payload schema

**Files:**
- Create: `packages/shared/src/intents/mark-action-used.ts`
- Modify: `packages/shared/src/intents/index.ts` (re-export + IntentTypes entry)

- [ ] **Step 1: Create the schema file**

```ts
// packages/shared/src/intents/mark-action-used.ts
import { z } from 'zod';

// Phase 5 Pass 2a — marks one of the three Turn-flow action slots
// (main / maneuver / move) as used or unused on a specific participant.
// Auto-emitted as a derived intent from RollPower (based on ability.type)
// and dispatched directly by the Turn-flow "Skip" / "Done moving" buttons.
// `used: false` clears the slot (used by the undo path).
export const MarkActionUsedPayloadSchema = z.object({
  participantId: z.string().min(1),
  slot: z.enum(['main', 'maneuver', 'move']),
  used: z.boolean().default(true),
});
export type MarkActionUsedPayload = z.infer<typeof MarkActionUsedPayloadSchema>;
```

- [ ] **Step 2: Re-export from `packages/shared/src/intents/index.ts`**

Add alphabetically (after `LoadEncounterTemplate`):

```ts
export { MarkActionUsedPayloadSchema } from './mark-action-used';
export type { MarkActionUsedPayload } from './mark-action-used';
```

And add to the `IntentTypes` const (alphabetically between `LoadEncounterTemplate` and `Note`):

```ts
  MarkActionUsed: 'MarkActionUsed',
```

- [ ] **Step 3: Typecheck the workspace**

```bash
pnpm typecheck
```
Expected: PASS (no consumers yet).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/intents/mark-action-used.ts packages/shared/src/intents/index.ts
git commit -m "$(cat <<'EOF'
feat(shared): MarkActionUsed intent schema + IntentTypes entry

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3: Add `applyMarkActionUsed` reducer

**Files:**
- Create: `packages/rules/src/intents/mark-action-used.ts`
- Create: `packages/rules/tests/intents/mark-action-used.spec.ts`
- Modify: `packages/rules/src/reducer.ts` (dispatch case)

- [ ] **Step 1: Write the failing reducer tests**

```ts
// packages/rules/tests/intents/mark-action-used.spec.ts
import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/reducer';
import {
  baseState,
  directorActor,
  ownerActor,
  playerActor,
  stamped,
  withEncounter,
} from './test-utils';

describe('applyMarkActionUsed', () => {
  it('flips the named slot to true on the named participant', () => {
    const state = withEncounter(baseState({}), {
      participants: [
        { id: 'pc-1', kind: 'pc', name: 'Mira', ownerId: 'u-mira' },
      ],
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.MarkActionUsed,
        actor: { userId: 'u-mira', role: 'player' },
        payload: { participantId: 'pc-1', slot: 'main', used: true },
      }),
    );
    expect(result.errors).toBeUndefined();
    const p = result.state.participants.find((x) => x.id === 'pc-1');
    expect(p?.turnActionUsage).toEqual({ main: true, maneuver: false, move: false });
  });

  it('supports clearing a slot (used: false) for the undo path', () => {
    const state = withEncounter(baseState({}), {
      participants: [
        {
          id: 'pc-1',
          kind: 'pc',
          name: 'Mira',
          ownerId: 'u-mira',
          turnActionUsage: { main: true, maneuver: false, move: false },
        },
      ],
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.MarkActionUsed,
        actor: { userId: 'u-mira', role: 'player' },
        payload: { participantId: 'pc-1', slot: 'main', used: false },
      }),
    );
    const p = result.state.participants.find((x) => x.id === 'pc-1');
    expect(p?.turnActionUsage.main).toBe(false);
  });

  it('rejects when the actor is neither the owner nor the active director', () => {
    const state = withEncounter(baseState({ activeDirectorId: 'u-director' }), {
      participants: [
        { id: 'pc-1', kind: 'pc', name: 'Mira', ownerId: 'u-mira' },
      ],
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.MarkActionUsed,
        actor: { userId: 'u-someone-else', role: 'player' },
        payload: { participantId: 'pc-1', slot: 'main', used: true },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('forbidden');
  });

  it('rejects for a missing participant id', () => {
    const state = withEncounter(baseState({}), { participants: [] });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.MarkActionUsed,
        actor: directorActor,
        payload: { participantId: 'nope', slot: 'main', used: true },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('participant_not_found');
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

```bash
pnpm --filter @ironyard/rules test mark-action-used.spec
```
Expected: FAIL — reducer doesn't exist yet.

- [ ] **Step 3: Implement the reducer**

```ts
// packages/rules/src/intents/mark-action-used.ts
import { MarkActionUsedPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

export function applyMarkActionUsed(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = MarkActionUsedPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `MarkActionUsed rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { participantId, slot, used } = parsed.data;
  const target = state.participants.find((p) => p.id === participantId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `MarkActionUsed: participant not found`, intentId: intent.id }],
      errors: [{ code: 'participant_not_found', message: participantId }],
    };
  }

  // Role gate: actor must own the participant OR be the active director.
  const isOwner = target.ownerId !== null && target.ownerId === intent.actor.userId;
  const isActiveDirector =
    state.activeDirectorId !== null && state.activeDirectorId === intent.actor.userId;
  if (!isOwner && !isActiveDirector) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `MarkActionUsed: forbidden`, intentId: intent.id }],
      errors: [{ code: 'forbidden', message: 'actor cannot mark this slot' }],
    };
  }

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: state.participants.map((p) =>
        p.id === participantId
          ? { ...p, turnActionUsage: { ...p.turnActionUsage, [slot]: used } }
          : p,
      ),
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `${target.name} ${used ? 'used' : 'cleared'} ${slot}`,
        intentId: intent.id,
      },
    ],
  };
}
```

- [ ] **Step 4: Wire the dispatch case in `reducer.ts`**

Add an import (alphabetically near `applyLoadEncounterTemplate`):

```ts
import { applyMarkActionUsed } from './intents/mark-action-used';
```

Add the dispatch case (alphabetically near `LoadEncounterTemplate`):

```ts
    case IntentTypes.MarkActionUsed:
      return applyMarkActionUsed(state, intent);
```

- [ ] **Step 5: Run the tests, verify they pass**

```bash
pnpm --filter @ironyard/rules test mark-action-used.spec
```
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/intents/mark-action-used.ts packages/rules/src/reducer.ts packages/rules/tests/intents/mark-action-used.spec.ts
git commit -m "$(cat <<'EOF'
feat(rules): applyMarkActionUsed reducer with owner-or-director gate

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4: Reset `turnActionUsage` on `StartTurn`

**Files:**
- Modify: `packages/rules/src/intents/turn.ts` (extend `applyStartTurn`)
- Modify: `packages/rules/tests/intents/turn.spec.ts` (or create if missing — add a focused test)

- [ ] **Step 1: Write the failing test**

Append to `packages/rules/tests/intents/turn.spec.ts`:

```ts
import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/reducer';
import { baseState, directorActor, stamped, withEncounter } from './test-utils';

describe('applyStartTurn — turnActionUsage', () => {
  it('resets the turn-holder\'s turnActionUsage to all-false', () => {
    const state = withEncounter(baseState({}), {
      participants: [
        {
          id: 'pc-1',
          kind: 'pc',
          name: 'Mira',
          ownerId: 'u-mira',
          turnActionUsage: { main: true, maneuver: true, move: true },
        },
      ],
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartTurn,
        actor: directorActor,
        payload: { participantId: 'pc-1' },
      }),
    );
    expect(result.errors).toBeUndefined();
    const p = result.state.participants.find((x) => x.id === 'pc-1');
    expect(p?.turnActionUsage).toEqual({ main: false, maneuver: false, move: false });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
pnpm --filter @ironyard/rules test turn.spec
```
Expected: FAIL — old turnActionUsage is preserved.

- [ ] **Step 3: Modify `applyStartTurn` to reset the field**

Open `packages/rules/src/intents/turn.ts`. `applyStartTurn` already uses a local `nextParticipants` variable that defaults to `state.participants` and is re-mapped only when the active PC has a heroic-resource gain. We need an unconditional reset that fires for every turn-holder (monster or PC, with or without heroic resources).

Locate the block right after the heroic-resource gain branch closes and before the `// Slice 6: reset per-turn flags...` comment (around line 262 — between the closing braces of the `if (config)` block and the `const nextTurnState = { ... };` block). Insert:

```ts
  // Phase 5 Pass 2a: clear the turn-flow action slots for the new turn-holder.
  // Unconditional — runs after any heroic-resource gain so it composes with
  // the heroicResources-only map above.
  nextParticipants = nextParticipants.map((p) =>
    isParticipant(p) && p.id === participantId
      ? { ...p, turnActionUsage: { main: false, maneuver: false, move: false } }
      : p,
  );
```

No other changes — the return statement already returns `participants: nextParticipants`.

- [ ] **Step 4: Run the test, verify it passes**

```bash
pnpm --filter @ironyard/rules test turn.spec
```
Expected: PASS.

- [ ] **Step 5: Run the full rules test suite to confirm no regressions**

```bash
pnpm --filter @ironyard/rules test
```
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/intents/turn.ts packages/rules/tests/intents/turn.spec.ts
git commit -m "$(cat <<'EOF'
feat(rules): applyStartTurn resets the turn-holder's turnActionUsage

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 5: Emit derived `MarkActionUsed` from `applyRollPower`

**Files:**
- Modify: `packages/rules/src/intents/roll-power.ts`
- Modify: `packages/rules/tests/intents/roll-power.spec.ts` (add focused tests)

- [ ] **Step 1: Write the failing tests**

Append to `packages/rules/tests/intents/roll-power.spec.ts`:

```ts
describe('applyRollPower — derived MarkActionUsed', () => {
  it('emits MarkActionUsed { slot: main } for an action-type ability', () => {
    // Construct a baseState/encounter where pc-1 has an action ability lined up
    // Mirror the existing roll-power test fixture pattern in this file.
    // ... build state with action-typed ability ...
    const result = applyIntent(state, stamped({ type: IntentTypes.RollPower, ... }));
    const derived = result.derived.find((d) => d.type === 'MarkActionUsed');
    expect(derived).toBeDefined();
    expect(derived?.payload).toMatchObject({
      participantId: 'pc-1',
      slot: 'main',
      used: true,
    });
  });

  it('emits MarkActionUsed { slot: maneuver } for a maneuver-type ability', () => {
    // ... same setup but ability.type === 'maneuver' ...
    const result = applyIntent(state, stamped({ type: IntentTypes.RollPower, ... }));
    const derived = result.derived.find((d) => d.type === 'MarkActionUsed');
    expect(derived?.payload).toMatchObject({ slot: 'maneuver' });
  });

  it('does NOT emit MarkActionUsed for triggered / free-triggered / villain / trait', () => {
    for (const type of ['triggered', 'free-triggered', 'villain', 'trait'] as const) {
      // ... ability with this type ...
      const result = applyIntent(state, stamped({ type: IntentTypes.RollPower, ... }));
      expect(result.derived.some((d) => d.type === 'MarkActionUsed')).toBe(false);
    }
  });
});
```

**Note for the implementer:** the exact fixture shape mirrors the existing `roll-power.spec.ts` setup — copy that pattern verbatim. The `ability.type` field on the static ability data is what drives the mapping.

- [ ] **Step 2: Run the tests, verify they fail**

```bash
pnpm --filter @ironyard/rules test roll-power.spec
```
Expected: FAIL on the three new tests; existing tests still pass.

- [ ] **Step 3: Add the derived-intent emission in `applyRollPower`**

Open `packages/rules/src/intents/roll-power.ts`. The function returns `IntentResult` with a `derived` array. After all existing derived intents are pushed (search the file for `derived.push(` or `derived: [` patterns), add:

```ts
// Phase 5 Pass 2a — auto-mark the action slot used when rolling an
// action- or maneuver-type ability. Triggered / villain / free-triggered /
// trait abilities do NOT consume a turn-flow slot.
const ability = /* the ability looked up earlier in this function */;
const slot: 'main' | 'maneuver' | null =
  ability.type === 'action' ? 'main'
  : ability.type === 'maneuver' ? 'maneuver'
  : null;
if (slot) {
  derived.push({
    type: IntentTypes.MarkActionUsed,
    payload: { participantId: attackerId, slot, used: true },
  });
}
```

The `ability` and `attackerId` references must come from the variables already in scope in `applyRollPower` (search for where those are resolved earlier in the function — likely from `payload.attackerId` and a lookup against static data or the participant's ability list).

- [ ] **Step 4: Run the tests, verify they pass**

```bash
pnpm --filter @ironyard/rules test roll-power.spec
```
Expected: PASS (existing + 3 new tests).

- [ ] **Step 5: Run the full rules test suite**

```bash
pnpm --filter @ironyard/rules test
```
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/intents/roll-power.ts packages/rules/tests/intents/roll-power.spec.ts
git commit -m "$(cat <<'EOF'
feat(rules): RollPower auto-emits MarkActionUsed for action/maneuver abilities

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Phase B — Engine: AdjustVictories

### Task 6: Add `AdjustVictories` intent payload schema

**Files:**
- Create: `packages/shared/src/intents/adjust-victories.ts`
- Modify: `packages/shared/src/intents/index.ts`

- [ ] **Step 1: Create the schema file**

```ts
// packages/shared/src/intents/adjust-victories.ts
import { z } from 'zod';

// Phase 5 Pass 2a — director-only intent that adjusts every PC participant's
// `victories` by the given signed delta. The post-state is clamped to ≥ 0 by
// the reducer. Applied collectively to the whole party (canon § 8.1: when
// the party earns a victory, every member gains one).
export const AdjustVictoriesPayloadSchema = z.object({
  delta: z.number().int(),
});
export type AdjustVictoriesPayload = z.infer<typeof AdjustVictoriesPayloadSchema>;
```

- [ ] **Step 2: Re-export + add to IntentTypes**

Edit `packages/shared/src/intents/index.ts`:

Re-export (alphabetically near top of file):

```ts
export { AdjustVictoriesPayloadSchema } from './adjust-victories';
export type { AdjustVictoriesPayload } from './adjust-victories';
```

In the `IntentTypes` map, add alphabetically (before `ApplyDamage`):

```ts
  AdjustVictories: 'AdjustVictories',
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/intents/adjust-victories.ts packages/shared/src/intents/index.ts
git commit -m "$(cat <<'EOF'
feat(shared): AdjustVictories intent schema + IntentTypes entry

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 7: Add `applyAdjustVictories` reducer with director gate

**Files:**
- Create: `packages/rules/src/intents/adjust-victories.ts`
- Create: `packages/rules/tests/intents/adjust-victories.spec.ts`
- Modify: `packages/rules/src/reducer.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/rules/tests/intents/adjust-victories.spec.ts
import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/reducer';
import { baseState, directorActor, playerActor, stamped, withEncounter } from './test-utils';

describe('applyAdjustVictories', () => {
  it('adds delta to every PC participant', () => {
    const state = withEncounter(baseState({ activeDirectorId: 'u-director' }), {
      participants: [
        { id: 'pc-1', kind: 'pc', name: 'Mira', ownerId: 'u-mira', victories: 2 },
        { id: 'pc-2', kind: 'pc', name: 'Aldon', ownerId: 'u-aldon', victories: 0 },
        { id: 'm-1', kind: 'monster', name: 'Bandit', ownerId: null, victories: 0 },
      ],
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.AdjustVictories,
        actor: { userId: 'u-director', role: 'director' },
        payload: { delta: 1 },
      }),
    );
    expect(result.errors).toBeUndefined();
    const byId = new Map(result.state.participants.map((p) => [p.id, p]));
    expect(byId.get('pc-1')?.victories).toBe(3);
    expect(byId.get('pc-2')?.victories).toBe(1);
    expect(byId.get('m-1')?.victories).toBe(0); // monsters untouched
  });

  it('clamps the result to >= 0', () => {
    const state = withEncounter(baseState({ activeDirectorId: 'u-director' }), {
      participants: [
        { id: 'pc-1', kind: 'pc', name: 'Mira', ownerId: 'u-mira', victories: 1 },
      ],
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.AdjustVictories,
        actor: { userId: 'u-director', role: 'director' },
        payload: { delta: -5 },
      }),
    );
    const p = result.state.participants.find((x) => x.id === 'pc-1');
    expect(p?.victories).toBe(0);
  });

  it('rejects when actor is not the active director', () => {
    const state = withEncounter(baseState({ activeDirectorId: 'u-director' }), {
      participants: [{ id: 'pc-1', kind: 'pc', name: 'Mira', ownerId: 'u-mira' }],
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.AdjustVictories,
        actor: { userId: 'u-mira', role: 'player' },
        payload: { delta: 1 },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('forbidden');
  });

  it('rejects when no encounter is active', () => {
    const state = baseState({ activeDirectorId: 'u-director' });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.AdjustVictories,
        actor: { userId: 'u-director', role: 'director' },
        payload: { delta: 1 },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('no_active_encounter');
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

```bash
pnpm --filter @ironyard/rules test adjust-victories.spec
```
Expected: FAIL.

- [ ] **Step 3: Implement the reducer**

```ts
// packages/rules/src/intents/adjust-victories.ts
import { AdjustVictoriesPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

export function applyAdjustVictories(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = AdjustVictoriesPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `AdjustVictories rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  if (!state.encounter) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'AdjustVictories: no active encounter', intentId: intent.id }],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }

  if (state.activeDirectorId === null || state.activeDirectorId !== intent.actor.userId) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'AdjustVictories: forbidden', intentId: intent.id }],
      errors: [{ code: 'forbidden', message: 'only the active director can adjust victories' }],
    };
  }

  const { delta } = parsed.data;
  const updated = state.participants.map((p) =>
    p.kind === 'pc'
      ? { ...p, victories: Math.max(0, p.victories + delta) }
      : p,
  );

  return {
    state: { ...state, seq: state.seq + 1, participants: updated },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `Director ${delta >= 0 ? 'awards' : 'deducts'} ${Math.abs(delta)} victory${Math.abs(delta) === 1 ? '' : 'ies'} to the party`,
        intentId: intent.id,
      },
    ],
  };
}
```

- [ ] **Step 4: Wire dispatch in `reducer.ts`**

Add import (alphabetically near `applyAddMonster`):

```ts
import { applyAdjustVictories } from './intents/adjust-victories';
```

Add the case (alphabetically near `AddMonster`):

```ts
    case IntentTypes.AdjustVictories:
      return applyAdjustVictories(state, intent);
```

- [ ] **Step 5: Run the tests**

```bash
pnpm --filter @ironyard/rules test adjust-victories.spec
```
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/intents/adjust-victories.ts packages/rules/src/reducer.ts packages/rules/tests/intents/adjust-victories.spec.ts
git commit -m "$(cat <<'EOF'
feat(rules): applyAdjustVictories — director-only, party-wide delta

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 8: Extend `EndEncounter` side-effect to write back `victories`

**Files:**
- Modify: `apps/api/src/lobby-do-side-effects.ts` (`sideEffectEndEncounter`)

- [ ] **Step 1: Add the victories writeback line**

Open `apps/api/src/lobby-do-side-effects.ts` and find `sideEffectEndEncounter` (around line 450). Inside the `pcParticipants.map` body, after the existing two assignments:

```ts
      data.currentStamina = participant.currentStamina;
      data.recoveriesUsed = participant.recoveries.max - participant.recoveries.current;
```

Add:

```ts
      data.victories = participant.victories;
```

- [ ] **Step 2: Verify `CharacterSchema.victories` is a writable field**

Run:

```bash
grep -n "victories" packages/shared/src/character.ts
```
Expected: see the field defined. (It is — Epic 2A added it.)

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lobby-do-side-effects.ts
git commit -m "$(cat <<'EOF'
feat(api): EndEncounter side-effect writes back per-PC victories

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Phase C — Web client: active-director signal

### Task 9: Add `useIsActingAsDirector` hook

**Files:**
- Create: `apps/web/src/lib/active-director.ts`
- Create: `apps/web/src/lib/active-director.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/lib/active-director.spec.tsx
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsActingAsDirector } from './active-director';

// Mock dependencies the hook reads from.
vi.mock('../api/queries', () => ({
  useMe: () => ({ data: { user: { id: 'u-mira' } } }),
}));

vi.mock('../ws/useSessionSocket', () => ({
  useSessionSocket: (campaignId: string | null) => ({
    activeDirectorId: campaignId === 'camp-1' ? 'u-mira' : null,
  }),
}));

describe('useIsActingAsDirector', () => {
  it('returns true when me === activeDirectorId', () => {
    const { result } = renderHook(() => useIsActingAsDirector('camp-1'));
    expect(result.current).toBe(true);
  });

  it('returns false for a non-director user', () => {
    const { result } = renderHook(() => useIsActingAsDirector('camp-2'));
    expect(result.current).toBe(false);
  });

  it('returns false when campaignId is null', () => {
    const { result } = renderHook(() => useIsActingAsDirector(null));
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
pnpm --filter @ironyard/web test active-director
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```ts
// apps/web/src/lib/active-director.ts
import { useMe } from '../api/queries';
import { useSessionSocket } from '../ws/useSessionSocket';

/**
 * Phase 5 Pass 2a — true iff the current user is the active director of the
 * given campaign (active-behind-the-screen, mirrored over the WS from the
 * lobby DO's `activeDirectorId`). Returns false during initial connect
 * (activeDirectorId null) and when campaignId is null.
 *
 * Consumers: AppShell (Mode-B chrome resolution), DirectorCombat (role-gated
 * rails / DetailPane / Malice / Victories edits).
 *
 * useSessionSocket(sessionId: string | undefined) accepts undefined safely —
 * the campaignless variant returns inert state without opening a connection.
 */
export function useIsActingAsDirector(campaignId: string | null): boolean {
  const me = useMe();
  const { activeDirectorId } = useSessionSocket(campaignId ?? undefined);
  if (!campaignId || !me.data || !activeDirectorId) return false;
  return me.data.user.id === activeDirectorId;
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
pnpm --filter @ironyard/web test active-director
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/active-director.ts apps/web/src/lib/active-director.spec.tsx
git commit -m "$(cat <<'EOF'
feat(web): useIsActingAsDirector hook from WS-mirrored activeDirectorId

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 10: Wire `AppShell` to the real signal

**Files:**
- Modify: `apps/web/src/primitives/AppShell.tsx`
- Modify: `apps/web/src/primitives/TopBar.spec.tsx` (if mock needs update)

- [ ] **Step 1: Replace the stub**

In `apps/web/src/primitives/AppShell.tsx`, delete the stub `useIsActiveDirector` and import the new hook:

```ts
import { useIsActingAsDirector } from '../lib/active-director';
```

In `AppShell`:

```ts
const { activeCampaignId } = useActiveContext();
const isActiveDirector = useIsActingAsDirector(activeCampaignId);
```

(Delete the old `useIsActiveDirector` function entirely.)

- [ ] **Step 2: Run the AppShell + TopBar tests**

```bash
pnpm --filter @ironyard/web test "TopBar|AppShell"
```
Expected: PASS. If `TopBar.spec.tsx` fails because the mock doesn't cover `useIsActingAsDirector`, widen the mock — add `useIsActingAsDirector: () => false` to the appropriate mock map.

- [ ] **Step 3: Smoke-test the dev server**

```bash
pnpm --filter @ironyard/web dev
```

Open `/campaigns/$id` (an active campaign) as the campaign's owner. Confirm the TopBar shows Mode-B chrome (campaign breadcrumb / Round / Victories / Malice readouts when on a combat page) — Pass 1 already rendered Mode-B; this task lights it up.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/primitives/AppShell.tsx apps/web/src/primitives/TopBar.spec.tsx
git commit -m "$(cat <<'EOF'
feat(web/shell): AppShell.useIsActiveDirector now reads WS-mirrored signal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Phase D — Web client: DetailPane decomposition (refactor, no behavior change)

The existing `DetailPane.tsx` is 746 lines. Tasks 11–15 extract its concerns into separate files **without changing behavior**. Each task ends with the page rendering identically — visual diffs and unit tests should be green. Layering of Pass-2a features (Turn flow / Full sheet toggle, content gating, target banner) happens after the decomposition lands in Phase H–J.

### Task 11: Create `pages/combat/detail/` and extract `ConditionPickerPopover`

**Files:**
- Create: `apps/web/src/pages/combat/detail/ConditionPickerPopover.tsx`
- Modify: `apps/web/src/pages/combat/DetailPane.tsx`

- [ ] **Step 1: Identify the condition-picker JSX**

In `DetailPane.tsx`, locate the JSX that renders the `+ Condition` button + its inline popover (the dropdown that shows the 9 condition types). Capture the props it needs from the parent.

- [ ] **Step 2: Create `ConditionPickerPopover.tsx`**

Move that JSX + its local state + its handlers verbatim into:

```tsx
// apps/web/src/pages/combat/detail/ConditionPickerPopover.tsx
import { /* same imports as DetailPane uses for this block */ } from '@ironyard/shared';
import { /* …*/ } from 'react';

export interface ConditionPickerPopoverProps {
  // Mirror the prop shape inferred from what the extracted JSX referenced
  // in DetailPane.
}

export function ConditionPickerPopover(props: ConditionPickerPopoverProps) {
  // ...exact code from DetailPane, just relocated...
}
```

- [ ] **Step 3: Replace the JSX in `DetailPane.tsx` with the component**

```tsx
import { ConditionPickerPopover } from './detail/ConditionPickerPopover';
// ...
<ConditionPickerPopover { /* mapped props */ } />
```

- [ ] **Step 4: Run tests + typecheck**

```bash
pnpm --filter @ironyard/web typecheck
pnpm --filter @ironyard/web test
```
Expected: PASS.

- [ ] **Step 5: Eye-test in dev**

```bash
pnpm --filter @ironyard/web dev
```

Navigate to an active encounter, focus a participant, click `+ Condition`. The dropdown should render and apply identically to before.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/combat/detail/ConditionPickerPopover.tsx apps/web/src/pages/combat/DetailPane.tsx
git commit -m "$(cat <<'EOF'
refactor(web/combat): extract ConditionPickerPopover from DetailPane

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 12: Extract `StaminaEditPopover`

**Files:**
- Create: `apps/web/src/pages/combat/detail/StaminaEditPopover.tsx`
- Modify: `apps/web/src/pages/combat/DetailPane.tsx`

- [ ] **Step 1: Move the stamina-edit JSX (the `Edit` button popover)**

Same approach as Task 11: relocate the JSX + state for typing a new stamina value into a fresh file with a focused props interface.

- [ ] **Step 2: Wire it back in `DetailPane.tsx`**

```tsx
import { StaminaEditPopover } from './detail/StaminaEditPopover';
```

- [ ] **Step 3: Test + typecheck + eye-test + commit**

```bash
pnpm --filter @ironyard/web typecheck && pnpm --filter @ironyard/web test
```

```bash
git add apps/web/src/pages/combat/detail/StaminaEditPopover.tsx apps/web/src/pages/combat/DetailPane.tsx
git commit -m "refactor(web/combat): extract StaminaEditPopover from DetailPane

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 13: Extract `DetailHeader`

**Files:**
- Create: `apps/web/src/pages/combat/detail/DetailHeader.tsx`
- Modify: `apps/web/src/pages/combat/DetailPane.tsx`

- [ ] **Step 1: Extract the header block**

`DetailHeader` owns the meta line (level / role / size / speed / stability), the stamina readout + bar + `−1 / −5 / −10 / Edit` buttons row, and the conditions row (`+ Condition` + active chips with `×`). It composes the two popovers from Tasks 11–12.

- [ ] **Step 2: Define a clear props interface**

```tsx
export interface DetailHeaderProps {
  focused: Participant;
  monsterLevel: number | null;     // null for PCs
  // Edit-gate flags (filled with `true` everywhere today; will be wired in Phase I).
  canEditStamina?: boolean;
  canEditConditions?: boolean;
  dispatchSetStamina: (payload: SetStaminaPayload) => void;
  dispatchSetCondition: (payload: SetConditionPayload) => void;
  dispatchRemoveCondition: (payload: RemoveConditionPayload) => void;
}
```

`canEditStamina` / `canEditConditions` default to `true` here. The actual gating wires up in Task 27.

- [ ] **Step 3: Test + typecheck + eye-test + commit**

```bash
git add apps/web/src/pages/combat/detail/DetailHeader.tsx apps/web/src/pages/combat/DetailPane.tsx
git commit -m "refactor(web/combat): extract DetailHeader from DetailPane

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 14: Extract `FullSheetTab` (today's body)

**Files:**
- Create: `apps/web/src/pages/combat/detail/FullSheetTab.tsx`
- Modify: `apps/web/src/pages/combat/DetailPane.tsx`

- [ ] **Step 1: Move the remaining DetailPane body**

Everything below `DetailHeader` — the ability list (current `AbilityCard` renders), the heroic-resources / surges / recoveries blocks (today rendered for PCs), and any inventory rendering currently embedded — moves to `FullSheetTab.tsx`. This is "the full stat block" content in the spec.

- [ ] **Step 2: Define `FullSheetTabProps`** that mirror exactly what's required to render the existing body.

- [ ] **Step 3: Test + typecheck + eye-test + commit**

```bash
git add apps/web/src/pages/combat/detail/FullSheetTab.tsx apps/web/src/pages/combat/DetailPane.tsx
git commit -m "refactor(web/combat): extract FullSheetTab from DetailPane body

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 15: Move `DetailPane.tsx` into the folder; add `index.ts`

**Files:**
- Move: `apps/web/src/pages/combat/DetailPane.tsx` → `apps/web/src/pages/combat/detail/DetailPane.tsx`
- Create: `apps/web/src/pages/combat/detail/index.ts`
- Modify: `apps/web/src/pages/combat/DirectorCombat.tsx` (update import path)

- [ ] **Step 1: Move the file**

```bash
git mv apps/web/src/pages/combat/DetailPane.tsx apps/web/src/pages/combat/detail/DetailPane.tsx
```

Update its internal imports of the sibling extracted files (drop the `./detail/` prefix; they're now siblings):

```ts
import { ConditionPickerPopover } from './ConditionPickerPopover';
import { DetailHeader } from './DetailHeader';
import { FullSheetTab } from './FullSheetTab';
import { StaminaEditPopover } from './StaminaEditPopover';
```

- [ ] **Step 2: Create `index.ts`**

```ts
// apps/web/src/pages/combat/detail/index.ts
export { DetailPane } from './DetailPane';
export type { DetailPaneProps } from './DetailPane';
```

- [ ] **Step 3: Update DirectorCombat's import**

```ts
import { DetailPane } from './detail';
```

- [ ] **Step 4: Test + typecheck + commit**

```bash
git add apps/web/src/pages/combat/detail/ apps/web/src/pages/combat/DirectorCombat.tsx
git commit -m "refactor(web/combat): relocate DetailPane into detail/ folder

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Phase E — Web client: combat-header extraction

### Task 16: Extract `InlineHeader` to `combat-header/`

**Files:**
- Create: `apps/web/src/pages/combat/combat-header/InlineHeader.tsx`
- Modify: `apps/web/src/pages/combat/DirectorCombat.tsx`

- [ ] **Step 1: Move the inline `InlineHeader` function out of `DirectorCombat.tsx` into a fresh file**

`DirectorCombat.tsx` defines `InlineHeader` inline (around lines 594-718). Cut the entire component (including its `InlineHeaderProps` type) and paste into:

```tsx
// apps/web/src/pages/combat/combat-header/InlineHeader.tsx
import { Link } from '@tanstack/react-router';
import { Button, Pill, Stat } from '../../../primitives';
// …other imports the function uses
export type InlineHeaderProps = { /* exact type from DirectorCombat */ };
export function InlineHeader(props: InlineHeaderProps) {
  // …exact body…
}
```

- [ ] **Step 2: Import it in `DirectorCombat.tsx`**

```ts
import { InlineHeader } from './combat-header/InlineHeader';
```

- [ ] **Step 3: Test + typecheck + eye-test + commit**

```bash
git add apps/web/src/pages/combat/combat-header/InlineHeader.tsx apps/web/src/pages/combat/DirectorCombat.tsx
git commit -m "refactor(web/combat): extract InlineHeader from DirectorCombat

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 17: Extract `MalicePill` (display-only first)

**Files:**
- Create: `apps/web/src/pages/combat/combat-header/MalicePill.tsx`
- Modify: `apps/web/src/pages/combat/combat-header/InlineHeader.tsx`

- [ ] **Step 1: Extract the Malice Pill JSX**

Move the Pill (with its `−` / value / `+` markup) into:

```tsx
// apps/web/src/pages/combat/combat-header/MalicePill.tsx
import { Pill } from '../../../primitives';

export interface MalicePillProps {
  malice: number;
  // For the next task (18), we'll add an `editable` prop. For now: both
  // buttons always render; behavior unchanged from the inline version.
  onGain: () => void;
  onSpend: () => void;
  disabled: boolean;
}

export function MalicePill({ malice, onGain, onSpend, disabled }: MalicePillProps) {
  return (
    <Pill dotClassName="bg-foe">
      <button
        type="button"
        onClick={onSpend}
        disabled={disabled}
        className="px-1.5 text-foe hover:text-text disabled:opacity-40"
        aria-label="Spend 1 Malice"
      >
        −
      </button>
      <span className="font-mono uppercase tracking-[0.08em] text-text-mute">
        Malice <b className="text-text font-sans">{malice}</b>
      </span>
      <button
        type="button"
        onClick={onGain}
        disabled={disabled}
        className="px-1.5 text-foe hover:text-text disabled:opacity-40"
        aria-label="Gain 1 Malice"
      >
        +
      </button>
    </Pill>
  );
}
```

- [ ] **Step 2: Use it in `InlineHeader.tsx`**

Replace the inline Pill JSX with:

```tsx
{malice !== null && (
  <MalicePill malice={malice} onGain={onMaliceGain} onSpend={onMaliceSpend} disabled={wsClosed} />
)}
```

- [ ] **Step 3: Test + typecheck + commit**

```bash
git add apps/web/src/pages/combat/combat-header/MalicePill.tsx apps/web/src/pages/combat/combat-header/InlineHeader.tsx
git commit -m "refactor(web/combat): extract MalicePill component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 18: Extract `VictoriesPill` (display-only initially)

**Files:**
- Create: `apps/web/src/pages/combat/combat-header/VictoriesPill.tsx`
- Modify: `apps/web/src/pages/combat/combat-header/InlineHeader.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/pages/combat/combat-header/VictoriesPill.tsx
import { Stat } from '../../../primitives';

export interface VictoriesPillProps {
  victories: number;
  // Pass 2a Task 28 wires director-only +/-. For now: display-only mirror of
  // the existing Stat usage.
  onIncrement?: () => void;
  onDecrement?: () => void;
  editable?: boolean;
  disabled?: boolean;
}

export function VictoriesPill({ victories, editable, onIncrement, onDecrement, disabled }: VictoriesPillProps) {
  if (!editable) {
    return <Stat label="Victories" value={victories} />;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onDecrement}
        disabled={disabled}
        className="px-1.5 text-text-mute hover:text-text disabled:opacity-40"
        aria-label="Decrement victories"
      >
        −
      </button>
      <Stat label="Victories" value={victories} />
      <button
        type="button"
        onClick={onIncrement}
        disabled={disabled}
        className="px-1.5 text-text-mute hover:text-text disabled:opacity-40"
        aria-label="Increment victories"
      >
        +
      </button>
    </span>
  );
}
```

- [ ] **Step 2: Use it in `InlineHeader.tsx` (display-only for now)**

Replace `<Stat label="Victories" value={victories} />` with:

```tsx
<VictoriesPill victories={victories} />
```

- [ ] **Step 3: Test + typecheck + commit**

```bash
git add apps/web/src/pages/combat/combat-header/VictoriesPill.tsx apps/web/src/pages/combat/combat-header/InlineHeader.tsx
git commit -m "refactor(web/combat): extract VictoriesPill (display-only stub)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Phase F — Web client: rail content gating + shared utils

### Task 19: Lift `initials` + `summarizeRole` into `rails/rail-utils.ts`

**Files:**
- Create: `apps/web/src/pages/combat/rails/rail-utils.ts`
- Modify: `apps/web/src/pages/combat/PartyRail.tsx`
- Modify: `apps/web/src/pages/combat/EncounterRail.tsx`

- [ ] **Step 1: Create the shared util**

```ts
// apps/web/src/pages/combat/rails/rail-utils.ts
import type { Participant } from '@ironyard/shared';

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function summarizeRole(p: Participant): string {
  // Pass 2b will materialize monster role / class / ancestry onto the
  // participant. Until then we render what's available.
  if (p.kind === 'monster') return p.level ? `L${p.level} · FOE` : 'FOE';
  const parts: string[] = [`L${p.level}`, 'HERO'];
  return parts.join(' · ');
}
```

- [ ] **Step 2: Replace the in-file copies in both rails**

In `PartyRail.tsx` and `EncounterRail.tsx`, delete the inline `initials()` and `summarizeRole()` definitions; import from `./rails/rail-utils`.

- [ ] **Step 3: Typecheck + test**

```bash
pnpm --filter @ironyard/web typecheck && pnpm --filter @ironyard/web test
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/combat/rails/rail-utils.ts apps/web/src/pages/combat/PartyRail.tsx apps/web/src/pages/combat/EncounterRail.tsx
git commit -m "refactor(web/combat): lift rail initials/summarizeRole to shared util

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 20: Add `viewerRole` + `selfParticipantId` props to both rails

**Files:**
- Modify: `apps/web/src/pages/combat/PartyRail.tsx`
- Modify: `apps/web/src/pages/combat/EncounterRail.tsx`
- Modify: `apps/web/src/pages/combat/DirectorCombat.tsx`

- [ ] **Step 1: Extend `PartyRailProps`**

```ts
export interface PartyRailProps {
  heroes: Participant[];
  activeParticipantId: string | null;
  selectedParticipantId: string | null;
  onSelect: (id: string) => void;
  actedIds: Set<string>;
  viewerRole: 'director' | 'player';
  selfParticipantId: string | null;     // when viewer is player, their own participant id
  targetParticipantId: string | null;    // set by tap-to-target (player view)
}
```

(The `targetParticipantId` is consumed in Task 22 / 23; declaring it now keeps the prop surface stable.)

For now, render unchanged when `viewerRole === 'director'`. Player-view rendering is Task 21.

- [ ] **Step 2: Same shape for `EncounterRailProps`**

(No `selfParticipantId` ever matches a foe, but include it for symmetry.)

- [ ] **Step 3: Thread the props from `DirectorCombat`**

In `DirectorCombat.tsx`, where it calls `<PartyRail .../>` and `<EncounterRail .../>`, add:

```tsx
const isDirector = useIsActingAsDirector(campaignId);   // import at top
const viewerRole: 'director' | 'player' = isDirector ? 'director' : 'player';
const selfParticipantId =
  participants.find((p) => p.kind === 'pc' && p.ownerId === me.data?.user.id)?.id ?? null;
const [targetParticipantId, setTargetParticipantId] = useState<string | null>(null);
// …
<PartyRail
  heroes={heroes}
  /* existing props */
  viewerRole={viewerRole}
  selfParticipantId={selfParticipantId}
  targetParticipantId={targetParticipantId}
/>
```

For now `setTargetParticipantId` is unused; that wires up in Task 23.

- [ ] **Step 4: Typecheck + test + commit**

```bash
pnpm --filter @ironyard/web typecheck && pnpm --filter @ironyard/web test
```

```bash
git add apps/web/src/pages/combat/PartyRail.tsx apps/web/src/pages/combat/EncounterRail.tsx apps/web/src/pages/combat/DirectorCombat.tsx
git commit -m "feat(web/combat): thread viewerRole + selfParticipantId through rails

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 21: Strip role / pips / recoveries for non-self rows in player view

**Files:**
- Modify: `apps/web/src/pages/combat/PartyRail.tsx`
- Modify: `apps/web/src/pages/combat/EncounterRail.tsx`

- [ ] **Step 1: Render gated content for non-self rows**

In both rails, replace the `<ParticipantRow />` invocation with a conditional:

```tsx
const isSelf = h.id === selfParticipantId;
const isGated = viewerRole === 'player' && !isSelf;
<ParticipantRow
  key={h.id}
  sigil={initials(h.name)}
  name={h.name}
  role={isGated ? null : summarizeRole(h)}
  // resource + recoveries are PartyRail-specific blocks; for EncounterRail they're omitted entirely.
  staminaCurrent={h.currentStamina}
  staminaMax={h.maxStamina}
  active={selectedParticipantId === h.id}
  isTurn={activeParticipantId === h.id}
  acted={actedIds.has(h.id)}
  isTarget={targetParticipantId === h.id}
  onSelect={() => onSelect(h.id)}
/>
```

The `isTarget` prop is added in Task 22; pass it now and Task 22 lights it up.

- [ ] **Step 2: Test + commit**

```bash
git add apps/web/src/pages/combat/PartyRail.tsx apps/web/src/pages/combat/EncounterRail.tsx
git commit -m "feat(web/combat): gate role/pips/recoveries for non-self rows in player view

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 22: Add `isTarget` prop to `ParticipantRow`

**Files:**
- Modify: `apps/web/src/primitives/ParticipantRow.tsx`

- [ ] **Step 1: Add the prop + render rule**

In `ParticipantRow`, add `isTarget?: boolean` to `ParticipantRowProps`. After the `turnClass` line:

```ts
const targetClass = isTarget && !isTurn ? 'shadow-[0_0_0_1px_var(--accent)]' : '';
```

Append `targetClass` to the row's `className` string (after `activeClass`):

```tsx
className={`relative grid grid-cols-[32px_1fr_auto_auto_auto_110px] items-center gap-3 px-3 py-2 bg-ink-2 border border-line text-left transition-colors hover:border-pk hover:bg-ink-3 ${packClass} ${turnClass} ${activeClass} ${targetClass} ${actedClass}`}
```

- [ ] **Step 2: Typecheck + test + commit**

```bash
pnpm --filter @ironyard/web typecheck && pnpm --filter @ironyard/web test
```

```bash
git add apps/web/src/primitives/ParticipantRow.tsx
git commit -m "feat(web/primitives): ParticipantRow isTarget ring at lower priority than isTurn

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Phase G — Web client: tap-to-target + role-driven row clicks

### Task 23: Role-driven row click handler in DirectorCombat

**Files:**
- Modify: `apps/web/src/pages/combat/DirectorCombat.tsx`

- [ ] **Step 1: Replace `handleSelect` with two handlers**

In `DirectorCombat.tsx`:

```ts
const handleFocus = useCallback((id: string) => setSelectedId(id), []);
const handleTarget = useCallback((id: string) => {
  setTargetParticipantId((prev) => (prev === id ? null : id));
}, []);
const handleRowClick = viewerRole === 'director' ? handleFocus : handleTarget;
```

- [ ] **Step 2: Wire `handleRowClick` to both rails' `onSelect` prop**

```tsx
<PartyRail
  heroes={heroes}
  /* …existing… */
  onSelect={handleRowClick}
  /* …existing… */
/>
<EncounterRail
  foes={liveFoes}
  /* …existing… */
  onSelect={handleRowClick}
  /* …existing… */
/>
```

- [ ] **Step 3: Force player's selected detail to their own char**

In the same component:

```ts
// For player view, the selected participant in DetailPane is ALWAYS the
// player's own character, regardless of what they tap in the rails.
useEffect(() => {
  if (viewerRole === 'player' && selfParticipantId) {
    setSelectedId(selfParticipantId);
  }
}, [viewerRole, selfParticipantId]);
```

- [ ] **Step 4: Eye-test in dev**

Open dev, sign in as a player. Confirm:
- Tapping another participant doesn't change the right pane.
- Tapping a row sets the accent ring on it.
- Tapping the same row again clears it.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/combat/DirectorCombat.tsx
git commit -m "feat(web/combat): role-driven row click (focus vs. target)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 24: Wire `targetParticipantId` into `AbilityCard` auto-roll

**Files:**
- Modify: `apps/web/src/pages/combat/detail/FullSheetTab.tsx` (or wherever AbilityCard is rendered)
- Modify: `apps/web/src/pages/combat/AbilityCard.tsx`

- [ ] **Step 1: Pass the target id down**

Plumb `targetParticipantId` from `DirectorCombat` through `DetailPane` → `FullSheetTab` (and later `TurnFlowTab`) → `AbilityCard`.

- [ ] **Step 2: Have `AbilityCard` prefer the row-tap target on Auto-roll**

In `AbilityCard.tsx`, when computing the target for an `Auto-roll`:

```ts
const effectiveTargetId = targetParticipantId ?? selectedTargetFromDropdown;
```

The existing dropdown stays as fallback. When `targetParticipantId` is set, the dropdown's value is preempted but the dropdown itself stays visible (for re-targeting via the existing director path).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/combat/detail/FullSheetTab.tsx apps/web/src/pages/combat/AbilityCard.tsx apps/web/src/pages/combat/detail/DetailPane.tsx
git commit -m "feat(web/combat): row-tap target preempts AbilityCard dropdown selection

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 25: `TargetBanner` component

**Files:**
- Create: `apps/web/src/pages/combat/detail/TargetBanner.tsx`
- Modify: `apps/web/src/pages/combat/detail/DetailPane.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/pages/combat/detail/TargetBanner.tsx
import type { Participant } from '@ironyard/shared';

export interface TargetBannerProps {
  target: Participant | null;
  selfParticipantId: string | null;
}

export function TargetBanner({ target, selfParticipantId }: TargetBannerProps) {
  if (!target) return null;
  const isSelf = target.id === selfParticipantId;
  return (
    <div className="bg-ink-3 border border-accent-glow px-3 py-1.5 text-sm">
      → Targeting{' '}
      <b className="font-semibold">{isSelf ? 'yourself' : target.name}</b>
      <span className="text-text-mute ml-2 font-mono tabular-nums">
        {target.currentStamina}/{target.maxStamina}
      </span>
      {target.conditions.length > 0 && (
        <span className="text-text-mute ml-2">
          · {target.conditions.map((c) => c.type).join(', ')}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render in `DetailPane` (Turn flow tab only — but stub-render in player view above body for now)**

Until Task 30 splits the tabs, render `TargetBanner` inside DetailPane only when `viewerRole === 'player'`. After Task 30, move it inside `TurnFlowTab`.

- [ ] **Step 3: Test + commit**

```bash
git add apps/web/src/pages/combat/detail/TargetBanner.tsx apps/web/src/pages/combat/detail/DetailPane.tsx
git commit -m "feat(web/combat): TargetBanner above DetailPane body for player view

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Phase H — Web client: spectator + DetailPane role gates

### Task 26: Spectator empty-state in DetailPane

**Files:**
- Modify: `apps/web/src/pages/combat/detail/DetailPane.tsx`

- [ ] **Step 1: Branch on `selfParticipantId === null` in player view**

```tsx
if (viewerRole === 'player' && !selfParticipantId) {
  return (
    <div className="border border-dashed border-line-soft p-6 text-center text-sm text-text-mute">
      You're not in this encounter. The director can bring you in via Encounter Builder.
    </div>
  );
}
```

`DetailPane` already early-returns for `!focused`; this branch sits just before that.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/combat/detail/DetailPane.tsx
git commit -m "feat(web/combat): DetailPane spectator empty-state for participant-less players

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 27: Gate edit affordances in `DetailHeader` + `FullSheetTab`

**Files:**
- Modify: `apps/web/src/pages/combat/detail/DetailHeader.tsx`
- Modify: `apps/web/src/pages/combat/detail/FullSheetTab.tsx`
- Modify: `apps/web/src/pages/combat/detail/DetailPane.tsx`

- [ ] **Step 1: Compute `canEdit` in `DetailPane`**

```ts
const canEdit = viewerRole === 'director' || focused.id === selfParticipantId;
```

Pass `canEditStamina={canEdit}`, `canEditConditions={canEdit}`, and a new `canRoll={canEdit}` prop through to `DetailHeader` / `FullSheetTab`.

- [ ] **Step 2: Hide the stamina edit buttons / `+ Condition` / chip `×` when `canEditStamina === false`**

In `DetailHeader.tsx`:

```tsx
{canEditStamina && (
  <>
    <button onClick={() => onDamage(-1)}>−1</button>
    {/* etc */}
  </>
)}
```

Same pattern for the `+ Condition` button + condition chip `×` buttons.

- [ ] **Step 3: Hide `Auto-roll` / `Manual` buttons on AbilityCard when `canRoll === false`**

Either gate inside `AbilityCard` (prop: `disabled` already exists — extend semantics to "hide" when role-gated) or render abilities as read-only (just text, no button row) in `FullSheetTab` when `!canRoll`. Read-only-render is the cleaner option; pick that and update `AbilityCard` to accept `readOnly?: boolean`.

- [ ] **Step 4: Eye-test in dev**

Player on /campaigns/$id/play; focus another participant's row via the dropdown or the player's own (locked) row. Confirm:
- Stamina edit buttons hidden on others' rows.
- `+ Condition` hidden.
- `×` on condition chips hidden.
- AbilityCards render but their roll buttons are absent.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/combat/detail/DetailHeader.tsx apps/web/src/pages/combat/detail/FullSheetTab.tsx apps/web/src/pages/combat/detail/DetailPane.tsx apps/web/src/pages/combat/AbilityCard.tsx
git commit -m "feat(web/combat): role-gate stamina/condition/ability edit affordances

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Phase I — Web client: Turn flow tab

### Task 28: Turn flow / Full sheet toggle in DetailPane

**Files:**
- Modify: `apps/web/src/pages/combat/detail/DetailPane.tsx`

- [ ] **Step 1: Add local toggle state**

```ts
type TabId = 'turn-flow' | 'full-sheet';
const [tab, setTab] = useState<TabId>(viewerRole === 'player' ? 'turn-flow' : 'full-sheet');
```

- [ ] **Step 2: Render the segmented control**

```tsx
<div className="flex justify-end mb-3">
  <div className="inline-flex border border-line">
    <button
      type="button"
      onClick={() => setTab('turn-flow')}
      className={`px-3 py-1 text-xs uppercase tracking-wider ${tab === 'turn-flow' ? 'bg-accent text-ink-0' : 'bg-ink-2 text-text-dim'}`}
    >
      Turn flow
    </button>
    <button
      type="button"
      onClick={() => setTab('full-sheet')}
      className={`px-3 py-1 text-xs uppercase tracking-wider ${tab === 'full-sheet' ? 'bg-accent text-ink-0' : 'bg-ink-2 text-text-dim'}`}
    >
      Full sheet
    </button>
  </div>
</div>
```

- [ ] **Step 3: Conditionally render `<FullSheetTab>` or `<TurnFlowTab>` based on `tab`**

`TurnFlowTab` is created in Task 29; for now render a placeholder when `tab === 'turn-flow'`:

```tsx
{tab === 'turn-flow' ? (
  <div className="text-text-mute text-sm">Turn flow — coming next task.</div>
) : (
  <FullSheetTab {...fullSheetProps} />
)}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/combat/detail/DetailPane.tsx
git commit -m "feat(web/combat): DetailPane Turn flow / Full sheet toggle (Turn flow stubbed)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 29: `TurnFlowSection` component

**Files:**
- Create: `apps/web/src/pages/combat/detail/TurnFlowSection.tsx`

- [ ] **Step 1: Create the section component**

```tsx
// apps/web/src/pages/combat/detail/TurnFlowSection.tsx
import { type ReactNode } from 'react';

export interface TurnFlowSectionProps {
  /** Display index — 1 / 2 / 3. */
  index: 1 | 2 | 3;
  /** Section label — "Main" / "Maneuver" / "Move". */
  label: string;
  /** Subtitle text shown next to the label (e.g. "6 squares" on Move). */
  subtitle?: string;
  /** Pending / active / done. */
  state: 'pending' | 'active' | 'done';
  /** Summary text shown when state === 'done' (e.g. "rolled Mind Spike" / "skipped"). */
  doneSummary?: string;
  /** Body content — typically inline AbilityCards. Hidden when state === 'done'. */
  children?: ReactNode;
  /** Skip / Done-moving button label. Hidden when state === 'done'. */
  skipLabel?: string;
  onSkip?: () => void;
  /** Optional gate — hide the Skip button when the viewer cannot dispatch (e.g. WS closed). */
  skipDisabled?: boolean;
}

export function TurnFlowSection({
  index,
  label,
  subtitle,
  state,
  doneSummary,
  children,
  skipLabel,
  onSkip,
  skipDisabled,
}: TurnFlowSectionProps) {
  const borderClass =
    state === 'active' ? 'border-l-accent' : state === 'done' ? 'border-l-line opacity-55' : 'border-l-line';
  return (
    <section className={`border-l-2 ${borderClass} pl-3 py-2`}>
      <header className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className={`inline-flex w-6 h-6 items-center justify-center text-xs border ${state === 'active' ? 'border-accent text-accent' : 'border-line text-text-dim'}`}>
            {index}
          </span>
          <span className="font-semibold">
            {state === 'done' ? <span className="text-text-mute">{`${label} — ${doneSummary ?? 'done'}`}</span> : label}
          </span>
          {subtitle && state !== 'done' && (
            <span className="text-xs text-text-mute font-mono">{subtitle}</span>
          )}
        </span>
        {state !== 'done' && skipLabel && onSkip && (
          <button
            type="button"
            onClick={onSkip}
            disabled={skipDisabled}
            className="text-xs px-2 py-0.5 border border-line text-text-dim hover:text-text disabled:opacity-40"
          >
            {skipLabel}
          </button>
        )}
      </header>
      {state !== 'done' && children && <div className="mt-2 space-y-2">{children}</div>}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/combat/detail/TurnFlowSection.tsx
git commit -m "feat(web/combat): TurnFlowSection primitive (pending / active / done states)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 30: `TurnFlowTab` component

**Files:**
- Create: `apps/web/src/pages/combat/detail/TurnFlowTab.tsx`
- Modify: `apps/web/src/pages/combat/detail/DetailPane.tsx`

- [ ] **Step 1: Create the tab**

```tsx
// apps/web/src/pages/combat/detail/TurnFlowTab.tsx
import type { Ability, MarkActionUsedPayload, Participant } from '@ironyard/shared';
import { AbilityCard } from '../AbilityCard';
import { TurnFlowSection } from './TurnFlowSection';

export interface TurnFlowTabProps {
  focused: Participant;
  abilities: Ability[];
  // dispatch helpers
  onMarkUsed: (payload: MarkActionUsedPayload) => void;
  onAbilityRoll: (ability: Ability, args: { rolls: [number, number]; source: 'manual' | 'auto' }) => void;
  canRoll: boolean;
  // For active-section heuristic + summaries — derived from intent log in the parent for now.
  lastUsedAbilityName: { main?: string; maneuver?: string };
}

export function TurnFlowTab({
  focused,
  abilities,
  onMarkUsed,
  onAbilityRoll,
  canRoll,
  lastUsedAbilityName,
}: TurnFlowTabProps) {
  const usage = focused.turnActionUsage;
  // Active section = lowest-index pending slot.
  const activeSlot: 'main' | 'maneuver' | 'move' = !usage.main
    ? 'main'
    : !usage.maneuver
      ? 'maneuver'
      : !usage.move
        ? 'move'
        : 'main';

  const mainAbilities = abilities.filter((a) => a.type === 'action');
  const maneuverAbilities = abilities.filter((a) => a.type === 'maneuver');

  const stateFor = (slot: 'main' | 'maneuver' | 'move'): 'pending' | 'active' | 'done' => {
    if (usage[slot]) return 'done';
    if (slot === activeSlot) return 'active';
    return 'pending';
  };

  const summaryFor = (slot: 'main' | 'maneuver'): string | undefined => {
    if (!usage[slot]) return undefined;
    return lastUsedAbilityName[slot] ? `rolled ${lastUsedAbilityName[slot]}` : 'skipped';
  };

  return (
    <div className="space-y-3">
      <TurnFlowSection
        index={1}
        label="Main"
        state={stateFor('main')}
        doneSummary={summaryFor('main')}
        skipLabel="Skip"
        skipDisabled={!canRoll}
        onSkip={() => onMarkUsed({ participantId: focused.id, slot: 'main', used: true })}
      >
        {mainAbilities.map((a) => (
          <AbilityCard
            key={a.name}
            ability={a}
            disabled={!canRoll}
            onRoll={(ab, args) => onAbilityRoll(ab, args)}
          />
        ))}
      </TurnFlowSection>

      <TurnFlowSection
        index={2}
        label="Maneuver"
        state={stateFor('maneuver')}
        doneSummary={summaryFor('maneuver')}
        skipLabel="Skip"
        skipDisabled={!canRoll}
        onSkip={() => onMarkUsed({ participantId: focused.id, slot: 'maneuver', used: true })}
      >
        {maneuverAbilities.map((a) => (
          <AbilityCard
            key={a.name}
            ability={a}
            disabled={!canRoll}
            onRoll={(ab, args) => onAbilityRoll(ab, args)}
          />
        ))}
      </TurnFlowSection>

      <TurnFlowSection
        index={3}
        label="Move"
        subtitle="6 squares"
        state={stateFor('move')}
        doneSummary={usage.move ? 'done moving' : undefined}
        skipLabel="Done moving"
        skipDisabled={!canRoll}
        onSkip={() => onMarkUsed({ participantId: focused.id, slot: 'move', used: true })}
      />
    </div>
  );
}
```

- [ ] **Step 2: Use in `DetailPane.tsx`**

Replace the Turn-flow placeholder from Task 28:

```tsx
{tab === 'turn-flow' ? (
  <TurnFlowTab
    focused={focused}
    abilities={abilitiesForFocused}
    onMarkUsed={(payload) => send(IntentTypes.MarkActionUsed, payload)}
    onAbilityRoll={(ability, args) => dispatchRoll({ ability, attacker: focused, target: ... , ...args, source: args.source })}
    canRoll={canEdit}
    lastUsedAbilityName={lastUsedAbilityName}
  />
) : (
  <FullSheetTab {...fullSheetProps} />
)}
```

`lastUsedAbilityName` is computed from the intent log — find the most-recent `RollPower` for this participant that auto-emitted a MarkActionUsed; pull the `abilityId` and resolve a friendly name. For Pass 2a the simple form is OK:

```ts
const lastUsedAbilityName = useMemo(() => {
  const result: { main?: string; maneuver?: string } = {};
  // Walk the most recent intents backwards to find roll-causers of the current
  // participant's slot consumption — simplest stub: just leave undefined and
  // let the section render "skipped" as fallback.
  return result;
}, [/* deps */]);
```

(A richer derivation can land as a Pass-2a PS follow-up.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/combat/detail/TurnFlowTab.tsx apps/web/src/pages/combat/detail/DetailPane.tsx
git commit -m "feat(web/combat): TurnFlowTab with Main/Maneuver/Move + Skip/Done-moving

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Phase J — Web client: role-asymmetric Malice + Victories edit

### Task 31: Make `MalicePill` editable-or-display

**Files:**
- Modify: `apps/web/src/pages/combat/combat-header/MalicePill.tsx`
- Modify: `apps/web/src/pages/combat/combat-header/InlineHeader.tsx`

- [ ] **Step 1: Add `editable` prop**

```ts
export interface MalicePillProps {
  malice: number;
  editable: boolean;   // false → display-only (no +/-).
  onGain?: () => void;
  onSpend?: () => void;
  disabled?: boolean;
}

export function MalicePill({ malice, editable, onGain, onSpend, disabled }: MalicePillProps) {
  return (
    <Pill dotClassName="bg-foe">
      {editable && (
        <button onClick={onSpend} disabled={disabled} /* … */>−</button>
      )}
      <span className="font-mono uppercase tracking-[0.08em] text-text-mute">
        Malice <b className="text-text font-sans">{malice}</b>
      </span>
      {editable && (
        <button onClick={onGain} disabled={disabled} /* … */>+</button>
      )}
    </Pill>
  );
}
```

- [ ] **Step 2: Thread `isActingAsDirector` into `InlineHeader`**

Add to `InlineHeaderProps`:

```ts
isActingAsDirector: boolean;
```

Pass `editable={isActingAsDirector}` to `MalicePill`. In `DirectorCombat.tsx`, pass `isActingAsDirector={viewerRole === 'director'}` to InlineHeader.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/combat/combat-header/MalicePill.tsx apps/web/src/pages/combat/combat-header/InlineHeader.tsx apps/web/src/pages/combat/DirectorCombat.tsx
git commit -m "feat(web/combat): MalicePill +/- visible only to active director

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 32: Wire `VictoriesPill` to dispatch `AdjustVictories`

**Files:**
- Modify: `apps/web/src/pages/combat/combat-header/InlineHeader.tsx`
- Modify: `apps/web/src/pages/combat/combat-header/VictoriesPill.tsx`
- Modify: `apps/web/src/pages/combat/DirectorCombat.tsx`

- [ ] **Step 1: Add `onVictoriesGain` / `onVictoriesSpend` to `InlineHeaderProps`**

```ts
onVictoriesGain: () => void;
onVictoriesSpend: () => void;
```

- [ ] **Step 2: Render `VictoriesPill` editable for director**

```tsx
<VictoriesPill
  victories={victories}
  editable={isActingAsDirector}
  disabled={wsClosed}
  onIncrement={onVictoriesGain}
  onDecrement={onVictoriesSpend}
/>
```

- [ ] **Step 3: Dispatch helpers in `DirectorCombat.tsx`**

```ts
const dispatchAdjustVictories = (delta: number) => {
  setParticipantSnapshotBefore(participants);
  send(IntentTypes.AdjustVictories, { delta });
};
// Pass:
//   onVictoriesGain={() => dispatchAdjustVictories(1)}
//   onVictoriesSpend={() => dispatchAdjustVictories(-1)}
```

- [ ] **Step 4: Eye-test**

Sign in as a director on an active encounter; press +/- on Victories; confirm:
- Toast shows the change.
- The number updates immediately (optimistic) and confirms after the WS round-trip.
- Reloading shows the new value persisted (after `EndEncounter` writeback path, not before).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/combat/combat-header/VictoriesPill.tsx apps/web/src/pages/combat/combat-header/InlineHeader.tsx apps/web/src/pages/combat/DirectorCombat.tsx
git commit -m "feat(web/combat): VictoriesPill +/- dispatches AdjustVictories (director only)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 33: Hide turn-control buttons for non-director

**Files:**
- Modify: `apps/web/src/pages/combat/combat-header/InlineHeader.tsx`

- [ ] **Step 1: Wrap `Start round`, `End turn`, `End round`, `End encounter`, `Undo` in `isActingAsDirector`**

In `InlineHeader.tsx`'s JSX, conditionally render each button:

```tsx
{isActingAsDirector && (
  <Button onClick={onUndo} disabled={!canUndo} size="sm" className="min-h-9">Undo</Button>
)}
{isActingAsDirector && hasEncounter && (
  <Button onClick={onEndEncounter} /* … */>End encounter</Button>
)}
{isActingAsDirector && hasEncounter && round !== null && !isAtTurnEnd && (
  <Button onClick={onEndTurn} /* … */>End turn</Button>
)}
{/* same for End round / Start round (round + 1) */}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/combat/combat-header/InlineHeader.tsx
git commit -m "feat(web/combat): hide turn-control buttons for non-director viewers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Phase K — Below-fold consolidation + deletions

### Task 34: Fold `PlayerSheetPanel` content into `FullSheetTab` (PC sections)

**Files:**
- Modify: `apps/web/src/pages/combat/detail/FullSheetTab.tsx`
- Modify: `apps/web/src/pages/combat/PlayerSheetPanel.tsx` (read-only — copy blocks out, then delete in Task 36)

- [ ] **Step 1: Copy PC-only blocks into `FullSheetTab`**

Open `PlayerSheetPanel.tsx`. Copy the JSX blocks that render:
- Heroic resource bars
- Surges
- Recoveries
- Inventory (the InventoryPanel sub-component reference)
- Hero tokens (if present)

Paste each into `FullSheetTab.tsx`, wrapping with a `focused.kind === 'pc'` gate so monsters render only the ability list.

- [ ] **Step 2: Pass the same dispatch helpers PlayerSheetPanel used**

`FullSheetTab` already accepts most of the dispatch helpers (gain/spend resource, set resource, spend surge, spend recovery). Add any missing ones (hero-token dispatchers if PlayerSheetPanel had them).

- [ ] **Step 3: Eye-test in dev**

Confirm that focusing your own PC in DetailPane → switching to Full sheet → renders the same content as today's below-fold PlayerSheetPanel — heroic resources, surges, recoveries, inventory, all of it.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/combat/detail/FullSheetTab.tsx
git commit -m "feat(web/combat): FullSheetTab absorbs PlayerSheetPanel's PC blocks

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 35: Remove `PlayerSheetPanel` from `DirectorCombat`'s below-fold

**Files:**
- Modify: `apps/web/src/pages/combat/DirectorCombat.tsx`

- [ ] **Step 1: Delete the `<PlayerSheetPanel>` line in the below-fold section**

Find around lines 538-540 in `DirectorCombat.tsx`:

```tsx
<div className="px-3.5 pb-3.5 space-y-3">
  <PlayerSheetPanel campaignId={campaignId} />
  <section className="border border-line bg-ink-1 p-3.5">
```

Remove the `<PlayerSheetPanel>` line. Keep the `<OpenActionsList>` section.

Also remove the corresponding import at the top of the file.

- [ ] **Step 2: Eye-test in dev**

Confirm:
- The below-fold area now shows only OpenActionsList.
- Focusing your own PC in DetailPane (Full sheet tab) renders the same blocks the old PlayerSheetPanel did.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/combat/DirectorCombat.tsx
git commit -m "feat(web/combat): remove PlayerSheetPanel from below-fold; lives in FullSheetTab now

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 36: Delete `PlayerSheetPanel.tsx`

**Files:**
- Delete: `apps/web/src/pages/combat/PlayerSheetPanel.tsx`

- [ ] **Step 1: Confirm no callers**

```bash
grep -rn "PlayerSheetPanel" apps/web/src/
```
Expected: no matches (or only inside the file itself).

- [ ] **Step 2: Delete + commit**

```bash
git rm apps/web/src/pages/combat/PlayerSheetPanel.tsx
git commit -m "chore(web/combat): remove PlayerSheetPanel.tsx (content moved to FullSheetTab)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 37: Delete dead `InitiativePanel.tsx`

**Files:**
- Delete: `apps/web/src/pages/combat/InitiativePanel.tsx`

- [ ] **Step 1: Confirm no callers**

```bash
grep -rn "InitiativePanel" apps/web/src/
```
Expected: no matches.

- [ ] **Step 2: Delete + commit**

```bash
git rm apps/web/src/pages/combat/InitiativePanel.tsx
git commit -m "chore(web/combat): remove dead InitiativePanel.tsx (Pass-1 replaced it with PartyRail+EncounterRail)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Phase L — Web client: intent describe + toast suppression

### Task 38: Describe `MarkActionUsed` + `AdjustVictories` in toasts

**Files:**
- Modify: `apps/web/src/lib/intentDescribe.ts`

- [ ] **Step 1: Add describe cases for both intents**

Find the switch / dispatcher inside `describeIntent` and add:

```ts
case IntentTypes.MarkActionUsed: {
  const payload = intent.payload as MarkActionUsedPayload;
  const p = participantsBefore.find((x) => x.id === payload.participantId);
  const name = p?.name ?? 'Someone';
  if (payload.slot === 'move') return `${name} finished moving`;
  // For Skip from a Skip button: no parent (causedBy null) and used: true.
  if (!intent.causedBy && payload.used) {
    return `${name} skipped their ${payload.slot}`;
  }
  // Auto-emitted from RollPower — suppress (parent toast already describes the action).
  return '';
}
case IntentTypes.AdjustVictories: {
  const payload = intent.payload as AdjustVictoriesPayload;
  const verb = payload.delta >= 0 ? 'awards' : 'deducts';
  const count = Math.abs(payload.delta);
  const word = count === 1 ? 'victory' : 'victories';
  return `Director ${verb} ${count} ${word}`;
}
```

- [ ] **Step 2: Suppress empty-string toasts in `DirectorCombat`**

In the toast-build loop in `DirectorCombat.tsx`:

```ts
const text = describeIntent({ intent: entry, participantsBefore: participantSnapshotBefore, parent });
if (!text) continue;   // suppress auto-emitted MarkActionUsed
additions.push({ ... });
```

- [ ] **Step 3: Test + commit**

```bash
git add apps/web/src/lib/intentDescribe.ts apps/web/src/pages/combat/DirectorCombat.tsx
git commit -m "feat(web/combat): describe MarkActionUsed + AdjustVictories in toasts; suppress derived MarkActionUsed

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Phase M — Verification

### Task 39: Full repo-wide checks

- [ ] **Step 1: Typecheck**

```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 2: Lint**

```bash
pnpm lint
```
Expected: clean.

- [ ] **Step 3: Test**

```bash
pnpm test
```
Expected: all green. If TopBar / DirectorCombat / DetailPane tests break because of changed prop shapes, update assertions (DO NOT lower coverage).

- [ ] **Step 4: Build**

```bash
pnpm --filter @ironyard/web build
pnpm --filter @ironyard/api build
```
Expected: builds succeed.

### Task 40: Screenshot eye-test

- [ ] **Step 1: Boot dev**

```bash
pnpm --filter @ironyard/web dev
```

- [ ] **Step 2: Eye-test the player-view path**

Sign in as a non-director member of a campaign with an active encounter. Walk:
- Rails show gated rows for everyone except own char.
- Right pane locked to own char, Turn flow default.
- Tap a foe row → accent ring on it, target banner on right pane.
- Auto-roll an action ability → Main section collapses; toast appears; OK button disabled until next interaction.
- Skip Maneuver → section collapses.
- Done moving → Move section collapses.
- Toggle to Full sheet → same body as the old PlayerSheetPanel.
- Malice readout visible, no +/- buttons.
- Victories readout visible, no +/- buttons.
- Turn-control buttons hidden.

- [ ] **Step 3: Eye-test the director-view path**

Sign in as the campaign owner / active director. Walk:
- Rails show full content for everyone.
- Tap any row → DetailPane focuses on them.
- Toggle Turn flow / Full sheet on a focused monster — confirm Turn flow renders Main/Maneuver from the monster's ability list.
- Malice +/- works.
- Victories +/- works; persists across encounter end (verify by EndEncounter + reopening the lobby).
- Mode-B TopBar chrome activates (campaign breadcrumb + Round / Victories / Malice readouts).

- [ ] **Step 4: Spot-check at iPad and iPhone portrait**

Open Chrome devtools, switch to iPad-portrait (810×1080) and iPhone-portrait (390×844). Confirm the layout holds for both director and player views on both surfaces.

- [ ] **Step 5: No commit needed for eye-test (it's just verification)**

## Self-Review Checklist

(For the implementer to confirm before declaring Pass 2a complete.)

- [ ] All 12 acceptance criteria from the spec are met (re-read the spec's Acceptance section).
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` all green.
- [ ] `git log` shows ~40 small, descriptive commits.
- [ ] No `// TODO` / `// FIXME` left in changed files.
- [ ] PlayerSheetPanel + InitiativePanel files removed.
- [ ] Two new reducer test suites (`mark-action-used.spec.ts`, `adjust-victories.spec.ts`) exist and pass.
- [ ] Screenshots taken at iPad-portrait and iPhone-portrait for both director and player views.
