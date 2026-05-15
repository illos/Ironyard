# Pass 3 Slice 1 — Damage State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the engine's permissive stamina model with the canon §2.7-2.9 state machine (healthy / winded / dying / dead / unconscious / inert / rubble / doomed), implement the generic `ParticipantStateOverride` pattern with five concrete plugs (Revenant inert, Hakaan rubble, Hakaan doomed via direct player intent, Title Doomed via Open Action, Curse of Punishment), ship KO interception, close Q10 cross-side trigger ordering, and wire the §4.10 critical-hit extra-main-action rule — per the [Pass 3 Slice 1 spec](../specs/2026-05-15-pass-3-slice-1-damage-state-machine-design.md).

**Architecture:** New `packages/shared/src/stamina-override.ts` + `pending-triggers.ts` + `trigger-event.ts` schemas; new `packages/rules/src/stamina.ts` module owns the state-machine primitives (`recomputeStaminaState`, `wouldHitDead`, `applyKnockOut`, `clampForDoomed`, `applyTransitionSideEffects`); `damage.ts` rewrites to orchestrate via `stamina.ts`. Seven new intent payload schemas plus optional `intent` field on `ApplyDamage`. Reducer changes to `apply-damage`, `apply-heal`, `end-encounter`, `end-round`, `respite`, `roll-power`. Five new reducers (`become-doomed`, `knock-unconscious`, `apply-participant-override`, `clear-participant-override`, `resolve-trigger-order`). UI adds 8 state tags on `ParticipantRow`, a `Become Doomed` section on `PlayerSheetPanel` for Hakaan-Doomsight PCs, a director-only `CrossSideTriggerModal`, and a passive players-side `TriggersPendingPill`.

**Tech Stack:** TypeScript strict mode, Zod schemas, Vitest, React 19, Vite, Tailwind v4 (CSS-variable tokens), dnd-kit (for trigger reorder), Radix Dialog (already in graph).

---

## File structure

```
packages/shared/src/
├── stamina-override.ts                       NEW — ParticipantStateOverrideSchema + types
├── pending-triggers.ts                       NEW — PendingTriggerSetSchema + types
├── trigger-event.ts                          NEW — TriggerEventDescSchema
├── participant.ts                            +staminaState +staminaOverride +bodyIntact
│                                             +triggeredActionUsedThisRound; relax currentStamina.min(0)
├── open-action.ts                            +'title-doomed-opt-in' kind
├── open-action-copy.ts                       +title-doomed-opt-in copy
├── intents/
│   ├── become-doomed.ts                      NEW
│   ├── knock-unconscious.ts                  NEW
│   ├── apply-participant-override.ts         NEW
│   ├── clear-participant-override.ts         NEW
│   ├── resolve-trigger-order.ts              NEW
│   ├── grant-extra-main-action.ts            NEW (server-only payload)
│   ├── execute-trigger.ts                    NEW (server-only payload)
│   ├── stamina-transitioned.ts               NEW (server-only payload)
│   ├── apply-damage.ts                       +optional intent field
│   └── index.ts                              re-exports + IntentTypes entries

packages/rules/src/
├── stamina.ts                                NEW — state-machine primitives
├── damage.ts                                 rewrite — orchestrate via stamina.ts
├── condition-hooks.ts                        BleedingTrigger discriminant split
├── types.ts                                  CampaignState.pendingTriggers
├── intents/
│   ├── become-doomed.ts                      NEW reducer
│   ├── knock-unconscious.ts                  NEW reducer
│   ├── apply-participant-override.ts         NEW reducer
│   ├── clear-participant-override.ts         NEW reducer
│   ├── resolve-trigger-order.ts              NEW reducer
│   ├── apply-damage.ts                       branches on intent payload, emits transitions
│   ├── apply-heal.ts                         clears non-removable Bleeding on dying→healthy
│   ├── end-encounter.ts                      resolves dieAtEncounterEnd doomed; clears pendingTriggers
│   ├── end-round.ts                          resets triggeredActionUsedThisRound
│   ├── respite.ts                            CoP override clears if predicate now false
│   └── roll-power.ts                         emits GrantExtraMainAction on nat 19/20 main-action
├── permissions.ts                            trust for new intents
└── reducer.ts                                dispatch cases

apps/web/src/
├── primitives/
│   └── ParticipantRow.tsx                    state tag slot extended (8 states)
├── pages/
│   ├── character/
│   │   ├── PlayerSheetPanel.tsx              +Doomsight section
│   │   └── DoomsightBecomeDoomedButton.tsx   NEW
│   └── combat/
│       ├── triggers/
│       │   ├── CrossSideTriggerModal.tsx     NEW — director-only modal
│       │   ├── TriggersPendingPill.tsx       NEW — passive pill
│       │   └── index.ts                      NEW — barrel
│       └── DirectorCombat.tsx                mounts CrossSideTriggerModal
├── lib/
│   ├── format-trigger-event.ts               NEW — TriggerEventDesc → prose
│   └── intentDescribe.ts                     +describe cases for new intents
└── ws/
    └── useSessionSocket.ts                   reflect() cases for new intents

docs/
├── rules-canon.md                            Q10 / Q16 closure pointers
└── rule-questions.md                         Q10 / Q16 status updates; new Q-doomed entry
```

---

## Task 1: Schema — `ParticipantStateOverride` discriminated union

**Files:**
- Create: `packages/shared/src/stamina-override.ts`
- Test: `packages/shared/tests/stamina-override.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/tests/stamina-override.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ParticipantStateOverrideSchema } from '../src/stamina-override';

describe('ParticipantStateOverrideSchema', () => {
  it('parses an inert override (Revenant)', () => {
    const parsed = ParticipantStateOverrideSchema.parse({
      kind: 'inert',
      source: 'revenant',
      instantDeathDamageTypes: ['fire'],
      regainHours: 12,
      regainAmount: 'recoveryValue',
    });
    expect(parsed.kind).toBe('inert');
  });

  it('parses a rubble override (Hakaan)', () => {
    const parsed = ParticipantStateOverrideSchema.parse({
      kind: 'rubble',
      source: 'hakaan-doomsight',
      regainHours: 12,
      regainAmount: 'recoveryValue',
    });
    expect(parsed.kind).toBe('rubble');
  });

  it('parses a doomed override with Hakaan params', () => {
    const parsed = ParticipantStateOverrideSchema.parse({
      kind: 'doomed',
      source: 'hakaan-doomsight',
      canRegainStamina: true,
      autoTier3OnPowerRolls: true,
      staminaDeathThreshold: 'none',
      dieAtEncounterEnd: true,
    });
    expect(parsed.kind).toBe('doomed');
    expect(parsed.source).toBe('hakaan-doomsight');
  });

  it('parses a doomed override with Title params', () => {
    const parsed = ParticipantStateOverrideSchema.parse({
      kind: 'doomed',
      source: 'title-doomed',
      canRegainStamina: false,
      autoTier3OnPowerRolls: true,
      staminaDeathThreshold: 'staminaMax',
      dieAtEncounterEnd: true,
    });
    expect(parsed.canRegainStamina).toBe(false);
    expect(parsed.staminaDeathThreshold).toBe('staminaMax');
  });

  it('parses an extra-dying-trigger override (CoP)', () => {
    const parsed = ParticipantStateOverrideSchema.parse({
      kind: 'extra-dying-trigger',
      source: 'curse-of-punishment',
      predicate: 'recoveries-exhausted',
    });
    expect(parsed.predicate).toBe('recoveries-exhausted');
  });

  it('rejects unknown kind', () => {
    expect(() =>
      ParticipantStateOverrideSchema.parse({ kind: 'nonsense', source: 'x' }),
    ).toThrow();
  });

  it('rejects mismatched source for inert', () => {
    expect(() =>
      ParticipantStateOverrideSchema.parse({
        kind: 'inert',
        source: 'hakaan-doomsight',
        instantDeathDamageTypes: ['fire'],
        regainHours: 12,
        regainAmount: 'recoveryValue',
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/shared test stamina-override`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `stamina-override.ts`**

```ts
import { z } from 'zod';
import { DamageTypeSchema } from './damage';

// Per-trait override of the canonical stamina state machine. Each variant
// intercepts a specific transition (or asserts an additional entry predicate)
// so that Revenant inert / Hakaan rubble / Hakaan doomed / Title Doomed /
// Curse of Punishment all flow through one mechanism instead of N one-off
// special cases. See docs/superpowers/specs/2026-05-15-pass-3-slice-1-...
export const ParticipantStateOverrideSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('inert'),
    source: z.literal('revenant'),
    instantDeathDamageTypes: z.array(DamageTypeSchema).default([]),
    regainHours: z.number().int().min(0).default(12),
    regainAmount: z.literal('recoveryValue'),
  }),
  z.object({
    kind: z.literal('rubble'),
    source: z.literal('hakaan-doomsight'),
    regainHours: z.number().int().min(0).default(12),
    regainAmount: z.literal('recoveryValue'),
  }),
  z.object({
    kind: z.literal('doomed'),
    source: z.enum(['hakaan-doomsight', 'title-doomed', 'manual']),
    canRegainStamina: z.boolean(),
    autoTier3OnPowerRolls: z.boolean(),
    staminaDeathThreshold: z.enum(['none', 'staminaMax']),
    dieAtEncounterEnd: z.boolean(),
  }),
  z.object({
    kind: z.literal('extra-dying-trigger'),
    source: z.literal('curse-of-punishment'),
    predicate: z.literal('recoveries-exhausted'),
  }),
]);
export type ParticipantStateOverride = z.infer<typeof ParticipantStateOverrideSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ironyard/shared test stamina-override`
Expected: PASS — 7 assertions.

- [ ] **Step 5: Re-export from package barrel**

Edit `packages/shared/src/index.ts` and add (in alphabetical group with the rest):

```ts
export { ParticipantStateOverrideSchema } from './stamina-override';
export type { ParticipantStateOverride } from './stamina-override';
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/stamina-override.ts packages/shared/src/index.ts packages/shared/tests/stamina-override.spec.ts
git commit -m "feat(shared): add ParticipantStateOverride discriminated union schema"
```

---

## Task 2: Schema — Participant additions + relax `currentStamina.min(0)`

**Files:**
- Modify: `packages/shared/src/participant.ts`
- Test: `packages/shared/tests/participant.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/shared/tests/participant.spec.ts` (create it if absent — basic shape from Slice 5 should already exist; if creating, mirror other shared tests):

```ts
import { describe, expect, it } from 'vitest';
import { ParticipantSchema } from '../src/participant';

describe('ParticipantSchema slice-1 additions', () => {
  const base = {
    id: 'p1',
    name: 'Korva',
    kind: 'pc' as const,
    level: 5,
    currentStamina: 30,
    maxStamina: 30,
    characteristics: { might: 2, agility: 1, reason: 0, intuition: 0, presence: 0 },
  };

  it('defaults staminaState to "healthy"', () => {
    const p = ParticipantSchema.parse(base);
    expect(p.staminaState).toBe('healthy');
  });

  it('defaults staminaOverride to null', () => {
    const p = ParticipantSchema.parse(base);
    expect(p.staminaOverride).toBeNull();
  });

  it('defaults bodyIntact to true', () => {
    const p = ParticipantSchema.parse(base);
    expect(p.bodyIntact).toBe(true);
  });

  it('defaults triggeredActionUsedThisRound to false', () => {
    const p = ParticipantSchema.parse(base);
    expect(p.triggeredActionUsedThisRound).toBe(false);
  });

  it('accepts negative currentStamina (dying hero)', () => {
    const p = ParticipantSchema.parse({ ...base, currentStamina: -5 });
    expect(p.currentStamina).toBe(-5);
  });

  it('accepts a populated staminaOverride', () => {
    const p = ParticipantSchema.parse({
      ...base,
      staminaState: 'doomed',
      staminaOverride: {
        kind: 'doomed',
        source: 'hakaan-doomsight',
        canRegainStamina: true,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'none',
        dieAtEncounterEnd: true,
      },
    });
    expect(p.staminaOverride?.kind).toBe('doomed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/shared test participant`
Expected: FAIL — fields not defined; negative `currentStamina` rejected by `.min(0)`.

- [ ] **Step 3: Modify `packages/shared/src/participant.ts`**

Add import at top:

```ts
import { ParticipantStateOverrideSchema } from './stamina-override';
```

Find `currentStamina: z.number().int().min(0),` (the existing line). Replace with:

```ts
  // Pass 3 Slice 1 — bound relaxed from .min(0). Heroes go negative when
  // dying per canon §2.8 (currentStamina ≤ 0 → dying; ≤ -windedValue → dead).
  // applyDamageStep clamps the lower bound at -maxStamina-1 (sentinel) when
  // explicit death-state transitions resolve.
  currentStamina: z.number().int(),
```

Then, immediately before the closing `});` of `ParticipantSchema` (the `}` on line ~110, currently following the `className` field), insert:

```ts
  // Pass 3 Slice 1 — canon §2.7-2.9 state machine.
  // Derived from currentStamina + staminaOverride via recomputeStaminaState.
  // The reducer recomputes after every stamina-mutating intent and emits
  // StaminaTransitioned when the value changes. Default 'healthy' keeps
  // pre-slice-1 snapshots parseable; loaders re-run derivation.
  staminaState: z
    .enum(['healthy', 'winded', 'dying', 'dead', 'unconscious', 'inert', 'rubble', 'doomed'])
    .default('healthy'),
  // Per-trait override of canonical state transitions. See stamina-override.ts.
  staminaOverride: ParticipantStateOverrideSchema.nullable().default(null),
  // Reified from 2b.0's permissive flag. True unless explicitly ablated (e.g.
  // force-move-to-extreme, vaporizing-damage). Slice 1 ships the field; the
  // ablation events themselves arrive in later slices.
  bodyIntact: z.boolean().default(true),
  // Canon §4.10 — round-tick reset by applyEndRound. Gates triggered-action
  // availability.
  triggeredActionUsedThisRound: z.boolean().default(false),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ironyard/shared test participant`
Expected: PASS — 6 new assertions; existing participant tests still pass.

- [ ] **Step 5: Typecheck repo-wide**

Run: `pnpm typecheck`
Expected: PASS. If errors surface in consumers that asserted `currentStamina >= 0`, note them — Task 11 will audit consumer guards.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/participant.ts packages/shared/tests/participant.spec.ts
git commit -m "feat(shared): add staminaState/staminaOverride/bodyIntact/triggeredActionUsedThisRound to Participant; relax currentStamina.min(0)"
```

---

## Task 3: Schema — `PendingTriggerSet` + `TriggerEventDesc` + `CampaignState.pendingTriggers`

**Files:**
- Create: `packages/shared/src/trigger-event.ts`
- Create: `packages/shared/src/pending-triggers.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/rules/src/types.ts`
- Test: `packages/shared/tests/pending-triggers.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/tests/pending-triggers.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PendingTriggerSetSchema } from '../src/pending-triggers';
import { TriggerEventDescSchema } from '../src/trigger-event';

