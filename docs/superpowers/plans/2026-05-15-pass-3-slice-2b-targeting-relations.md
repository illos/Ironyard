# Pass 3 Slice 2b — Targeting Relations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close slice 2a PS#7's three permissive predicate stubs (`isJudgedBy`, `isMarkedBy`, `hasActiveNullField`) by introducing a player-managed `Participant.targetingRelations` tagged-map driven by per-row chip toggles, auto-set from `UseAbility` for the two PHB ability ids (`censor-judgment-t1`, `tactician-mark-t1`). Flips canon § 5.4 umbrella + § 5.4.1 / § 5.4.5 / § 5.4.7 from 🚧 → ✅.

**Architecture:** New `TargetingRelationsSchema` tagged-map on `ParticipantSchema` (three `string[]` arrays — `judged`, `marked`, `nullField`). One generic `SetTargetingRelation` intent (player-or-director trust). `UseAbility` reducer extended to emit derived `SetTargetingRelation` when ability matches the `ABILITY_TARGETING_EFFECTS` registry (both PHB entries are `mode: 'replace'` per canon). `EndEncounter` clears all three; `RemoveParticipant` strips the removed id from every source's arrays. Three per-class predicates collapse to one-line `.includes()` reads. UI: a persistent `TargetingRelationsCard` under the heroic-resource block on the source's sheet + per-row outbound chip (owner/director only) + read-only inbound chip (all viewers).

**Tech Stack:** TypeScript strict; Zod schemas as source of truth; Vitest; React + Vite; pnpm workspaces (`@ironyard/shared`, `@ironyard/rules`, `apps/web`).

**Spec:** [`docs/superpowers/specs/2026-05-15-pass-3-slice-2b-targeting-relations-design.md`](../specs/2026-05-15-pass-3-slice-2b-targeting-relations-design.md)

---

## File Structure Summary

**New files (8):**
- `packages/shared/src/targeting-relations.ts` — `TargetingRelationKindSchema`, `TargetingRelationsSchema`, `defaultTargetingRelations()`
- `packages/shared/src/intents/set-targeting-relation.ts` — payload schema
- `packages/rules/src/intents/set-targeting-relation.ts` — reducer
- `packages/rules/src/class-triggers/ability-targeting-effects.ts` — override registry
- `apps/web/src/components/TargetingRelationsCard.tsx` — persistent card UI
- `packages/shared/tests/targeting-relations.spec.ts`
- `packages/rules/tests/intents/set-targeting-relation.spec.ts`
- `packages/rules/tests/class-triggers/ability-targeting-effects.spec.ts`
- `packages/rules/tests/slice-2b-integration.spec.ts`
- `apps/web/src/components/TargetingRelationsCard.spec.tsx`

**Modified files (13):**
- `packages/shared/src/participant.ts` — add `targetingRelations` field
- `packages/shared/src/intents/use-ability.ts` — add optional `targetIds`
- `packages/shared/src/intents/index.ts` — export new payload + register `IntentTypes.SetTargetingRelation`
- `packages/shared/src/index.ts` — re-export targeting-relations module
- `packages/rules/src/intents/index.ts` — export `applySetTargetingRelation`
- `packages/rules/src/intents/use-ability.ts` — emit derived `SetTargetingRelation` on registry match
- `packages/rules/src/intents/end-encounter.ts` — clear relations for all participants
- `packages/rules/src/intents/remove-participant.ts` — strip removed id from every source's arrays
- `packages/rules/src/class-triggers/per-class/censor.ts` — replace `isJudgedBy` stub
- `packages/rules/src/class-triggers/per-class/tactician.ts` — replace `isMarkedBy` stub
- `packages/rules/src/class-triggers/per-class/null.ts` — rewrite Null Field path to auto-apply (drop the OA detour)
- `packages/rules/src/reducer.ts` — register `applySetTargetingRelation`
- `apps/web/src/ws/useSessionSocket.ts` — WS-mirror reflects `SetTargetingRelation` + `UseAbility` derived cascade
- `apps/web/src/components/ParticipantRow.tsx` — outbound chip (owner/director only) + inbound chip (all)
- `apps/web/src/components/PlayerSheetPanel.tsx` — render `<TargetingRelationsCard>` for class-aware PCs
- `docs/rules-canon.md` — flip § 5.4 + sub-sections from 🚧 → ✅; remove "auto-apply gated" footers
- `docs/superpowers/specs/2026-05-15-pass-3-slice-2a-class-delta-and-open-actions-design.md` — PS#7 follow-up note

---

## Task 1: Schema — `TargetingRelations` module

**Files:**
- Create: `packages/shared/src/targeting-relations.ts`
- Test: `packages/shared/tests/targeting-relations.spec.ts`

- [ ] **Step 1: Write the failing test**

`packages/shared/tests/targeting-relations.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  TargetingRelationKindSchema,
  TargetingRelationsSchema,
  defaultTargetingRelations,
} from '../src/targeting-relations';

describe('TargetingRelationKindSchema', () => {
  it('accepts the three known kinds', () => {
    expect(TargetingRelationKindSchema.parse('judged')).toBe('judged');
    expect(TargetingRelationKindSchema.parse('marked')).toBe('marked');
    expect(TargetingRelationKindSchema.parse('nullField')).toBe('nullField');
  });
  it('rejects unknown kinds', () => {
    expect(() => TargetingRelationKindSchema.parse('taunted')).toThrow();
    expect(() => TargetingRelationKindSchema.parse('')).toThrow();
  });
});

describe('TargetingRelationsSchema', () => {
  it('parses empty object via defaults', () => {
    const parsed = TargetingRelationsSchema.parse({});
    expect(parsed).toEqual({ judged: [], marked: [], nullField: [] });
  });
  it('round-trips populated arrays', () => {
    const input = { judged: ['p1', 'p2'], marked: ['p3'], nullField: ['p4', 'p5'] };
    expect(TargetingRelationsSchema.parse(input)).toEqual(input);
  });
  it('accepts duplicate ids at the schema layer (reducer enforces uniqueness)', () => {
    const input = { judged: ['p1', 'p1'], marked: [], nullField: [] };
    expect(TargetingRelationsSchema.parse(input).judged).toEqual(['p1', 'p1']);
  });
  it('rejects non-string entries', () => {
    expect(() =>
      TargetingRelationsSchema.parse({ judged: [123], marked: [], nullField: [] }),
    ).toThrow();
  });
  it('rejects empty-string ids', () => {
    expect(() =>
      TargetingRelationsSchema.parse({ judged: [''], marked: [], nullField: [] }),
    ).toThrow();
  });
});

describe('defaultTargetingRelations', () => {
  it('returns three empty arrays', () => {
    expect(defaultTargetingRelations()).toEqual({ judged: [], marked: [], nullField: [] });
  });
  it('returns fresh references each call', () => {
    const a = defaultTargetingRelations();
    const b = defaultTargetingRelations();
    expect(a).not.toBe(b);
    expect(a.judged).not.toBe(b.judged);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/shared test targeting-relations`
Expected: FAIL with module-not-found / import errors.

- [ ] **Step 3: Write minimal implementation**

`packages/shared/src/targeting-relations.ts`:

```ts
import { z } from 'zod';

// Pass 3 Slice 2b — player-managed targeting relations on a source
// participant. Mutated via SetTargetingRelation intent (per-row chip toggle)
// or auto-derived from UseAbility for the two PHB ability ids in
// ABILITY_TARGETING_EFFECTS (Judgment, Mark). Engine reads these in three
// class-trigger predicates (Censor isJudgedBy, Tactician isMarkedBy,
// Null hasActiveNullFieldOver).

export const TargetingRelationKindSchema = z.enum(['judged', 'marked', 'nullField']);
export type TargetingRelationKind = z.infer<typeof TargetingRelationKindSchema>;

export const TargetingRelationsSchema = z.object({
  judged: z.array(z.string().min(1)).default([]),
  marked: z.array(z.string().min(1)).default([]),
  nullField: z.array(z.string().min(1)).default([]),
});
export type TargetingRelations = z.infer<typeof TargetingRelationsSchema>;

export function defaultTargetingRelations(): TargetingRelations {
  return { judged: [], marked: [], nullField: [] };
}
```

- [ ] **Step 4: Add re-exports**

Modify `packages/shared/src/index.ts` — add near other module re-exports:

```ts
export {
  TargetingRelationKindSchema,
  TargetingRelationsSchema,
  defaultTargetingRelations,
} from './targeting-relations';
export type { TargetingRelationKind, TargetingRelations } from './targeting-relations';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ironyard/shared test targeting-relations`
Expected: PASS — 6 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/targeting-relations.ts packages/shared/src/index.ts packages/shared/tests/targeting-relations.spec.ts
git commit -m "feat(shared): TargetingRelationsSchema module (slice 2b)"
```

---

## Task 2: Extend `ParticipantSchema` with `targetingRelations` field

**Files:**
- Modify: `packages/shared/src/participant.ts:1-15` (imports) and `:155-159` (end of schema)
- Test: `packages/shared/tests/participant.spec.ts` (extend if exists; if not, add to `participant.spec.ts` — check first)

- [ ] **Step 1: Confirm test file location**

Run: `find packages/shared/tests -name "participant*.spec.ts" -o -name "*participant*spec*"`
Expected: a `participant.spec.ts` file path. If none, the test goes into the existing closest fixture file or a new `participant.spec.ts` is added.

- [ ] **Step 2: Write the failing test (append to existing participant test file)**

Add to the existing participant spec (or create one) at `packages/shared/tests/participant.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ParticipantSchema } from '../src/participant';