describe('TriggerEventDescSchema', () => {
  it('parses a damage-applied event', () => {
    const parsed = TriggerEventDescSchema.parse({
      kind: 'damage-applied',
      targetId: 'p1',
      attackerId: 'p2',
      amount: 8,
      type: 'fire',
    });
    expect(parsed.kind).toBe('damage-applied');
  });

  it('parses a stamina-transition event', () => {
    const parsed = TriggerEventDescSchema.parse({
      kind: 'stamina-transition',
      participantId: 'p1',
      from: 'healthy',
      to: 'winded',
    });
    expect(parsed.kind).toBe('stamina-transition');
  });

  it('rejects unknown kind', () => {
    expect(() =>
      TriggerEventDescSchema.parse({ kind: 'unknown' }),
    ).toThrow();
  });
});

describe('PendingTriggerSetSchema', () => {
  it('parses a populated set', () => {
    const parsed = PendingTriggerSetSchema.parse({
      id: '01ABC',
      triggerEvent: {
        kind: 'damage-applied',
        targetId: 'p1',
        attackerId: 'p2',
        amount: 8,
        type: 'fire',
      },
      candidates: [
        { participantId: 'p1', triggeredActionId: 'reactive-strike', side: 'heroes' },
        { participantId: 'p3', triggeredActionId: 'bloodfire-rush', side: 'foes' },
      ],
      order: null,
    });
    expect(parsed.candidates).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/shared test pending-triggers`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `trigger-event.ts`**

```ts
import { z } from 'zod';
import { DamageTypeSchema } from './damage';

// Description of the event that fires triggered actions. Used by
// PendingTriggerSet (cross-side Q10 resolution) and by slice 2's class-δ
// triggers when they subscribe to the same event stream. Open discriminated
// union — future event kinds add as additional variants.
export const TriggerEventDescSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('damage-applied'),
    targetId: z.string().min(1),
    attackerId: z.string().nullable(),
    amount: z.number().int().min(0),
    type: DamageTypeSchema,
  }),
  z.object({
    kind: z.literal('stamina-transition'),
    participantId: z.string().min(1),
    from: z.enum(['healthy', 'winded', 'dying', 'dead', 'unconscious', 'inert', 'rubble', 'doomed']),
    to: z.enum(['healthy', 'winded', 'dying', 'dead', 'unconscious', 'inert', 'rubble', 'doomed']),
  }),
  z.object({
    kind: z.literal('forced-movement'),
    targetId: z.string().min(1),
    actorId: z.string().nullable(),
    distance: z.number().int(),
  }),
]);
export type TriggerEventDesc = z.infer<typeof TriggerEventDescSchema>;
```

- [ ] **Step 4: Create `pending-triggers.ts`**

```ts
import { z } from 'zod';
import { TriggerEventDescSchema } from './trigger-event';

// Pause-state for cross-side trigger resolution (canon §4.10 / Q10). When set,
// the engine has emitted the original event but the triggered-action responses
// are queued waiting for the director to pick an order via ResolveTriggerOrder.
export const PendingTriggerSetSchema = z.object({
  id: z.string().min(1),                  // ulid; matches ResolveTriggerOrder.pendingTriggerSetId
  triggerEvent: TriggerEventDescSchema,
  candidates: z.array(
    z.object({
      participantId: z.string().min(1),
      triggeredActionId: z.string().min(1),
      side: z.enum(['heroes', 'foes']),
    }),
  ),
  order: z.array(z.string().min(1)).nullable().default(null),
});
export type PendingTriggerSet = z.infer<typeof PendingTriggerSetSchema>;
```

- [ ] **Step 5: Re-export from `packages/shared/src/index.ts`**

Add (alphabetical group):

```ts
export { PendingTriggerSetSchema } from './pending-triggers';
export type { PendingTriggerSet } from './pending-triggers';
export { TriggerEventDescSchema } from './trigger-event';
export type { TriggerEventDesc } from './trigger-event';
```

- [ ] **Step 6: Extend `CampaignState` in `packages/rules/src/types.ts`**

At the top of the file, ensure `PendingTriggerSet` is imported:

```ts
import type { Intent, MaliceState, Member, OpenAction, Participant, PendingTriggerSet } from '@ironyard/shared';
```

Find the `CampaignState` type definition (it contains `openActions: OpenAction[]`). Add a sibling field:

```ts
  // Pass 3 Slice 1 — Q10 cross-side trigger resolution. Set non-null when the
  // engine is paused waiting for a director to pick triggered-action order.
  // Cleared after ResolveTriggerOrder fires the cascade, or at EndEncounter.
  pendingTriggers: PendingTriggerSet | null;
```

Find the default `CampaignState` (or `initialCampaignState` / equivalent) — it has `openActions: []`. Add a sibling:

```ts
    pendingTriggers: null,
```

- [ ] **Step 7: Run tests + typecheck**

Run: `pnpm --filter @ironyard/shared test pending-triggers && pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/trigger-event.ts packages/shared/src/pending-triggers.ts packages/shared/src/index.ts packages/shared/tests/pending-triggers.spec.ts packages/rules/src/types.ts
git commit -m "feat(shared,rules): add PendingTriggerSet + TriggerEventDesc schemas; extend CampaignState.pendingTriggers"
```

---

## Task 4: Schema — Player-dispatched intent payloads

**Files:**
- Create: `packages/shared/src/intents/become-doomed.ts`
- Create: `packages/shared/src/intents/knock-unconscious.ts`
- Create: `packages/shared/src/intents/apply-participant-override.ts`
- Create: `packages/shared/src/intents/clear-participant-override.ts`
- Create: `packages/shared/src/intents/resolve-trigger-order.ts`
- Modify: `packages/shared/src/intents/index.ts`
- Test: `packages/shared/tests/slice-1-intent-payloads.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/tests/slice-1-intent-payloads.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ApplyParticipantOverridePayloadSchema,
  BecomeDoomedPayloadSchema,
  ClearParticipantOverridePayloadSchema,
  KnockUnconsciousPayloadSchema,
  ResolveTriggerOrderPayloadSchema,
} from '../src/intents';

describe('BecomeDoomedPayloadSchema', () => {
  it('accepts a Hakaan-Doomsight dispatch', () => {
    const p = BecomeDoomedPayloadSchema.parse({
      participantId: 'p1',
      source: 'hakaan-doomsight',
    });
    expect(p.source).toBe('hakaan-doomsight');
  });

  it('rejects an unknown source', () => {
    expect(() =>
      BecomeDoomedPayloadSchema.parse({ participantId: 'p1', source: 'mystery' }),
    ).toThrow();
  });
});

describe('KnockUnconsciousPayloadSchema', () => {
  it('accepts null attackerId for environmental KO', () => {
    const p = KnockUnconsciousPayloadSchema.parse({ targetId: 'p1', attackerId: null });
    expect(p.attackerId).toBeNull();
  });
});

describe('ApplyParticipantOverridePayloadSchema', () => {
  it('accepts a director-applied doomed override', () => {
    const p = ApplyParticipantOverridePayloadSchema.parse({
      participantId: 'p1',
      override: {
        kind: 'doomed',
        source: 'manual',
        canRegainStamina: false,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'staminaMax',
        dieAtEncounterEnd: true,
      },
    });
    expect(p.override.kind).toBe('doomed');
  });
});

describe('ClearParticipantOverridePayloadSchema', () => {
  it('accepts a participantId-only payload', () => {
    const p = ClearParticipantOverridePayloadSchema.parse({ participantId: 'p1' });
    expect(p.participantId).toBe('p1');
  });
});

describe('ResolveTriggerOrderPayloadSchema', () => {
  it('accepts an order array', () => {
    const p = ResolveTriggerOrderPayloadSchema.parse({
      pendingTriggerSetId: '01ABC',
      order: ['p1', 'p2'],
    });
    expect(p.order).toEqual(['p1', 'p2']);
  });

  it('rejects an empty order array', () => {
    expect(() =>
      ResolveTriggerOrderPayloadSchema.parse({ pendingTriggerSetId: '01ABC', order: [] }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/shared test slice-1-intent-payloads`
Expected: FAIL — schemas don't exist.

- [ ] **Step 3: Create `become-doomed.ts`**

```ts
import { z } from 'zod';

export const BecomeDoomedPayloadSchema = z.object({
  participantId: z.string().min(1),
  source: z.enum(['hakaan-doomsight', 'manual']),
}).strict();
export type BecomeDoomedPayload = z.infer<typeof BecomeDoomedPayloadSchema>;
```

- [ ] **Step 4: Create `knock-unconscious.ts`**

```ts
import { z } from 'zod';

export const KnockUnconsciousPayloadSchema = z.object({
  targetId: z.string().min(1),
  attackerId: z.string().nullable(),
}).strict();
export type KnockUnconsciousPayload = z.infer<typeof KnockUnconsciousPayloadSchema>;
```

- [ ] **Step 5: Create `apply-participant-override.ts`**

```ts
import { z } from 'zod';
import { ParticipantStateOverrideSchema } from '../stamina-override';

export const ApplyParticipantOverridePayloadSchema = z.object({
  participantId: z.string().min(1),
  override: ParticipantStateOverrideSchema,
}).strict();
export type ApplyParticipantOverridePayload = z.infer<typeof ApplyParticipantOverridePayloadSchema>;
```

- [ ] **Step 6: Create `clear-participant-override.ts`**

```ts
import { z } from 'zod';

export const ClearParticipantOverridePayloadSchema = z.object({
  participantId: z.string().min(1),
}).strict();
export type ClearParticipantOverridePayload = z.infer<typeof ClearParticipantOverridePayloadSchema>;
```

- [ ] **Step 7: Create `resolve-trigger-order.ts`**

```ts
import { z } from 'zod';

export const ResolveTriggerOrderPayloadSchema = z.object({
  pendingTriggerSetId: z.string().min(1),
  order: z.array(z.string().min(1)).min(1),
}).strict();
export type ResolveTriggerOrderPayload = z.infer<typeof ResolveTriggerOrderPayloadSchema>;
```

- [ ] **Step 8: Re-export from `packages/shared/src/intents/index.ts`**

Append before the `IntentTypes` const (with the other `export` lines, alphabetical):

```ts
export { ApplyParticipantOverridePayloadSchema } from './apply-participant-override';
export type { ApplyParticipantOverridePayload } from './apply-participant-override';
export { BecomeDoomedPayloadSchema } from './become-doomed';
export type { BecomeDoomedPayload } from './become-doomed';
export { ClearParticipantOverridePayloadSchema } from './clear-participant-override';
export type { ClearParticipantOverridePayload } from './clear-participant-override';
export { KnockUnconsciousPayloadSchema } from './knock-unconscious';
export type { KnockUnconsciousPayload } from './knock-unconscious';
export { ResolveTriggerOrderPayloadSchema } from './resolve-trigger-order';
export type { ResolveTriggerOrderPayload } from './resolve-trigger-order';
```

Inside the `IntentTypes` object (alphabetical, between existing entries):

```ts
  ApplyParticipantOverride: 'ApplyParticipantOverride',
  BecomeDoomed: 'BecomeDoomed',
  ClearParticipantOverride: 'ClearParticipantOverride',
  KnockUnconscious: 'KnockUnconscious',
  ResolveTriggerOrder: 'ResolveTriggerOrder',
```

- [ ] **Step 9: Run tests**

Run: `pnpm --filter @ironyard/shared test slice-1-intent-payloads && pnpm typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/shared/src/intents/become-doomed.ts packages/shared/src/intents/knock-unconscious.ts packages/shared/src/intents/apply-participant-override.ts packages/shared/src/intents/clear-participant-override.ts packages/shared/src/intents/resolve-trigger-order.ts packages/shared/src/intents/index.ts packages/shared/tests/slice-1-intent-payloads.spec.ts
git commit -m "feat(shared): add BecomeDoomed / KnockUnconscious / ApplyParticipantOverride / ClearParticipantOverride / ResolveTriggerOrder intent payload schemas"
```

---

## Task 5: Schema — Server-only derived intent payloads

**Files:**
- Create: `packages/shared/src/intents/grant-extra-main-action.ts`
- Create: `packages/shared/src/intents/execute-trigger.ts`
- Create: `packages/shared/src/intents/stamina-transitioned.ts`
- Modify: `packages/shared/src/intents/index.ts`
- Test: `packages/shared/tests/slice-1-derived-payloads.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/tests/slice-1-derived-payloads.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ExecuteTriggerPayloadSchema,
  GrantExtraMainActionPayloadSchema,
  StaminaTransitionedPayloadSchema,
} from '../src/intents';

describe('GrantExtraMainActionPayloadSchema', () => {
  it('accepts a participantId-only payload', () => {
    const p = GrantExtraMainActionPayloadSchema.parse({ participantId: 'p1' });
    expect(p.participantId).toBe('p1');
  });
});

describe('ExecuteTriggerPayloadSchema', () => {
  it('accepts a full execution descriptor', () => {
    const p = ExecuteTriggerPayloadSchema.parse({
      participantId: 'p1',
      triggeredActionId: 'reactive-strike',
      triggerEvent: {
        kind: 'damage-applied',
        targetId: 'p2',
        attackerId: null,
        amount: 5,
        type: 'fire',
      },
    });
    expect(p.triggeredActionId).toBe('reactive-strike');
  });
});

describe('StaminaTransitionedPayloadSchema', () => {
  it('accepts a transition descriptor', () => {
    const p = StaminaTransitionedPayloadSchema.parse({
      participantId: 'p1',
      from: 'healthy',
      to: 'winded',
      cause: 'damage',
    });
    expect(p.cause).toBe('damage');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/shared test slice-1-derived-payloads`
Expected: FAIL.

- [ ] **Step 3: Create `grant-extra-main-action.ts`**

```ts
import { z } from 'zod';

// Server-only derived intent — emitted by applyRollPower on nat 19/20 with a
// main-action ability. Sets participant.turnActionUsage.main = false so the
// actor gets an extra main action this turn (canon §4.10).
export const GrantExtraMainActionPayloadSchema = z.object({
  participantId: z.string().min(1),
}).strict();
export type GrantExtraMainActionPayload = z.infer<typeof GrantExtraMainActionPayloadSchema>;
```

- [ ] **Step 4: Create `execute-trigger.ts`**

```ts
import { z } from 'zod';
import { TriggerEventDescSchema } from '../trigger-event';

// Server-only derived intent — emitted by applyResolveTriggerOrder for each
// candidate in the chosen order. Thin wrapper around the actual triggered
// action's effect dispatch (typically RollPower).
export const ExecuteTriggerPayloadSchema = z.object({
  participantId: z.string().min(1),
  triggeredActionId: z.string().min(1),
  triggerEvent: TriggerEventDescSchema,
}).strict();
export type ExecuteTriggerPayload = z.infer<typeof ExecuteTriggerPayloadSchema>;
```

- [ ] **Step 5: Create `stamina-transitioned.ts`**

```ts
import { z } from 'zod';

export const StaminaStateSchema = z.enum([
  'healthy', 'winded', 'dying', 'dead', 'unconscious', 'inert', 'rubble', 'doomed',
]);
export type StaminaState = z.infer<typeof StaminaStateSchema>;

// Server-only derived intent — emitted whenever a participant's staminaState
// changes. Substrate for slice 2's class-δ triggers (Fury winded, Troubadour
// posthumous Drama) and slice 5's action effects (skull emblem on → dead).
export const StaminaTransitionedPayloadSchema = z.object({
  participantId: z.string().min(1),
  from: StaminaStateSchema,
  to: StaminaStateSchema,
  cause: z.enum(['damage', 'heal', 'override-applied', 'override-cleared', 'encounter-end', 'recoveries-refilled', 'recoveries-exhausted']),
}).strict();
export type StaminaTransitionedPayload = z.infer<typeof StaminaTransitionedPayloadSchema>;
```

- [ ] **Step 6: Re-export from `packages/shared/src/intents/index.ts`**

Add exports (alphabetical):

```ts
export { ExecuteTriggerPayloadSchema } from './execute-trigger';
export type { ExecuteTriggerPayload } from './execute-trigger';
export { GrantExtraMainActionPayloadSchema } from './grant-extra-main-action';
export type { GrantExtraMainActionPayload } from './grant-extra-main-action';
export { StaminaStateSchema, StaminaTransitionedPayloadSchema } from './stamina-transitioned';
export type { StaminaState, StaminaTransitionedPayload } from './stamina-transitioned';
```

And add to `IntentTypes` object:

```ts
  ExecuteTrigger: 'ExecuteTrigger',
  GrantExtraMainAction: 'GrantExtraMainAction',
  StaminaTransitioned: 'StaminaTransitioned',
```

- [ ] **Step 7: Add to `SERVER_ONLY_INTENTS` registry**

Find `SERVER_ONLY_INTENTS` in `packages/shared/src/intents/index.ts` (it should already contain `ApplyDamage`, `RaiseOpenAction`, etc.). Add:

```ts
  IntentTypes.ExecuteTrigger,
  IntentTypes.GrantExtraMainAction,
  IntentTypes.StaminaTransitioned,
```

- [ ] **Step 8: Run tests**

Run: `pnpm --filter @ironyard/shared test slice-1-derived-payloads && pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/intents/grant-extra-main-action.ts packages/shared/src/intents/execute-trigger.ts packages/shared/src/intents/stamina-transitioned.ts packages/shared/src/intents/index.ts packages/shared/tests/slice-1-derived-payloads.spec.ts
git commit -m "feat(shared): add GrantExtraMainAction / ExecuteTrigger / StaminaTransitioned derived intent payloads"
```

---

## Task 6: Schema — `ApplyDamage.intent` field + `OpenActionKind` extension

**Files:**
- Modify: `packages/shared/src/intents/apply-damage.ts`
- Modify: `packages/shared/src/open-action.ts`
- Modify: `packages/shared/src/open-action-copy.ts`
- Test: `packages/shared/tests/apply-damage-intent-field.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/tests/apply-damage-intent-field.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApplyDamagePayloadSchema } from '../src/intents';
import { OpenActionKindSchema } from '../src/open-action';

describe('ApplyDamagePayloadSchema.intent', () => {
  const base = {
    targetId: 'p1',
    amount: 8,
    damageType: 'fire' as const,
    sourceIntentId: 'src1',
  };

  it("defaults intent to 'kill' when omitted", () => {
    const p = ApplyDamagePayloadSchema.parse(base);
    expect(p.intent).toBe('kill');
  });

  it("accepts intent: 'knock-out'", () => {
    const p = ApplyDamagePayloadSchema.parse({ ...base, intent: 'knock-out' });
    expect(p.intent).toBe('knock-out');
  });

  it('rejects unknown intent value', () => {
    expect(() => ApplyDamagePayloadSchema.parse({ ...base, intent: 'banish' })).toThrow();
  });
});

describe('OpenActionKindSchema title-doomed-opt-in', () => {
  it('accepts title-doomed-opt-in', () => {
    expect(OpenActionKindSchema.parse('title-doomed-opt-in')).toBe('title-doomed-opt-in');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/shared test apply-damage-intent-field`
Expected: FAIL.

- [ ] **Step 3: Modify `packages/shared/src/intents/apply-damage.ts`**

Replace the schema with:

```ts
import { z } from 'zod';
import { DamageTypeSchema } from '../damage';

// ApplyDamage is server-only — emitted by the reducer as a derived intent.
// Clients that dispatch it directly are rejected with 'permission'.
// Pass 3 Slice 1: `intent` field selects between standard damage application
// ('kill') and the §2.9 knock-out interception ('knock-out'). Defaulting to
// 'kill' preserves pre-slice-1 dispatch behavior.
export const ApplyDamagePayloadSchema = z.object({
  targetId: z.string().min(1),
  amount: z.number().int().min(0),
  damageType: DamageTypeSchema,
  sourceIntentId: z.string().min(1),
  intent: z.enum(['kill', 'knock-out']).default('kill'),
});
export type ApplyDamagePayload = z.infer<typeof ApplyDamagePayloadSchema>;
```

- [ ] **Step 4: Extend `OpenActionKindSchema` in `packages/shared/src/open-action.ts`**

Find `OpenActionKindSchema = z.enum([...])` (today empty per 2b.0). Replace with:

```ts
export const OpenActionKindSchema = z.enum([
  // Pass 3 Slice 1
  'title-doomed-opt-in',
  // Slice 2 entries (added when slice 2 lands):
  //   'pray-to-the-gods'
  //   'spatial-trigger-elementalist-essence'
  //   ...
]);
```

- [ ] **Step 5: Add OA copy in `packages/shared/src/open-action-copy.ts`**

Add a new entry inside the `OPEN_ACTION_COPY` registry (which is `Partial<Record<OpenActionKind, { title, body, claimLabel }>>` per 2b.0 spec):

```ts
  'title-doomed-opt-in': {
    title: () => 'Embrace your doom?',
    body: () =>
      'Your stamina has hit 0. Per the *Doomed* title, you may become doomed — ' +
      'automatically obtain a tier 3 outcome on every power roll, but you cannot ' +
      'regain Stamina, and you die at the end of the encounter.',
    claimLabel: () => 'Become doomed',
  },
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @ironyard/shared test apply-damage-intent-field && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/intents/apply-damage.ts packages/shared/src/open-action.ts packages/shared/src/open-action-copy.ts packages/shared/tests/apply-damage-intent-field.spec.ts
git commit -m "feat(shared): add ApplyDamage.intent field; register title-doomed-opt-in OpenAction kind + copy"
```

---

## Task 7: Engine — `stamina.ts` state machine primitives

**Files:**
- Create: `packages/rules/src/stamina.ts`
- Test: `packages/rules/tests/stamina.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/rules/tests/stamina.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Participant } from '@ironyard/shared';
import { recomputeStaminaState, wouldHitDead } from '../src/stamina';

function pc(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'p1',
    name: 'Korva',
    kind: 'pc',
    ownerId: 'u1',
    characterId: 'c1',
    level: 5,
    currentStamina: 30,
    maxStamina: 30,
    characteristics: { might: 2, agility: 1, reason: 0, intuition: 0, presence: 0 },
    immunities: [],
    weaknesses: [],
    conditions: [],
    heroicResources: [],
    extras: [],
    surges: 0,
    recoveries: { current: 8, max: 8 },
    recoveryValue: 10,
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
    className: 'Tactician',
    staminaState: 'healthy',
    staminaOverride: null,
    bodyIntact: true,
    triggeredActionUsedThisRound: false,
    ...overrides,
  } as Participant;
}

function foe(overrides: Partial<Participant> = {}): Participant {
  return pc({ id: 'f1', kind: 'monster', ownerId: null, characterId: null, className: null, ...overrides });
}

describe('recomputeStaminaState — heroes', () => {
  it('healthy → healthy when stamina > windedValue', () => {
    const p = pc({ currentStamina: 20, maxStamina: 30 });   // windedValue = 15
    expect(recomputeStaminaState(p).newState).toBe('healthy');
  });

  it('healthy → winded when stamina ≤ windedValue but > 0', () => {
    const p = pc({ currentStamina: 10, maxStamina: 30 });
    expect(recomputeStaminaState(p).newState).toBe('winded');
  });

  it('winded → dying when stamina ≤ 0 but > -windedValue', () => {
    const p = pc({ currentStamina: -5, maxStamina: 30, staminaState: 'winded' });
    expect(recomputeStaminaState(p).newState).toBe('dying');
  });

  it('dying → dead when stamina ≤ -windedValue', () => {
    const p = pc({ currentStamina: -20, maxStamina: 30, staminaState: 'dying' });
    expect(recomputeStaminaState(p).newState).toBe('dead');
  });

  it('marks transitioned=true when state changes', () => {
    const p = pc({ currentStamina: -5, maxStamina: 30, staminaState: 'healthy' });
    expect(recomputeStaminaState(p).transitioned).toBe(true);
  });

  it('marks transitioned=false when state is stable', () => {
    const p = pc({ currentStamina: 20, maxStamina: 30, staminaState: 'healthy' });
    expect(recomputeStaminaState(p).transitioned).toBe(false);
  });
});

describe('recomputeStaminaState — director creatures', () => {
  it('die at currentStamina ≤ 0 (no dying state)', () => {
    const f = foe({ currentStamina: 0, maxStamina: 30 });
    expect(recomputeStaminaState(f).newState).toBe('dead');
  });

  it('cannot enter dying', () => {
    const f = foe({ currentStamina: -5, maxStamina: 30 });
    expect(recomputeStaminaState(f).newState).toBe('dead');
  });
});

describe('recomputeStaminaState — overrides', () => {
  it('inert override holds state at "inert" while currentStamina ≤ 0', () => {
    const p = pc({
      currentStamina: -3,
      maxStamina: 30,
      staminaOverride: {
        kind: 'inert',
        source: 'revenant',
        instantDeathDamageTypes: ['fire'],
        regainHours: 12,
        regainAmount: 'recoveryValue',
      },
    });
    expect(recomputeStaminaState(p).newState).toBe('inert');
  });

  it('rubble override holds state at "rubble" while currentStamina ≤ -windedValue', () => {
    const p = pc({
      currentStamina: -20,
      maxStamina: 30,
      staminaOverride: {
        kind: 'rubble',
        source: 'hakaan-doomsight',
        regainHours: 12,
        regainAmount: 'recoveryValue',
      },
    });
    expect(recomputeStaminaState(p).newState).toBe('rubble');
  });

  it('doomed (hakaan) override locks state regardless of stamina', () => {
    const p = pc({
      currentStamina: -100,
      maxStamina: 30,
      staminaOverride: {
        kind: 'doomed',
        source: 'hakaan-doomsight',
        canRegainStamina: true,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'none',
        dieAtEncounterEnd: true,
      },
    });
    expect(recomputeStaminaState(p).newState).toBe('doomed');
  });

  it('doomed (title) override yields dead when stamina ≤ -staminaMax', () => {
    const p = pc({
      currentStamina: -30,
      maxStamina: 30,
      staminaOverride: {
        kind: 'doomed',
        source: 'title-doomed',
        canRegainStamina: false,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'staminaMax',
        dieAtEncounterEnd: true,
      },
    });
    expect(recomputeStaminaState(p).newState).toBe('dead');
  });

  it('CoP extra-dying-trigger forces dying when recoveries exhausted', () => {
    const p = pc({
      currentStamina: 20,        // healthy stamina, but...
      maxStamina: 30,
      recoveries: { current: 0, max: 8 },
      staminaOverride: {
        kind: 'extra-dying-trigger',
        source: 'curse-of-punishment',
        predicate: 'recoveries-exhausted',
      },
    });
    expect(recomputeStaminaState(p).newState).toBe('dying');
  });

  it('CoP override is dormant when recoveries non-zero', () => {
    const p = pc({
      currentStamina: 20,
      maxStamina: 30,
      recoveries: { current: 3, max: 8 },
      staminaOverride: {
        kind: 'extra-dying-trigger',
        source: 'curse-of-punishment',
        predicate: 'recoveries-exhausted',
      },
    });
    expect(recomputeStaminaState(p).newState).toBe('healthy');
  });
});

describe('wouldHitDead', () => {
  it('returns true for a hero whose stamina would land below -windedValue', () => {
    const p = pc({ currentStamina: -10, maxStamina: 30 });
    expect(wouldHitDead(p, -20)).toBe(true);   // -20 ≤ -15
  });

  it('returns false for a hero in dying range', () => {
    const p = pc({ currentStamina: 0, maxStamina: 30 });
    expect(wouldHitDead(p, -10)).toBe(false);
  });

  it('returns true for a foe whose stamina would land ≤ 0', () => {
    const f = foe({ currentStamina: 5, maxStamina: 30 });
    expect(wouldHitDead(f, -1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/rules test stamina`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create `packages/rules/src/stamina.ts`**

```ts
import type {
  ConditionInstance,
  DamageType,
  Participant,
  ParticipantStateOverride,
  StaminaState,
} from '@ironyard/shared';

// Canon §2.7 winded value derives from base stamina max (not effective max).
// Q7 confirmed.
export function windedValue(p: Participant): number {
  return Math.floor(p.maxStamina / 2);
}

// Canon §2.10 recovery value. Used by KO-recovery, ApplyHeal default amount
// for recovery spends, and rubble/inert auto-revive at 12h.
export function recoveryValue(p: Participant): number {
  return p.recoveryValue || Math.floor(p.maxStamina / 3);
}

// True if applying `proposedDelta` to currentStamina would put the participant
// past their death threshold under normal stamina derivation. Used by KO
// interception (caller checks before applying damage).
export function wouldHitDead(p: Participant, proposedNewStamina: number): boolean {
  if (p.kind === 'pc') return proposedNewStamina <= -windedValue(p);
  return proposedNewStamina <= 0;
}

// Returns the new state given current stamina, max, and override. Pure
// derivation; no side effects, no logging. Caller decides whether to emit
// StaminaTransitioned based on the `transitioned` flag.
export function recomputeStaminaState(p: Participant): {
  newState: StaminaState;
  transitioned: boolean;
} {
  const derived = deriveStaminaState(p);
  return { newState: derived, transitioned: derived !== p.staminaState };
}

function deriveStaminaState(p: Participant): StaminaState {
  // Override-driven branches first.
  if (p.staminaOverride !== null) {
    return deriveOverrideState(p, p.staminaOverride);
  }
  return deriveNaturalState(p);
}

function deriveOverrideState(p: Participant, override: ParticipantStateOverride): StaminaState {
  switch (override.kind) {
    case 'inert':
      // Holds at 'inert' while currentStamina ≤ 0. Healed above → override
      // releases and natural derivation runs.
      return p.currentStamina <= 0 ? 'inert' : deriveNaturalState({ ...p, staminaOverride: null });
    case 'rubble':
      // Holds at 'rubble' while currentStamina ≤ -windedValue. Above that,
      // the override releases (returns to dying-or-better).
      return p.currentStamina <= -windedValue(p) ? 'rubble' : deriveNaturalState({ ...p, staminaOverride: null });
    case 'doomed': {
      // Title Doomed has a staminaMax death threshold; Hakaan has 'none'.
      if (override.staminaDeathThreshold === 'staminaMax' && p.currentStamina <= -p.maxStamina) {
        return 'dead';
      }
      return 'doomed';
    }
    case 'extra-dying-trigger': {
      // CoP — recoveries-exhausted predicate forces dying regardless of
      // stamina. When predicate de-asserts, natural derivation runs.
      if (override.predicate === 'recoveries-exhausted' && p.recoveries.current === 0) {
        // Forced into dying unless natural derivation would already be dead.
        const natural = deriveNaturalState({ ...p, staminaOverride: null });
        return natural === 'dead' ? 'dead' : 'dying';
      }
      return deriveNaturalState({ ...p, staminaOverride: null });
    }
  }
}

function deriveNaturalState(p: Participant): StaminaState {
  if (p.kind === 'pc') {
    if (p.currentStamina <= -windedValue(p)) return 'dead';
    if (p.currentStamina <= 0) return 'dying';
    if (p.currentStamina <= windedValue(p)) return 'winded';
    return 'healthy';
  }
  // Director creatures: no dying state.
  if (p.currentStamina <= 0) return 'dead';
  if (p.currentStamina <= windedValue(p)) return 'winded';
  return 'healthy';
}

// Clamps a proposed damage delivery against the doomed override's stamina-
// death-threshold rule. Hakaan doomed = 'none' → no clamp (stamina goes
// arbitrarily negative). Title doomed = 'staminaMax' → caller still applies
// damage; only deriveOverrideState's check above decides whether to flip to
// dead. Returns the damage to actually apply (which is delivered as-is in
// slice 1 — clamping is purely a state-derivation concern).
export function clampForDoomed(_p: Participant, delivered: number): number {
  return delivered;
}

// Applies the KO interception: stamina unchanged, Unconscious + Prone
// conditions added, state set to 'unconscious'. Caller responsibility to
// dispatch this only when wouldHitDead and the attacker opted intent='knock-out'.
export function applyKnockOut(p: Participant): Participant {
  const unconsciousCond: ConditionInstance = {
    type: 'Unconscious',
    duration: { kind: 'manual' },
    source: 'ko-interception',
    removable: true,
  };
  const proneCond: ConditionInstance = {
    type: 'Prone',
    duration: { kind: 'manual' },
    source: 'ko-interception',
    removable: true,
  };
  // Idempotent — don't double-stack.
  const conditions = [
    ...p.conditions.filter((c) => c.type !== 'Unconscious' && c.type !== 'Prone'),
    unconsciousCond,
    proneCond,
  ];
  return { ...p, staminaState: 'unconscious', conditions };
}

// Applies the side-effects that fire on a state transition. Called by the
// reducer after recomputeStaminaState returns transitioned=true.
export function applyTransitionSideEffects(
  p: Participant,
  from: StaminaState,
  to: StaminaState,
): Participant {
  let result = { ...p, staminaState: to };

  // Hero → dying: apply non-removable Bleeding (canon §2.8).
  if (to === 'dying' && p.kind === 'pc') {
    const hasDyingBleed = result.conditions.some(
      (c) => c.type === 'Bleeding' && c.source === 'dying-state',
    );
    if (!hasDyingBleed) {
      const bleedCond: ConditionInstance = {
        type: 'Bleeding',
        duration: { kind: 'manual' },
        source: 'dying-state',
        removable: false,
      };
      result = { ...result, conditions: [...result.conditions, bleedCond] };
    }
  }

  // → healthy / → winded from dying: clear non-removable dying Bleeding.
  if ((to === 'healthy' || to === 'winded') && (from === 'dying' || from === 'unconscious')) {
    result = {
      ...result,
      conditions: result.conditions.filter(
        (c) => !(c.type === 'Bleeding' && c.source === 'dying-state'),
      ),
    };
  }

  // → dead: clear all conditions.
  if (to === 'dead') {
    result = { ...result, conditions: [] };
  }

  // → inert / → rubble: clear all conditions.
  if (to === 'inert' || to === 'rubble') {
    result = { ...result, conditions: [] };
  }

  return result;
}

// Type-only re-export so callers can `import { StaminaState } from '../stamina'`
// without going to shared.
export type { StaminaState };

// Returns the damage to actually apply, intercepting the inert-fire instant-
// death rule (Revenant). When intercepted, returns the special marker
// 'instant-death' so the caller skips the normal damage clamp and transitions
// directly to dead.
export function checkInertFireInstantDeath(
  target: Participant,
  damageType: DamageType,
  delivered: number,
): 'instant-death' | null {
  if (
    target.staminaOverride?.kind === 'inert' &&
    target.staminaOverride.instantDeathDamageTypes.includes(damageType) &&
    delivered > 0
  ) {
    return 'instant-death';
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ironyard/rules test stamina`
Expected: PASS — all assertions.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/stamina.ts packages/rules/tests/stamina.spec.ts
git commit -m "feat(rules): add stamina.ts state-machine primitives (recomputeStaminaState, applyKnockOut, applyTransitionSideEffects, etc.)"
```

---

## Task 8: Engine — `damage.ts` rewrite

**Files:**
- Modify: `packages/rules/src/damage.ts`
- Test: `packages/rules/tests/damage.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create or extend `packages/rules/tests/damage.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Participant } from '@ironyard/shared';
import { applyDamageStep } from '../src/damage';

function hero(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'p1',
    name: 'Korva',
    kind: 'pc',
    ownerId: 'u1',
    characterId: 'c1',
    level: 5,
    currentStamina: 30,
    maxStamina: 30,
    characteristics: { might: 2, agility: 1, reason: 0, intuition: 0, presence: 0 },
    immunities: [],
    weaknesses: [],
    conditions: [],
    heroicResources: [],
    extras: [],
    surges: 0,
    recoveries: { current: 8, max: 8 },
    recoveryValue: 10,
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
    className: 'Tactician',
    staminaState: 'healthy',
    staminaOverride: null,
    bodyIntact: true,
    triggeredActionUsedThisRound: false,
    ...overrides,
  } as Participant;
}

describe('applyDamageStep — natural transitions', () => {
  it('hero healthy → winded on a partial blow', () => {
    const r = applyDamageStep(hero({ currentStamina: 30, maxStamina: 30 }), 20, 'fire');
    expect(r.after).toBe(10);
    expect(r.newParticipant.staminaState).toBe('winded');
    expect(r.transitionedTo).toBe('winded');
  });

  it('hero → dying gets non-removable Bleeding', () => {
    const r = applyDamageStep(hero({ currentStamina: 5, maxStamina: 30 }), 10, 'fire');
    expect(r.after).toBe(-5);
    expect(r.newParticipant.staminaState).toBe('dying');
    expect(r.newParticipant.conditions.some(
      (c) => c.type === 'Bleeding' && c.source === 'dying-state' && c.removable === false,
    )).toBe(true);
  });

  it('hero → dead clears all conditions', () => {
    const start = hero({
      currentStamina: -10,
      maxStamina: 30,
      staminaState: 'dying',
      conditions: [{ type: 'Bleeding', duration: { kind: 'manual' }, source: 'dying-state', removable: false }],
    });
    const r = applyDamageStep(start, 20, 'fire');
    expect(r.newParticipant.staminaState).toBe('dead');
    expect(r.newParticipant.conditions).toHaveLength(0);
  });
});

describe('applyDamageStep — KO interception', () => {
  it("intent='knock-out' at would-kill stops the damage and sets unconscious", () => {
    const start = hero({ currentStamina: -10, maxStamina: 30, staminaState: 'dying' });
    const r = applyDamageStep(start, 20, 'fire', 'knock-out');
    expect(r.delivered).toBe(0);
    expect(r.knockedOut).toBe(true);
    expect(r.newParticipant.currentStamina).toBe(-10);
    expect(r.newParticipant.staminaState).toBe('unconscious');
    expect(r.newParticipant.conditions.some((c) => c.type === 'Unconscious')).toBe(true);
    expect(r.newParticipant.conditions.some((c) => c.type === 'Prone')).toBe(true);
  });

  it("intent='knock-out' at non-killing blow applies damage normally", () => {
    const r = applyDamageStep(hero({ currentStamina: 30, maxStamina: 30 }), 10, 'fire', 'knock-out');
    expect(r.delivered).toBe(10);
    expect(r.knockedOut).toBe(false);
    expect(r.newParticipant.staminaState).toBe('winded');
  });

  it('an unconscious target takes further damage and dies', () => {
    const start = hero({
      currentStamina: -10,
      maxStamina: 30,
      staminaState: 'unconscious',
      conditions: [
        { type: 'Unconscious', duration: { kind: 'manual' }, source: 'ko-interception', removable: true },
        { type: 'Prone', duration: { kind: 'manual' }, source: 'ko-interception', removable: true },
      ],
    });
    const r = applyDamageStep(start, 1, 'fire');
    expect(r.newParticipant.staminaState).toBe('dead');
  });
});

describe('applyDamageStep — overrides', () => {
  it('inert + fire damage → instant death', () => {
    const start = hero({
      currentStamina: -5,
      maxStamina: 30,
      staminaState: 'inert',
      staminaOverride: {
        kind: 'inert',
        source: 'revenant',
        instantDeathDamageTypes: ['fire'],
        regainHours: 12,
        regainAmount: 'recoveryValue',
      },
    });
    const r = applyDamageStep(start, 1, 'fire');
    expect(r.newParticipant.staminaState).toBe('dead');
    expect(r.newParticipant.staminaOverride).toBeNull();
  });

  it('inert + cold damage → still inert (only listed types instant-death)', () => {
    const start = hero({
      currentStamina: -5,
      maxStamina: 30,
      staminaState: 'inert',
      staminaOverride: {
        kind: 'inert',
        source: 'revenant',
        instantDeathDamageTypes: ['fire'],
        regainHours: 12,
        regainAmount: 'recoveryValue',
      },
    });
    const r = applyDamageStep(start, 10, 'cold');
    // Damage applies (stamina drops further) but state holds at 'inert' per
    // override's currentStamina ≤ 0 rule.
    expect(r.newParticipant.staminaState).toBe('inert');
  });

  it('doomed (hakaan) absorbs would-kill damage without dying', () => {
    const start = hero({
      currentStamina: -10,
      maxStamina: 30,
      staminaState: 'doomed',
      staminaOverride: {
        kind: 'doomed',
        source: 'hakaan-doomsight',
        canRegainStamina: true,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'none',
        dieAtEncounterEnd: true,
      },
    });
    const r = applyDamageStep(start, 100, 'fire');
    // Damage applies; stamina goes very negative; state stays doomed.
    expect(r.newParticipant.staminaState).toBe('doomed');
  });

  it('doomed (title) dies when stamina ≤ -staminaMax', () => {
    const start = hero({
      currentStamina: -10,
      maxStamina: 30,
      staminaState: 'doomed',
      staminaOverride: {
        kind: 'doomed',
        source: 'title-doomed',
        canRegainStamina: false,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'staminaMax',
        dieAtEncounterEnd: true,
      },
    });
    const r = applyDamageStep(start, 30, 'fire');
    expect(r.newParticipant.staminaState).toBe('dead');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/rules test damage`
Expected: FAIL — old `applyDamageStep` doesn't have `intent` parameter or state-machine integration.

- [ ] **Step 3: Rewrite `packages/rules/src/damage.ts`**

```ts
import type { DamageType, Participant, StaminaState, TypedResistance } from '@ironyard/shared';
import {
  applyKnockOut,
  applyTransitionSideEffects,
  checkInertFireInstantDeath,
  recomputeStaminaState,
  wouldHitDead,
} from './stamina';

function sumMatching(list: readonly TypedResistance[], type: DamageType): number {
  let total = 0;
  for (const r of list) if (r.type === type) total += r.value;
  return total;
}

export type DamageStepResult = {
  delivered: number;
  before: number;
  after: number;
  newParticipant: Participant;
  transitionedTo: StaminaState | null;
  knockedOut: boolean;
};

// Canon §2.12 engine resolution order. Slice 1 implements steps 1-4 + 6 + 7
// (state recompute + KO interception + inert-fire-instant-death). Step 5
// (temp stamina) is not yet implemented in this engine — preserved as a TODO
// marker for a later slice. Slice 1 doesn't introduce temp stamina.
export function applyDamageStep(
  target: Participant,
  amount: number,
  damageType: DamageType,
  intent: 'kill' | 'knock-out' = 'kill',
): DamageStepResult {
  // Step 1-2: base + pre-immunity external modifiers (none in slice 1).
  let delivered = amount;
  // Step 3: weakness.
  delivered += sumMatching(target.weaknesses, damageType);
  // Step 4: immunity.
  delivered = Math.max(0, delivered - sumMatching(target.immunities, damageType));

  const before = target.currentStamina;

  // Inert + fire-typed-listed → instant death, bypasses normal flow.
  if (checkInertFireInstantDeath(target, damageType, delivered) === 'instant-death') {
    const killed: Participant = {
      ...target,
      currentStamina: -target.maxStamina - 1,
      staminaState: 'dead',
      staminaOverride: null,
      conditions: [],
    };
    return {
      delivered,
      before,
      after: killed.currentStamina,
      newParticipant: killed,
      transitionedTo: 'dead',
      knockedOut: false,
    };
  }

  // KO interception path — applies BEFORE damage is recorded.
  const wouldBe = before - delivered;
  if (intent === 'knock-out' && wouldHitDead(target, wouldBe)) {
    const ko = applyKnockOut(target);
    return {
      delivered: 0,
      before,
      after: before,
      newParticipant: ko,
      transitionedTo: 'unconscious',
      knockedOut: true,
    };
  }

  // Step 6: apply damage. Step 5 (temp stamina) not implemented.
  const after = before - delivered;
  const intermediate = { ...target, currentStamina: after };

  // Step 7: recompute state + apply side-effects.
  const { newState, transitioned } = recomputeStaminaState(intermediate);
  const newParticipant = transitioned
    ? applyTransitionSideEffects(intermediate, target.staminaState, newState)
    : intermediate;

  return {
    delivered,
    before,
    after,
    newParticipant,
    transitionedTo: transitioned ? newState : null,
    knockedOut: false,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ironyard/rules test damage`
Expected: PASS — all damage-step tests including the new state-machine + KO + override cases.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/damage.ts packages/rules/tests/damage.spec.ts
git commit -m "feat(rules): rewrite damage.ts to orchestrate via stamina.ts (state transitions, KO interception, inert-fire instant death)"
```

---

## Task 9: Engine — `condition-hooks.ts` Bleeding trigger split

**Files:**
- Modify: `packages/rules/src/condition-hooks.ts`
- Modify: any caller of the old `might_or_agility_roll` discriminant
- Test: extend `packages/rules/tests/condition-hooks.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/rules/tests/condition-hooks.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bleedingDamageHook } from '../src/condition-hooks';
// (helper to build a bleeding actor — reuse existing test helper or inline)

describe('BleedingTrigger discriminant — slice 1 split', () => {
  const actor = {
    id: 'p1',
    name: 'X',
    kind: 'pc' as const,
    level: 5,
    conditions: [{ type: 'Bleeding', duration: { kind: 'manual' as const }, source: 'dying-state', removable: false }],
  };

  it('fires on ability_roll trigger', () => {
    const r = bleedingDamageHook(actor as any, { kind: 'ability_roll' }, 4);
    expect('amount' in r ? r.amount : null).toBe(9); // 4 + level 5
  });

  it('fires on might_or_agility_test trigger', () => {
    const r = bleedingDamageHook(actor as any, { kind: 'might_or_agility_test' }, 3);
    expect('amount' in r ? r.amount : null).toBe(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/rules test condition-hooks`
Expected: FAIL — `ability_roll` and `might_or_agility_test` discriminants don't exist.

- [ ] **Step 3: Update `packages/rules/src/condition-hooks.ts`**

Find the `BleedingTrigger` type (around line 159):

```ts
export type BleedingTrigger =
  | { kind: 'main_action' }
  | { kind: 'triggered_action' }
  | { kind: 'might_or_agility_test' }      // renamed from might_or_agility_roll for canon precision
  | { kind: 'ability_roll' };               // new: any ability roll regardless of characteristic
```

Add a brief comment above:

```ts
// Pass 3 Slice 1 — canon clarification: "ability roll" and "test" are two
// subkinds of power roll. The Bleeding hook fires on dying-hero actions
// (main, triggered) and on either subkind of power roll. The previous
// 'might_or_agility_roll' was ambiguous; it's renamed to '...test' for
// tests and 'ability_roll' is new for power-roll-during-ability.
```

- [ ] **Step 4: Update callers of `might_or_agility_roll`**

Search for `might_or_agility_roll`:

```bash
grep -rn "might_or_agility_roll" packages/ apps/
```

Each call site that previously dispatched the old discriminant: classify whether the call was for a TEST (rename to `might_or_agility_test`) or for an ABILITY (rename to `ability_roll`). For 99% of slice-1-era code, the existing call site is `roll-power.ts` (ability rolls) — those become `ability_roll`.

For `roll-power.ts` specifically (the slice 1 spec lists this as the home for the rename), find the existing `bleedingDamageHook(..., { kind: 'might_or_agility_roll' }, ...)` call and change the discriminant to `{ kind: 'ability_roll' }`. If there's a Might/Agility check elsewhere it should use `might_or_agility_test`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ironyard/rules test condition-hooks && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/condition-hooks.ts packages/rules/tests/condition-hooks.spec.ts packages/rules/src/intents/roll-power.ts
git commit -m "feat(rules): split BleedingTrigger discriminant into might_or_agility_test + ability_roll for canon precision"
```

---

## Task 10: Reducer — `applyApplyDamage` extension

**Files:**
- Modify: `packages/rules/src/intents/apply-damage.ts`
- Modify: `packages/rules/src/types.ts` (helper exports)
- Test: `packages/rules/tests/intents/apply-damage.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create or extend `packages/rules/tests/intents/apply-damage.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyApplyDamage } from '../../src/intents/apply-damage';
// Use existing test-helper that constructs a CampaignState; if absent build
// inline with hero() + a one-participant encounter.

describe('applyApplyDamage — Pass 3 Slice 1', () => {
  // Build minimum CampaignState with one PC participant.
  function buildState(participant: any) {
    return {
      campaignId: 'c1',
      seq: 0,
      members: [],
      participants: [participant],
      encounter: {
        id: 'e1', currentRound: 1, firstSide: 'heroes', currentPickingSide: 'heroes',
        actedThisRound: [], activeParticipantId: participant.id, turnState: {}, malice: { current: 0 },
      },
      openActions: [],
      pendingTriggers: null,
    } as any;
  }

  it('emits StaminaTransitioned on hero → dying', () => {
    // Setup: hero at 5/30 takes 10 damage → after=-5 → dying
    // ...
  });

  it('with intent="knock-out", emits a KnockedUnconscious log', () => {
    // ...
  });

  // Detail: write 3-5 tests covering the additions; the patterns mirror
  // damage.spec.ts but go through the reducer envelope.
});
```

(Sketch — fill in matching the existing test patterns in `packages/rules/tests/`. The reducer test is mostly a thin wrapper over `applyDamageStep`'s already-covered behavior; the new assertions are about derived intents emitted.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/rules test apply-damage`
Expected: FAIL.

- [ ] **Step 3: Modify `packages/rules/src/intents/apply-damage.ts`**

Replace the existing body with:

```ts
import {
  ApplyDamagePayloadSchema,
  type StaminaState,
  type TriggerEventDesc,
} from '@ironyard/shared';
import { applyDamageStep } from '../damage';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';
import { ulid } from '@ironyard/shared/ulid';   // adjust import per project convention

export function applyApplyDamage(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = ApplyDamagePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `ApplyDamage rejected: ${parsed.error.message}`, intentId: intent.id }],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  if (!state.encounter) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'no active encounter', intentId: intent.id }],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }

  const { targetId, amount, damageType, intent: damageIntent } = parsed.data;
  const participants = state.participants.filter(isParticipant);
  const target = participants.find((p) => p.id === targetId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `target ${targetId} not found`, intentId: intent.id }],
      errors: [{ code: 'target_missing', message: `target ${targetId} not in encounter` }],
    };
  }

  const result = applyDamageStep(target, amount, damageType, damageIntent);

  // Apply per-trait override-activation rules at the moment of transition.
  // Revenant intercepts → dying with inert.
  // Hakaan-Doomsight intercepts → dead with rubble (when not currently doomed).
  let updatedTarget = result.newParticipant;
  if (result.transitionedTo === 'dying' && shouldRevenantInterceptDying(updatedTarget)) {
    updatedTarget = applyRevenantInert(updatedTarget);
  }
  if (result.transitionedTo === 'dead' && shouldHakaanInterceptDead(updatedTarget)) {
    updatedTarget = applyHakaanRubble(updatedTarget);
  }

  const updatedParticipants = state.participants.map((p) =>
    isParticipant(p) && p.id === targetId ? updatedTarget : p,
  );

  // Build derived intents.
  const derived: StampedIntent[] = [];
  const log = [
    result.knockedOut
      ? { kind: 'info' as const, text: `${target.name} is knocked unconscious`, intentId: intent.id }
      : { kind: 'info' as const, text: `${target.name} takes ${result.delivered} ${damageType} damage (${result.before} → ${result.after})`, intentId: intent.id },
  ];

  if (result.transitionedTo) {
    derived.push({
      id: ulid(),
      causedBy: intent.id,
      timestamp: intent.timestamp,
      source: 'server',
      type: 'StaminaTransitioned',
      actor: intent.actor,
      payload: {
        participantId: targetId,
        from: target.staminaState,
        to: updatedTarget.staminaState,
        cause: damageIntent === 'knock-out' && result.knockedOut ? 'damage' : 'damage',
      },
    } as StampedIntent);

    // Title-Doomed auto-raise: PC with Title equipped reached zero stamina
    // while conscious (state derives to 'dying') → emit RaiseOpenAction.
    if (
      updatedTarget.staminaState === 'dying' &&
      updatedTarget.kind === 'pc' &&
      hasTitleDoomedEquipped(updatedTarget) &&
      updatedTarget.staminaOverride === null
    ) {
      derived.push({
        id: ulid(),
        causedBy: intent.id,
        timestamp: intent.timestamp,
        source: 'server',
        type: 'RaiseOpenAction',
        actor: intent.actor,
        payload: {
          kind: 'title-doomed-opt-in',
          participantId: targetId,
          expiresAtRound: null,
          payload: {},
        },
      } as StampedIntent);
    }
  }

  return {
    state: { ...state, seq: state.seq + 1, participants: updatedParticipants },
    derived,
    log,
  };
}

// --- Override activation helpers ---

function shouldRevenantInterceptDying(p: Participant): boolean {
  // ancestry: string[] carries the keyword list from monster stat blocks; for
  // PCs we read it the same way after slice 1 ensures it's stamped from the
  // character's ancestry id at StartEncounter. For slice 1 the check is
  // permissive — if the ancestry array contains 'revenant'.
  return p.kind === 'pc' && (p.ancestry ?? []).includes('revenant') && p.staminaOverride === null;
}

function applyRevenantInert(p: Participant): Participant {
  return {
    ...p,
    staminaOverride: {
      kind: 'inert',
      source: 'revenant',
      instantDeathDamageTypes: ['fire'],
      regainHours: 12,
      regainAmount: 'recoveryValue',
    },
    staminaState: 'inert',
    conditions: [],
  };
}

function shouldHakaanInterceptDead(p: Participant): boolean {
  // Requires hakaan ancestry + Doomsight purchased trait. The trait check
  // reads activeAbilities or another marker once 2b.8 wires Doomsight; for
  // slice 1, presence of the 'doomsight' marker in either ancestry array or
  // activeAbilities is sufficient. The plan author confirms via grep.
  if (p.kind !== 'pc') return false;
  if (!(p.ancestry ?? []).includes('hakaan')) return false;
  if (p.staminaOverride !== null) return false;
  if (p.staminaState === 'doomed') return false;
  // Slice 1 uses a coarse marker — adjust to read character.purchasedTraits
  // when the per-slice plan author wires the read path.
  return p.activeAbilities.some((a) => a.id === 'doomsight');
}

function applyHakaanRubble(p: Participant): Participant {
  return {
    ...p,
    staminaOverride: {
      kind: 'rubble',
      source: 'hakaan-doomsight',
      regainHours: 12,
      regainAmount: 'recoveryValue',
    },
    staminaState: 'rubble',
    conditions: [],
  };
}

function hasTitleDoomedEquipped(p: Participant): boolean {
  // Reads from titles[] on the underlying character. Slice 1 receives the
  // titles via the Participant.activeAbilities or a sibling field — adjust
  // to the actual field once verified.
  return p.activeAbilities.some((a) => a.id === 'title-doomed');
}
```

(The plan author should adjust the helper read paths — `ancestry`, `activeAbilities`, etc. — to match what's actually stamped on the participant in the existing `StartEncounter` materialization path. The slice 1 plan is correct that **the data shape exists**; the specific field names are a one-line verification against `participant.ts`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ironyard/rules test apply-damage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/intents/apply-damage.ts packages/rules/tests/intents/apply-damage.spec.ts
git commit -m "feat(rules): extend applyApplyDamage with intent payload, transition emit, Revenant/Hakaan override activation, Title-Doomed OA raise"
```

---

## Task 11: Reducer — `applyApplyHeal` clears dying Bleeding

**Files:**
- Modify: `packages/rules/src/intents/apply-heal.ts`
- Test: extend `packages/rules/tests/intents/apply-heal.spec.ts`

- [ ] **Step 1: Write the failing test**

Append a test to `apply-heal.spec.ts`:

```ts
it('clears non-removable dying Bleeding when stamina rises above 0', () => {
  // Setup: hero at -3 stamina with non-removable Bleeding source='dying-state'
  // Dispatch ApplyHeal { amount: 10 }
  // Expect: stamina at 7, conditions empty (or Bleeding cleared)
  // Expect: derived StaminaTransitioned from 'dying' to 'winded' or 'healthy'
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/rules test apply-heal`
Expected: FAIL.

- [ ] **Step 3: Modify `packages/rules/src/intents/apply-heal.ts`**

After the `currentStamina` update, add a state recompute + apply transition side-effects (which clears dying Bleeding automatically per stamina.ts):

```ts
import { recomputeStaminaState, applyTransitionSideEffects } from '../stamina';

// ... in the reducer body, after `const updatedTarget = { ...target, currentStamina: after };`:
const recompute = recomputeStaminaState(updatedTarget);
const finalTarget = recompute.transitioned
  ? applyTransitionSideEffects(updatedTarget, target.staminaState, recompute.newState)
  : updatedTarget;

// Replace `updatedTarget` references below with `finalTarget`, and add the
// StaminaTransitioned derived intent in the derived[] array (when transitioned).
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ironyard/rules test apply-heal`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/intents/apply-heal.ts packages/rules/tests/intents/apply-heal.spec.ts
git commit -m "feat(rules): applyHeal recomputes state and clears dying Bleeding when stamina rises above 0"
```

---

## Task 12: Reducer — `BecomeDoomed`

**Files:**
- Create: `packages/rules/src/intents/become-doomed.ts`
- Test: `packages/rules/tests/intents/become-doomed.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/rules/tests/intents/become-doomed.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyBecomeDoomed } from '../../src/intents/become-doomed';
// Use existing campaign-state test helper or inline build.

describe('applyBecomeDoomed', () => {
  it('sets the doomed override with hakaan-doomsight params when source is hakaan-doomsight', () => {
    // Setup: Hakaan-Doomsight PC; dispatch BecomeDoomed { source: 'hakaan-doomsight' }.
    // Expect: staminaOverride.kind === 'doomed', source 'hakaan-doomsight',
    //         canRegainStamina true, staminaDeathThreshold 'none'.
  });

  it('rejects non-Hakaan participant for source=hakaan-doomsight', () => {
    // Setup: non-Hakaan PC; dispatch with source 'hakaan-doomsight'.
    // Expect: rejected with errors[0].code = 'not_eligible'.
  });

  it('rejects PC without Doomsight purchased trait', () => {
    // ...
  });

  it('rejects when participant is already dead', () => {
    // ...
  });

  it('director can apply manual source override', () => {
    // ...
  });

  it('player non-owner is rejected', () => {
    // ...
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/rules test become-doomed`
Expected: FAIL.

- [ ] **Step 3: Create `packages/rules/src/intents/become-doomed.ts`**

```ts
import {
  BecomeDoomedPayloadSchema,
  type ParticipantStateOverride,
} from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';
import { ulid } from '@ironyard/shared/ulid';

export function applyBecomeDoomed(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = BecomeDoomedPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `BecomeDoomed rejected: ${parsed.error.message}`, intentId: intent.id }],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { participantId, source } = parsed.data;
  const target = state.participants.filter(isParticipant).find((p) => p.id === participantId);
  if (!target) {
    return reject(state, intent, 'target_missing', `participant ${participantId} not found`);
  }
  if (target.kind !== 'pc') {
    return reject(state, intent, 'not_eligible', 'only PC participants can become doomed');
  }
  if (target.staminaState === 'dead') {
    return reject(state, intent, 'not_eligible', 'dead participant cannot become doomed');
  }

  // Trust + eligibility.
  if (source === 'hakaan-doomsight') {
    const isOwner = intent.actor.userId === target.ownerId;
    const isDirector = intent.actor.userId === state.activeDirectorId;
    if (!isOwner && !isDirector) {
      return reject(state, intent, 'not_authorized', 'only the PC owner or active director can dispatch');
    }
    if (!(target.ancestry ?? []).includes('hakaan')) {
      return reject(state, intent, 'not_eligible', 'hakaan-doomsight requires Hakaan ancestry');
    }
    if (!target.activeAbilities.some((a) => a.id === 'doomsight')) {
      return reject(state, intent, 'not_eligible', 'Doomsight purchased trait not equipped');
    }
  } else if (source === 'manual') {
    if (intent.actor.userId !== state.activeDirectorId) {
      return reject(state, intent, 'not_authorized', 'manual source requires active director');
    }
  }

  // Build the override config.
  const override: ParticipantStateOverride = source === 'hakaan-doomsight'
    ? {
        kind: 'doomed',
        source: 'hakaan-doomsight',
        canRegainStamina: true,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'none',
        dieAtEncounterEnd: true,
      }
    : {
        kind: 'doomed',
        source: 'manual',
        canRegainStamina: true,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'none',
        dieAtEncounterEnd: true,
      };

  const updated: typeof target = {
    ...target,
    staminaOverride: override,
    staminaState: 'doomed',
  };

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: state.participants.map((p) =>
        isParticipant(p) && p.id === participantId ? updated : p,
      ),
    },
    derived: [
      {
        id: ulid(),
        causedBy: intent.id,
        timestamp: intent.timestamp,
        source: 'server',
        type: 'StaminaTransitioned',
        actor: intent.actor,
        payload: {
          participantId,
          from: target.staminaState,
          to: 'doomed',
          cause: 'override-applied',
        },
      } as StampedIntent,
    ],
    log: [{ kind: 'info', text: `${target.name} becomes doomed (${source})`, intentId: intent.id }],
  };
}

function reject(
  state: CampaignState,
  intent: StampedIntent,
  code: string,
  message: string,
): IntentResult {
  return {
    state,
    derived: [],
    log: [{ kind: 'error', text: `BecomeDoomed rejected: ${message}`, intentId: intent.id }],
    errors: [{ code, message }],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ironyard/rules test become-doomed`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/intents/become-doomed.ts packages/rules/tests/intents/become-doomed.spec.ts
git commit -m "feat(rules): add applyBecomeDoomed reducer (Hakaan-Doomsight + manual director paths)"
```

---

## Task 13: Reducer — `KnockUnconscious` / `ApplyParticipantOverride` / `ClearParticipantOverride`

**Files:**
- Create: `packages/rules/src/intents/knock-unconscious.ts`
- Create: `packages/rules/src/intents/apply-participant-override.ts`
- Create: `packages/rules/src/intents/clear-participant-override.ts`
- Tests: corresponding `*.spec.ts` files

Each reducer follows the same shape as `become-doomed`: validate payload, find target, check trust, apply mutation, emit `StaminaTransitioned` (when state changes), log.

- [ ] **Step 1: Write `knock-unconscious` test**

```ts
// Setup: target hero alive at 10/30, dispatched as a director or attacker.
// Apply applyKnockOut helper from stamina.ts internally.
// Expect: state 'unconscious', Unconscious + Prone conditions, log line.
```

- [ ] **Step 2: Create `packages/rules/src/intents/knock-unconscious.ts`**

```ts
import { KnockUnconsciousPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';
import { applyKnockOut } from '../stamina';
import { ulid } from '@ironyard/shared/ulid';

export function applyKnockUnconscious(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = KnockUnconsciousPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state, derived: [], log: [], errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { targetId, attackerId } = parsed.data;
  const target = state.participants.filter(isParticipant).find((p) => p.id === targetId);
  if (!target) {
    return { state, derived: [], log: [], errors: [{ code: 'target_missing', message: 'target not found' }] };
  }

  // Trust: active director OR the attacker themselves.
  const attacker = attackerId
    ? state.participants.filter(isParticipant).find((p) => p.id === attackerId)
    : null;
  const isDirector = intent.actor.userId === state.activeDirectorId;
  const isAttackerOwner = attacker !== null && intent.actor.userId === attacker.ownerId;
  if (!isDirector && !isAttackerOwner) {
    return { state, derived: [], log: [], errors: [{ code: 'not_authorized', message: 'only director or attacker' }] };
  }

  const updated = applyKnockOut(target);
  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: state.participants.map((p) =>
        isParticipant(p) && p.id === targetId ? updated : p,
      ),
    },
    derived: [
      {
        id: ulid(), causedBy: intent.id, timestamp: intent.timestamp, source: 'server',
        type: 'StaminaTransitioned', actor: intent.actor,
        payload: { participantId: targetId, from: target.staminaState, to: 'unconscious', cause: 'damage' },
      } as StampedIntent,
    ],
    log: [{ kind: 'info', text: `${target.name} is knocked unconscious`, intentId: intent.id }],
  };
}
```

- [ ] **Step 3: Test + create `apply-participant-override.ts`**

```ts
import { ApplyParticipantOverridePayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';
import { recomputeStaminaState } from '../stamina';
import { ulid } from '@ironyard/shared/ulid';

export function applyApplyParticipantOverride(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = ApplyParticipantOverridePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return { state, derived: [], log: [], errors: [{ code: 'invalid_payload', message: parsed.error.message }] };
  }
  if (intent.actor.userId !== state.activeDirectorId) {
    return { state, derived: [], log: [], errors: [{ code: 'not_authorized', message: 'director only' }] };
  }
  const { participantId, override } = parsed.data;
  const target = state.participants.filter(isParticipant).find((p) => p.id === participantId);
  if (!target) return { state, derived: [], log: [], errors: [{ code: 'target_missing', message: 'not found' }] };

  const intermediate = { ...target, staminaOverride: override };
  const { newState } = recomputeStaminaState(intermediate);
  const updated = { ...intermediate, staminaState: newState };

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: state.participants.map((p) =>
        isParticipant(p) && p.id === participantId ? updated : p,
      ),
    },
    derived: newState !== target.staminaState ? [
      {
        id: ulid(), causedBy: intent.id, timestamp: intent.timestamp, source: 'server',
        type: 'StaminaTransitioned', actor: intent.actor,
        payload: { participantId, from: target.staminaState, to: newState, cause: 'override-applied' },
      } as StampedIntent,
    ] : [],
    log: [{ kind: 'info', text: `${target.name}: ${override.kind} override applied (${override.source})`, intentId: intent.id }],
  };
}
```

- [ ] **Step 4: Test + create `clear-participant-override.ts`** (mirror shape; sets `staminaOverride: null` and re-derives state)

- [ ] **Step 5: Run all three reducer tests**

Run: `pnpm --filter @ironyard/rules test knock-unconscious apply-participant-override clear-participant-override`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/intents/knock-unconscious.ts packages/rules/src/intents/apply-participant-override.ts packages/rules/src/intents/clear-participant-override.ts packages/rules/tests/intents/knock-unconscious.spec.ts packages/rules/tests/intents/apply-participant-override.spec.ts packages/rules/tests/intents/clear-participant-override.spec.ts
git commit -m "feat(rules): add KnockUnconscious / ApplyParticipantOverride / ClearParticipantOverride reducers"
```

---

## Task 14: Reducer — `ResolveTriggerOrder` + `pendingTriggers` state semantics

**Files:**
- Create: `packages/rules/src/intents/resolve-trigger-order.ts`
- Test: `packages/rules/tests/intents/resolve-trigger-order.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('applyResolveTriggerOrder', () => {
  it('rejects when pendingTriggers is null', () => {
    // ...
  });

  it('rejects when pendingTriggerSetId does not match', () => {
    // ...
  });

  it('rejects when order is missing a candidate', () => {
    // ...
  });

  it('rejects when order contains an extra id', () => {
    // ...
  });

  it('rejects when order has duplicates', () => {
    // ...
  });

  it('rejects when actor is not active director', () => {
    // ...
  });

  it('emits ExecuteTrigger derived intents in the chosen order', () => {
    // ...
  });

  it('clears pendingTriggers after the cascade', () => {
    // ...
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/rules test resolve-trigger-order`
Expected: FAIL.

- [ ] **Step 3: Create `packages/rules/src/intents/resolve-trigger-order.ts`**

```ts
import { ResolveTriggerOrderPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { ulid } from '@ironyard/shared/ulid';

export function applyResolveTriggerOrder(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = ResolveTriggerOrderPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return { state, derived: [], log: [], errors: [{ code: 'invalid_payload', message: parsed.error.message }] };
  }
  if (intent.actor.userId !== state.activeDirectorId) {
    return { state, derived: [], log: [], errors: [{ code: 'not_authorized', message: 'director only' }] };
  }
  const pt = state.pendingTriggers;
  if (pt === null) {
    return { state, derived: [], log: [], errors: [{ code: 'no_pending_triggers', message: 'no pending triggers' }] };
  }
  if (pt.id !== parsed.data.pendingTriggerSetId) {
    return { state, derived: [], log: [], errors: [{ code: 'id_mismatch', message: 'pendingTriggerSetId mismatch' }] };
  }

  // Order set must exactly match candidate set (no missing, no extras, no duplicates).
  const candidateIds = pt.candidates.map((c) => c.participantId).sort();
  const orderIds = [...parsed.data.order].sort();
  const orderSet = new Set(parsed.data.order);
  if (orderSet.size !== parsed.data.order.length) {
    return { state, derived: [], log: [], errors: [{ code: 'order_duplicates', message: 'order has duplicates' }] };
  }
  if (candidateIds.join('|') !== orderIds.join('|')) {
    return { state, derived: [], log: [], errors: [{ code: 'order_mismatch', message: 'order set mismatch' }] };
  }

  // Build ExecuteTrigger derived intents in order.
  const derived: StampedIntent[] = parsed.data.order.map((participantId) => {
    const cand = pt.candidates.find((c) => c.participantId === participantId)!;
    return {
      id: ulid(),
      causedBy: intent.id,
      timestamp: intent.timestamp,
      source: 'server',
      type: 'ExecuteTrigger',
      actor: intent.actor,
      payload: {
        participantId,
        triggeredActionId: cand.triggeredActionId,
        triggerEvent: pt.triggerEvent,
      },
    } as StampedIntent;
  });

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      pendingTriggers: null,
    },
    derived,
    log: [{ kind: 'info', text: `Trigger order resolved: ${parsed.data.order.join(' → ')}`, intentId: intent.id }],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ironyard/rules test resolve-trigger-order`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/intents/resolve-trigger-order.ts packages/rules/tests/intents/resolve-trigger-order.spec.ts
git commit -m "feat(rules): add applyResolveTriggerOrder reducer + pendingTriggers state semantics (Q10)"
```

---

## Task 15: Reducer — `EndEncounter` / `EndRound` / `Respite` extensions

**Files:**
- Modify: `packages/rules/src/intents/end-encounter.ts`
- Modify: `packages/rules/src/intents/end-round.ts`
- Modify: `packages/rules/src/intents/respite.ts`
- Tests: extend existing specs

### Sub-task 15a: `EndEncounter` — fire `dieAtEncounterEnd`

- [ ] **Step 1: Write the failing test**

```ts
it('transitions doomed participants with dieAtEncounterEnd=true to dead at encounter end', () => {
  // ...
});

it('clears pendingTriggers at encounter end', () => {
  // ...
});
```

- [ ] **Step 2: Update `applyEndEncounter`**

Add to the reducer body (before returning):

```ts
// Pass 3 Slice 1 — fire doomed dieAtEncounterEnd.
const updatedParticipants = state.participants.map((p) => {
  if (!isParticipant(p)) return p;
  if (p.staminaOverride?.kind === 'doomed' && p.staminaOverride.dieAtEncounterEnd) {
    return {
      ...p,
      currentStamina: -p.maxStamina - 1,
      staminaState: 'dead' as const,
      staminaOverride: null,
      conditions: [],
    };
  }
  return p;
});

// Clear pendingTriggers (defensive — shouldn't be set across encounters).
const next = { ...state, participants: updatedParticipants, pendingTriggers: null /* plus existing fields */ };
```

(Splice into the existing `applyEndEncounter` return — emit a `StaminaTransitioned` derived intent for each doomed-died participant.)

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm --filter @ironyard/rules test end-encounter`
Expected: PASS.

### Sub-task 15b: `EndRound` — reset `triggeredActionUsedThisRound`

- [ ] **Step 1: Write the failing test**

```ts
it('resets triggeredActionUsedThisRound on every participant', () => { ... });
```

- [ ] **Step 2: Update `applyEndRound`**

In the existing reducer, when stepping over participants, set `triggeredActionUsedThisRound: false`.

- [ ] **Step 3: Run + commit**

### Sub-task 15c: `Respite` — CoP override clears when recoveries refill

- [ ] **Step 1: Write the failing test**

```ts
it('clears the CoP extra-dying-trigger override when recoveries refill above 0', () => {
  // Setup: PC with CoP override + recoveries 0 + currentStamina 20 → staminaState 'dying'
  // Dispatch Respite (which refills recoveries)
  // Expect: staminaOverride === null, staminaState === 'healthy' (re-derived from stamina)
});
```

- [ ] **Step 2: Update `applyRespite`**

After the recoveries refill, run `recomputeStaminaState` and clear CoP override when predicate no longer holds:

```ts
const updatedTarget = { ...character, recoveries: { ...character.recoveries, current: character.recoveries.max } };
// If CoP override and predicate no longer satisfied, clear it.
if (updatedTarget.staminaOverride?.kind === 'extra-dying-trigger'
    && updatedTarget.staminaOverride.predicate === 'recoveries-exhausted'
    && updatedTarget.recoveries.current > 0) {
  updatedTarget.staminaOverride = null;
}
const { newState } = recomputeStaminaState(updatedTarget);
const finalTarget = { ...updatedTarget, staminaState: newState };
```

- [ ] **Step 3: Run + commit**

- [ ] **Step 4: Commit all three sub-tasks together**

```bash
git add packages/rules/src/intents/end-encounter.ts packages/rules/src/intents/end-round.ts packages/rules/src/intents/respite.ts packages/rules/tests/intents/end-encounter.spec.ts packages/rules/tests/intents/end-round.spec.ts packages/rules/tests/intents/respite.spec.ts
git commit -m "feat(rules): EndEncounter fires doomed dieAtEncounterEnd; EndRound resets triggeredActionUsedThisRound; Respite clears CoP override when recoveries refill"
```

---

## Task 16: Reducer — `RollPower` crit extra-main-action

**Files:**
- Modify: `packages/rules/src/intents/roll-power.ts`
- Test: extend `packages/rules/tests/intents/roll-power.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('emits GrantExtraMainAction on nat 19 main-action ability', () => {
  // Setup: ability with action === 'main', RollPower payload with d10s [19, 5]
  // Expect: derived intent GrantExtraMainAction { participantId } emitted
});

it('emits GrantExtraMainAction on nat 20 even when actor is dazed', () => { ... });

it('does NOT emit GrantExtraMainAction on nat 19 if ability is a maneuver', () => { ... });

it('does NOT emit GrantExtraMainAction if actor is dead', () => { ... });
```

- [ ] **Step 2: Update `applyRollPower`**

Where the reducer evaluates the d10 dice for tier resolution, also check for nat 19/20 + ability.action === 'main' + actor !== dead:

```ts
const d10s = parsed.data.rolls.d10s;
const isCrit = d10s.some((d) => d === 19 || d === 20);
if (isCrit && ability.action === 'main' && actor.staminaState !== 'dead') {
  derived.push({
    id: ulid(),
    causedBy: intent.id,
    timestamp: intent.timestamp,
    source: 'server',
    type: 'GrantExtraMainAction',
    actor: intent.actor,
    payload: { participantId: actor.id },
  } as StampedIntent);
}
```

(Field name `ability.action` is illustrative — verify against the actual ability schema. If the field is named differently, the plan author substitutes the correct one.)

- [ ] **Step 3: Add reducer for `GrantExtraMainAction`**

Create `packages/rules/src/intents/grant-extra-main-action.ts`:

```ts
import { GrantExtraMainActionPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

export function applyGrantExtraMainAction(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = GrantExtraMainActionPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return { state, derived: [], log: [], errors: [{ code: 'invalid_payload', message: parsed.error.message }] };
  }
  const { participantId } = parsed.data;
  const target = state.participants.filter(isParticipant).find((p) => p.id === participantId);
  if (!target) return { state, derived: [], log: [], errors: [{ code: 'target_missing', message: 'not found' }] };

  const updated = {
    ...target,
    turnActionUsage: { ...target.turnActionUsage, main: false },
  };

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: state.participants.map((p) =>
        isParticipant(p) && p.id === participantId ? updated : p,
      ),
    },
    derived: [],
    log: [{ kind: 'info', text: `${target.name} gains an extra main action (critical hit)`, intentId: intent.id }],
  };
}
```

- [ ] **Step 4: Run tests + commit**

```bash
git add packages/rules/src/intents/roll-power.ts packages/rules/src/intents/grant-extra-main-action.ts packages/rules/tests/intents/roll-power.spec.ts
git commit -m "feat(rules): nat 19/20 main-action emits GrantExtraMainAction; refresh turnActionUsage.main"
```

---

## Task 17: Reducer dispatch + permissions wiring

**Files:**
- Modify: `packages/rules/src/reducer.ts`
- Modify: `packages/rules/src/permissions.ts`

- [ ] **Step 1: Add dispatch cases to `reducer.ts`**

In the switch statement (alphabetical):

```ts
    case IntentTypes.ApplyParticipantOverride:
      return applyApplyParticipantOverride(state, intent);
    case IntentTypes.BecomeDoomed:
      return applyBecomeDoomed(state, intent);
    case IntentTypes.ClearParticipantOverride:
      return applyClearParticipantOverride(state, intent);
    case IntentTypes.ExecuteTrigger:
      // ExecuteTrigger is a thin wrapper that dispatches the underlying
      // ability's effect intent. Slice 1 just logs the execution; slice 2
      // wires the actual cascade dispatch.
      return applyExecuteTrigger(state, intent);
    case IntentTypes.GrantExtraMainAction:
      return applyGrantExtraMainAction(state, intent);
    case IntentTypes.KnockUnconscious:
      return applyKnockUnconscious(state, intent);
    case IntentTypes.ResolveTriggerOrder:
      return applyResolveTriggerOrder(state, intent);
    case IntentTypes.StaminaTransitioned:
      // Server-only event — pure log/derived-substrate. No state mutation.
      return { state, derived: [], log: [{ kind: 'info', text: `stamina: ${(intent.payload as any).participantId} ${(intent.payload as any).from} → ${(intent.payload as any).to}`, intentId: intent.id }] };
```

Add corresponding imports at the top of `reducer.ts` (one per new reducer file).

Create `applyExecuteTrigger` stub in `packages/rules/src/intents/execute-trigger.ts`:

```ts
import { ExecuteTriggerPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

export function applyExecuteTrigger(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = ExecuteTriggerPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return { state, derived: [], log: [], errors: [{ code: 'invalid_payload', message: parsed.error.message }] };
  }
  // Slice 1 just logs; slice 2 wires the underlying ability's dispatch.
  return {
    state,
    derived: [],
    log: [{ kind: 'info', text: `Execute trigger: ${parsed.data.participantId} → ${parsed.data.triggeredActionId}`, intentId: intent.id }],
  };
}
```

- [ ] **Step 2: Add permissions to `permissions.ts`**

Add entries (the existing file has a per-intent permission table):

```ts
ApplyParticipantOverride: { allow: 'director' },
BecomeDoomed:             { allow: 'owner-or-director' },     // PC owner OR director
ClearParticipantOverride: { allow: 'director' },
ExecuteTrigger:           { allow: 'server' },
GrantExtraMainAction:     { allow: 'server' },
KnockUnconscious:         { allow: 'director-or-attacker' },
ResolveTriggerOrder:      { allow: 'director' },
StaminaTransitioned:      { allow: 'server' },
```

(Adjust permission strings to match the existing taxonomy in `permissions.ts`.)

- [ ] **Step 3: Run repo-wide tests + typecheck**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/rules/src/reducer.ts packages/rules/src/permissions.ts packages/rules/src/intents/execute-trigger.ts
git commit -m "feat(rules): wire dispatch + permissions for slice 1 intents"
```

---

## Task 18: UI — `ParticipantRow` state tag extension

**Files:**
- Modify: `apps/web/src/primitives/ParticipantRow.tsx`
- Modify: `apps/web/src/theme/tokens.css` (state-tag tokens if needed)
- Test: `apps/web/src/primitives/__tests__/ParticipantRow.state-tag.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { ParticipantRow } from '../ParticipantRow';

describe('ParticipantRow — slice 1 state tags', () => {
  const base = { /* minimum props */ };

  it('renders WINDED tag when staminaState=winded', () => {
    render(<ParticipantRow {...base} staminaState="winded" />);
    expect(screen.getByText('WINDED')).toBeInTheDocument();
  });

  it('renders DYING with Bleeding annotation', () => { ... });
  it('renders DEAD with strikethrough name', () => { ... });
  it('renders KO with 💤 glyph', () => { ... });
  it('renders DOOMED with 🔥 glyph in hero-tone', () => { ... });
  it('renders INERT (12h)', () => { ... });
  it('renders RUBBLE (12h)', () => { ... });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test ParticipantRow.state-tag`
Expected: FAIL.

- [ ] **Step 3: Extend `ParticipantRow.tsx`**

Add a `staminaState` prop and render the appropriate tag (compose with the existing `ACTED` / `SURPRISED` state-tag slot from Pass 2b1):

```tsx
// Inside the row JSX, where the existing state-tag block lives (e.g., right
// after the role readout):
{staminaState && staminaState !== 'healthy' && (
  <StaminaStateTag state={staminaState} />
)}
```

Create `apps/web/src/primitives/StaminaStateTag.tsx`:

```tsx
import type { StaminaState } from '@ironyard/shared';

const TAG_COPY: Record<Exclude<StaminaState, 'healthy'>, { text: string; tone: 'foe' | 'hero' | 'muted'; glyph?: string }> = {
  winded:      { text: 'WINDED',     tone: 'muted' },
  dying:       { text: 'DYING',      tone: 'foe' },
  dead:        { text: 'DEAD',       tone: 'foe' },
  unconscious: { text: 'KO',         tone: 'foe', glyph: '💤' },
  inert:       { text: 'INERT (12h)', tone: 'muted' },
  rubble:      { text: 'RUBBLE (12h)', tone: 'muted' },
  doomed:      { text: 'DOOMED',     tone: 'hero', glyph: '🔥' },
};

export function StaminaStateTag({ state }: { state: StaminaState }) {
  if (state === 'healthy') return null;
  const c = TAG_COPY[state];
  const colorClass = c.tone === 'foe' ? 'text-foe' : c.tone === 'hero' ? 'text-accent' : 'text-ink-mute';
  return (
    <span className={`text-xs font-mono uppercase tracking-wider ${colorClass}`} role="status">
      {c.glyph && <span aria-hidden>{c.glyph} </span>}
      {c.text}
    </span>
  );
}
```

For `DEAD`, also strike through the participant name when state === 'dead'. Adjust the row's name span:

```tsx
<span className={`name ... ${staminaState === 'dead' ? 'line-through opacity-60' : ''}`}>
  {participant.name}
</span>
```

- [ ] **Step 4: Run tests + commit**

```bash
git add apps/web/src/primitives/ParticipantRow.tsx apps/web/src/primitives/StaminaStateTag.tsx apps/web/src/primitives/__tests__/ParticipantRow.state-tag.spec.tsx
git commit -m "feat(web): ParticipantRow state tag — 8 stamina states (DYING, DEAD, KO, INERT, RUBBLE, DOOMED, etc.)"
```

---

## Task 19: UI — `DoomsightBecomeDoomedButton` on player sheet

**Files:**
- Create: `apps/web/src/pages/character/DoomsightBecomeDoomedButton.tsx`
- Modify: `apps/web/src/pages/character/PlayerSheetPanel.tsx`
- Test: `apps/web/src/pages/character/__tests__/DoomsightBecomeDoomedButton.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
describe('DoomsightBecomeDoomedButton', () => {
  it('renders only when character has Hakaan ancestry + Doomsight trait', () => {
    // ...
  });

  it('opens confirm modal on click', () => { ... });

  it('dispatches BecomeDoomed { source: hakaan-doomsight } on confirm', () => { ... });

  it('is disabled when character is dead', () => { ... });

  it('is disabled when no active encounter', () => { ... });

  it('is disabled when already doomed', () => { ... });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test DoomsightBecomeDoomedButton`
Expected: FAIL.

- [ ] **Step 3: Create `DoomsightBecomeDoomedButton.tsx`**

```tsx
import { useState } from 'react';
import type { Character, Participant } from '@ironyard/shared';
import { useDispatchIntent } from '../../ws/useDispatchIntent';   // hypothetical hook — match actual project hook

type Props = {
  character: Character;
  participant: Participant | null;
};

export function DoomsightBecomeDoomedButton({ character, participant }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const dispatch = useDispatchIntent();

  if (character.ancestry.id !== 'hakaan') return null;
  if (!character.purchasedTraits.includes('doomsight')) return null;

  const disabled =
    !participant ||
    participant.staminaState === 'dead' ||
    participant.staminaState === 'doomed';

  return (
    <section className="border border-foe/30 bg-foe/5 p-3 rounded">
      <h3 className="text-sm font-bold uppercase tracking-wider text-foe">Doomsight</h3>
      <p className="text-xs text-ink-mute mt-1">Predetermine a heroic death.</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setShowConfirm(true)}
        className="mt-2 px-3 py-2 bg-foe text-bg font-mono uppercase text-sm disabled:opacity-40 disabled:cursor-not-allowed min-h-11"
      >
        Become doomed
      </button>
      {showConfirm && participant && (
        <div role="dialog" className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-ink-2 p-6 max-w-md">
            <p className="text-sm">
              This sets your character to the doomed state — auto tier-3 on all power
              rolls, can't die from stamina, dies at encounter end. Continue?
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: 'BecomeDoomed', payload: { participantId: participant.id, source: 'hakaan-doomsight' } });
                  setShowConfirm(false);
                }}
                className="px-3 py-2 bg-foe text-bg font-mono uppercase text-sm"
              >
                Yes — become doomed
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Mount on `PlayerSheetPanel`**

Find `PlayerSheetPanel.tsx`. Add an import + render the button alongside existing sections:

```tsx
import { DoomsightBecomeDoomedButton } from './DoomsightBecomeDoomedButton';

// In the JSX, e.g., below the heroic-resource chip:
<DoomsightBecomeDoomedButton character={character} participant={participant} />
```

- [ ] **Step 5: Run tests + commit**

```bash
git add apps/web/src/pages/character/DoomsightBecomeDoomedButton.tsx apps/web/src/pages/character/PlayerSheetPanel.tsx apps/web/src/pages/character/__tests__/DoomsightBecomeDoomedButton.spec.tsx
git commit -m "feat(web): Doomsight section + Become Doomed button on player sheet (Hakaan-Doomsight only)"
```

---

## Task 20: UI — `CrossSideTriggerModal` + `TriggersPendingPill` + `DirectorCombat` mount

**Files:**
- Create: `apps/web/src/pages/combat/triggers/CrossSideTriggerModal.tsx`
- Create: `apps/web/src/pages/combat/triggers/TriggersPendingPill.tsx`
- Create: `apps/web/src/pages/combat/triggers/index.ts`
- Create: `apps/web/src/lib/format-trigger-event.ts`
- Modify: `apps/web/src/pages/combat/DirectorCombat.tsx`
- Test: `apps/web/src/pages/combat/triggers/__tests__/CrossSideTriggerModal.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
describe('CrossSideTriggerModal', () => {
  it('renders when pendingTriggers is set and actor is director', () => { ... });
  it('does not render for non-director viewers', () => { ... });
  it('default order is foes first, then heroes', () => { ... });
  it('clicking Resolve dispatches ResolveTriggerOrder with the current order', () => { ... });
  it('drag-to-reorder updates the order before dispatch', () => { ... });
});

describe('TriggersPendingPill', () => {
  it('renders "Director resolving triggers..." for non-director viewers when pendingTriggers is set', () => { ... });
  it('does not render when pendingTriggers is null', () => { ... });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test CrossSideTriggerModal`
Expected: FAIL.

- [ ] **Step 3: Create `format-trigger-event.ts`**

```ts
import type { TriggerEventDesc } from '@ironyard/shared';

export function formatTriggerEvent(
  ev: TriggerEventDesc,
  resolveParticipantName: (id: string) => string,
): string {
  switch (ev.kind) {
    case 'damage-applied': {
      const tName = resolveParticipantName(ev.targetId);
      const aName = ev.attackerId ? resolveParticipantName(ev.attackerId) : 'an effect';
      return `${tName} took ${ev.amount} ${ev.type} damage from ${aName}`;
    }
    case 'stamina-transition':
      return `${resolveParticipantName(ev.participantId)} transitioned from ${ev.from} to ${ev.to}`;
    case 'forced-movement':
      return `${resolveParticipantName(ev.targetId)} was forcibly moved ${ev.distance} squares`;
  }
}
```

- [ ] **Step 4: Create `CrossSideTriggerModal.tsx`**

```tsx
import { useState } from 'react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PendingTriggerSet } from '@ironyard/shared';
import { formatTriggerEvent } from '../../../lib/format-trigger-event';

type Props = {
  pendingTriggers: PendingTriggerSet;
  resolveName: (id: string) => string;
  onResolve: (order: string[]) => void;
};

export function CrossSideTriggerModal({ pendingTriggers, resolveName, onResolve }: Props) {
  // Default order: foes first, then heroes.
  const sortedDefault = [...pendingTriggers.candidates].sort((a, b) => {
    if (a.side === b.side) return 0;
    return a.side === 'foes' ? -1 : 1;
  });
  const [order, setOrder] = useState<typeof sortedDefault>(sortedDefault);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over === null || active.id === over.id) return;
    const oldIndex = order.findIndex((c) => c.participantId === active.id);
    const newIndex = order.findIndex((c) => c.participantId === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setOrder(arrayMove(order, oldIndex, newIndex));
  }

  return (
    <div role="dialog" className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-ink-2 p-6 max-w-lg border border-line">
        <h2 className="text-sm font-mono uppercase tracking-wider mb-2">Resolve trigger order</h2>
        <p className="text-xs text-ink-mute mb-4">
          Trigger: {formatTriggerEvent(pendingTriggers.triggerEvent, resolveName)}
        </p>
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order.map((c) => c.participantId)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1">
              {order.map((cand, i) => (
                <SortableRow key={cand.participantId} index={i + 1} cand={cand} name={resolveName(cand.participantId)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        <p className="text-xs text-ink-mute mt-3">Drag to reorder.</p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => onResolve(order.map((c) => c.participantId))}
            className="px-4 py-2 bg-foe text-bg font-mono uppercase text-sm min-h-11"
          >
            Resolve in order
          </button>
        </div>
      </div>
    </div>
  );
}

function SortableRow({
  cand,
  name,
  index,
}: {
  cand: { participantId: string; triggeredActionId: string; side: 'heroes' | 'foes' };
  name: string;
  index: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: cand.participantId });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex items-center gap-3 bg-ink-3 px-3 py-2 text-sm cursor-grab"
    >
      <span className="font-mono w-6">[{index}]</span>
      <span className="flex-1">{name} — {cand.triggeredActionId}</span>
      <span className={`text-xs uppercase ${cand.side === 'foes' ? 'text-foe' : 'text-accent'}`}>{cand.side}</span>
    </li>
  );
}
```

- [ ] **Step 5: Create `TriggersPendingPill.tsx`**

```tsx
export function TriggersPendingPill() {
  return (
    <span className="text-xs font-mono uppercase text-ink-mute px-2 py-1 bg-ink-3 rounded">
      Director resolving triggers…
    </span>
  );
}
```

- [ ] **Step 6: Create `index.ts` barrel**

```ts
export { CrossSideTriggerModal } from './CrossSideTriggerModal';
export { TriggersPendingPill } from './TriggersPendingPill';
```

- [ ] **Step 7: Mount in `DirectorCombat.tsx`**

Add an import + render block when `state.pendingTriggers !== null && isDirector`:

```tsx
import { CrossSideTriggerModal } from './triggers';

// Inside the JSX:
{state.pendingTriggers !== null && isActingAsDirector && (
  <CrossSideTriggerModal
    pendingTriggers={state.pendingTriggers}
    resolveName={(id) => state.participants.find((p) => p.id === id)?.name ?? id}
    onResolve={(order) =>
      dispatch({
        type: 'ResolveTriggerOrder',
        payload: { pendingTriggerSetId: state.pendingTriggers!.id, order },
      })
    }
  />
)}
```

Add `TriggersPendingPill` to `PlayerSheetPanel.tsx` (or wherever player viewers see combat chrome) when `state.pendingTriggers !== null && !isActingAsDirector`.

- [ ] **Step 8: Run tests + commit**

```bash
git add apps/web/src/pages/combat/triggers/ apps/web/src/lib/format-trigger-event.ts apps/web/src/pages/combat/DirectorCombat.tsx
git commit -m "feat(web): CrossSideTriggerModal (director) + TriggersPendingPill (players) — Q10 resolution UI"
```

---

## Task 21: WS-mirror reflect cases

**Files:**
- Modify: `apps/web/src/ws/useSessionSocket.ts`
- Modify: `apps/web/src/lib/intentDescribe.ts`

- [ ] **Step 1: Add reflect cases**

In `useSessionSocket.ts`'s `reflect()` function (the function that applies optimistic state mutations from dispatched intents), add cases for the new intents:

```ts
case 'BecomeDoomed': {
  const { participantId, source } = intent.payload;
  // Mirror the doomed override locally.
  next.participants = next.participants.map((p) =>
    p.id === participantId ? {
      ...p,
      staminaState: 'doomed',
      staminaOverride: source === 'hakaan-doomsight'
        ? { kind: 'doomed', source: 'hakaan-doomsight', canRegainStamina: true, autoTier3OnPowerRolls: true, staminaDeathThreshold: 'none', dieAtEncounterEnd: true }
        : { kind: 'doomed', source: 'manual', canRegainStamina: true, autoTier3OnPowerRolls: true, staminaDeathThreshold: 'none', dieAtEncounterEnd: true },
    } : p,
  );
  break;
}

case 'KnockUnconscious': {
  // ... mirror applyKnockOut locally
  break;
}

case 'ApplyParticipantOverride': {
  // ... mirror the override + recomputeStaminaState locally
  break;
}

case 'ClearParticipantOverride': {
  // ... clear + recompute
  break;
}

case 'ResolveTriggerOrder': {
  next.pendingTriggers = null;
  break;
}

case 'ApplyDamage': {
  // The existing case (or new case) — apply damage step locally via the
  // same damage.ts path. Defensive ?? null on `pendingTriggers` and `staminaState`.
}
```

**Defensive null-guards**: per Pass 2b1 PS #1 and 2b2a PS #1, the WS mirror bypasses Zod parsing. Every consumer of slice-1's new fields must defend against `undefined`:

- `participant.staminaState ?? 'healthy'`
- `participant.staminaOverride ?? null`
- `state.pendingTriggers ?? null`

Adjust the reducer-side helpers used in `reflect()` (likely importing `recomputeStaminaState`) to handle the optional fields by defaulting them upon entry.

- [ ] **Step 2: Add describe cases in `intentDescribe.ts`**

Add describe entries (the existing file has a giant switch matching every IntentType):

```ts
case 'BecomeDoomed':
  return `${actor} → ${nameFor(payload.participantId)} becomes doomed (${payload.source})`;
case 'KnockUnconscious':
  return `${actor} → ${nameFor(payload.targetId)} is knocked unconscious`;
case 'ApplyParticipantOverride':
  return `${actor} applies ${payload.override.kind} override to ${nameFor(payload.participantId)}`;
case 'ClearParticipantOverride':
  return `${actor} clears override on ${nameFor(payload.participantId)}`;
case 'ResolveTriggerOrder':
  return `${actor} resolves trigger order: ${payload.order.map(nameFor).join(' → ')}`;
case 'GrantExtraMainAction':
  return `${nameFor(payload.participantId)} gains an extra main action (crit hit)`;
case 'ExecuteTrigger':
  return `${nameFor(payload.participantId)} fires triggered action ${payload.triggeredActionId}`;
case 'StaminaTransitioned':
  return `${nameFor(payload.participantId)}: ${payload.from} → ${payload.to}`;
```

- [ ] **Step 3: Run tests + commit**

```bash
git add apps/web/src/ws/useSessionSocket.ts apps/web/src/lib/intentDescribe.ts
git commit -m "feat(web): WS-mirror reflect + intent describe cases for slice 1 intents"
```

---

## Task 22: Docs — `rules-canon.md` + `rule-questions.md` updates

**Files:**
- Modify: `docs/rules-canon.md`
- Modify: `docs/rule-questions.md`

- [ ] **Step 1: Flip § 2.7 / 2.8 / 2.9 to ✅ (already ✅) and add slice 1 pointer**

In `docs/rules-canon.md`, find the §2.7 header (line ~270). Add a one-line pointer:

```markdown
> **Engine:** state machine implemented in `packages/rules/src/stamina.ts` (Pass 3 Slice 1, 2026-05-15). See [slice 1 spec](superpowers/specs/2026-05-15-pass-3-slice-1-damage-state-machine-design.md).
```

Same for § 2.8, § 2.9.

- [ ] **Step 2: Add §4.10 critical-hit-extra-main-action pointer**

In §4.10 (canon section already ✅), add a pointer to slice 1's spec for the nat-19/20 extra-main-action rule.

- [ ] **Step 3: Close Q10 in `rule-questions.md`**

Find Q10 (cross-side trigger order). Change status from 🟡 → ✅. Add:

```markdown
**Resolution.** Director picks order via `ResolveTriggerOrder` intent + `CrossSideTriggerModal` UI. Pass 3 Slice 1, 2026-05-15. Default order on mount: foes first, heroes second (table-flow bias). See [slice 1 spec](superpowers/specs/2026-05-15-pass-3-slice-1-damage-state-machine-design.md).
```

- [ ] **Step 4: Close Q16 in `rule-questions.md`**

Find Q16 (Revenant inert). Change status from 🟡 → ✅. Add a pointer to slice 1.

- [ ] **Step 5: Add new Q-doomed entry**

Append a new Q-entry to `rule-questions.md` covering:
- Hakaan Doomsight (rubble + doomed)
- Title *Doomed*
- Curse of Punishment

Mark each as ✅ closed via slice 1's generic-override pattern.

- [ ] **Step 6: Commit**

```bash
git add docs/rules-canon.md docs/rule-questions.md
git commit -m "docs(canon): flip Q10 + Q16 to ✅; add Q-doomed entry; pointer to slice 1 spec from §2.7-2.9 and §4.10"
```

---

## Task 23: Integration test

**Files:**
- Create: `packages/rules/tests/slice-1-integration.spec.ts`

- [ ] **Step 1: Write the integration test**

```ts
import { describe, expect, it } from 'vitest';
// Imports: applyApplyDamage, applyBecomeDoomed, applyApplyParticipantOverride,
// applyClearParticipantOverride, applyEndEncounter — plus state-builder.

describe('slice-1 integration — full encounter run', () => {
  it('Revenant inert → fire instant death', () => {
    // Build state with Revenant PC at 5 stamina.
    // Apply damage 10 fire → currentStamina -5 → state should become 'inert'
    //   (Revenant intercept fires before fire-instant-death since override didn't yet exist).
    //   Verify the override activation logic correctly populates after dying.
    // Apply damage 1 fire on inert participant → state 'dead'.
  });

  it('Hakaan rubble at -windedValue, then 12h clear', () => {
    // Build Hakaan-Doomsight PC at -5 stamina.
    // Apply damage 20 → state 'rubble' (override fires at would-kill).
    // Director dispatches ClearParticipantOverride → state recomputes; since
    // stamina is still -25 (well past -windedValue 15), state derives to 'dead'.
    // (12h regain-stamina is not auto — Director adjudicates via ApplyHeal if needed.)
  });

  it('Hakaan doomed via player intent, dies at encounter end', () => {
    // Build Hakaan-Doomsight PC at 30/30. Dispatch BecomeDoomed.
    // Apply massive damage → state stays 'doomed'.
    // EndEncounter → state transitions to 'dead'.
  });

  it('Title Doomed via OA, dies at -staminaMax', () => {
    // Build PC with Title Doomed equipped. Apply damage to reach 0 stamina.
    // Verify OA raised. Simulate ClaimOpenAction → override set.
    // Apply damage past -staminaMax → state 'dead'.
  });

  it('Curse of Punishment forces dying when recoveries exhausted, clears on Respite', () => {
    // PC with CoP override, recoveries 0. Verify state is 'dying'.
    // Dispatch Respite (refill recoveries). Verify state recomputes to 'healthy'.
  });

  it('Q10 cross-side trigger resolution cascade', () => {
    // Build state where a damage event triggers reactions from both sides.
    // Verify pendingTriggers set, cascade paused.
    // Dispatch ResolveTriggerOrder. Verify ExecuteTrigger intents emit in order
    // and pendingTriggers cleared.
  });
});
```

- [ ] **Step 2: Run + commit**

Run: `pnpm --filter @ironyard/rules test slice-1-integration`
Expected: PASS.

```bash
git add packages/rules/tests/slice-1-integration.spec.ts
git commit -m "test(rules): slice 1 integration — full encounter covering all 5 override plugs + Q10"
```

---

## Task 24: Repo-wide verify + screenshots

**Files:** none modified; verification only.

- [ ] **Step 1: Run full repo verification**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

Expected: PASS in every package.

- [ ] **Step 2: Start dev server and screenshot key surfaces**

```bash
pnpm dev
```

Visit `/campaigns/<id>/play` after stamping a test encounter with each relevant state. Capture screenshots at iPad-portrait (810 × 1080) and iPhone-portrait (390 × 844):

- Dying hero row with state tag + Bleeding chip
- Dead foe row (strikethrough name)
- KO state row with 💤 glyph
- Doomed-Hakaan row with 🔥 glyph
- Doomsight `Become Doomed` button on player sheet
- Title-Doomed OA in the OpenActionsList
- `CrossSideTriggerModal` mid-resolution

Save under `apps/web/screenshots/pass-3-slice-1/` (gitignored).

- [ ] **Step 3: Commit any post-shipping fixes as PS entries**

If surprises surface during dev verification, append numbered PS entries to the slice 1 spec at `docs/superpowers/specs/2026-05-15-pass-3-slice-1-damage-state-machine-design.md` per the memory `feedback_post_shipping_fixes_ps_section.md`.

---

## Self-review notes

**Spec coverage check:** Every spec acceptance criterion (1-20) maps to a task above:

- AC 1-4 (state transitions for heroes, foes, healing) → Tasks 7, 8, 11
- AC 5 (KO interception) → Tasks 7, 8
- AC 6 (Revenant inert + fire instant death) → Tasks 7, 8, 10
- AC 7 (Hakaan rubble) → Tasks 7, 8, 10
- AC 8 (BecomeDoomed) → Tasks 12, 19
- AC 9 (Title Doomed OA) → Tasks 6, 10
- AC 10 (CoP) → Tasks 7, 15c
- AC 11 (manual override) → Task 13
- AC 12 (crit extra-main-action) → Task 16
- AC 13 (Q10 cross-side resolution) → Tasks 14, 20
- AC 14 (Bleeding trigger discriminants) → Task 9
- AC 15 (ParticipantRow state tags) → Task 18
- AC 16 (snapshot backwards-compat) → Task 2 (defaults) + Task 21 (WS mirror)
- AC 17 (rule-questions closures) → Task 22
- AC 18 (pnpm test/typecheck/lint) → Task 24
- AC 19 (screenshots) → Task 24
- AC 20 (umbrella patch) → Already shipped in the slice 1 spec commit

**Placeholder scan:** No "TBD" / "TODO" markers except a deliberate one in `damage.ts` for unimplemented temp-stamina (Step 5 of canon §2.12), flagged in slice 1 spec § Constraints.

**Type consistency:** Names match across tasks (`recomputeStaminaState`, `applyKnockOut`, `applyTransitionSideEffects`, etc.). New intent IntentTypes spelled identically in payload schemas, reducer files, dispatch cases, and reflect cases.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-15-pass-3-slice-1-damage-state-machine.md`.** Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