describe('ParticipantSchema — targetingRelations', () => {
  it('defaults targetingRelations to three empty arrays when omitted', () => {
    const base = {
      id: 'p1',
      name: 'Aldric',
      kind: 'pc' as const,
      currentStamina: 20,
      maxStamina: 20,
      characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    };
    const parsed = ParticipantSchema.parse(base);
    expect(parsed.targetingRelations).toEqual({ judged: [], marked: [], nullField: [] });
  });
  it('round-trips populated targetingRelations', () => {
    const base = {
      id: 'p1',
      name: 'Aldric',
      kind: 'pc' as const,
      currentStamina: 20,
      maxStamina: 20,
      characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
      targetingRelations: { judged: ['goblin-a'], marked: [], nullField: ['goblin-b'] },
    };
    const parsed = ParticipantSchema.parse(base);
    expect(parsed.targetingRelations.judged).toEqual(['goblin-a']);
    expect(parsed.targetingRelations.nullField).toEqual(['goblin-b']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @ironyard/shared test participant`
Expected: FAIL — `targetingRelations` field doesn't exist on `ParticipantSchema`.

- [ ] **Step 4: Implement schema extension**

Modify `packages/shared/src/participant.ts`. Add import at top (near other module imports, around line 10):

```ts
import { TargetingRelationsSchema, defaultTargetingRelations } from './targeting-relations';
```

Add the field at the end of `ParticipantSchema` object literal, just before the closing `});` (after `maintainedAbilities`):

```ts
  // Pass 3 Slice 2b — player-managed source-to-target relations consumed by
  // the Censor / Tactician / Null class-δ predicates. Each array is a set of
  // participant ids the source has the relation with. Mutated via the
  // SetTargetingRelation intent or auto-derived from UseAbility for the two
  // PHB ability ids in ABILITY_TARGETING_EFFECTS (Judgment, Mark). Cleared
  // for every participant at EndEncounter; stripped per-source when a
  // referenced target is removed via RemoveParticipant. Defaults to three
  // empty arrays so pre-slice-2b snapshots load without migration.
  targetingRelations: TargetingRelationsSchema.default(defaultTargetingRelations()),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ironyard/shared test participant`
Expected: PASS — both new tests, plus existing participant tests still green.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/participant.ts packages/shared/tests/participant.spec.ts
git commit -m "feat(shared): add Participant.targetingRelations field (slice 2b)"
```

---

## Task 3: Intent payload — `SetTargetingRelationPayloadSchema`

**Files:**
- Create: `packages/shared/src/intents/set-targeting-relation.ts`
- Modify: `packages/shared/src/intents/index.ts` (re-export + register IntentTypes entry)

- [ ] **Step 1: Write the failing test**

`packages/shared/tests/intents/set-targeting-relation.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SetTargetingRelationPayloadSchema } from '../../src/intents/set-targeting-relation';

describe('SetTargetingRelationPayloadSchema', () => {
  it('accepts a valid add payload', () => {
    const p = SetTargetingRelationPayloadSchema.parse({
      sourceId: 'censor-1',
      relationKind: 'judged',
      targetId: 'goblin-a',
      present: true,
    });
    expect(p.relationKind).toBe('judged');
    expect(p.present).toBe(true);
  });
  it('accepts a valid remove payload', () => {
    const p = SetTargetingRelationPayloadSchema.parse({
      sourceId: 'censor-1',
      relationKind: 'marked',
      targetId: 'goblin-a',
      present: false,
    });
    expect(p.present).toBe(false);
  });
  it('rejects unknown relationKind', () => {
    expect(() =>
      SetTargetingRelationPayloadSchema.parse({
        sourceId: 'p1',
        relationKind: 'taunted',
        targetId: 'p2',
        present: true,
      }),
    ).toThrow();
  });
  it('rejects empty sourceId', () => {
    expect(() =>
      SetTargetingRelationPayloadSchema.parse({
        sourceId: '',
        relationKind: 'judged',
        targetId: 'p2',
        present: true,
      }),
    ).toThrow();
  });
  it('rejects missing present', () => {
    expect(() =>
      SetTargetingRelationPayloadSchema.parse({
        sourceId: 'p1',
        relationKind: 'judged',
        targetId: 'p2',
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/shared test set-targeting-relation`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the payload schema**

`packages/shared/src/intents/set-targeting-relation.ts`:

```ts
import { z } from 'zod';
import { TargetingRelationKindSchema } from '../targeting-relations';

// Pass 3 Slice 2b — mutate a source participant's targetingRelations[kind]
// list. `present: true` adds targetId if absent (idempotent); `present:
// false` removes if present (idempotent). Trust: actor.userId ===
// source.ownerId OR active director. The reducer enforces uniqueness in
// the array (schema accepts duplicates per the slice-2a maintainedAbilities
// precedent).
//
// This intent is NOT in SERVER_ONLY_INTENTS — players manage their own
// relations directly. Director can edit anyone's via the active-director
// permission.
export const SetTargetingRelationPayloadSchema = z
  .object({
    sourceId: z.string().min(1),
    relationKind: TargetingRelationKindSchema,
    targetId: z.string().min(1),
    present: z.boolean(),
  })
  .strict();
export type SetTargetingRelationPayload = z.infer<typeof SetTargetingRelationPayloadSchema>;
```

- [ ] **Step 4: Register exports in intent registry**

Modify `packages/shared/src/intents/index.ts`. Add the re-export near other payload exports (alphabetical-ish — after `SetResource` exports):

```ts
export { SetTargetingRelationPayloadSchema } from './set-targeting-relation';
export type { SetTargetingRelationPayload } from './set-targeting-relation';
```

Add the registry entry to the `IntentTypes` const (alphabetical, after `SetResource`):

```ts
  SetResource: 'SetResource',
  SetStamina: 'SetStamina',
  SetTargetingRelation: 'SetTargetingRelation',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ironyard/shared test set-targeting-relation`
Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/intents/set-targeting-relation.ts packages/shared/src/intents/index.ts packages/shared/tests/intents/set-targeting-relation.spec.ts
git commit -m "feat(shared): SetTargetingRelation intent payload (slice 2b)"
```

---

## Task 4: Reducer — `applySetTargetingRelation`

**Files:**
- Create: `packages/rules/src/intents/set-targeting-relation.ts`
- Modify: `packages/rules/src/intents/index.ts` (re-export)
- Modify: `packages/rules/src/reducer.ts:~119` (register dispatch case)
- Test: `packages/rules/tests/intents/set-targeting-relation.spec.ts`

- [ ] **Step 1: Write the failing test**

`packages/rules/tests/intents/set-targeting-relation.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { IntentTypes } from '@ironyard/shared';
import { applySetTargetingRelation } from '../../src/intents/set-targeting-relation';
import type { CampaignState, StampedIntent } from '../../src/types';

function fixtureState(overrides?: Partial<CampaignState>): CampaignState {
  return {
    campaignId: 'c1',
    seq: 0,
    sessionId: null,
    activeDirectorId: 'dir-1',
    participants: [
      {
        id: 'censor-1',
        name: 'Aldric',
        kind: 'pc',
        ownerId: 'user-aldric',
        characterId: 'char-aldric',
        level: 1,
        currentStamina: 20,
        maxStamina: 20,
        characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
        immunities: [],
        weaknesses: [],
        conditions: [],
        heroicResources: [],
        extras: [],
        surges: 0,
        recoveries: { current: 0, max: 0 },
        recoveryValue: 0,
        weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
        activeAbilities: [],
        victories: 0,
        turnActionUsage: { main: false, maneuver: false, move: false },
        surprised: false,
        role: null,
        ancestry: [],
        size: null,
        speed: null,
        stability: null,
        freeStrike: null,
        ev: null,
        withCaptain: null,
        className: 'censor',
        purchasedTraits: [],
        equippedTitleIds: [],
        staminaState: 'healthy',
        staminaOverride: null,
        bodyIntact: true,
        triggeredActionUsedThisRound: false,
        perEncounterFlags: { perTurn: { entries: [], heroesActedThisTurn: [] }, perRound: {}, perEncounter: {} } as any,
        posthumousDramaEligible: false,
        psionFlags: { clarityDamageOptOutThisTurn: false },
        maintainedAbilities: [],
        targetingRelations: { judged: [], marked: [], nullField: [] },
      },
      {
        id: 'goblin-a',
        name: 'Goblin A',
        kind: 'monster',
        ownerId: null,
        characterId: null,
        level: 1,
        currentStamina: 10,
        maxStamina: 10,
        characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
        immunities: [],
        weaknesses: [],
        conditions: [],
        heroicResources: [],
        extras: [],
        surges: 0,
        recoveries: { current: 0, max: 0 },
        recoveryValue: 0,
        weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
        activeAbilities: [],
        victories: 0,
        turnActionUsage: { main: false, maneuver: false, move: false },
        surprised: false,
        role: null,
        ancestry: [],
        size: null,
        speed: null,
        stability: null,
        freeStrike: null,
        ev: null,
        withCaptain: null,
        className: null,
        purchasedTraits: [],
        equippedTitleIds: [],
        staminaState: 'healthy',
        staminaOverride: null,
        bodyIntact: true,
        triggeredActionUsedThisRound: false,
        perEncounterFlags: { perTurn: { entries: [], heroesActedThisTurn: [] }, perRound: {}, perEncounter: {} } as any,
        posthumousDramaEligible: false,
        psionFlags: { clarityDamageOptOutThisTurn: false },
        maintainedAbilities: [],
        targetingRelations: { judged: [], marked: [], nullField: [] },
      },
    ],
    encounter: null,
    openActions: [],
    party: { victories: 0, heroTokens: 0 },
    log: [],
    ...overrides,
  } as unknown as CampaignState;
}

function intent(payload: any, actor = { userId: 'user-aldric', role: 'player' as const }): StampedIntent {
  return {
    id: 'i-1',
    campaignId: 'c1',
    actor,
    source: 'manual',
    type: IntentTypes.SetTargetingRelation,
    payload,
    timestamp: 0,
  };
}

describe('applySetTargetingRelation', () => {
  it('adds a target id when present=true', () => {
    const state = fixtureState();
    const res = applySetTargetingRelation(
      state,
      intent({ sourceId: 'censor-1', relationKind: 'judged', targetId: 'goblin-a', present: true }),
    );
    const updated = res.state.participants.find((p: any) => p.id === 'censor-1') as any;
    expect(updated.targetingRelations.judged).toEqual(['goblin-a']);
  });
  it('is idempotent on add when target already present', () => {
    const state = fixtureState();
    state.participants[0].targetingRelations.judged = ['goblin-a'];
    const res = applySetTargetingRelation(
      state,
      intent({ sourceId: 'censor-1', relationKind: 'judged', targetId: 'goblin-a', present: true }),
    );
    const updated = res.state.participants.find((p: any) => p.id === 'censor-1') as any;
    expect(updated.targetingRelations.judged).toEqual(['goblin-a']);
  });
  it('removes a target id when present=false', () => {
    const state = fixtureState();
    state.participants[0].targetingRelations.marked = ['goblin-a'];
    const res = applySetTargetingRelation(
      state,
      intent({ sourceId: 'censor-1', relationKind: 'marked', targetId: 'goblin-a', present: false }),
    );
    const updated = res.state.participants.find((p: any) => p.id === 'censor-1') as any;
    expect(updated.targetingRelations.marked).toEqual([]);
  });
  it('is idempotent on remove when target absent', () => {
    const state = fixtureState();
    const res = applySetTargetingRelation(
      state,
      intent({ sourceId: 'censor-1', relationKind: 'judged', targetId: 'goblin-a', present: false }),
    );
    expect(res.errors).toBeUndefined();
    const updated = res.state.participants.find((p: any) => p.id === 'censor-1') as any;
    expect(updated.targetingRelations.judged).toEqual([]);
  });
  it('rejects self-targeting', () => {
    const state = fixtureState();
    const res = applySetTargetingRelation(
      state,
      intent({ sourceId: 'censor-1', relationKind: 'judged', targetId: 'censor-1', present: true }),
    );
    expect(res.errors).toBeDefined();
    expect(res.errors?.[0].code).toBe('self_targeting');
  });
  it('rejects unknown sourceId', () => {
    const state = fixtureState();
    const res = applySetTargetingRelation(
      state,
      intent({ sourceId: 'no-such', relationKind: 'judged', targetId: 'goblin-a', present: true }),
    );
    expect(res.errors).toBeDefined();
    expect(res.errors?.[0].code).toBe('source_missing');
  });
  it('rejects unknown targetId', () => {
    const state = fixtureState();
    const res = applySetTargetingRelation(
      state,
      intent({ sourceId: 'censor-1', relationKind: 'judged', targetId: 'no-such', present: true }),
    );
    expect(res.errors).toBeDefined();
    expect(res.errors?.[0].code).toBe('target_missing');
  });
  it('rejects non-owner non-director player', () => {
    const state = fixtureState();
    const res = applySetTargetingRelation(
      state,
      intent(
        { sourceId: 'censor-1', relationKind: 'judged', targetId: 'goblin-a', present: true },
        { userId: 'someone-else', role: 'player' },
      ),
    );
    expect(res.errors).toBeDefined();
    expect(res.errors?.[0].code).toBe('not_authorized');
  });
  it('accepts active director', () => {
    const state = fixtureState();
    const res = applySetTargetingRelation(
      state,
      intent(
        { sourceId: 'censor-1', relationKind: 'nullField', targetId: 'goblin-a', present: true },
        { userId: 'dir-1', role: 'director' },
      ),
    );
    expect(res.errors).toBeUndefined();
    const updated = res.state.participants.find((p: any) => p.id === 'censor-1') as any;
    expect(updated.targetingRelations.nullField).toEqual(['goblin-a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/rules test set-targeting-relation`
Expected: FAIL — `applySetTargetingRelation` not exported.

- [ ] **Step 3: Implement the reducer**

`packages/rules/src/intents/set-targeting-relation.ts`:

```ts
import { SetTargetingRelationPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

// Pass 3 Slice 2b — set or unset a participant id in a source's
// targetingRelations[kind] list. Idempotent on both add and remove. Rejects
// self-target, missing source or target, and unauthorized actor.
//
// Trust: actor.userId === source.ownerId OR actor is the active director.
// Not server-only — players manage their own relations directly.
export function applySetTargetingRelation(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = SetTargetingRelationPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetTargetingRelation rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { sourceId, relationKind, targetId, present } = parsed.data;

  if (sourceId === targetId) {
    return {
      state,
      derived: [],
      log: [
        { kind: 'error', text: 'SetTargetingRelation rejected: self-targeting', intentId: intent.id },
      ],
      errors: [{ code: 'self_targeting', message: 'source and target must differ' }],
    };
  }

  const source = state.participants.filter(isParticipant).find((p) => p.id === sourceId);
  if (!source) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetTargetingRelation rejected: source ${sourceId} not found`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'source_missing', message: `${sourceId} not in roster` }],
    };
  }

  const target = state.participants.filter(isParticipant).find((p) => p.id === targetId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetTargetingRelation rejected: target ${targetId} not found`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'target_missing', message: `${targetId} not in roster` }],
    };
  }

  // Trust: source owner OR active director. (Active director check uses
  // state.activeDirectorId — same pattern as RemoveParticipant.)
  const isOwner = intent.actor.userId === source.ownerId;
  const isActiveDirector = intent.actor.userId === state.activeDirectorId;
  if (!isOwner && !isActiveDirector) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'SetTargetingRelation rejected: not source owner or active director',
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'not_authorized', message: 'must be source owner or active director' }],
    };
  }

  // Apply the add/remove. Idempotent: adding when present is a no-op; removing
  // when absent is a no-op.
  const currentArray = source.targetingRelations[relationKind];
  const alreadyPresent = currentArray.includes(targetId);
  let newArray = currentArray;
  if (present && !alreadyPresent) {
    newArray = [...currentArray, targetId];
  } else if (!present && alreadyPresent) {
    newArray = currentArray.filter((id) => id !== targetId);
  }
  if (newArray === currentArray) {
    // Idempotent no-op. Still bump seq so the intent appears in the log.
    return {
      state: { ...state, seq: state.seq + 1 },
      derived: [],
      log: [
        {
          kind: 'info',
          text: `${source.name}.${relationKind} ${present ? 'add' : 'remove'} ${targetId} (idempotent)`,
          intentId: intent.id,
        },
      ],
    };
  }

  const updatedSource = {
    ...source,
    targetingRelations: {
      ...source.targetingRelations,
      [relationKind]: newArray,
    },
  };

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: state.participants.map((p) =>
        isParticipant(p) && p.id === sourceId ? updatedSource : p,
      ),
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `${source.name}.${relationKind} ${present ? '+' : '-'} ${target.name}`,
        intentId: intent.id,
      },
    ],
  };
}
```

- [ ] **Step 4: Register the reducer**

Modify `packages/rules/src/intents/index.ts` — add the re-export near other intent exports (alphabetical, after `applySetStamina`):

```ts
export { applySetTargetingRelation } from './set-targeting-relation';
```

Modify `packages/rules/src/reducer.ts` — add the dispatch case (look for `case IntentTypes.SetStamina:` and add immediately after):

```ts
    case IntentTypes.SetTargetingRelation:
      return applySetTargetingRelation(state, intent);
```

Add the import at the top of `reducer.ts` (next to other `applySet*` imports):

```ts
  applySetTargetingRelation,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ironyard/rules test set-targeting-relation`
Expected: PASS — 9 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/intents/set-targeting-relation.ts packages/rules/src/intents/index.ts packages/rules/src/reducer.ts packages/rules/tests/intents/set-targeting-relation.spec.ts
git commit -m "feat(rules): applySetTargetingRelation reducer (slice 2b)"
```

---

## Task 5: `EndEncounter` clears `targetingRelations`

**Files:**
- Modify: `packages/rules/src/intents/end-encounter.ts` (the `slice2aParticipants` walk)
- Test: `packages/rules/tests/intents/end-encounter.spec.ts` (extension)

- [ ] **Step 1: Write the failing test**

Append to existing `packages/rules/tests/intents/end-encounter.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
// (existing imports — keep)
import { applyEndEncounter } from '../../src/intents/end-encounter';
import { IntentTypes } from '@ironyard/shared';

describe('applyEndEncounter — targetingRelations', () => {
  it('clears targetingRelations on every participant', () => {
    // Use the same fixture pattern as the existing end-encounter tests.
    // Pre-populate two participants with non-empty relations.
    const state = makeStateWithEncounter({
      participants: [
        makePc({
          id: 'censor-1',
          targetingRelations: { judged: ['goblin-a', 'goblin-b'], marked: [], nullField: [] },
        }),
        makePc({
          id: 'tactician-1',
          targetingRelations: { judged: [], marked: ['goblin-c'], nullField: [] },
        }),
        makePc({
          id: 'null-1',
          targetingRelations: { judged: [], marked: [], nullField: ['goblin-a', 'goblin-c'] },
        }),
      ],
    });
    const res = applyEndEncounter(state, {
      id: 'i-1',
      campaignId: 'c1',
      actor: { userId: 'dir-1', role: 'director' },
      source: 'manual',
      type: IntentTypes.EndEncounter,
      payload: { encounterId: state.encounter!.id },
      timestamp: 0,
    });
    for (const p of res.state.participants) {
      expect((p as any).targetingRelations).toEqual({ judged: [], marked: [], nullField: [] });
    }
  });
});
```

Replace the `makeStateWithEncounter` and `makePc` helper references with whatever the existing test file uses. If they don't exist, lift the fixture pattern from the existing `end-encounter.spec.ts` body (extract local helpers or use the existing inline approach).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/rules test end-encounter`
Expected: FAIL — the new test expects empty arrays, but the reducer doesn't reset `targetingRelations`.

- [ ] **Step 3: Extend the reducer**

Modify `packages/rules/src/intents/end-encounter.ts`. In the `slice2aParticipants` walk (around line 174), add a `targetingRelations` reset to the returned participant object. Also import the helper:

Add to the import block at the top:

```ts
import {
  // ...existing...
  defaultTargetingRelations,
} from '@ironyard/shared';
```

In the `slice2aParticipants` walk, extend the returned shape (the existing block already returns a new participant object):

```ts
  const slice2aParticipants: RosterEntry[] = finalParticipants.map((entry) => {
    if (!isParticipant(entry)) return entry;
    if (entry.kind !== 'pc') {
      // Pass 3 Slice 2b — monsters also get cleared. Monsters never *source*
      // a relation today (no class-trigger reads from a monster's
      // targetingRelations), but they can be referenced *as targets* by PCs;
      // EndEncounter clearing the sources elsewhere makes the monster-side
      // cleanup moot. We still reset for shape-consistency / future-proofing.
      return { ...entry, targetingRelations: defaultTargetingRelations() };
    }
    return {
      ...entry,
      perEncounterFlags: {
        ...entry.perEncounterFlags,
        perEncounter: defaultPerEncounterLatches(),
      },
      posthumousDramaEligible:
        entry.staminaState === 'dead' ? false : entry.posthumousDramaEligible,
      maintainedAbilities: [],
      targetingRelations: defaultTargetingRelations(),
    };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ironyard/rules test end-encounter`
Expected: PASS — new test green; existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/intents/end-encounter.ts packages/rules/tests/intents/end-encounter.spec.ts
git commit -m "feat(rules): EndEncounter clears targetingRelations (slice 2b)"
```

---

## Task 6: `RemoveParticipant` strips removed id from every source

**Files:**
- Modify: `packages/rules/src/intents/remove-participant.ts`
- Test: `packages/rules/tests/intents/remove-participant.spec.ts` (extension; create if doesn't exist)

- [ ] **Step 1: Check whether the test file exists**

Run: `ls packages/rules/tests/intents/remove-participant*`
If exists, extend it. If not, create with the test below.

- [ ] **Step 2: Write the failing test**

Append to (or create) `packages/rules/tests/intents/remove-participant.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { IntentTypes } from '@ironyard/shared';
import { applyRemoveParticipant } from '../../src/intents/remove-participant';

describe('applyRemoveParticipant — targetingRelations cleanup', () => {
  it('strips removed id from every other participant targetingRelations arrays', () => {
    // Two PCs both reference goblin-a; one references goblin-b; goblin-a is removed.
    const state = {
      campaignId: 'c1',
      seq: 0,
      sessionId: null,
      activeDirectorId: 'dir-1',
      participants: [
        makeParticipant({
          id: 'censor-1',
          ownerId: 'u-aldric',
          targetingRelations: { judged: ['goblin-a', 'goblin-b'], marked: [], nullField: [] },
        }),
        makeParticipant({
          id: 'tactician-1',
          ownerId: 'u-korva',
          targetingRelations: { judged: [], marked: ['goblin-a'], nullField: [] },
        }),
        makeParticipant({
          id: 'null-1',
          ownerId: 'u-vex',
          targetingRelations: { judged: [], marked: [], nullField: ['goblin-a', 'goblin-c'] },
        }),
        makeMonster({ id: 'goblin-a' }),
        makeMonster({ id: 'goblin-b' }),
        makeMonster({ id: 'goblin-c' }),
      ],
      encounter: {
        id: 'enc-1',
        currentRound: 1,
        activeParticipantId: 'censor-1',
        perEncounterFlags: { perTurn: { entries: [], heroesActedThisTurn: [] }, perRound: {}, perEncounter: {} },
      } as any,
      openActions: [],
      party: { victories: 0, heroTokens: 0 },
      log: [],
    } as any;

    const res = applyRemoveParticipant(state, {
      id: 'i-1',
      campaignId: 'c1',
      actor: { userId: 'dir-1', role: 'director' },
      source: 'manual',
      type: IntentTypes.RemoveParticipant,
      payload: { participantId: 'goblin-a' },
      timestamp: 0,
    });

    const censor = res.state.participants.find((p: any) => p.id === 'censor-1') as any;
    const tactician = res.state.participants.find((p: any) => p.id === 'tactician-1') as any;
    const nullPc = res.state.participants.find((p: any) => p.id === 'null-1') as any;
    expect(censor.targetingRelations.judged).toEqual(['goblin-b']);
    expect(tactician.targetingRelations.marked).toEqual([]);
    expect(nullPc.targetingRelations.nullField).toEqual(['goblin-c']);
    // goblin-a is gone from the roster entirely
    expect(res.state.participants.find((p: any) => p.id === 'goblin-a')).toBeUndefined();
  });
});
```

If `makeParticipant` / `makeMonster` helpers don't exist, write inline minimal participants (copy the fixture from the slice-2b reducer test in Task 4).

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @ironyard/rules test remove-participant`
Expected: FAIL — the reducer doesn't strip ids from other participants' relation arrays today.

- [ ] **Step 4: Extend the reducer**

Modify `packages/rules/src/intents/remove-participant.ts`. After the existing `newParticipants` filter line:

```ts
  const survivors = state.participants.filter(
    (p) => !isParticipant(p) || p.id !== participantId,
  );
  // Pass 3 Slice 2b — strip the removed id from every other participant's
  // targetingRelations arrays so dangling references can't outlive the
  // referenced target.
  const newParticipants = survivors.map((entry) => {
    if (!isParticipant(entry)) return entry;
    const r = entry.targetingRelations;
    if (
      !r.judged.includes(participantId) &&
      !r.marked.includes(participantId) &&
      !r.nullField.includes(participantId)
    ) {
      return entry;
    }
    return {
      ...entry,
      targetingRelations: {
        judged: r.judged.filter((id) => id !== participantId),
        marked: r.marked.filter((id) => id !== participantId),
        nullField: r.nullField.filter((id) => id !== participantId),
      },
    };
  });
```

Replace the original `newParticipants` declaration with the two-step `survivors` → `newParticipants` flow above.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ironyard/rules test remove-participant`
Expected: PASS — new test green; existing tests still green.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/intents/remove-participant.ts packages/rules/tests/intents/remove-participant.spec.ts
git commit -m "feat(rules): RemoveParticipant strips targetingRelations refs (slice 2b)"
```

---

## Task 7: Ability-targeting registry

**Files:**
- Create: `packages/rules/src/class-triggers/ability-targeting-effects.ts`
- Test: `packages/rules/tests/class-triggers/ability-targeting-effects.spec.ts`

- [ ] **Step 1: Write the failing test**

`packages/rules/tests/class-triggers/ability-targeting-effects.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ABILITY_TARGETING_EFFECTS } from '../../src/class-triggers/ability-targeting-effects';

describe('ABILITY_TARGETING_EFFECTS', () => {
  it('contains entries for the two PHB ability ids', () => {
    expect(ABILITY_TARGETING_EFFECTS['censor-judgment-t1']).toEqual({
      relationKind: 'judged',
      mode: 'replace',
    });
    expect(ABILITY_TARGETING_EFFECTS['tactician-mark-t1']).toEqual({
      relationKind: 'marked',
      mode: 'replace',
    });
  });

  it('keys correspond to actual ability ids in the data pipeline (fail loudly on rename)', () => {
    // Loaded from the ingested ability dataset; fails immediately if a
    // pipeline rename strips either id.
    const abilitiesPath = resolve(__dirname, '../../../../apps/web/public/data/abilities.json');
    const abilities = JSON.parse(readFileSync(abilitiesPath, 'utf8'));
    const ids = new Set<string>();
    for (const cls of abilities) {
      for (const a of cls.abilities ?? []) ids.add(a.id);
    }
    for (const key of Object.keys(ABILITY_TARGETING_EFFECTS)) {
      expect(ids.has(key), `ABILITY_TARGETING_EFFECTS key '${key}' not in abilities.json`).toBe(
        true,
      );
    }
  });
});
```

If the abilities.json shape differs from `{ abilities: [...] }` per class, adjust the iteration. Inspect with `head -100 apps/web/public/data/abilities.json` if the test fails for the wrong reason.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/rules test ability-targeting-effects`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the registry**

`packages/rules/src/class-triggers/ability-targeting-effects.ts`:

```ts
import type { TargetingRelationKind } from '@ironyard/shared';

// Pass 3 Slice 2b — auto-set registry for UseAbility → SetTargetingRelation
// derivation. When UseAbility resolves an ability whose id is in this map
// and targetIds is non-empty, the reducer emits a derived
// SetTargetingRelation per target. mode: 'replace' first clears the existing
// relation array (one SetTargetingRelation with present:false per existing
// entry), then adds the new target(s).
//
// Canon-verified against apps/web/public/data/abilities.json:
//   - 'censor-judgment-t1' raw: "The target is judged by you until the end
//     of the encounter, you use this ability again, you willingly end this
//     effect (no action required), or another censor judges the target."
//     → cap-1, replaces on re-cast.
//   - 'tactician-mark-t1' raw: "The target is marked by you until the end
//     of the encounter, until you are dying, or until you use this ability
//     again... You can initially mark only one creature using this ability."
//     → cap-1, replaces on re-cast. (Tactician class features at higher
//     levels mark additional creatures simultaneously; those land with the
//     Q18 / 2b.7 class-feature pipeline and would add additional registry
//     entries with mode: 'add'.)
export type AbilityTargetingEffect = {
  relationKind: TargetingRelationKind;
  mode: 'replace' | 'add';
};

export const ABILITY_TARGETING_EFFECTS: Record<string, AbilityTargetingEffect> = {
  'censor-judgment-t1': { relationKind: 'judged', mode: 'replace' },
  'tactician-mark-t1': { relationKind: 'marked', mode: 'replace' },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ironyard/rules test ability-targeting-effects`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/class-triggers/ability-targeting-effects.ts packages/rules/tests/class-triggers/ability-targeting-effects.spec.ts
git commit -m "feat(rules): ABILITY_TARGETING_EFFECTS registry (slice 2b)"
```

---

## Task 8: `UseAbility` emits derived `SetTargetingRelation`

**Files:**
- Modify: `packages/shared/src/intents/use-ability.ts` (add optional `targetIds`)
- Modify: `packages/rules/src/intents/use-ability.ts` (registry-matched derived emission)
- Test: `packages/rules/tests/intents/use-ability.spec.ts` (extension)

- [ ] **Step 1: Extend the payload schema first**

Modify `packages/shared/src/intents/use-ability.ts`. Add the optional field at the bottom of the `UseAbilityPayloadSchema` object (after `abilityKind`):

```ts
  // Pass 3 Slice 2b — primary targets of the ability. Optional because most
  // UseAbility dispatches are for narrative-only buffs that don't target.
  // Required by the reducer's ABILITY_TARGETING_EFFECTS path: when set and
  // non-empty for a registered ability id, derives SetTargetingRelation per
  // target. Matches the repo convention from roll-power.ts (targetIds).
  targetIds: z.array(z.string().min(1)).optional(),
```

- [ ] **Step 2: Write the failing test**

Append to existing `packages/rules/tests/intents/use-ability.spec.ts` (or create if missing):

```ts
import { describe, it, expect } from 'vitest';
import { IntentTypes } from '@ironyard/shared';
import { applyUseAbility } from '../../src/intents/use-ability';

describe('applyUseAbility — ABILITY_TARGETING_EFFECTS derivation', () => {
  it('emits derived SetTargetingRelation { present:true } for Judgment with empty existing relation', () => {
    const state = makeStateWithCensor({
      participants: [makeCensor({ id: 'censor-1' }), makeMonster({ id: 'goblin-a' })],
      encounterCurrentRound: 1,
    });
    const res = applyUseAbility(state, {
      id: 'i-1',
      campaignId: 'c1',
      actor: { userId: 'u-aldric', role: 'player' },
      source: 'manual',
      type: IntentTypes.UseAbility,
      payload: {
        participantId: 'censor-1',
        abilityId: 'censor-judgment-t1',
        source: { kind: 'class-feature' },
        duration: { kind: 'end_of_encounter' },
        targetIds: ['goblin-a'],
      },
      timestamp: 0,
    });
    const setRel = res.derived.filter((d) => d.type === IntentTypes.SetTargetingRelation);
    expect(setRel).toHaveLength(1);
    expect(setRel[0].payload).toEqual({
      sourceId: 'censor-1',
      relationKind: 'judged',
      targetId: 'goblin-a',
      present: true,
    });
  });

  it('first emits present:false for existing entries, then present:true for new target (replace mode)', () => {
    const state = makeStateWithCensor({
      participants: [
        makeCensor({ id: 'censor-1', judged: ['goblin-a', 'goblin-c'] }),
        makeMonster({ id: 'goblin-a' }),
        makeMonster({ id: 'goblin-b' }),
        makeMonster({ id: 'goblin-c' }),
      ],
      encounterCurrentRound: 1,
    });
    const res = applyUseAbility(state, {
      id: 'i-1',
      campaignId: 'c1',
      actor: { userId: 'u-aldric', role: 'player' },
      source: 'manual',
      type: IntentTypes.UseAbility,
      payload: {
        participantId: 'censor-1',
        abilityId: 'censor-judgment-t1',
        source: { kind: 'class-feature' },
        duration: { kind: 'end_of_encounter' },
        targetIds: ['goblin-b'],
      },
      timestamp: 0,
    });
    const setRel = res.derived.filter((d) => d.type === IntentTypes.SetTargetingRelation);
    // Two removes then one add
    expect(setRel).toHaveLength(3);
    expect(setRel[0].payload).toMatchObject({ targetId: 'goblin-a', present: false });
    expect(setRel[1].payload).toMatchObject({ targetId: 'goblin-c', present: false });
    expect(setRel[2].payload).toMatchObject({ targetId: 'goblin-b', present: true });
  });

  it('does NOT emit SetTargetingRelation for unregistered ability ids', () => {
    const state = makeStateWithCensor({
      participants: [makeCensor({ id: 'censor-1' }), makeMonster({ id: 'goblin-a' })],
      encounterCurrentRound: 1,
    });
    const res = applyUseAbility(state, {
      id: 'i-1',
      campaignId: 'c1',
      actor: { userId: 'u-aldric', role: 'player' },
      source: 'manual',
      type: IntentTypes.UseAbility,
      payload: {
        participantId: 'censor-1',
        abilityId: 'some-other-ability',
        source: { kind: 'class-feature' },
        duration: { kind: 'EoT' },
        targetIds: ['goblin-a'],
      },
      timestamp: 0,
    });
    const setRel = res.derived.filter((d) => d.type === IntentTypes.SetTargetingRelation);
    expect(setRel).toHaveLength(0);
  });

  it('does NOT emit SetTargetingRelation when targetIds is empty', () => {
    const state = makeStateWithCensor({
      participants: [makeCensor({ id: 'censor-1' })],
      encounterCurrentRound: 1,
    });
    const res = applyUseAbility(state, {
      id: 'i-1',
      campaignId: 'c1',
      actor: { userId: 'u-aldric', role: 'player' },
      source: 'manual',
      type: IntentTypes.UseAbility,
      payload: {
        participantId: 'censor-1',
        abilityId: 'censor-judgment-t1',
        source: { kind: 'class-feature' },
        duration: { kind: 'end_of_encounter' },
        targetIds: [],
      },
      timestamp: 0,
    });
    const setRel = res.derived.filter((d) => d.type === IntentTypes.SetTargetingRelation);
    expect(setRel).toHaveLength(0);
  });

  it('emits Mark replace path for tactician-mark-t1', () => {
    const state = makeStateWithCensor({
      participants: [
        makeTactician({ id: 'tactician-1', marked: ['goblin-a'] }),
        makeMonster({ id: 'goblin-a' }),
        makeMonster({ id: 'goblin-b' }),
      ],
      encounterCurrentRound: 1,
    });
    const res = applyUseAbility(state, {
      id: 'i-1',
      campaignId: 'c1',
      actor: { userId: 'u-korva', role: 'player' },
      source: 'manual',
      type: IntentTypes.UseAbility,
      payload: {
        participantId: 'tactician-1',
        abilityId: 'tactician-mark-t1',
        source: { kind: 'class-feature' },
        duration: { kind: 'end_of_encounter' },
        targetIds: ['goblin-b'],
      },
      timestamp: 0,
    });
    const setRel = res.derived.filter((d) => d.type === IntentTypes.SetTargetingRelation);
    expect(setRel).toHaveLength(2);
    expect(setRel[0].payload).toMatchObject({
      relationKind: 'marked',
      targetId: 'goblin-a',
      present: false,
    });
    expect(setRel[1].payload).toMatchObject({
      relationKind: 'marked',
      targetId: 'goblin-b',
      present: true,
    });
  });
});
```

Where `makeStateWithCensor`, `makeCensor`, `makeTactician`, `makeMonster` are existing or new local helpers — write them inline if absent (copy the fixture from Task 4's reducer test). The Tactician helper needs `className: 'tactician'` and a `targetingRelations.marked` initializer; same for the Censor.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @ironyard/rules test use-ability`
Expected: FAIL — derived `SetTargetingRelation` array is empty.

- [ ] **Step 4: Extend the reducer**

Modify `packages/rules/src/intents/use-ability.ts`. Add imports near the top:

```ts
import { ABILITY_TARGETING_EFFECTS } from '../class-triggers/ability-targeting-effects';
```

After the existing slice-2a derived-intent block (after the `triggerDerived` loop, before the final `return`), add:

```ts
  // ── Slice 2b: ABILITY_TARGETING_EFFECTS derived emission ────────────────
  // Auto-set targeting relations for the two registered PHB abilities
  // (Judgment, Mark). Both ship with mode: 'replace' — clear existing
  // entries before adding the new target. Skipped when targetIds is empty.
  const targetingEffect = ABILITY_TARGETING_EFFECTS[abilityId];
  if (
    targetingEffect &&
    parsed.data.targetIds &&
    parsed.data.targetIds.length > 0 &&
    target.kind === 'pc'
  ) {
    const { relationKind, mode } = targetingEffect;
    const existing = target.targetingRelations[relationKind];
    if (mode === 'replace') {
      for (const exId of existing) {
        derived.push({
          actor: intent.actor,
          source: 'server' as const,
          type: IntentTypes.SetTargetingRelation,
          payload: {
            sourceId: target.id,
            relationKind,
            targetId: exId,
            present: false,
          },
          causedBy: intent.id,
        });
      }
    }
    for (const newId of parsed.data.targetIds) {
      derived.push({
        actor: intent.actor,
        source: 'server' as const,
        type: IntentTypes.SetTargetingRelation,
        payload: {
          sourceId: target.id,
          relationKind,
          targetId: newId,
          present: true,
        },
        causedBy: intent.id,
      });
    }
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ironyard/rules test use-ability`
Expected: PASS — new tests green; existing slice-2a UseAbility tests still green.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/intents/use-ability.ts packages/rules/src/intents/use-ability.ts packages/rules/tests/intents/use-ability.spec.ts
git commit -m "feat(rules): UseAbility emits derived SetTargetingRelation (slice 2b)"
```

---

## Task 9: Replace Censor `isJudgedBy` stub

**Files:**
- Modify: `packages/rules/src/class-triggers/per-class/censor.ts`
- Test: `packages/rules/tests/class-triggers/per-class/censor.spec.ts` (extension)

- [ ] **Step 1: Write the failing test**

Append (or create) `packages/rules/tests/class-triggers/per-class/censor.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { evaluate } from '../../../src/class-triggers/per-class/censor';

describe('Censor isJudgedBy (slice 2b)', () => {
  it('fires Wrath +1 when damager is in censor.targetingRelations.judged', () => {
    const state = makeStateWithCensor({
      participants: [
        makeCensor({ id: 'censor-1', judged: ['goblin-a'] }),
        makeMonster({ id: 'goblin-a' }),
        makeMonster({ id: 'goblin-b' }),
      ],
    });
    const derived = evaluate(
      state,
      {
        kind: 'damage-applied',
        actorId: 'goblin-a',
        dealerId: 'goblin-a',
        targetId: 'censor-1',
        amount: 5,
        cause: 'damage',
        sideOfActor: 'foes',
      },
      { actor: { userId: 'dir-1', role: 'director' }, rolls: {} },
    );
    const gain = derived.find((d) => d.type === 'GainResource');
    expect(gain).toBeDefined();
    expect((gain as any).payload).toMatchObject({
      participantId: 'censor-1',
      name: 'wrath',
      amount: 1,
    });
  });

  it('does NOT fire when damager is NOT in censor.targetingRelations.judged (regression for slice 2a over-fire bug)', () => {
    const state = makeStateWithCensor({
      participants: [
        makeCensor({ id: 'censor-1', judged: [] }),
        makeMonster({ id: 'goblin-b' }),
      ],
    });
    const derived = evaluate(
      state,
      {
        kind: 'damage-applied',
        actorId: 'goblin-b',
        dealerId: 'goblin-b',
        targetId: 'censor-1',
        amount: 5,
        cause: 'damage',
        sideOfActor: 'foes',
      },
      { actor: { userId: 'dir-1', role: 'director' }, rolls: {} },
    );
    expect(derived.filter((d) => d.type === 'GainResource')).toHaveLength(0);
  });

  it('fires Wrath +1 when censor damages a judged-target', () => {
    const state = makeStateWithCensor({
      participants: [
        makeCensor({ id: 'censor-1', judged: ['goblin-a'] }),
        makeMonster({ id: 'goblin-a' }),
      ],
    });
    const derived = evaluate(
      state,
      {
        kind: 'damage-applied',
        actorId: 'censor-1',
        dealerId: 'censor-1',
        targetId: 'goblin-a',
        amount: 5,
        cause: 'damage',
        sideOfActor: 'heroes',
      },
      { actor: { userId: 'u-aldric', role: 'player' }, rolls: {} },
    );
    const gain = derived.find((d) => d.type === 'GainResource');
    expect(gain).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/rules test censor`
Expected: FAIL — second test ("does NOT fire") fails because the existing stub returns `true` for any non-self target.

- [ ] **Step 3: Replace the stub**

Modify `packages/rules/src/class-triggers/per-class/censor.ts`. Replace the `isJudgedBy` function and update its header comment:

```ts
// Pass 3 Slice 2a — Censor class-δ action triggers.
// Pass 3 Slice 2b — `isJudgedBy` now reads from the source's
// `targetingRelations.judged` list (player-managed via chip toggle and
// auto-set from UseAbility for ability id 'censor-judgment-t1').
//
// Wrath (canon § 5.4.1):
//   - When a creature this Censor has Judgment on damages this Censor:
//     +1 wrath, gated by `perRound.judgedTargetDamagedMe` (first time per round).
//   - When this Censor damages a creature they have Judgment on:
//     +1 wrath, gated by `perRound.damagedJudgedTarget` (first time per round).

function isJudgedBy(_state: CampaignState, censor: Participant, candidateId: string): boolean {
  if (candidateId === censor.id) return false;
  return censor.targetingRelations.judged.includes(candidateId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ironyard/rules test censor`
Expected: PASS — all three tests green; the original slice-2a triggering test (if present) still green because it presumably uses a fixture where the target is added to the judged list.

If the existing slice-2a censor test relied on the over-fire behavior, fix it: add the judged target to the fixture's `targetingRelations.judged` array.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/class-triggers/per-class/censor.ts packages/rules/tests/class-triggers/per-class/censor.spec.ts
git commit -m "fix(rules): Censor isJudgedBy reads targetingRelations.judged (slice 2b)"
```

---

## Task 10: Replace Tactician `isMarkedBy` stub

**Files:**
- Modify: `packages/rules/src/class-triggers/per-class/tactician.ts`
- Test: `packages/rules/tests/class-triggers/per-class/tactician.spec.ts` (extension)

- [ ] **Step 1: Write the failing test**

Append (or create) `packages/rules/tests/class-triggers/per-class/tactician.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { evaluate } from '../../../src/class-triggers/per-class/tactician';

describe('Tactician isMarkedBy (slice 2b)', () => {
  it('fires Focus +1 when damage target is in tactician.targetingRelations.marked', () => {
    const state = makeStateWithTactician({
      participants: [
        makeTactician({ id: 'tactician-1', marked: ['goblin-a'] }),
        makeMonster({ id: 'goblin-a' }),
      ],
    });
    const derived = evaluate(
      state,
      {
        kind: 'damage-applied',
        actorId: 'tactician-1',
        dealerId: 'tactician-1',
        targetId: 'goblin-a',
        amount: 5,
        cause: 'damage',
        sideOfActor: 'heroes',
      },
      { actor: { userId: 'u-korva', role: 'player' }, rolls: {} },
    );
    const gain = derived.find((d) => d.type === 'GainResource');
    expect(gain).toBeDefined();
    expect((gain as any).payload).toMatchObject({
      participantId: 'tactician-1',
      name: 'focus',
      amount: 1,
    });
  });

  it('does NOT fire when damage target is NOT in tactician.targetingRelations.marked (regression)', () => {
    const state = makeStateWithTactician({
      participants: [
        makeTactician({ id: 'tactician-1', marked: [] }),
        makeMonster({ id: 'goblin-b' }),
      ],
    });
    const derived = evaluate(
      state,
      {
        kind: 'damage-applied',
        actorId: 'tactician-1',
        dealerId: 'tactician-1',
        targetId: 'goblin-b',
        amount: 5,
        cause: 'damage',
        sideOfActor: 'heroes',
      },
      { actor: { userId: 'u-korva', role: 'player' }, rolls: {} },
    );
    expect(derived.filter((d) => d.type === 'GainResource')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/rules test tactician`
Expected: FAIL — second test fails because the stub over-fires.

- [ ] **Step 3: Replace the stub**

Modify `packages/rules/src/class-triggers/per-class/tactician.ts`. Replace `isMarkedBy`:

```ts
// Pass 3 Slice 2a — Tactician class-δ action triggers.
// Pass 3 Slice 2b — `isMarkedBy` now reads from the source's
// `targetingRelations.marked` list (player-managed via chip toggle and
// auto-set from UseAbility for ability id 'tactician-mark-t1').

function isMarkedBy(_state: CampaignState, tactician: Participant, candidateId: string): boolean {
  if (candidateId === tactician.id) return false;
  return tactician.targetingRelations.marked.includes(candidateId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ironyard/rules test tactician`
Expected: PASS — new tests green; ally-heroic-within-10 OA path still works (separate event branch).

If the existing tactician test relied on the over-fire behavior, add `marked: ['goblin-a']` to the fixture.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/class-triggers/per-class/tactician.ts packages/rules/tests/class-triggers/per-class/tactician.spec.ts
git commit -m "fix(rules): Tactician isMarkedBy reads targetingRelations.marked (slice 2b)"
```

---

## Task 11: Replace Null `hasActiveNullField` stub + drop OA detour

**Files:**
- Modify: `packages/rules/src/class-triggers/per-class/null.ts`
- Test: `packages/rules/tests/class-triggers/per-class/null.spec.ts` (extension)

The Null Field trigger today raises a `spatial-trigger-null-field` OA on every enemy main action by an active-Null (with the field-check stubbed `true`). With the predicate now resolving whether the enemy is in the field, the trigger flips from OA-raised to direct auto-apply (matches the Censor / Tactician pattern). The OA kind stays in the registry as harmless dead code.

- [ ] **Step 1: Write the failing test**

Append (or create) `packages/rules/tests/class-triggers/per-class/null.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { evaluate } from '../../../src/class-triggers/per-class/null';
import { IntentTypes } from '@ironyard/shared';

describe('Null hasActiveNullFieldOver (slice 2b)', () => {
  it('auto-applies Discipline +1 when enemy actor is in null.targetingRelations.nullField (no OA)', () => {
    const state = makeStateWithNull({
      participants: [
        makeNull({ id: 'null-1', nullField: ['goblin-a'] }),
        makeMonster({ id: 'goblin-a' }),
      ],
    });
    const derived = evaluate(
      state,
      {
        kind: 'main-action-used',
        actorId: 'goblin-a',
        abilityId: 'goblin-stab',
        sideOfActor: 'foes',
      },
      { actor: { userId: 'dir-1', role: 'director' }, rolls: {} },
    );
    const gain = derived.find((d) => d.type === 'GainResource');
    expect(gain).toBeDefined();
    expect((gain as any).payload).toMatchObject({
      participantId: 'null-1',
      name: 'discipline',
      amount: 1,
    });
    // No more spatial OA detour
    expect(derived.find((d) => d.type === IntentTypes.RaiseOpenAction)).toBeUndefined();
  });

  it('does NOT fire when enemy actor is NOT in null.targetingRelations.nullField (regression)', () => {
    const state = makeStateWithNull({
      participants: [
        makeNull({ id: 'null-1', nullField: [] }),
        makeMonster({ id: 'goblin-a' }),
      ],
    });
    const derived = evaluate(
      state,
      {
        kind: 'main-action-used',
        actorId: 'goblin-a',
        abilityId: 'goblin-stab',
        sideOfActor: 'foes',
      },
      { actor: { userId: 'dir-1', role: 'director' }, rolls: {} },
    );
    expect(derived.filter((d) => d.type === 'GainResource')).toHaveLength(0);
    expect(derived.find((d) => d.type === IntentTypes.RaiseOpenAction)).toBeUndefined();
  });

  it('does NOT fire when actor is a PC ally (sideOfActor heroes)', () => {
    const state = makeStateWithNull({
      participants: [
        makeNull({ id: 'null-1', nullField: ['ally-pc'] }),
        makePc({ id: 'ally-pc' }),
      ],
    });
    const derived = evaluate(
      state,
      {
        kind: 'main-action-used',
        actorId: 'ally-pc',
        abilityId: 'pc-strike',
        sideOfActor: 'heroes',
      },
      { actor: { userId: 'u-ally', role: 'player' }, rolls: {} },
    );
    expect(derived.filter((d) => d.type === 'GainResource')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/rules test null`
Expected: FAIL — first test expects auto-apply but current code raises an OA; second test fails because stub returns true.

- [ ] **Step 3: Rewrite Null Field path**

Modify `packages/rules/src/class-triggers/per-class/null.ts`. Replace the `hasActiveNullField` function and the `main-action-used` branch:

```ts
// Pass 3 Slice 2a — Null class-δ action triggers.
// Pass 3 Slice 2b — `hasActiveNullField` renamed to
// `hasActiveNullFieldOver(target, source)`: now checks whether this specific
// enemy is in the source's `targetingRelations.nullField` list. Spatial
// adjudication moved entirely to the player (chip toggle); engine
// auto-applies when the predicate is true. The
// `spatial-trigger-null-field` OA kind is no longer raised by this evaluator
// — it stays in the OpenActionKindSchema as harmless dead code for back-compat
// with mid-encounter snapshots that may have raised one before this slice
// shipped.

function hasActiveNullFieldOver(
  _state: CampaignState,
  nullPc: Participant,
  candidateId: string,
): boolean {
  return nullPc.targetingRelations.nullField.includes(candidateId);
}
```

Then in the `main-action-used` branch (replace the OA-raising block):

```ts
  if (event.kind === 'main-action-used') {
    const actor = state.participants.filter(isParticipant).find((p) => p.id === event.actorId);
    if (!actor) return derived;
    if (actor.kind !== 'monster') return derived;
    for (const nullPc of nulls) {
      if (nullPc.perEncounterFlags.perRound.nullFieldEnemyMainTriggered) continue;
      if (!hasActiveNullFieldOver(state, nullPc, actor.id)) continue;
      derived.push(
        {
          actor: ctx.actor,
          source: 'server',
          type: 'GainResource',
          payload: { participantId: nullPc.id, name: 'discipline', amount: 1 },
        },
        {
          actor: ctx.actor,
          source: 'server',
          type: 'SetParticipantPerRoundFlag',
          payload: {
            participantId: nullPc.id,
            key: 'nullFieldEnemyMainTriggered',
            value: true,
          },
        },
      );
    }
    return derived;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ironyard/rules test null`
Expected: PASS — all new tests green; existing malice-spent test still green (separate branch).

If the existing slice-2a Null Field test used the OA-raised path, update it to expect direct auto-apply (the new contract).

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/class-triggers/per-class/null.ts packages/rules/tests/class-triggers/per-class/null.spec.ts
git commit -m "fix(rules): Null hasActiveNullFieldOver reads targetingRelations.nullField + drop OA detour (slice 2b)"
```

---

## Task 12: Integration test — slice 2b end-to-end

**Files:**
- Create: `packages/rules/tests/slice-2b-integration.spec.ts`

- [ ] **Step 1: Write the integration test**

`packages/rules/tests/slice-2b-integration.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reduce } from '../src/reducer';
import { IntentTypes } from '@ironyard/shared';
// Use whatever fixture helpers the existing slice-1 / slice-2a integration
// tests use. If `makeCensor`, `makeTactician`, `makeNull`, `makeMonster`
// don't exist as shared helpers, write minimal ones inline.

describe('Slice 2b integration — targeting relations end-to-end', () => {
  it('exercises the full Judgment / Mark / Null Field flow + EndEncounter cleanup', () => {
    let state = makeStateWith4PcEncounter({
      participants: [
        makeCensor({ id: 'aldric', ownerId: 'u-aldric' }),
        makeTactician({ id: 'korva', ownerId: 'u-korva' }),
        makeNull({ id: 'vex', ownerId: 'u-vex' }),
        makeTalent({ id: 'eldra', ownerId: 'u-eldra' }),
        makeMonster({ id: 'goblin-a' }),
        makeMonster({ id: 'goblin-b' }),
        makeMonster({ id: 'goblin-c' }),
      ],
    });

    // Round 1 — Aldric uses Judgment on Goblin-A
    state = reduce(state, {
      id: 'i-1',
      campaignId: 'c1',
      actor: { userId: 'u-aldric', role: 'player' },
      source: 'manual',
      type: IntentTypes.UseAbility,
      payload: {
        participantId: 'aldric',
        abilityId: 'censor-judgment-t1',
        source: { kind: 'class-feature' },
        duration: { kind: 'end_of_encounter' },
        targetIds: ['goblin-a'],
      },
      timestamp: 0,
    }).state;
    const aldric = state.participants.find((p: any) => p.id === 'aldric') as any;
    expect(aldric.targetingRelations.judged).toEqual(['goblin-a']);

    // Goblin-A damages Aldric → +1 wrath
    state = reduce(state, {
      id: 'i-2',
      campaignId: 'c1',
      actor: { userId: 'dir-1', role: 'director' },
      source: 'manual',
      type: IntentTypes.ApplyDamage,
      payload: { dealerId: 'goblin-a', targetId: 'aldric', amount: 5, damageType: 'weapon' },
      timestamp: 0,
    }).state;
    const wrath = (state.participants.find((p: any) => p.id === 'aldric') as any).heroicResources
      .find((r: any) => r.name === 'wrath')?.value ?? 0;
    expect(wrath).toBe(1);

    // Goblin-B damages Aldric → no extra wrath
    state = reduce(state, {
      id: 'i-3',
      campaignId: 'c1',
      actor: { userId: 'dir-1', role: 'director' },
      source: 'manual',
      type: IntentTypes.ApplyDamage,
      payload: { dealerId: 'goblin-b', targetId: 'aldric', amount: 5, damageType: 'weapon' },
      timestamp: 0,
    }).state;
    const wrath2 = (state.participants.find((p: any) => p.id === 'aldric') as any).heroicResources
      .find((r: any) => r.name === 'wrath')?.value ?? 0;
    expect(wrath2).toBe(1); // unchanged

    // Korva uses Mark on Goblin-A
    state = reduce(state, {
      id: 'i-4',
      campaignId: 'c1',
      actor: { userId: 'u-korva', role: 'player' },
      source: 'manual',
      type: IntentTypes.UseAbility,
      payload: {
        participantId: 'korva',
        abilityId: 'tactician-mark-t1',
        source: { kind: 'class-feature' },
        duration: { kind: 'end_of_encounter' },
        targetIds: ['goblin-a'],
      },
      timestamp: 0,
    }).state;
    const korva = state.participants.find((p: any) => p.id === 'korva') as any;
    expect(korva.targetingRelations.marked).toEqual(['goblin-a']);

    // Vex toggles Goblin-A into Null Field via SetTargetingRelation
    state = reduce(state, {
      id: 'i-5',
      campaignId: 'c1',
      actor: { userId: 'u-vex', role: 'player' },
      source: 'manual',
      type: IntentTypes.SetTargetingRelation,
      payload: { sourceId: 'vex', relationKind: 'nullField', targetId: 'goblin-a', present: true },
      timestamp: 0,
    }).state;
    const vex = state.participants.find((p: any) => p.id === 'vex') as any;
    expect(vex.targetingRelations.nullField).toEqual(['goblin-a']);

    // Aldric uses Judgment on Goblin-C (replace mode)
    state = reduce(state, {
      id: 'i-6',
      campaignId: 'c1',
      actor: { userId: 'u-aldric', role: 'player' },
      source: 'manual',
      type: IntentTypes.UseAbility,
      payload: {
        participantId: 'aldric',
        abilityId: 'censor-judgment-t1',
        source: { kind: 'class-feature' },
        duration: { kind: 'end_of_encounter' },
        targetIds: ['goblin-c'],
      },
      timestamp: 0,
    }).state;
    const aldric2 = state.participants.find((p: any) => p.id === 'aldric') as any;
    expect(aldric2.targetingRelations.judged).toEqual(['goblin-c']); // replaced

    // Remove Goblin-A → strip from Korva.marked and Vex.nullField
    state = reduce(state, {
      id: 'i-7',
      campaignId: 'c1',
      actor: { userId: 'dir-1', role: 'director' },
      source: 'manual',
      type: IntentTypes.RemoveParticipant,
      payload: { participantId: 'goblin-a' },
      timestamp: 0,
    }).state;
    const korva2 = state.participants.find((p: any) => p.id === 'korva') as any;
    const vex2 = state.participants.find((p: any) => p.id === 'vex') as any;
    expect(korva2.targetingRelations.marked).toEqual([]);
    expect(vex2.targetingRelations.nullField).toEqual([]);

    // EndEncounter → all three relations cleared for everyone
    state = reduce(state, {
      id: 'i-8',
      campaignId: 'c1',
      actor: { userId: 'dir-1', role: 'director' },
      source: 'manual',
      type: IntentTypes.EndEncounter,
      payload: { encounterId: state.encounter!.id },
      timestamp: 0,
    }).state;
    for (const p of state.participants) {
      expect((p as any).targetingRelations).toEqual({ judged: [], marked: [], nullField: [] });
    }
  });
});
```

If the helper functions (`makeStateWith4PcEncounter`, `makeCensor`, etc.) don't exist, lift the fixture pattern from `packages/rules/tests/slice-2a-integration.spec.ts` (referenced in slice 2a spec) and adapt.

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @ironyard/rules test slice-2b-integration`
Expected: PASS — full flow exercises all slice-2b touchpoints.

If any assertion fails, it indicates an integration gap between earlier tasks — investigate before declaring task complete.

- [ ] **Step 3: Commit**

```bash
git add packages/rules/tests/slice-2b-integration.spec.ts
git commit -m "test(rules): slice 2b end-to-end integration (slice 2b)"
```

---

## Task 13: WS-mirror reflects `SetTargetingRelation`

**Files:**
- Modify: `apps/web/src/ws/useSessionSocket.ts`
- Test: `apps/web/src/ws/useSessionSocket.spec.ts` (extension; check for file first)

- [ ] **Step 1: Confirm WS-mirror test file**

Run: `find apps/web/src/ws -name "useSessionSocket*spec*"`

- [ ] **Step 2: Write the failing test**

Append (or extend the existing slice-2a mirror tests) at `apps/web/src/ws/useSessionSocket.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyMirrorIntent } from './useSessionSocket'; // adjust import to match exported test helper
import type { Encounter } from './useSessionSocket'; // adjust to actual mirror state type

describe('WS-mirror — SetTargetingRelation', () => {
  it('adds targetId to source.targetingRelations[kind] when present:true', () => {
    const prev = makeMirrorState({
      participants: [
        makePc({ id: 'censor-1', targetingRelations: { judged: [], marked: [], nullField: [] } }),
        makeMonster({ id: 'goblin-a' }),
      ],
    });
    const next = applyMirrorIntent(prev, {
      type: 'SetTargetingRelation',
      payload: {
        sourceId: 'censor-1',
        relationKind: 'judged',
        targetId: 'goblin-a',
        present: true,
      },
    });
    const censor = next.participants.find((p: any) => p.id === 'censor-1') as any;
    expect(censor.targetingRelations.judged).toEqual(['goblin-a']);
  });

  it('removes targetId when present:false', () => {
    const prev = makeMirrorState({
      participants: [
        makePc({
          id: 'censor-1',
          targetingRelations: { judged: ['goblin-a'], marked: [], nullField: [] },
        }),
      ],
    });
    const next = applyMirrorIntent(prev, {
      type: 'SetTargetingRelation',
      payload: {
        sourceId: 'censor-1',
        relationKind: 'judged',
        targetId: 'goblin-a',
        present: false,
      },
    });
    const censor = next.participants.find((p: any) => p.id === 'censor-1') as any;
    expect(censor.targetingRelations.judged).toEqual([]);
  });
});
```

Adapt import paths and helper signatures to match the actual export surface of `useSessionSocket.ts`. (Check the exported test helper around line 153 per slice-2a comment: "Exported for unit testing.")

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @ironyard/web test useSessionSocket`
Expected: FAIL — mirror doesn't know about `SetTargetingRelation`.

- [ ] **Step 4: Implement the mirror case**

Modify `apps/web/src/ws/useSessionSocket.ts`. Find the slice-2a block (search for `IntentTypes.StartMaintenance`) and add a new branch near it:

```ts
  if (type === IntentTypes.SetTargetingRelation) {
    const { sourceId, relationKind, targetId, present } = payload as SetTargetingRelationPayload;
    return {
      ...prev,
      participants: prev.participants.map((p) => {
        if (!isParticipantEntry(p) || p.id !== sourceId) return p;
        const current = p.targetingRelations[relationKind];
        const has = current.includes(targetId);
        if (present && !has) {
          return {
            ...p,
            targetingRelations: {
              ...p.targetingRelations,
              [relationKind]: [...current, targetId],
            },
          };
        }
        if (!present && has) {
          return {
            ...p,
            targetingRelations: {
              ...p.targetingRelations,
              [relationKind]: current.filter((id) => id !== targetId),
            },
          };
        }
        return p; // idempotent no-op
      }),
    };
  }
```

Add the import to the top (next to other intent payload imports):

```ts
import type { SetTargetingRelationPayload } from '@ironyard/shared';
```

The `UseAbility` derived cascade is handled by the reducer engine on the server side; the WS mirror separately mirrors the `SetTargetingRelation` derived intents as the server broadcasts them. No additional mirror logic needed for the auto-set path — each derived `SetTargetingRelation` flows through the case above.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ironyard/web test useSessionSocket`
Expected: PASS — new tests green; existing slice-2a mirror tests still green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ws/useSessionSocket.ts apps/web/src/ws/useSessionSocket.spec.ts
git commit -m "feat(web): WS-mirror reflects SetTargetingRelation (slice 2b)"
```

---

## Task 14: `TargetingRelationsCard` component

**Files:**
- Create: `apps/web/src/components/TargetingRelationsCard.tsx`
- Test: `apps/web/src/components/TargetingRelationsCard.spec.tsx`

- [ ] **Step 1: Survey existing component aesthetic**

Run: `ls apps/web/src/primitives/ ; ls apps/web/src/theme/`
Read one component (e.g., the slice-2a Maintenance sub-section, search for it in `PlayerSheetPanel.tsx`) to mirror the styling pattern. The card must use existing primitives — do not invent new ones.

Run: `grep -n "Maintenance\|maintainedAbilities" apps/web/src/components/PlayerSheetPanel.tsx | head -10`

- [ ] **Step 2: Write the failing test**

`apps/web/src/components/TargetingRelationsCard.spec.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TargetingRelationsCard } from './TargetingRelationsCard';

const baseParticipant = (overrides: any = {}) => ({
  id: 'censor-1',
  name: 'Aldric',
  className: 'censor',
  targetingRelations: { judged: [], marked: [], nullField: [] },
  ...overrides,
});

describe('TargetingRelationsCard', () => {
  it('renders empty state when relation array is empty', () => {
    render(
      <TargetingRelationsCard
        source={baseParticipant()}
        relationKind="judged"
        candidates={[]}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText(/judging: none/i)).toBeInTheDocument();
  });

  it('renders entries with remove buttons', () => {
    render(
      <TargetingRelationsCard
        source={baseParticipant({
          targetingRelations: { judged: ['goblin-a'], marked: [], nullField: [] },
        })}
        relationKind="judged"
        candidates={[{ id: 'goblin-a', name: 'Goblin A' }]}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('Goblin A')).toBeInTheDocument();
  });

  it('calls onToggle(present:false) when remove tapped', () => {
    const onToggle = vi.fn();
    render(
      <TargetingRelationsCard
        source={baseParticipant({
          targetingRelations: { judged: ['goblin-a'], marked: [], nullField: [] },
        })}
        relationKind="judged"
        candidates={[{ id: 'goblin-a', name: 'Goblin A' }]}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByLabelText(/remove Goblin A/i));
    expect(onToggle).toHaveBeenCalledWith('goblin-a', false);
  });

  it('opens picker and dispatches add', () => {
    const onToggle = vi.fn();
    render(
      <TargetingRelationsCard
        source={baseParticipant()}
        relationKind="judged"
        candidates={[
          { id: 'goblin-a', name: 'Goblin A' },
          { id: 'goblin-b', name: 'Goblin B' },
        ]}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByText(/add target/i));
    fireEvent.click(screen.getByText('Goblin B'));
    expect(onToggle).toHaveBeenCalledWith('goblin-b', true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @ironyard/web test TargetingRelationsCard`
Expected: FAIL — component doesn't exist.

- [ ] **Step 4: Implement the component**

`apps/web/src/components/TargetingRelationsCard.tsx`:

```tsx
import { useState } from 'react';
import type { Participant, TargetingRelationKind } from '@ironyard/shared';
// Reuse existing primitives — do not invent new ones. Adjust imports to match
// the actual export names in apps/web/src/primitives/ (Button, Chip, etc.).
import { Button } from '../primitives/Button';

const RELATION_LABEL: Record<TargetingRelationKind, string> = {
  judged: 'Judging',
  marked: 'Marked',
  nullField: 'In My Null Field',
};

type Candidate = { id: string; name: string };

type Props = {
  source: Pick<Participant, 'id' | 'name' | 'targetingRelations'>;
  relationKind: TargetingRelationKind;
  /** Candidates the source could add (typically opposing-side participants). */
  candidates: Candidate[];
  /** Called with (targetId, present) when the user toggles an entry. */
  onToggle: (targetId: string, present: boolean) => void;
};

export function TargetingRelationsCard({ source, relationKind, candidates, onToggle }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const entries = source.targetingRelations[relationKind];
  const entryNames = entries.map((id) => candidates.find((c) => c.id === id)?.name ?? id);
  const addable = candidates.filter((c) => !entries.includes(c.id));

  return (
    <section data-testid={`targeting-relations-card-${relationKind}`}>
      <h4>{RELATION_LABEL[relationKind]}</h4>
      {entries.length === 0 ? (
        <p>{RELATION_LABEL[relationKind]}: none.</p>
      ) : (
        <ul>
          {entries.map((id, i) => (
            <li key={id}>
              <span>{entryNames[i]}</span>
              <Button
                aria-label={`remove ${entryNames[i]}`}
                onClick={() => onToggle(id, false)}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button onClick={() => setPickerOpen(true)} disabled={addable.length === 0}>
        + Add target
      </Button>
      {pickerOpen && (
        <div role="dialog" aria-label="Add targeting relation target">
          {addable.map((c) => (
            <Button
              key={c.id}
              onClick={() => {
                onToggle(c.id, true);
                setPickerOpen(false);
              }}
            >
              {c.name}
            </Button>
          ))}
          <Button onClick={() => setPickerOpen(false)}>Cancel</Button>
        </div>
      )}
    </section>
  );
}
```

If the `Button` primitive has a different name or shape, adapt; the test asserts behavior (click → callback), not specific markup.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ironyard/web test TargetingRelationsCard`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/TargetingRelationsCard.tsx apps/web/src/components/TargetingRelationsCard.spec.tsx
git commit -m "feat(web): TargetingRelationsCard component (slice 2b)"
```

---

## Task 15: `ParticipantRow` chips (outbound + inbound)

**Files:**
- Modify: `apps/web/src/components/ParticipantRow.tsx`
- Test: `apps/web/src/components/ParticipantRow.spec.tsx` (extension)

- [ ] **Step 1: Survey existing row + signature**

Run: `head -100 apps/web/src/components/ParticipantRow.tsx`

Identify what props the row currently takes (likely `participant`, `viewer`, possibly `allParticipants` or similar). Determine where the source's `targetingRelations` will come from — most likely the parent passes `allParticipants` (so the row can derive inbound chips by scanning others' arrays).

- [ ] **Step 2: Write the failing test**

Append to `apps/web/src/components/ParticipantRow.spec.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ParticipantRow } from './ParticipantRow';

describe('ParticipantRow — targeting relation chips', () => {
  it('renders inbound chips for all viewers', () => {
    render(
      <ParticipantRow
        participant={{ id: 'goblin-a', name: 'Goblin A', kind: 'monster' } as any}
        viewer={{ userId: 'u-other', role: 'player' }}
        allParticipants={[
          { id: 'aldric', name: 'Aldric', kind: 'pc', ownerId: 'u-aldric',
            targetingRelations: { judged: ['goblin-a'], marked: [], nullField: [] } } as any,
          { id: 'korva', name: 'Korva', kind: 'pc', ownerId: 'u-korva',
            targetingRelations: { judged: [], marked: ['goblin-a'], nullField: [] } } as any,
        ]}
        activeDirectorId="dir-1"
      />,
    );
    expect(screen.getByText(/judged by aldric/i)).toBeInTheDocument();
    expect(screen.getByText(/marked by korva/i)).toBeInTheDocument();
  });

  it('renders outbound chips only for source-owner / active-director viewers', () => {
    const aldric = {
      id: 'aldric', name: 'Aldric', kind: 'pc', ownerId: 'u-aldric',
      className: 'censor',
      targetingRelations: { judged: [], marked: [], nullField: [] },
    } as any;

    // Non-owner non-director: no outbound chip
    const { rerender } = render(
      <ParticipantRow
        participant={{ id: 'goblin-a', name: 'Goblin A', kind: 'monster' } as any}
        viewer={{ userId: 'u-other', role: 'player' }}
        allParticipants={[aldric]}
        activeDirectorId="dir-1"
        viewerOwnedSourceIds={[]}
      />,
    );
    expect(screen.queryByLabelText(/toggle judged/i)).toBeNull();

    // Owner of Aldric (the Censor source): outbound chip visible
    rerender(
      <ParticipantRow
        participant={{ id: 'goblin-a', name: 'Goblin A', kind: 'monster' } as any}
        viewer={{ userId: 'u-aldric', role: 'player' }}
        allParticipants={[aldric]}
        activeDirectorId="dir-1"
        viewerOwnedSourceIds={['aldric']}
      />,
    );
    expect(screen.getByLabelText(/toggle judged/i)).toBeInTheDocument();
  });
});
```

The exact prop shape (`viewerOwnedSourceIds`, `activeDirectorId`) is one possible API — adapt to whatever the existing `ParticipantRow` already accepts. The test asserts visibility based on viewer identity, regardless of how the prop plumbing is structured.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @ironyard/web test ParticipantRow`
Expected: FAIL — chips not rendered yet.

- [ ] **Step 4: Implement chip rendering**

Modify `apps/web/src/components/ParticipantRow.tsx`. Add two render helpers:

```tsx
import type { TargetingRelationKind, Participant } from '@ironyard/shared';

const RELATION_PRESENT_TENSE: Record<TargetingRelationKind, string> = {
  judged: 'Judged by',
  marked: 'Marked by',
  nullField: 'In Null Field of',
};

function inboundChips(participant: Pick<Participant, 'id'>, allParticipants: Participant[]) {
  const chips: Array<{ kind: TargetingRelationKind; sourceName: string }> = [];
  for (const p of allParticipants) {
    if (p.id === participant.id) continue;
    for (const kind of ['judged', 'marked', 'nullField'] as TargetingRelationKind[]) {
      if (p.targetingRelations[kind].includes(participant.id)) {
        chips.push({ kind, sourceName: p.name });
      }
    }
  }
  return chips;
}
```

In the row render output, place inbound chips next to HP / name:

```tsx
{inboundChips(participant, allParticipants).map((c, i) => (
  <span key={i} className="chip chip--inbound">
    {RELATION_PRESENT_TENSE[c.kind]} {c.sourceName}
  </span>
))}
```

For outbound chips, given the viewer's owned source ids (PCs the viewer plays + all PCs/monsters if director), determine which relation kinds apply:

```tsx
import { useIsActingAsDirector } from '../lib/active-director';

// ... inside the component:
const isDirector = useIsActingAsDirector();
const ownedSources = allParticipants.filter(
  (p) => p.ownerId === viewer.userId || (isDirector && p.kind === 'pc'),
);

// For each owned source whose class has a relation-kind, render an outbound chip:
const CLASS_RELATION_KIND: Record<string, TargetingRelationKind | undefined> = {
  censor: 'judged',
  tactician: 'marked',
  null: 'nullField',
};

{ownedSources.flatMap((source) => {
  const kind = source.className ? CLASS_RELATION_KIND[source.className] : undefined;
  if (!kind) return [];
  if (source.id === participant.id) return [];
  const isOn = source.targetingRelations[kind].includes(participant.id);
  return [
    <button
      key={`${source.id}-${kind}`}
      aria-label={`toggle ${kind} from ${source.name}`}
      onClick={() => onToggleRelation?.(source.id, kind, participant.id, !isOn)}
      className={isOn ? 'chip chip--outbound chip--on' : 'chip chip--outbound'}
    >
      {kind}
    </button>,
  ];
})}
```

Add an `onToggleRelation` prop to the row signature so the parent (e.g., DirectorCombat) can dispatch `SetTargetingRelation`. The parent (Task 16) wires the dispatcher.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ironyard/web test ParticipantRow`
Expected: PASS — new tests green; existing row tests still green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ParticipantRow.tsx apps/web/src/components/ParticipantRow.spec.tsx
git commit -m "feat(web): ParticipantRow targeting-relation chips (slice 2b)"
```

---

## Task 16: Render `TargetingRelationsCard` from `PlayerSheetPanel` + wire dispatcher

**Files:**
- Modify: `apps/web/src/components/PlayerSheetPanel.tsx`
- Modify: (whichever parent renders `ParticipantRow` — likely `apps/web/src/pages/combat/DirectorCombat.tsx`) — wire `onToggleRelation`

- [ ] **Step 1: Survey current PlayerSheetPanel structure**

Run: `grep -n "maintainedAbilities\|className\b" apps/web/src/components/PlayerSheetPanel.tsx | head -10`

Find where the slice-2a Maintenance sub-section renders. The `TargetingRelationsCard` slots in alongside it under each class's heroic resource block.

- [ ] **Step 2: Render the card conditionally**

In `PlayerSheetPanel.tsx`, add the import:

```tsx
import { TargetingRelationsCard } from './TargetingRelationsCard';
import type { TargetingRelationKind } from '@ironyard/shared';

const CLASS_RELATION_KIND: Record<string, TargetingRelationKind | undefined> = {
  censor: 'judged',
  tactician: 'marked',
  null: 'nullField',
};
```

Where the Maintenance card renders (or near the heroic-resource block), add:

```tsx
{(() => {
  const kind = participant.className ? CLASS_RELATION_KIND[participant.className] : undefined;
  if (!kind) return null;
  // Candidates: opposing-side participants. For a PC, opposing side = monsters.
  // For Null Field specifically, the spec says players manage who's "in the field"
  // — but canon limits it to enemies, so we filter to the opposite side for all three.
  const candidates = allParticipants
    .filter((p) => p.id !== participant.id && p.kind === 'monster')
    .map((p) => ({ id: p.id, name: p.name }));
  return (
    <TargetingRelationsCard
      source={participant}
      relationKind={kind}
      candidates={candidates}
      onToggle={(targetId, present) =>
        dispatch({
          type: 'SetTargetingRelation',
          payload: {
            sourceId: participant.id,
            relationKind: kind,
            targetId,
            present,
          },
        })
      }
    />
  );
})()}
```

Where `dispatch` is whatever existing intent-dispatch surface the sheet panel uses; adapt to its actual name. If the sheet doesn't currently have a dispatch path, follow the pattern slice 2a used for `StartMaintenance` / `StopMaintenance` (search the file for those handlers).

- [ ] **Step 3: Wire `onToggleRelation` on `ParticipantRow` in the combat view**

In `apps/web/src/pages/combat/DirectorCombat.tsx` (the row's primary consumer), pass the `onToggleRelation` callback:

```tsx
<ParticipantRow
  // ... existing props ...
  onToggleRelation={(sourceId, relationKind, targetId, present) =>
    dispatch({
      type: 'SetTargetingRelation',
      payload: { sourceId, relationKind, targetId, present },
    })
  }
/>
```

Search for the same row usage in `PlayerCombat.tsx` (or whichever the player-side combat view is) and add the same prop.

- [ ] **Step 4: Manual UI check**

Start the dev server and verify the card renders for a Censor/Tactician/Null PC; that tapping `[+ Add target]` opens a picker; that selecting a candidate adds it; that the public inbound chip appears on the target's row for all viewers. Open at iPad-portrait (810×1080) and iPhone-portrait (390×844); confirm 44pt hit targets per CLAUDE.md.

```bash
pnpm dev
```

Take screenshots at both viewports — store as `docs/slice-2b-ipad.png` and `docs/slice-2b-iphone.png` if the project has a screenshots convention; otherwise just visually confirm.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/PlayerSheetPanel.tsx apps/web/src/pages/combat/DirectorCombat.tsx apps/web/src/pages/combat/PlayerCombat.tsx
git commit -m "feat(web): wire TargetingRelationsCard + per-row chips into combat views (slice 2b)"
```

---

## Task 17: Canon doc flips

**Files:**
- Modify: `docs/rules-canon.md` — § 5.4 umbrella + § 5.4.1 / § 5.4.5 / § 5.4.7 from 🚧 → ✅; remove "auto-apply gated by umbrella" footers on § 5.4.2 / § 5.4.3 / § 5.4.4 / § 5.4.6 / § 5.4.8
- Run: `pnpm canon:gen` — regenerates `packages/rules/src/canon-status.generated.ts`

- [ ] **Step 1: Edit the canon doc**

Open `docs/rules-canon.md` and find each of the following headers; replace the 🚧 with ✅ and replace the 🚧 deferral note immediately under each header with a brief closure note:

- `### 5.4 Other classes 🚧` → `### 5.4 Other classes ✅`
- `#### 5.4.1 Censor — Wrath 🚧` → `#### 5.4.1 Censor — Wrath ✅`
- `#### 5.4.5 Null — Discipline 🚧` → `#### 5.4.5 Null — Discipline ✅`
- `#### 5.4.7 Tactician — Focus 🚧` → `#### 5.4.7 Tactician — Focus ✅`

Under § 5.4's existing 🚧 deferral block, replace the multi-line "Engine deferred 2026-05-15..." callout with a closure note:

```markdown
> ✅ Engine closed YYYY-MM-DD (slice 2b). The three permissive stubs `isJudgedBy`, `isMarkedBy`, `hasActiveNullField` are reified via player-managed `Participant.targetingRelations` (per-row chip toggle + auto-set from `UseAbility` for `'censor-judgment-t1'` and `'tactician-mark-t1'`). Each per-class predicate now reads `source.targetingRelations[kind].includes(target.id)`. The previous "auto-apply gated by the umbrella § 5.4 🚧 flip" footers on the five individually-✅ sub-sections (5.4.2 Conduit / 5.4.3 Elementalist / 5.4.4 Fury / 5.4.6 Shadow / 5.4.8 Troubadour) have been removed. See [Pass 3 Slice 2b spec](superpowers/specs/2026-05-15-pass-3-slice-2b-targeting-relations-design.md).
```

Replace YYYY-MM-DD with today's date.

For § 5.4.1 / § 5.4.5 / § 5.4.7 individual sub-sections, replace each 🚧 deferral callout with a brief closure note that points to slice 2b's spec.

For § 5.4.2 / § 5.4.3 / § 5.4.4 / § 5.4.6 / § 5.4.8 individual sub-sections, find and delete the line `**Note:** auto-apply is currently gated by the umbrella § 5.4 🚧 flip; this sub-section will go live again when § 5.4 is restored.` (and adjacent phrasing variants).

- [ ] **Step 2: Regenerate canon-status**

Run: `pnpm canon:gen`
Expected: `packages/rules/src/canon-status.generated.ts` updates. Check the diff: `'heroic-resources-and-surges.other-classes'` flips from `'drafted'` to `'verified'`.

- [ ] **Step 3: Run all tests to verify no regressions from the canon-flip**

Several auto-apply paths gated on `requireCanon('heroic-resources-and-surges.other-classes')` will now run. If any test was passing because the gate was off, it may fail now. Run the full test suite:

```bash
pnpm test
```

Expected: PASS — green repo-wide. Investigate and fix any failures.

- [ ] **Step 4: Commit**

```bash
git add docs/rules-canon.md packages/rules/src/canon-status.generated.ts
git commit -m "docs(canon): flip § 5.4 + § 5.4.1/5.4.5/5.4.7 to ✅ (slice 2b closure)"
```

---

## Task 18: Slice 2a PS follow-up note

**Files:**
- Modify: `docs/superpowers/specs/2026-05-15-pass-3-slice-2a-class-delta-and-open-actions-design.md` — append a closure note to PS#7

- [ ] **Step 1: Edit PS#7**

Open the slice 2a spec and find the existing PS#7 entry (around line 660):

```markdown
7. **Permissive helper stubs for Slice 2b/2c follow-up:**
   - `isJudgedBy` (Censor) — TODO Slice 2b/2c — Judgment target tracking
   - `isMarkedBy` (Tactician) — TODO Slice 2b/2c — Mark target tracking
   - `hasActiveNullField` (Null) — TODO Slice 2b/2c — active-ability lookup
   - Until these land, the 3 affected triggers over-fire and the canon entries are flagged manual-override.
```

Append a closure paragraph immediately after:

```markdown

   **Closed by slice 2b** ([spec](2026-05-15-pass-3-slice-2b-targeting-relations-design.md), commit `<SHA>`). All three predicates now read from a player-managed `Participant.targetingRelations` tagged-map (auto-set from `UseAbility` for `'censor-judgment-t1'` and `'tactician-mark-t1'`). The over-fire bugs are gone; canon § 5.4 umbrella + § 5.4.1 / § 5.4.5 / § 5.4.7 flipped 🚧 → ✅.
```

Replace `<SHA>` with the canon-doc commit SHA from Task 17 (run `git log --oneline -1` to retrieve).

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-15-pass-3-slice-2a-class-delta-and-open-actions-design.md
git commit -m "docs(spec): slice 2a PS#7 closure note (slice 2b shipped)"
```

---

## Task 19: Full-repo verification

**Files:** none — verification only.

- [ ] **Step 1: Run the test suite**

```bash
pnpm test
```

Expected: PASS — green repo-wide. Slice 2a's 1,199 tests + slice 2b's new tests all green.

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS — no type errors.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Manual UI smoke**

```bash
pnpm dev
```

Open `http://localhost:5173`. Walk the integration scenario from Task 12 in the browser:

1. Start an encounter with a Censor PC + a goblin.
2. As the Censor's player, use Judgment on the goblin. Verify the persistent "Judging" card on the sheet shows the goblin's name.
3. Verify the goblin's row shows an inbound "Judged by <censor-name>" chip visible to all viewers.
4. Have the goblin attack the Censor → verify Wrath goes up by 1.
5. Use Judgment again on a different goblin → verify the first goblin is removed from the card and the new one added.
6. End the encounter → verify the card empties and the inbound chip disappears.

Repeat once for Tactician/Mark and once for Null/(manual chip toggle).

- [ ] **Step 5: Final commit (if any UI tweaks landed)**

```bash
git status
# If anything is uncommitted from the manual smoke, stage and commit it.
```

---

## Self-review checklist

Before merging:

- [ ] Every spec acceptance criterion (1-15) has at least one task that exercises it.
- [ ] The three predicate stubs are replaced and verified to NOT over-fire when relation is empty (Tasks 9 / 10 / 11 each have a regression test).
- [ ] `EndEncounter` clears all three relations for every participant (Task 5 test).
- [ ] `RemoveParticipant` strips dangling refs (Task 6 test).
- [ ] `UseAbility` auto-set works for both PHB ability ids with `mode: 'replace'` semantics (Task 8 tests).
- [ ] WS-mirror reflects `SetTargetingRelation` (Task 13).
- [ ] UI: card + outbound chip + inbound chip all present (Tasks 14 / 15 / 16).
- [ ] Canon doc + canon-status.generated reflect the flip (Task 17).
- [ ] Slice 2a PS#7 has a closure note with commit SHA (Task 18).
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` clean (Task 19).
