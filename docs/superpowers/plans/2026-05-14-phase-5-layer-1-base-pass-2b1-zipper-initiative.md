# Phase 5 Layer 1 Pass 2b1 — Zipper Initiative Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the engine's flat `turnOrder: string[]` initiative model with Draw Steel's canon zipper initiative (canon § 4.1), plus the run-screen UI that drives it (Roll-Initiative overlay, picking-phase chrome, "I'll go now" / director foe-tap affordances).

**Architecture:** Three new intents (`RollInitiative`, `PickNextActor`, `MarkSurprised`) plus a rewritten `applyEndTurn` move turn advancement from "next index in array" to "derive next picking side from acted set + side membership." Two helpers (`participantSide`, `nextPickingSide`) in `state-helpers.ts` give client and server the same source of truth for the run-out rule. New UI overlay masks the left-pane rails on encounter start; picking-phase chrome lights up the InlineHeader, PartyRail, and EncounterRail. `SetInitiative` + the `turnOrder` field are removed once all callers migrate.

**Tech Stack:** TypeScript, Zod, Vitest, React, Tailwind, TanStack Query/Router, Cloudflare Workers + Durable Objects (engine runs in both DO and client mirror).

**Spec:** [`docs/superpowers/specs/2026-05-14-phase-5-layer-1-base-pass-2b1-zipper-initiative-design.md`](../specs/2026-05-14-phase-5-layer-1-base-pass-2b1-zipper-initiative-design.md)

**Test conventions used in this plan:**
- Reducer tests live at `packages/rules/tests/reducer-*.spec.ts` using Vitest.
- Use the existing `intent()` and `part()` helpers from `packages/rules/tests/reducer-turn.spec.ts` (copy locally when adding a new file).
- Type-imports come from `@ironyard/shared`; runtime helpers from `../src/index`.
- UI component tests (when added) live at `apps/web/src/**/*.spec.tsx` using Vitest + React Testing Library.

**Commit cadence:** every task ends with a commit. Run `pnpm test`, `pnpm typecheck`, `pnpm lint` at minimum before each commit; failures block the commit.

---

## Task 1: Add `participantSide` + `nextPickingSide` helpers

Pure functions; no dependencies on the new intents. Lock in the run-out-rule logic first so every following task can rely on it.

**Files:**
- Modify: `packages/rules/src/state-helpers.ts`
- Test: `packages/rules/tests/state-helpers.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append the following to `packages/rules/tests/state-helpers.spec.ts` (preserve existing test bodies):

```ts
import type { Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { emptyCampaignState } from '../src/index';
import { nextPickingSide, participantSide } from '../src/state-helpers';

function pc(id: string): Participant {
  return {
    id, name: id, kind: 'pc', level: 1, currentStamina: 30, maxStamina: 30,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [], weaknesses: [], conditions: [], heroicResources: [],
    extras: [], surges: 0, recoveries: { current: 0, max: 0 }, recoveryValue: 0,
    ownerId: null, characterId: null,
    weaponDamageBonus: { melee: [0,0,0], ranged: [0,0,0] },
    activeAbilities: [], victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false },
    surprised: false,
  };
}

function monster(id: string): Participant {
  return { ...pc(id), kind: 'monster' };
}

describe('participantSide', () => {
  it('returns heroes for PCs and foes for monsters', () => {
    expect(participantSide(pc('alice'))).toBe('heroes');
    expect(participantSide(monster('goblin'))).toBe('foes');
  });
});

describe('nextPickingSide', () => {
  function stateWith(parts: Participant[], acted: string[], current: 'heroes' | 'foes' | null) {
    const s = emptyCampaignState('c1', 'owner');
    return {
      ...s,
      participants: parts,
      encounter: {
        id: 'e1', currentRound: 1,
        firstSide: 'heroes' as const,
        currentPickingSide: current,
        actedThisRound: acted,
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
      },
    };
  }

  it('flips to the other side when both sides have unacted creatures', () => {
    const s = stateWith([pc('alice'), monster('goblin')], [], 'heroes');
    expect(nextPickingSide(s)).toBe('foes');
  });

  it('flips back to heroes when foes side just acted', () => {
    const s = stateWith([pc('alice'), monster('goblin')], ['goblin'], 'foes');
    expect(nextPickingSide(s)).toBe('heroes');
  });

  it('stays on heroes when foes are exhausted (run-out rule)', () => {
    const s = stateWith([pc('alice'), pc('bob'), monster('goblin')], ['goblin'], 'foes');
    expect(nextPickingSide(s)).toBe('heroes');
  });

  it('stays on foes when heroes are exhausted', () => {
    const s = stateWith([pc('alice'), monster('goblin'), monster('orc')], ['alice'], 'heroes');
    expect(nextPickingSide(s)).toBe('foes');
  });

  it('returns null when both sides are fully acted (round end)', () => {
    const s = stateWith([pc('alice'), monster('goblin')], ['alice', 'goblin'], 'heroes');
    expect(nextPickingSide(s)).toBeNull();
  });

  it('returns null when there is no encounter', () => {
    const s = emptyCampaignState('c1', 'owner');
    expect(nextPickingSide(s)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests; verify they fail**

Run: `pnpm --filter @ironyard/rules test state-helpers`
Expected: failures — `nextPickingSide` not exported and `Participant.surprised` not yet in the schema. The schema-level failure on `surprised` is expected at this point; ignore until Task 2.

If the failure is _only_ on the missing export and not on the schema field, that means the participant fixture's `surprised: false` is rejected by Zod when something tries to validate it. The fixture currently doesn't go through Zod, so this should be fine. Proceed.

- [ ] **Step 3: Implement the helpers**

Append to `packages/rules/src/state-helpers.ts`:

```ts
import type { Participant } from '@ironyard/shared';
// (existing imports remain)

/**
 * Side of a participant for zipper-initiative purposes (canon § 4.1).
 * PCs are heroes; monsters are foes. The minion-squads epic (2b.11) will
 * preserve this mapping — squads inherit their members' side.
 */
export function participantSide(p: Participant): 'heroes' | 'foes' {
  return p.kind === 'pc' ? 'heroes' : 'foes';
}

/**
 * Derive the next picking side from `actedThisRound` and side membership.
 * Canon § 4.1 run-out rule:
 *  - if both sides have unacted creatures, flip to the other side
 *  - if only one side has unacted creatures, stay on that side
 *  - if neither does, return null (round is ready to end)
 *
 * Used by `applyEndTurn` and by the WS client's `reflect()` so client and
 * server always agree on whose pick is next.
 */
export function nextPickingSide(state: CampaignState): 'heroes' | 'foes' | null {
  if (!state.encounter) return null;
  const acted = new Set(state.encounter.actedThisRound);
  let unactedHeroes = 0;
  let unactedFoes = 0;
  for (const p of state.participants) {
    if (!isParticipant(p) || acted.has(p.id)) continue;
    if (participantSide(p) === 'heroes') unactedHeroes++;
    else unactedFoes++;
  }
  if (unactedHeroes === 0 && unactedFoes === 0) return null;
  if (unactedHeroes === 0) return 'foes';
  if (unactedFoes === 0) return 'heroes';
  const current = state.encounter.currentPickingSide;
  return current === 'heroes' ? 'foes' : 'heroes';
}
```

- [ ] **Step 4: Run the tests; verify they pass**

Run: `pnpm --filter @ironyard/rules test state-helpers`
Expected: 7 passing tests in this file (4 existing + new ones).

Run typecheck: `pnpm typecheck`. Expected to fail because `EncounterPhase` doesn't yet have `firstSide` / `currentPickingSide` / `actedThisRound` — see Task 2.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/state-helpers.ts packages/rules/tests/state-helpers.spec.ts
git commit -m "feat(rules): participantSide + nextPickingSide helpers for zipper initiative"
```

Do not push.

---

## Task 2: Extend `ParticipantSchema` and `EncounterPhase` shape

Add the new fields with defaults so existing snapshots parse. Keep `turnOrder` in place for now — it gets removed in Task 12 after all callers migrate.

**Files:**
- Modify: `packages/shared/src/participant.ts`
- Modify: `packages/rules/src/types.ts`

- [ ] **Step 1: Add `surprised` field to ParticipantSchema**

In `packages/shared/src/participant.ts`, inside `ParticipantSchema`, add after `turnActionUsage`:

```ts
  // Phase 5 Pass 2b1 — zipper-initiative surprise flag (canon § 4.1).
  // Set by `MarkSurprised` or as part of `RollInitiative.surprised[]`.
  // Cleared by `applyEndRound` at the end of round 1 per canon. The
  // "edge on rolls against" and "can't take triggered actions" consequences
  // of being surprised are Phase 2b umbrella work — 2b1 only carries the flag.
  surprised: z.boolean().default(false),
```

- [ ] **Step 2: Extend `EncounterPhase`**

In `packages/rules/src/types.ts`, update the `EncounterPhase` type. Replace the existing comment + fields starting at "Slice 4:" through `activeParticipantId: string | null;` with:

```ts
  // Phase 5 Pass 2b1 — zipper initiative (canon § 4.1).
  // `firstSide` is null until RollInitiative fires; once set it stays for the
  // encounter. `currentPickingSide` is who picks the next acting creature;
  // null between rounds or when both sides are fully acted (round-end).
  // `actedThisRound` is the set of participant ids who have already acted in
  // the current round (cleared by StartRound).
  currentRound: number | null;
  firstSide: 'heroes' | 'foes' | null;
  currentPickingSide: 'heroes' | 'foes' | null;
  actedThisRound: string[];
  // `turnOrder` is deprecated — kept here only until Task 12 (Pass 2b1)
  // when all callers (reducer, WS reflect, tests) have migrated to the
  // side-aware model. Do NOT use this field in new code.
  turnOrder: string[];
  activeParticipantId: string | null;
```

The rest of `EncounterPhase` (turnState, malice) is unchanged.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: failures in places that construct `EncounterPhase` without the new fields. Most likely: `start-encounter.ts`, `reducer-turn.spec.ts`'s `readyState()`, `useSessionSocket.ts`'s `ActiveEncounter` mirror. Note the file paths for Task 6 (start-encounter) and Task 11 (WS mirror); the spec test is fixed inline below.

Run: `pnpm --filter @ironyard/rules test`
Expected: pre-existing tests should still pass; only typecheck fails.

- [ ] **Step 4: Update `readyState()` in reducer-turn.spec.ts to populate new fields**

In `packages/rules/tests/reducer-turn.spec.ts`, update `readyState`'s encounter object (lines 62–70) to include the new fields. New body:

```ts
    encounter: {
      id: 'enc_test',
      currentRound: 1,
      firstSide: 'heroes',
      currentPickingSide: 'heroes',
      actedThisRound: [],
      turnOrder: participants.map((p) => p.id),
      activeParticipantId: null,
      turnState: {},
      malice: { current: 0, lastMaliciousStrikeRound: null },
    },
```

Also extend `part()` (lines 27–51) to set `surprised: false`:

```ts
    turnActionUsage: { main: false, maneuver: false, move: false },
    surprised: false,
  };
}
```

- [ ] **Step 5: Run tests, then typecheck**

Run: `pnpm --filter @ironyard/rules test reducer-turn`
Expected: existing tests still pass.

Run: `pnpm typecheck`
Expected: a smaller set of failures, all in `apps/web` (the WS mirror) and `packages/rules/src/intents/start-encounter.ts`. Those are addressed in Tasks 6 and 11.

For now, get the rules package's local typecheck green:

Run: `pnpm --filter @ironyard/rules typecheck`
Expected: clean for rules package only (start-encounter compiles because TypeScript only flags assignment to the new required fields — if it does flag, jump ahead to Task 6 step 2's edit and apply it, then come back).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/participant.ts packages/rules/src/types.ts packages/rules/tests/reducer-turn.spec.ts
git commit -m "feat(shared,rules): add surprised field + zipper-init encounter fields"
```

---

## Task 3: Define `RollInitiative` intent + add `IntentTypes` constant

The Zod schema + the IntentType registry constant. No reducer yet — that's Task 4.

**Files:**
- Create: `packages/shared/src/intents/roll-initiative.ts`
- Modify: `packages/shared/src/intents/index.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the schema file**

Create `packages/shared/src/intents/roll-initiative.ts`:

```ts
import { z } from 'zod';

/**
 * Phase 5 Pass 2b1 — Roll initiative for zipper alternation (canon § 4.1).
 *
 * The dispatcher handles all client-side decision-making (d10 roll →
 * chooser UI → manual override) and sends one final intent carrying the
 * chosen winning side. The d10 value is informational (logged only) so
 * the table can audit; engine logic never reads it.
 *
 * Trust: anyone at the table may dispatch. The reducer is idempotent — once
 * `encounter.firstSide` is set, subsequent RollInitiative intents reject.
 */
export const RollInitiativePayloadSchema = z
  .object({
    winner: z.enum(['heroes', 'foes']),
    surprised: z.array(z.string().min(1)).default([]),
    rolledD10: z.number().int().min(1).max(10).optional(),
  })
  .strict();
export type RollInitiativePayload = z.infer<typeof RollInitiativePayloadSchema>;
```

- [ ] **Step 2: Wire into the intent index**

In `packages/shared/src/intents/index.ts`:

After the existing `MarkActionUsed` re-export (line 56–57), insert:

```ts
export { MarkSurprisedPayloadSchema } from './mark-surprised';
export type { MarkSurprisedPayload } from './mark-surprised';
```

Wait — `mark-surprised` doesn't exist yet. Skip that block; revisit in Task 5. For now insert only:

```ts
export { RollInitiativePayloadSchema } from './roll-initiative';
export type { RollInitiativePayload } from './roll-initiative';
```

In the same file, add to the `IntentTypes` constant (alphabetical order — between `RemoveParticipant` and `RollPower`):

```ts
  RollInitiative: 'RollInitiative',
```

- [ ] **Step 3: Re-export from the package root**

In `packages/shared/src/index.ts`, find the existing export block for intents and add `RollInitiativePayloadSchema` + `RollInitiativePayload` alongside the others (preserve alphabetical/grouping convention; look for `RollPower*` for placement reference).

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @ironyard/shared typecheck`
Expected: clean.

Run: `pnpm --filter @ironyard/rules typecheck`
Expected: clean (no reducer references the new intent yet).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/intents/roll-initiative.ts packages/shared/src/intents/index.ts packages/shared/src/index.ts
git commit -m "feat(shared): RollInitiative intent schema + IntentTypes entry"
```

---

## Task 4: Implement `applyRollInitiative` reducer

Wire the reducer + dispatch + tests. The reducer validates the surprise auto-pick rule and stamps `firstSide`.

**Files:**
- Create: `packages/rules/src/intents/roll-initiative.ts`
- Modify: `packages/rules/src/reducer.ts`
- Test: `packages/rules/tests/reducer-roll-initiative.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/rules/tests/reducer-roll-initiative.spec.ts`:

```ts
import type { Intent, Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  type CampaignState,
  type StampedIntent,
  applyIntent,
  emptyCampaignState,
} from '../src/index';

const T = 1_700_000_000_000;
const campaignId = 'c1';

function intent(type: string, payload: unknown, overrides: Partial<Intent> = {}): StampedIntent {
  return {
    id: overrides.id ?? `i_${Math.random().toString(36).slice(2)}`,
    campaignId: overrides.campaignId ?? campaignId,
    actor: overrides.actor ?? { userId: 'alice', role: 'director' },
    timestamp: overrides.timestamp ?? T,
    source: overrides.source ?? 'manual',
    type,
    payload,
    causedBy: overrides.causedBy,
  };
}

function pc(id: string): Participant {
  return {
    id, name: id, kind: 'pc', level: 1, currentStamina: 30, maxStamina: 30,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [], weaknesses: [], conditions: [], heroicResources: [],
    extras: [], surges: 0, recoveries: { current: 0, max: 0 }, recoveryValue: 0,
    ownerId: null, characterId: null,
    weaponDamageBonus: { melee: [0,0,0], ranged: [0,0,0] },
    activeAbilities: [], victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false },
    surprised: false,
  };
}

function monster(id: string): Participant {
  return { ...pc(id), kind: 'monster' };
}

function readyState(parts: Participant[]): CampaignState {
  const s = emptyCampaignState(campaignId, 'owner');
  return {
    ...s,
    participants: parts,
    encounter: {
      id: 'e1', currentRound: 1,
      firstSide: null, currentPickingSide: null, actedThisRound: [],
      turnOrder: [], activeParticipantId: null,
      turnState: {}, malice: { current: 0, lastMaliciousStrikeRound: null },
    },
  };
}

describe('RollInitiative', () => {
  it('stamps firstSide and currentPickingSide to the winner', () => {
    const s = readyState([pc('alice'), monster('goblin')]);
    const r = applyIntent(s, intent('RollInitiative', { winner: 'heroes', surprised: [], rolledD10: 7 }));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.firstSide).toBe('heroes');
    expect(r.state.encounter?.currentPickingSide).toBe('heroes');
    expect(r.state.encounter?.actedThisRound).toEqual([]);
  });

  it('stamps surprised flag on named participants', () => {
    const s = readyState([pc('alice'), monster('goblin'), monster('orc')]);
    const r = applyIntent(s, intent('RollInitiative', { winner: 'heroes', surprised: ['goblin'] }));
    expect(r.errors).toBeUndefined();
    const goblin = r.state.participants.find((p) => 'id' in p && p.id === 'goblin') as Participant;
    expect(goblin.surprised).toBe(true);
    const alice = r.state.participants.find((p) => 'id' in p && p.id === 'alice') as Participant;
    expect(alice.surprised).toBe(false);
  });

  it('rejects when no active encounter', () => {
    const s = emptyCampaignState(campaignId, 'owner');
    const r = applyIntent(s, intent('RollInitiative', { winner: 'heroes', surprised: [] }));
    expect(r.errors?.[0]?.code).toBe('no_active_encounter');
  });

  it('rejects a second roll (idempotent guard)', () => {
    let s = readyState([pc('alice'), monster('goblin')]);
    s = applyIntent(s, intent('RollInitiative', { winner: 'heroes', surprised: [] })).state;
    const r = applyIntent(s, intent('RollInitiative', { winner: 'foes', surprised: [] }));
    expect(r.errors?.[0]?.code).toBe('already_rolled');
  });

  it('rejects unknown participant ids in surprised[]', () => {
    const s = readyState([pc('alice')]);
    const r = applyIntent(s, intent('RollInitiative', { winner: 'heroes', surprised: ['ghost'] }));
    expect(r.errors?.[0]?.code).toBe('unknown_participant');
  });

  it('rejects when surprise auto-pick would override the chosen winner', () => {
    // All foes will be surprised; canon: heroes (un-surprised side) must win.
    const s = readyState([pc('alice'), monster('goblin'), monster('orc')]);
    const r = applyIntent(
      s,
      intent('RollInitiative', { winner: 'foes', surprised: ['goblin', 'orc'] }),
    );
    expect(r.errors?.[0]?.code).toBe('surprise_override_mismatch');
  });

  it('accepts when the chosen winner matches the surprise auto-pick', () => {
    const s = readyState([pc('alice'), monster('goblin'), monster('orc')]);
    const r = applyIntent(
      s,
      intent('RollInitiative', { winner: 'heroes', surprised: ['goblin', 'orc'] }),
    );
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.firstSide).toBe('heroes');
  });
});
```

- [ ] **Step 2: Run tests; verify they fail**

Run: `pnpm --filter @ironyard/rules test reducer-roll-initiative`
Expected: all 7 tests fail (reducer not yet wired — intent rejects as unknown type or similar).

- [ ] **Step 3: Implement the reducer**

Create `packages/rules/src/intents/roll-initiative.ts`:

```ts
import { type Participant, RollInitiativePayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';
import { participantSide } from '../state-helpers';

export function applyRollInitiative(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = RollInitiativePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `RollInitiative rejected: ${parsed.error.message}`, intentId: intent.id }],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  if (!state.encounter) {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: 'RollInitiative: no active encounter', intentId: intent.id }],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }
  if (state.encounter.firstSide !== null) {
    return {
      state, derived: [],
      log: [{ kind: 'info', text: 'RollInitiative ignored: firstSide already set', intentId: intent.id }],
      errors: [{ code: 'already_rolled', message: 'initiative already rolled this encounter' }],
    };
  }

  const { winner, surprised, rolledD10 } = parsed.data;
  const ids = new Set(state.participants.filter(isParticipant).map((p) => p.id));
  for (const sid of surprised) {
    if (!ids.has(sid)) {
      return {
        state, derived: [],
        log: [{ kind: 'error', text: `RollInitiative: unknown participant ${sid}`, intentId: intent.id }],
        errors: [{ code: 'unknown_participant', message: `unknown participant id ${sid}` }],
      };
    }
  }

  // Compute the post-stamp surprised set and validate the auto-pick rule.
  const willBeSurprised = new Set(surprised);
  const participantsBySide = { heroes: [] as Participant[], foes: [] as Participant[] };
  for (const p of state.participants) {
    if (!isParticipant(p)) continue;
    participantsBySide[participantSide(p)].push(p);
  }
  function allSurprised(side: 'heroes' | 'foes'): boolean {
    const list = participantsBySide[side];
    return list.length > 0 && list.every((p) => willBeSurprised.has(p.id) || p.surprised);
  }
  const heroesAllSurprised = allSurprised('heroes');
  const foesAllSurprised = allSurprised('foes');
  // One side fully surprised AND the other side has at least one un-surprised participant
  if (heroesAllSurprised && !foesAllSurprised && winner !== 'foes') {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: 'RollInitiative: all heroes surprised; foes must win', intentId: intent.id }],
      errors: [{ code: 'surprise_override_mismatch', message: 'heroes fully surprised — winner must be foes' }],
    };
  }
  if (foesAllSurprised && !heroesAllSurprised && winner !== 'heroes') {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: 'RollInitiative: all foes surprised; heroes must win', intentId: intent.id }],
      errors: [{ code: 'surprise_override_mismatch', message: 'foes fully surprised — winner must be heroes' }],
    };
  }

  const nextParticipants = state.participants.map((p) =>
    isParticipant(p) && willBeSurprised.has(p.id) ? { ...p, surprised: true } : p,
  );

  const reason = rolledD10 !== undefined
    ? `d10=${rolledD10} → ${winner} first`
    : (heroesAllSurprised || foesAllSurprised)
      ? `auto-pick: one side fully surprised → ${winner} first`
      : `manual: ${winner} first`;

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: nextParticipants,
      encounter: {
        ...state.encounter,
        firstSide: winner,
        currentPickingSide: winner,
        actedThisRound: [],
      },
    },
    derived: [],
    log: [{ kind: 'info', text: `RollInitiative — ${reason}`, intentId: intent.id }],
  };
}
```

- [ ] **Step 4: Wire into the dispatch table**

In `packages/rules/src/reducer.ts`:

Add to the top-of-file imports (matching the existing alphabetical-ish order — group with `applySetInitiative`):

```ts
import { applyRollInitiative } from './intents/roll-initiative';
```

Add to the dispatch switch (find the `case IntentTypes.SetInitiative:` case for placement reference):

```ts
    case IntentTypes.RollInitiative:
      return applyRollInitiative(state, intent);
```

- [ ] **Step 5: Run tests; verify they pass**

Run: `pnpm --filter @ironyard/rules test reducer-roll-initiative`
Expected: all 7 tests pass.

Run: `pnpm --filter @ironyard/rules typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/intents/roll-initiative.ts packages/rules/src/reducer.ts packages/rules/tests/reducer-roll-initiative.spec.ts
git commit -m "feat(rules): applyRollInitiative — first-side roll + surprise auto-pick"
```

---

## Task 5: Define + implement `PickNextActor` intent + reducer

The intent that turns a player's "I'll go now" tap into a turn-start cascade. Includes the heroic-resource d3 threading.

**Files:**
- Create: `packages/shared/src/intents/pick-next-actor.ts`
- Modify: `packages/shared/src/intents/index.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/rules/src/intents/pick-next-actor.ts`
- Modify: `packages/rules/src/reducer.ts`
- Test: `packages/rules/tests/reducer-pick-next-actor.spec.ts`

- [ ] **Step 1: Define the schema**

Create `packages/shared/src/intents/pick-next-actor.ts`:

```ts
import { z } from 'zod';

/**
 * Phase 5 Pass 2b1 — Pick the next acting creature in the zipper.
 *
 * Trust:
 *  - Hero pick: participant's owner (own PC) OR active director (override).
 *  - Foe pick: active director only.
 *
 * The reducer validates that `participantId` is on `currentPickingSide` and
 * not in `actedThisRound`, then emits a derived `StartTurn` (threading the
 * optional `rolls.d3` through for d3-gain heroic-resource classes).
 */
export const PickNextActorPayloadSchema = z
  .object({
    participantId: z.string().min(1),
    rolls: z.object({ d3: z.number().int().min(1).max(3) }).optional(),
  })
  .strict();
export type PickNextActorPayload = z.infer<typeof PickNextActorPayloadSchema>;
```

- [ ] **Step 2: Wire into shared index + IntentTypes**

In `packages/shared/src/intents/index.ts`:

After the `RollInitiative` re-export added in Task 3, insert:

```ts
export { PickNextActorPayloadSchema } from './pick-next-actor';
export type { PickNextActorPayload } from './pick-next-actor';
```

Add `PickNextActor: 'PickNextActor',` to `IntentTypes` (between `Note` and `PushItem`, preserving alphabetical order).

Re-export from `packages/shared/src/index.ts` alongside the other intent schemas (near where you placed `RollInitiative` in Task 3).

- [ ] **Step 3: Write the failing tests**

Create `packages/rules/tests/reducer-pick-next-actor.spec.ts`:

```ts
import type { Intent, Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  type CampaignState,
  type StampedIntent,
  applyIntent,
  emptyCampaignState,
} from '../src/index';

const T = 1_700_000_000_000;
const campaignId = 'c1';

function intent(type: string, payload: unknown, overrides: Partial<Intent> = {}): StampedIntent {
  return {
    id: overrides.id ?? `i_${Math.random().toString(36).slice(2)}`,
    campaignId: overrides.campaignId ?? campaignId,
    actor: overrides.actor ?? { userId: 'alice', role: 'director' },
    timestamp: overrides.timestamp ?? T,
    source: overrides.source ?? 'manual',
    type, payload,
    causedBy: overrides.causedBy,
  };
}

function pc(id: string, ownerId: string | null = id): Participant {
  return {
    id, name: id, kind: 'pc', level: 1, currentStamina: 30, maxStamina: 30,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [], weaknesses: [], conditions: [], heroicResources: [],
    extras: [], surges: 0, recoveries: { current: 0, max: 0 }, recoveryValue: 0,
    ownerId, characterId: null,
    weaponDamageBonus: { melee: [0,0,0], ranged: [0,0,0] },
    activeAbilities: [], victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false },
    surprised: false,
  };
}

function monster(id: string): Participant {
  return { ...pc(id, null), kind: 'monster' };
}

function readyState(parts: Participant[], picking: 'heroes' | 'foes' = 'heroes'): CampaignState {
  const s = emptyCampaignState(campaignId, 'director-user');
  return {
    ...s,
    activeDirectorId: 'director-user',
    participants: parts,
    encounter: {
      id: 'e1', currentRound: 1,
      firstSide: picking, currentPickingSide: picking, actedThisRound: [],
      turnOrder: [], activeParticipantId: null,
      turnState: {}, malice: { current: 0, lastMaliciousStrikeRound: null },
    },
  };
}

describe('PickNextActor', () => {
  it('starts the picked PC turn when dispatched by their owner', () => {
    const s = readyState([pc('alice', 'alice-user'), monster('goblin')]);
    const r = applyIntent(
      s,
      intent('PickNextActor', { participantId: 'alice' }, { actor: { userId: 'alice-user', role: 'player' } }),
    );
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.actedThisRound).toEqual(['alice']);
    // The derived StartTurn is emitted by the reducer; verify it exists.
    expect(r.derived.some((d) => d.type === 'StartTurn')).toBe(true);
  });

  it('allows director override to pick another hero', () => {
    const s = readyState([pc('alice', 'alice-user'), pc('bob', 'bob-user')]);
    const r = applyIntent(
      s,
      intent('PickNextActor', { participantId: 'bob' }, { actor: { userId: 'director-user', role: 'director' } }),
    );
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.actedThisRound).toEqual(['bob']);
  });

  it('rejects a non-owner non-director pick', () => {
    const s = readyState([pc('alice', 'alice-user'), pc('bob', 'bob-user')]);
    const r = applyIntent(
      s,
      intent('PickNextActor', { participantId: 'bob' }, { actor: { userId: 'alice-user', role: 'player' } }),
    );
    expect(r.errors?.[0]?.code).toBe('not_permitted');
  });

  it('rejects when the picked side does not match currentPickingSide', () => {
    const s = readyState([pc('alice', 'alice-user'), monster('goblin')], 'heroes');
    const r = applyIntent(
      s,
      intent('PickNextActor', { participantId: 'goblin' }, { actor: { userId: 'director-user', role: 'director' } }),
    );
    expect(r.errors?.[0]?.code).toBe('wrong_side');
  });

  it('rejects when participant already acted', () => {
    let s = readyState([pc('alice', 'alice-user'), pc('bob', 'bob-user')]);
    s = applyIntent(
      s,
      intent('PickNextActor', { participantId: 'alice' }, { actor: { userId: 'alice-user', role: 'player' } }),
    ).state;
    // After alice acts, the turn is in progress; end it so the side flips correctly.
    s = applyIntent(s, intent('EndTurn', {})).state;
    s.encounter!.currentPickingSide = 'heroes'; // force back for the test
    const r = applyIntent(
      s,
      intent('PickNextActor', { participantId: 'alice' }, { actor: { userId: 'alice-user', role: 'player' } }),
    );
    expect(r.errors?.[0]?.code).toBe('already_acted');
  });

  it('rejects when no firstSide has been set', () => {
    const s = readyState([pc('alice', 'alice-user')]);
    s.encounter!.firstSide = null;
    const r = applyIntent(
      s,
      intent('PickNextActor', { participantId: 'alice' }, { actor: { userId: 'alice-user', role: 'player' } }),
    );
    expect(r.errors?.[0]?.code).toBe('initiative_not_rolled');
  });

  it('rejects when a turn is already in progress', () => {
    let s = readyState([pc('alice', 'alice-user'), pc('bob', 'bob-user')]);
    s = applyIntent(
      s,
      intent('PickNextActor', { participantId: 'alice' }, { actor: { userId: 'alice-user', role: 'player' } }),
    ).state;
    // alice's turn is now active. Try to pick bob before ending alice's turn.
    const r = applyIntent(
      s,
      intent('PickNextActor', { participantId: 'bob' }, { actor: { userId: 'bob-user', role: 'player' } }),
    );
    expect(r.errors?.[0]?.code).toBe('turn_in_progress');
  });
});
```

- [ ] **Step 4: Run tests; verify they fail**

Run: `pnpm --filter @ironyard/rules test reducer-pick-next-actor`
Expected: 7 failing tests.

- [ ] **Step 5: Implement the reducer**

Create `packages/rules/src/intents/pick-next-actor.ts`:

```ts
import { IntentTypes, PickNextActorPayloadSchema, type Participant } from '@ironyard/shared';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';
import { participantSide } from '../state-helpers';

export function applyPickNextActor(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = PickNextActorPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: `PickNextActor rejected: ${parsed.error.message}`, intentId: intent.id }],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  if (!state.encounter) {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: 'PickNextActor: no active encounter', intentId: intent.id }],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }
  const enc = state.encounter;
  if (enc.currentRound === null || enc.firstSide === null) {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: 'PickNextActor: initiative not rolled', intentId: intent.id }],
      errors: [{ code: 'initiative_not_rolled', message: 'RollInitiative must fire first' }],
    };
  }
  if (enc.activeParticipantId !== null) {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: 'PickNextActor: a turn is already in progress', intentId: intent.id }],
      errors: [{ code: 'turn_in_progress', message: 'end the current turn before picking' }],
    };
  }

  const { participantId, rolls } = parsed.data;
  const target = state.participants.find(
    (p): p is Participant => isParticipant(p) && p.id === participantId,
  );
  if (!target) {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: `PickNextActor: unknown participant ${participantId}`, intentId: intent.id }],
      errors: [{ code: 'unknown_participant', message: `unknown participant ${participantId}` }],
    };
  }
  if (enc.actedThisRound.includes(participantId)) {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: `PickNextActor: ${participantId} already acted this round`, intentId: intent.id }],
      errors: [{ code: 'already_acted', message: `${participantId} already acted this round` }],
    };
  }
  const side = participantSide(target);
  if (side !== enc.currentPickingSide) {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: `PickNextActor: ${participantId} is on the wrong side`, intentId: intent.id }],
      errors: [{ code: 'wrong_side', message: `currentPickingSide is ${enc.currentPickingSide}; ${participantId} is on ${side}` }],
    };
  }

  // Trust check.
  const isDirector = intent.actor.userId === state.activeDirectorId;
  if (side === 'heroes') {
    const isOwner = target.ownerId !== null && intent.actor.userId === target.ownerId;
    if (!isDirector && !isOwner) {
      return {
        state, derived: [],
        log: [{ kind: 'error', text: 'PickNextActor: not permitted', intentId: intent.id }],
        errors: [{ code: 'not_permitted', message: 'only the PC owner or active director may pick this hero' }],
      };
    }
  } else {
    if (!isDirector) {
      return {
        state, derived: [],
        log: [{ kind: 'error', text: 'PickNextActor: foe picks are director-only', intentId: intent.id }],
        errors: [{ code: 'not_permitted', message: 'only the active director may pick a foe' }],
      };
    }
  }

  const derived: DerivedIntent[] = [
    {
      actor: intent.actor,
      source: 'auto' as const,
      type: IntentTypes.StartTurn,
      payload: rolls ? { participantId, rolls } : { participantId },
      causedBy: intent.id,
    },
  ];

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      encounter: {
        ...enc,
        actedThisRound: [...enc.actedThisRound, participantId],
      },
    },
    derived,
    log: [{ kind: 'info', text: `${participantId} picked next (${side})`, intentId: intent.id }],
  };
}
```

- [ ] **Step 6: Wire into reducer dispatch**

In `packages/rules/src/reducer.ts`:

```ts
import { applyPickNextActor } from './intents/pick-next-actor';
```

Dispatch case (next to `RollInitiative`):

```ts
    case IntentTypes.PickNextActor:
      return applyPickNextActor(state, intent);
```

- [ ] **Step 7: Run tests; verify they pass**

Run: `pnpm --filter @ironyard/rules test reducer-pick-next-actor`
Expected: all 7 pass.

Run: `pnpm --filter @ironyard/rules typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/intents/pick-next-actor.ts packages/shared/src/intents/index.ts packages/shared/src/index.ts packages/rules/src/intents/pick-next-actor.ts packages/rules/src/reducer.ts packages/rules/tests/reducer-pick-next-actor.spec.ts
git commit -m "feat(rules): PickNextActor intent + reducer (zipper turn picking)"
```

---

## Task 6: Define + implement `MarkSurprised` intent + reducer

Director-only post-roll edit to mark/unmark surprise. Round-1-only.

**Files:**
- Create: `packages/shared/src/intents/mark-surprised.ts`
- Modify: `packages/shared/src/intents/index.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/rules/src/intents/mark-surprised.ts`
- Modify: `packages/rules/src/reducer.ts`
- Test: `packages/rules/tests/reducer-mark-surprised.spec.ts`

- [ ] **Step 1: Define the schema**

Create `packages/shared/src/intents/mark-surprised.ts`:

```ts
import { z } from 'zod';

/**
 * Phase 5 Pass 2b1 — Toggle the `surprised` flag on a single participant
 * (canon § 4.1). Director-only; rejected once round > 1 (surprise ends
 * automatically at the end of round 1 per canon, swept by `applyEndRound`).
 */
export const MarkSurprisedPayloadSchema = z
  .object({
    participantId: z.string().min(1),
    surprised: z.boolean(),
  })
  .strict();
export type MarkSurprisedPayload = z.infer<typeof MarkSurprisedPayloadSchema>;
```

- [ ] **Step 2: Wire into shared index + IntentTypes**

In `packages/shared/src/intents/index.ts`:

After the `MarkActionUsed` re-export, insert:

```ts
export { MarkSurprisedPayloadSchema } from './mark-surprised';
export type { MarkSurprisedPayload } from './mark-surprised';
```

Add `MarkSurprised: 'MarkSurprised',` to `IntentTypes` (between `MarkActionUsed` and `Note`).

Re-export from `packages/shared/src/index.ts`.

- [ ] **Step 3: Write the failing tests**

Create `packages/rules/tests/reducer-mark-surprised.spec.ts`:

```ts
import type { Intent, Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  type CampaignState,
  type StampedIntent,
  applyIntent,
  emptyCampaignState,
} from '../src/index';

const T = 1_700_000_000_000;
const campaignId = 'c1';

function intent(type: string, payload: unknown, overrides: Partial<Intent> = {}): StampedIntent {
  return {
    id: overrides.id ?? `i_${Math.random().toString(36).slice(2)}`,
    campaignId: overrides.campaignId ?? campaignId,
    actor: overrides.actor ?? { userId: 'director-user', role: 'director' },
    timestamp: overrides.timestamp ?? T,
    source: overrides.source ?? 'manual',
    type, payload,
    causedBy: overrides.causedBy,
  };
}

function pc(id: string): Participant {
  return {
    id, name: id, kind: 'pc', level: 1, currentStamina: 30, maxStamina: 30,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [], weaknesses: [], conditions: [], heroicResources: [],
    extras: [], surges: 0, recoveries: { current: 0, max: 0 }, recoveryValue: 0,
    ownerId: id, characterId: null,
    weaponDamageBonus: { melee: [0,0,0], ranged: [0,0,0] },
    activeAbilities: [], victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false },
    surprised: false,
  };
}

function readyState(round: number | null = 1): CampaignState {
  const s = emptyCampaignState(campaignId, 'director-user');
  return {
    ...s,
    activeDirectorId: 'director-user',
    participants: [pc('alice')],
    encounter: {
      id: 'e1', currentRound: round,
      firstSide: null, currentPickingSide: null, actedThisRound: [],
      turnOrder: [], activeParticipantId: null,
      turnState: {}, malice: { current: 0, lastMaliciousStrikeRound: null },
    },
  };
}

describe('MarkSurprised', () => {
  it('toggles surprised true on a participant when dispatched by the director', () => {
    const s = readyState();
    const r = applyIntent(s, intent('MarkSurprised', { participantId: 'alice', surprised: true }));
    expect(r.errors).toBeUndefined();
    const alice = r.state.participants[0] as Participant;
    expect(alice.surprised).toBe(true);
  });

  it('toggles surprised back to false', () => {
    let s = readyState();
    s = applyIntent(s, intent('MarkSurprised', { participantId: 'alice', surprised: true })).state;
    s = applyIntent(s, intent('MarkSurprised', { participantId: 'alice', surprised: false })).state;
    expect((s.participants[0] as Participant).surprised).toBe(false);
  });

  it('rejects from a non-director', () => {
    const s = readyState();
    const r = applyIntent(
      s,
      intent('MarkSurprised', { participantId: 'alice', surprised: true }, { actor: { userId: 'alice', role: 'player' } }),
    );
    expect(r.errors?.[0]?.code).toBe('not_permitted');
  });

  it('rejects after round 1', () => {
    const s = readyState(2);
    const r = applyIntent(s, intent('MarkSurprised', { participantId: 'alice', surprised: true }));
    expect(r.errors?.[0]?.code).toBe('surprise_window_closed');
  });

  it('rejects unknown participant', () => {
    const s = readyState();
    const r = applyIntent(s, intent('MarkSurprised', { participantId: 'ghost', surprised: true }));
    expect(r.errors?.[0]?.code).toBe('unknown_participant');
  });
});
```

- [ ] **Step 4: Run tests; verify they fail**

Run: `pnpm --filter @ironyard/rules test reducer-mark-surprised`
Expected: 5 failing tests.

- [ ] **Step 5: Implement the reducer**

Create `packages/rules/src/intents/mark-surprised.ts`:

```ts
import { MarkSurprisedPayloadSchema, type Participant } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

export function applyMarkSurprised(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = MarkSurprisedPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: `MarkSurprised rejected: ${parsed.error.message}`, intentId: intent.id }],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  if (!state.encounter) {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: 'MarkSurprised: no active encounter', intentId: intent.id }],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }
  if (intent.actor.userId !== state.activeDirectorId) {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: 'MarkSurprised: director only', intentId: intent.id }],
      errors: [{ code: 'not_permitted', message: 'only the active director may mark surprise' }],
    };
  }
  if (state.encounter.currentRound !== null && state.encounter.currentRound > 1) {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: 'MarkSurprised: surprise ends after round 1', intentId: intent.id }],
      errors: [{ code: 'surprise_window_closed', message: 'surprise can only be edited during round 1 or before initiative' }],
    };
  }
  const { participantId, surprised } = parsed.data;
  const exists = state.participants.some(
    (p): p is Participant => isParticipant(p) && p.id === participantId,
  );
  if (!exists) {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: `MarkSurprised: unknown participant ${participantId}`, intentId: intent.id }],
      errors: [{ code: 'unknown_participant', message: `unknown participant ${participantId}` }],
    };
  }
  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: state.participants.map((p) =>
        isParticipant(p) && p.id === participantId ? { ...p, surprised } : p,
      ),
    },
    derived: [],
    log: [{ kind: 'info', text: `${participantId} surprised = ${surprised}`, intentId: intent.id }],
  };
}
```

- [ ] **Step 6: Wire into reducer dispatch**

In `packages/rules/src/reducer.ts`:

```ts
import { applyMarkSurprised } from './intents/mark-surprised';
```

```ts
    case IntentTypes.MarkSurprised:
      return applyMarkSurprised(state, intent);
```

- [ ] **Step 7: Run tests; verify they pass**

Run: `pnpm --filter @ironyard/rules test reducer-mark-surprised`
Expected: all 5 pass.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/intents/mark-surprised.ts packages/shared/src/intents/index.ts packages/shared/src/index.ts packages/rules/src/intents/mark-surprised.ts packages/rules/src/reducer.ts packages/rules/tests/reducer-mark-surprised.spec.ts
git commit -m "feat(rules): MarkSurprised intent + reducer (director-only, round-1)"
```

---

## Task 7: Update `applyStartEncounter` to initialize zipper-init fields

Drop `turnOrder` from new encounters and seed `firstSide`/`currentPickingSide`/`actedThisRound` at null/null/[].

**Files:**
- Modify: `packages/rules/src/intents/start-encounter.ts`
- Test: `packages/rules/tests/start-encounter.spec.ts` (existing file)

- [ ] **Step 1: Read the existing test file to find the encounter-init assertions**

```bash
grep -n "turnOrder\|firstSide\|currentRound" packages/rules/tests/start-encounter.spec.ts | head -20
```

Note the test names that touch `turnOrder` — they need to be updated.

- [ ] **Step 2: Add new assertions**

In `packages/rules/tests/start-encounter.spec.ts`, find an existing test that asserts on `state.encounter` after dispatching `StartEncounter`. Add the following expectations to that test (or add a new dedicated test if cleaner):

```ts
    expect(r.state.encounter?.firstSide).toBeNull();
    expect(r.state.encounter?.currentPickingSide).toBeNull();
    expect(r.state.encounter?.actedThisRound).toEqual([]);
```

Run: `pnpm --filter @ironyard/rules test start-encounter`
Expected: failures on the new assertions (the encounter doesn't initialize the new fields yet).

- [ ] **Step 3: Update the reducer**

In `packages/rules/src/intents/start-encounter.ts`, find where the new `encounter` object is constructed (search for `id: encounterId` or `turnOrder: allParticipants`). Update the object literal to include the new fields. The diff is roughly:

```ts
    encounter: {
      id: encounterId,
      currentRound: 1,
      firstSide: null,
      currentPickingSide: null,
      actedThisRound: [],
      turnOrder: allParticipants.map((p) => p.id), // keep for now; removed in Task 12
      activeParticipantId: null,
      turnState: {},
      malice: { current: initialMalice, lastMaliciousStrikeRound: null },
    },
```

(Use the exact variable names from `start-encounter.ts` — `allParticipants`, `initialMalice`, etc. are placeholders; do not invent. Read the file first.)

- [ ] **Step 4: Run tests; verify they pass**

Run: `pnpm --filter @ironyard/rules test start-encounter`
Expected: pass including the new assertions.

Run: `pnpm --filter @ironyard/rules test`
Expected: full rules suite passes.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/intents/start-encounter.ts packages/rules/tests/start-encounter.spec.ts
git commit -m "feat(rules): StartEncounter initializes zipper-init fields"
```

---

## Task 8: Rewrite `applyEndTurn` to derive next picking side

Replace the "advance to next index in turnOrder" logic with `nextPickingSide(state)`. The save-ends and Talent-Clarity cascades stay.

**Files:**
- Modify: `packages/rules/src/intents/turn.ts`
- Test: `packages/rules/tests/reducer-turn.spec.ts` (existing)

- [ ] **Step 1: Add failing tests for the new EndTurn semantics**

Append to `packages/rules/tests/reducer-turn.spec.ts`:

```ts
describe('EndTurn (zipper-init)', () => {
  function stateWith(picking: 'heroes' | 'foes', acted: string[], active: string | null): CampaignState {
    const s = readyState(['alice', 'bob']);  // 2 PCs
    // Add a monster to give us a foes side too. readyState's `part()` makes PCs;
    // mutate one to monster.
    const goblin: Participant = { ...s.participants[0] as Participant, id: 'goblin', kind: 'monster', name: 'goblin' };
    const next = {
      ...s,
      participants: [...s.participants, goblin],
      encounter: {
        ...(s.encounter as NonNullable<CampaignState['encounter']>),
        firstSide: 'heroes' as const,
        currentPickingSide: picking,
        actedThisRound: acted,
        activeParticipantId: active,
      },
    };
    return next;
  }

  it('clears activeParticipantId and flips to the other side when both sides have unacted', () => {
    const s = stateWith('heroes', ['alice'], 'alice');
    const r = applyIntent(s, intent('EndTurn', {}));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.activeParticipantId).toBeNull();
    expect(r.state.encounter?.currentPickingSide).toBe('foes');
  });

  it('stays on the same side when the other side is exhausted (run-out rule)', () => {
    // alice and bob remain on heroes; goblin already acted.
    const s = stateWith('foes', ['goblin'], 'goblin');
    const r = applyIntent(s, intent('EndTurn', {}));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.currentPickingSide).toBe('heroes');
  });

  it('returns currentPickingSide null when both sides are exhausted', () => {
    const s = stateWith('foes', ['alice', 'bob', 'goblin'], 'goblin');
    const r = applyIntent(s, intent('EndTurn', {}));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.currentPickingSide).toBeNull();
  });
});
```

- [ ] **Step 2: Run; verify failures**

Run: `pnpm --filter @ironyard/rules test reducer-turn -t "EndTurn (zipper-init)"`
Expected: 3 failures — current `applyEndTurn` doesn't touch `currentPickingSide`.

The first two existing EndTurn tests in this file (lines 120+) also reference `turnOrder` for index-advance — those need migration too. Read those tests now to understand their assertions.

- [ ] **Step 3: Rewrite `applyEndTurn`**

In `packages/rules/src/intents/turn.ts`, locate `applyEndTurn`. Replace the body of the function (keeping the existing parse + guard prologue and the save-ends + Clarity + activeAbilities-EoT-drain cascades intact). The specific change is:

**Old code** (find these lines):
```ts
  const order = guard.encounter.turnOrder;
  const currentId = guard.encounter.activeParticipantId;
  const currentIdx = currentId === null ? -1 : order.indexOf(currentId);
  // Falling off the end (or off a stale id) parks at null; explicit StartRound
  // or EndRound moves the lifecycle on from there.
  const nextId =
    currentIdx >= 0 && currentIdx + 1 < order.length ? (order[currentIdx + 1] ?? null) : null;
```

**Replace with:**
```ts
  const currentId = guard.encounter.activeParticipantId;
  // Zipper initiative (canon § 4.1): clear activeParticipantId, derive the
  // next picking side from `actedThisRound` + side membership. Run-out rule
  // is encoded in `nextPickingSide()`.
  const nextSide = nextPickingSide({
    ...state,
    encounter: { ...guard.encounter, activeParticipantId: null },
  });
```

Update the log line further down:
```ts
  // Old:
  //   text: nextId ? `${currentId ?? 'no one'} ends turn, ${nextId} is up`
  //                : `${currentId ?? 'no one'} ends turn; round end pending`,
  // New:
      text: nextSide
        ? `${currentId ?? 'no one'} ends turn; ${nextSide} pick next`
        : `${currentId ?? 'no one'} ends turn; round end pending`,
```

Update the final return statement (the encounter object):
```ts
      encounter: {
        ...guard.encounter,
        activeParticipantId: null,
        currentPickingSide: nextSide,
        turnState: remainingTurnState,
      },
```

(Remove the `activeParticipantId: nextId,` assignment.)

Add the new import at the top of the file:
```ts
import { nextPickingSide } from '../state-helpers';
```

- [ ] **Step 4: Migrate the existing EndTurn tests in `reducer-turn.spec.ts`**

Find the existing `describe('StartTurn / EndTurn')` (or similar) block. Update assertions:

- Tests asserting `activeParticipantId === nextInOrder` should be updated to assert `activeParticipantId === null && currentPickingSide === <expected>`.
- Tests asserting that `EndTurn` from the last creature in turnOrder parks at null still pass — that maps to "both sides exhausted" in the new model when the encounter has only one side, but the existing fixture has only heroes, so `nextPickingSide` returns `'heroes'` until they all act. The assertion may need to switch to checking `actedThisRound` count.

Re-read each existing failing test and adjust. If a test asserts a specific `turnOrder` value, remove the assertion (the field is going away in Task 12).

- [ ] **Step 5: Run all rules tests**

Run: `pnpm --filter @ironyard/rules test`
Expected: full suite passes. Pay attention to `reducer-resources.spec.ts:467` which still dispatches `SetInitiative`; that test stays green because `SetInitiative` still works (Task 12 removes it).

Run: `pnpm --filter @ironyard/rules typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/intents/turn.ts packages/rules/tests/reducer-turn.spec.ts
git commit -m "feat(rules): applyEndTurn derives next picking side via nextPickingSide"
```

---

## Task 9: Update `applyStartRound` to reset `currentPickingSide` + `actedThisRound`

Rounds 2+ need to reset to `firstSide` per canon (winning side picks first every round).

**Files:**
- Modify: `packages/rules/src/intents/turn.ts`
- Test: `packages/rules/tests/reducer-turn.spec.ts`

- [ ] **Step 1: Add failing test**

Append to `packages/rules/tests/reducer-turn.spec.ts`:

```ts
describe('StartRound (zipper-init)', () => {
  it('rounds 2+ reset currentPickingSide to firstSide and clear actedThisRound', () => {
    const base = readyState(['alice', 'bob']);
    // Force into "round 1 ended" state with heroes having won.
    const s: CampaignState = {
      ...base,
      encounter: {
        ...(base.encounter as NonNullable<CampaignState['encounter']>),
        firstSide: 'heroes',
        currentPickingSide: null,
        actedThisRound: ['alice', 'bob'],
        activeParticipantId: null,
        currentRound: 1,
      },
    };
    const r = applyIntent(s, intent('StartRound', {}));
    expect(r.errors).toBeUndefined();
    expect(r.state.encounter?.currentRound).toBe(2);
    expect(r.state.encounter?.currentPickingSide).toBe('heroes');
    expect(r.state.encounter?.actedThisRound).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm --filter @ironyard/rules test reducer-turn -t "StartRound (zipper-init)"`
Expected: assertion failure — `currentPickingSide` still null and `actedThisRound` still `['alice', 'bob']`.

- [ ] **Step 3: Update the reducer**

In `packages/rules/src/intents/turn.ts`, locate `applyStartRound`. The current return statement sets `currentRound: round` and `activeParticipantId: firstId` (from `turnOrder[0]`).

Replace the encounter return to:

```ts
      encounter: {
        ...guard.encounter,
        currentRound: round,
        // Zipper initiative: reset pick state for the new round.
        currentPickingSide: guard.encounter.firstSide,
        actedThisRound: [],
        activeParticipantId: null,
        malice: { ...guard.encounter.malice, current: nextMalice },
      },
```

(Remove the `firstId` constant + the `activeParticipantId: firstId` line.)

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @ironyard/rules test reducer-turn`
Expected: new test passes. Existing StartRound tests may fail if they asserted on `activeParticipantId === firstId` — migrate those to assert `currentPickingSide === firstSide`.

Run: `pnpm --filter @ironyard/rules test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/intents/turn.ts packages/rules/tests/reducer-turn.spec.ts
git commit -m "feat(rules): StartRound resets currentPickingSide + actedThisRound"
```

---

## Task 10: Update `applyEndRound` to sweep `surprised` at end of round 1

**Files:**
- Modify: `packages/rules/src/intents/turn.ts`
- Test: `packages/rules/tests/reducer-turn.spec.ts`

- [ ] **Step 1: Add failing test**

Append to `packages/rules/tests/reducer-turn.spec.ts`:

```ts
describe('EndRound (zipper-init)', () => {
  it('clears surprised on every participant at end of round 1', () => {
    const base = readyState(['alice']);
    const s: CampaignState = {
      ...base,
      participants: base.participants.map((p) =>
        isParticipant(p) ? { ...p, surprised: true } : p,
      ),
      encounter: {
        ...(base.encounter as NonNullable<CampaignState['encounter']>),
        currentRound: 1,
      },
    };
    const r = applyIntent(s, intent('EndRound', {}));
    expect(r.errors).toBeUndefined();
    const alice = r.state.participants[0] as Participant;
    expect(alice.surprised).toBe(false);
  });

  it('leaves surprised alone on rounds > 1 (already cleared earlier)', () => {
    const base = readyState(['alice']);
    const s: CampaignState = {
      ...base,
      participants: base.participants.map((p) =>
        isParticipant(p) ? { ...p, surprised: true } : p,
      ),
      encounter: {
        ...(base.encounter as NonNullable<CampaignState['encounter']>),
        currentRound: 2,
      },
    };
    const r = applyIntent(s, intent('EndRound', {}));
    expect(r.errors).toBeUndefined();
    // round-2 surprise is a defensive-no-op; the field stays as-is.
    expect((r.state.participants[0] as Participant).surprised).toBe(true);
  });
});
```

The `isParticipant` import already exists in this file (line 9). If not, add `import { isParticipant } from '../src/types';`.

- [ ] **Step 2: Run, verify failure**

Run: `pnpm --filter @ironyard/rules test reducer-turn -t "EndRound (zipper-init)"`
Expected: first test fails — surprise is not cleared.

- [ ] **Step 3: Update `applyEndRound`**

In `packages/rules/src/intents/turn.ts`, find `applyEndRound`. After the existing `nextOpenActions` filter, add:

```ts
  // Phase 5 Pass 2b1: end-of-round-1 surprise sweep (canon § 4.1).
  const nextParticipants =
    guard.encounter.currentRound === 1
      ? state.participants.map((p) =>
          isParticipant(p) && p.surprised ? { ...p, surprised: false } : p,
        )
      : state.participants;
```

Update the return statement to use `nextParticipants`:

```ts
  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: nextParticipants,
      openActions: nextOpenActions,
      encounter: {
        ...guard.encounter,
        activeParticipantId: null,
      },
    },
    derived: [],
    log: [...],
  };
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @ironyard/rules test reducer-turn`
Expected: pass.

Run: `pnpm --filter @ironyard/rules test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/intents/turn.ts packages/rules/tests/reducer-turn.spec.ts
git commit -m "feat(rules): EndRound sweeps surprised flag at end of round 1"
```

---

## Task 11: Update `useSessionSocket` mirror — new fields + reflect cases

The client-side WS mirror has its own `ActiveEncounter` type and `reflect()` function. Mirror the engine changes here.

**Files:**
- Modify: `apps/web/src/ws/useSessionSocket.ts`

- [ ] **Step 1: Extend the mirror `ActiveEncounter` type**

In `apps/web/src/ws/useSessionSocket.ts`, find the `ActiveEncounter` type (currently lines 86–95). Update to:

```ts
export type ActiveEncounter = {
  encounterId: string;
  participants: RosterEntry[];
  currentRound: number | null;
  turnOrder: string[];                                  // deprecated; removed in Task 12
  activeParticipantId: string | null;
  firstSide: 'heroes' | 'foes' | null;
  currentPickingSide: 'heroes' | 'foes' | null;
  actedThisRound: string[];
  malice: MaliceState;
};
```

- [ ] **Step 2: Update the `StartEncounter` reflect to seed the new fields**

Find `if (type === IntentTypes.StartEncounter)` (around line 122). Update the return object:

```ts
    return {
      encounterId: encounterId ?? '',
      participants: [],
      currentRound: null,
      turnOrder: [],
      activeParticipantId: null,
      firstSide: null,
      currentPickingSide: null,
      actedThisRound: [],
      malice: { current: 0, lastMaliciousStrikeRound: null },
    };
```

- [ ] **Step 3: Import the new payload types**

At the top of the file, in the existing `import { ... } from '@ironyard/shared'` block, add `RollInitiativePayload`, `PickNextActorPayload`, `MarkSurprisedPayload`. (Locate the alphabetical placement — they fit after `MarkActionUsedPayload` and `LeaveLobbyPayload`.)

Also add `IntentTypes.PickNextActor`, `IntentTypes.RollInitiative`, `IntentTypes.MarkSurprised` to whatever switch your existing reflect uses. (The current code uses string-equality on `IntentTypes.X`; these constants come for free with the IntentTypes addition.)

Also import:
```ts
import { participantSide, nextPickingSide } from '@ironyard/rules';
```

(If `nextPickingSide` and `participantSide` are not yet exported from the rules package root, export them: edit `packages/rules/src/index.ts` to add `export { participantSide, nextPickingSide } from './state-helpers';`. Verify before adding the import.)

- [ ] **Step 4: Add reflect cases for the new intents**

After the existing `EndTurn` reflect case (around line 204), insert:

```ts
  if (type === IntentTypes.RollInitiative) {
    const { winner, surprised } = payload as RollInitiativePayload;
    return {
      ...prev,
      firstSide: winner,
      currentPickingSide: winner,
      actedThisRound: [],
      participants: prev.participants.map((p) =>
        isParticipantEntry(p) && surprised.includes(p.id) ? { ...p, surprised: true } : p,
      ),
    };
  }

  if (type === IntentTypes.PickNextActor) {
    const { participantId } = payload as PickNextActorPayload;
    return {
      ...prev,
      actedThisRound: [...prev.actedThisRound, participantId],
      // activeParticipantId is set by the cascaded StartTurn's reflect case.
    };
  }

  if (type === IntentTypes.MarkSurprised) {
    const { participantId, surprised } = payload as MarkSurprisedPayload;
    return {
      ...prev,
      participants: prev.participants.map((p) =>
        isParticipantEntry(p) && p.id === participantId ? { ...p, surprised } : p,
      ),
    };
  }
```

- [ ] **Step 5: Replace the existing `EndTurn` reflect with the side-flip derivation**

Replace the existing `if (type === IntentTypes.EndTurn)` block (around line 204) with:

```ts
  if (type === IntentTypes.EndTurn) {
    void (payload as EndTurnPayload);
    // Pure derivation matches the engine — see `nextPickingSide` in state-helpers.ts.
    const acted = new Set(prev.actedThisRound);
    let unactedHeroes = 0;
    let unactedFoes = 0;
    for (const p of prev.participants) {
      if (!isParticipantEntry(p) || acted.has(p.id)) continue;
      if (p.kind === 'pc') unactedHeroes++;
      else unactedFoes++;
    }
    let next: 'heroes' | 'foes' | null;
    if (unactedHeroes === 0 && unactedFoes === 0) next = null;
    else if (unactedHeroes === 0) next = 'foes';
    else if (unactedFoes === 0) next = 'heroes';
    else next = prev.currentPickingSide === 'heroes' ? 'foes' : 'heroes';
    return {
      ...prev,
      activeParticipantId: null,
      currentPickingSide: next,
    };
  }
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @ironyard/web typecheck`
Expected: clean. If `RollInitiativePayload` etc. are missing from `@ironyard/shared`'s root export, add them in Task 3/5/6's re-export blocks.

Run: `pnpm --filter @ironyard/web test`
Expected: existing tests pass. (The combat-related tests don't exercise the new reflect cases; that's OK — manual smoke covers them in Task 22.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/ws/useSessionSocket.ts packages/rules/src/index.ts
git commit -m "feat(web/ws): mirror new zipper-init fields + RollInitiative/PickNextActor/MarkSurprised/EndTurn reflect"
```

---

## Task 12: Remove `SetInitiative` and `turnOrder` field

All callers have migrated; tear down the legacy surface in one commit.

**Files:**
- Delete: `packages/shared/src/intents/turn.ts` (SetInitiative half) — actually edit
- Modify: `packages/shared/src/intents/turn.ts`
- Modify: `packages/shared/src/intents/index.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/rules/src/intents/turn.ts`
- Modify: `packages/rules/src/reducer.ts`
- Modify: `packages/rules/src/types.ts`
- Modify: `packages/rules/src/intents/start-encounter.ts`
- Modify: `packages/rules/tests/reducer-turn.spec.ts`
- Modify: `packages/rules/tests/reducer-resources.spec.ts`
- Modify: `apps/web/src/ws/useSessionSocket.ts`

- [ ] **Step 1: Find every caller**

```bash
grep -rn "SetInitiative\|turnOrder" packages apps 2>/dev/null | grep -v node_modules | grep -v ".turbo" | grep -v docs
```

Note every match — these all need to be updated or removed.

- [ ] **Step 2: Remove from `packages/shared/src/intents/turn.ts`**

Delete the `SetInitiativePayloadSchema` declaration + the `SetInitiativePayload` type (lines 29–32).

- [ ] **Step 3: Remove from `packages/shared/src/intents/index.ts`**

Remove `SetInitiativePayloadSchema` from the `./turn` re-export block. Remove `SetInitiativePayload` from the type re-export. Remove `SetInitiative: 'SetInitiative',` from `IntentTypes`.

- [ ] **Step 4: Remove from `packages/shared/src/index.ts`**

Drop `SetInitiativePayloadSchema` and `SetInitiativePayload` from the re-exports.

- [ ] **Step 5: Remove from `packages/rules/src/intents/turn.ts`**

Delete the entire `applySetInitiative` function. Remove `SetInitiativePayloadSchema` from the `@ironyard/shared` import.

- [ ] **Step 6: Remove from `packages/rules/src/reducer.ts`**

Remove the `applySetInitiative` import. Remove the `case IntentTypes.SetInitiative:` block.

- [ ] **Step 7: Remove `turnOrder` from `EncounterPhase`**

In `packages/rules/src/types.ts`, delete the `turnOrder: string[];` line from `EncounterPhase`. Update the inline comment about deprecation.

- [ ] **Step 8: Update `applyStartEncounter` to drop `turnOrder` from the new encounter object**

In `packages/rules/src/intents/start-encounter.ts`, remove the `turnOrder: allParticipants.map((p) => p.id),` line (or whatever the exact line reads).

- [ ] **Step 9: Update WS mirror**

In `apps/web/src/ws/useSessionSocket.ts`:
- Remove `turnOrder: string[];` from `ActiveEncounter`.
- Remove the `turnOrder: []` initialization in the `StartEncounter` reflect.
- Find any other references and remove (e.g. the `LobbySnapshot` parsing block around line 530+ may include `turnOrder?: string[];` and `turnOrder: enc.turnOrder ?? [],` — strip both).

- [ ] **Step 10: Update reducer tests**

In `packages/rules/tests/reducer-turn.spec.ts`:
- Remove the entire `describe('SetInitiative')` block (lines 73–111).
- In `readyState()`, remove `turnOrder: participants.map((p) => p.id),`.
- Any remaining test that referenced `turnOrder` in an assertion should be deleted or migrated.

In `packages/rules/tests/reducer-resources.spec.ts`:
- Line ~467 dispatches `intent('SetInitiative', { order: ['pc_talent', 'm_goblin'] })`. Delete that line (the test's purpose can be preserved by directly seeding `currentPickingSide` if needed, but most likely the line is incidental).

- [ ] **Step 11: Update any remaining test fixtures**

Run again:
```bash
grep -rn "SetInitiative\|turnOrder" packages apps 2>/dev/null | grep -v node_modules | grep -v ".turbo" | grep -v docs | grep -v ".d.ts"
```

Expected: zero matches. If there are stragglers (e.g. snapshot fixtures), delete the relevant line.

- [ ] **Step 12: Run full suite**

Run: `pnpm test`
Expected: clean.

Run: `pnpm typecheck`
Expected: clean.

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 13: Commit**

```bash
git add -A packages apps
git commit -m "refactor(shared,rules,web): remove SetInitiative + turnOrder (replaced by zipper init)"
```

---

## Task 13: Add `intentDescribe` cases for the three new intents

Toast strings + log readability.

**Files:**
- Modify: `apps/web/src/lib/intentDescribe.ts`

- [ ] **Step 1: Read the existing patterns**

```bash
grep -n "case IntentTypes\|nameOf\|describe(" apps/web/src/lib/intentDescribe.ts | head -30
```

Note the structure of an existing case (e.g. `MarkActionUsed` or `AdjustVictories`) — they typically resolve participantId to a human name via `nameOf(state, id)`.

- [ ] **Step 2: Add cases**

In `apps/web/src/lib/intentDescribe.ts`, add three cases near the others (alphabetical placement):

```ts
    case IntentTypes.RollInitiative: {
      const p = intent.payload as RollInitiativePayload;
      const reason = p.rolledD10 !== undefined ? ` (d10=${p.rolledD10})` : '';
      const surpriseSummary = p.surprised.length > 0
        ? `; ${p.surprised.length} surprised`
        : '';
      return `Initiative — ${p.winner} first${reason}${surpriseSummary}`;
    }
    case IntentTypes.PickNextActor: {
      const p = intent.payload as PickNextActorPayload;
      return `${nameOf(state, p.participantId)} picked next`;
    }
    case IntentTypes.MarkSurprised: {
      const p = intent.payload as MarkSurprisedPayload;
      return p.surprised
        ? `${nameOf(state, p.participantId)} marked surprised`
        : `${nameOf(state, p.participantId)} unmarked surprised`;
    }
```

Add the necessary type imports at the top of the file from `@ironyard/shared`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @ironyard/web typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/intentDescribe.ts
git commit -m "feat(web/toasts): describe RollInitiative / PickNextActor / MarkSurprised"
```

---

## Task 14: Extend `ParticipantRow` primitive with `isActed`, `isSurprised`, `pickAffordance`

Visual additions. No tests required by the existing codebase (no spec exists for ParticipantRow), but add a visual smoke story.

**Files:**
- Modify: `apps/web/src/primitives/ParticipantRow.tsx`

- [ ] **Step 1: Read the existing file**

```bash
wc -l apps/web/src/primitives/ParticipantRow.tsx
```

Note the line count and the existing props shape. Locate the props interface (likely `ParticipantRowProps`).

- [ ] **Step 2: Add new props to the type**

Extend the props interface:

```ts
export type ParticipantRowProps = {
  // ...existing props...
  isActed?: boolean;
  isSurprised?: boolean;
  pickAffordance?:
    | { kind: 'self'; onClick: () => void; label: string }
    | { kind: 'other'; onClick: () => void; label: string }
    | { kind: 'foe-tap'; onClick: () => void }
    | null;
};
```

- [ ] **Step 3: Render the new visual states**

Inside the JSX:

- When `isActed` is true: wrap the row in a div with `opacity-55` (or use the existing className composition pattern). Render a trailing `<span className="font-mono uppercase text-text-mute">ACTED</span>` in the meta line slot.
- When `isSurprised` is true: render `<span className="font-mono uppercase text-foe">SURPRISED</span>` in the meta line slot (use existing chip styling if a chip primitive exists).
- When `pickAffordance` is set, render the trailing affordance:
  - `kind: 'self'` → a primary Button with the given label, calling `pickAffordance.onClick`.
  - `kind: 'other'` → a ghost link styled as `text-text-mute hover:text-accent`, with the given label.
  - `kind: 'foe-tap'` → the entire row's `onClick` handler dispatches `pickAffordance.onClick`. Add cursor-pointer styling and a subtle hover bg.

The existing `isTurn` / `isTarget` visual priority logic stays. Add the new affordances last so they layer on top.

- [ ] **Step 4: Visual sanity check**

Run: `pnpm --filter @ironyard/web dev` (in a separate terminal). Open `http://localhost:5173` (or 5174). Navigate to a campaign play screen — the existing rendering should still work unchanged because the new props are optional and default to `false`/`null`.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @ironyard/web typecheck`
Run: `pnpm --filter @ironyard/web test`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/primitives/ParticipantRow.tsx
git commit -m "feat(web/primitives): ParticipantRow isActed / isSurprised / pickAffordance props"
```

---

## Task 15: Build `PickerAffordance` helper

Pure-function derivation that maps `(participant, currentPickingSide, actedThisRound, viewerId, isActingAsDirector)` to a `pickAffordance` value for ParticipantRow.

**Files:**
- Create: `apps/web/src/pages/combat/initiative/PickerAffordance.tsx`
- Create: `apps/web/src/pages/combat/initiative/PickerAffordance.spec.tsx`
- Create: `apps/web/src/pages/combat/initiative/index.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/pages/combat/initiative/PickerAffordance.spec.tsx`:

```ts
import type { Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { derivePickAffordance } from './PickerAffordance';

function pc(id: string, ownerId: string | null): Participant {
  return {
    id, name: id, kind: 'pc', level: 1, currentStamina: 30, maxStamina: 30,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [], weaknesses: [], conditions: [], heroicResources: [],
    extras: [], surges: 0, recoveries: { current: 0, max: 0 }, recoveryValue: 0,
    ownerId, characterId: null,
    weaponDamageBonus: { melee: [0,0,0], ranged: [0,0,0] },
    activeAbilities: [], victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false },
    surprised: false,
  };
}
function monster(id: string): Participant { return { ...pc(id, null), kind: 'monster' }; }

const onPick = () => {};

describe('derivePickAffordance', () => {
  it('returns null if the participant already acted', () => {
    const r = derivePickAffordance({
      participant: pc('alice', 'alice-user'),
      currentPickingSide: 'heroes',
      acted: ['alice'],
      viewerId: 'alice-user',
      isActingAsDirector: false,
      onPick,
    });
    expect(r).toBeNull();
  });

  it('returns self for the viewer\'s own unacted PC when heroes are picking', () => {
    const r = derivePickAffordance({
      participant: pc('alice', 'alice-user'),
      currentPickingSide: 'heroes',
      acted: [],
      viewerId: 'alice-user',
      isActingAsDirector: false,
      onPick,
    });
    expect(r?.kind).toBe('self');
  });

  it('returns null for another player\'s PC in player view', () => {
    const r = derivePickAffordance({
      participant: pc('alice', 'alice-user'),
      currentPickingSide: 'heroes',
      acted: [],
      viewerId: 'bob-user',
      isActingAsDirector: false,
      onPick,
    });
    expect(r).toBeNull();
  });

  it('returns other for another player\'s PC in director view', () => {
    const r = derivePickAffordance({
      participant: pc('alice', 'alice-user'),
      currentPickingSide: 'heroes',
      acted: [],
      viewerId: 'director-user',
      isActingAsDirector: true,
      onPick,
    });
    expect(r?.kind).toBe('other');
  });

  it('returns foe-tap for unacted foes in director view when foes are picking', () => {
    const r = derivePickAffordance({
      participant: monster('goblin'),
      currentPickingSide: 'foes',
      acted: [],
      viewerId: 'director-user',
      isActingAsDirector: true,
      onPick,
    });
    expect(r?.kind).toBe('foe-tap');
  });

  it('returns null for foes in player view', () => {
    const r = derivePickAffordance({
      participant: monster('goblin'),
      currentPickingSide: 'foes',
      acted: [],
      viewerId: 'alice-user',
      isActingAsDirector: false,
      onPick,
    });
    expect(r).toBeNull();
  });

  it('returns null when the participant is on the non-picking side', () => {
    const r = derivePickAffordance({
      participant: pc('alice', 'alice-user'),
      currentPickingSide: 'foes',
      acted: [],
      viewerId: 'alice-user',
      isActingAsDirector: false,
      onPick,
    });
    expect(r).toBeNull();
  });

  it('returns null when currentPickingSide is null', () => {
    const r = derivePickAffordance({
      participant: pc('alice', 'alice-user'),
      currentPickingSide: null,
      acted: [],
      viewerId: 'alice-user',
      isActingAsDirector: false,
      onPick,
    });
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 2: Run failures**

Run: `pnpm --filter @ironyard/web test PickerAffordance`
Expected: 8 failures — `derivePickAffordance` not exported.

- [ ] **Step 3: Implement**

Create `apps/web/src/pages/combat/initiative/PickerAffordance.tsx`:

```ts
import type { Participant } from '@ironyard/shared';

type PickAffordance =
  | { kind: 'self'; onClick: () => void; label: string }
  | { kind: 'other'; onClick: () => void; label: string }
  | { kind: 'foe-tap'; onClick: () => void };

export function derivePickAffordance(args: {
  participant: Participant;
  currentPickingSide: 'heroes' | 'foes' | null;
  acted: string[];
  viewerId: string | null;
  isActingAsDirector: boolean;
  onPick: () => void;
}): PickAffordance | null {
  const { participant, currentPickingSide, acted, viewerId, isActingAsDirector, onPick } = args;
  if (!currentPickingSide) return null;
  if (acted.includes(participant.id)) return null;
  const side = participant.kind === 'pc' ? 'heroes' : 'foes';
  if (side !== currentPickingSide) return null;

  if (side === 'heroes') {
    if (participant.ownerId && participant.ownerId === viewerId) {
      return { kind: 'self', onClick: onPick, label: "I'LL GO NOW" };
    }
    if (isActingAsDirector) {
      return { kind: 'other', onClick: onPick, label: 'Pick for them' };
    }
    return null;
  }

  // foes
  if (isActingAsDirector) {
    return { kind: 'foe-tap', onClick: onPick };
  }
  return null;
}
```

Also create `apps/web/src/pages/combat/initiative/index.ts`:

```ts
export { derivePickAffordance } from './PickerAffordance';
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @ironyard/web test PickerAffordance`
Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/combat/initiative/PickerAffordance.tsx apps/web/src/pages/combat/initiative/PickerAffordance.spec.tsx apps/web/src/pages/combat/initiative/index.ts
git commit -m "feat(web/combat): derivePickAffordance — pure pickAffordance derivation"
```

---

## Task 16: Build `RollInitiativeOverlay` component

The left-pane overlay with Roll / Pick-manually / surprise-marking modes. Uses `useDispatch` to send the final `RollInitiative` intent.

**Files:**
- Create: `apps/web/src/pages/combat/initiative/RollInitiativeOverlay.tsx`

- [ ] **Step 1: Read the existing dice helper + dispatch pattern**

```bash
grep -rn "rollD10\|Math.random.*10\|dispatchRoll" apps/web/src 2>/dev/null | head -10
grep -rn "useDispatch\|dispatch:" apps/web/src/ws 2>/dev/null | head -10
```

Note how existing dispatches (e.g. in DirectorCombat) call `dispatch({ type: 'RollPower', payload: ... })`.

- [ ] **Step 2: Implement the overlay**

Create `apps/web/src/pages/combat/initiative/RollInitiativeOverlay.tsx`:

```tsx
import { useMemo, useState } from 'react';
import type { Participant } from '@ironyard/shared';

type Side = 'heroes' | 'foes';

type Props = {
  participants: Participant[];
  isActingAsDirector: boolean;
  onRoll: (payload: { winner: Side; surprised: string[]; rolledD10?: number }) => void;
};

function rollD10(): number {
  return 1 + Math.floor(Math.random() * 10);
}

function sideOf(p: Participant): Side {
  return p.kind === 'pc' ? 'heroes' : 'foes';
}

export function RollInitiativeOverlay({ participants, isActingAsDirector, onRoll }: Props) {
  const [surprised, setSurprised] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'default' | 'pick-manual' | 'reveal'>('default');
  const [rolledValue, setRolledValue] = useState<number | null>(null);

  const counts = useMemo(() => {
    let heroes = 0, foes = 0;
    for (const p of participants) {
      if (sideOf(p) === 'heroes') heroes++;
      else foes++;
    }
    return { heroes, foes };
  }, [participants]);

  // Compute auto-pick prediction live.
  const autoPick: Side | null = useMemo(() => {
    const heroSurp = participants.filter((p) => sideOf(p) === 'heroes').every((p) => surprised.has(p.id) || p.surprised);
    const foeSurp = participants.filter((p) => sideOf(p) === 'foes').every((p) => surprised.has(p.id) || p.surprised);
    const anyHeroes = counts.heroes > 0;
    const anyFoes = counts.foes > 0;
    if (anyHeroes && heroSurp && !(anyFoes && foeSurp)) return 'foes';
    if (anyFoes && foeSurp && !(anyHeroes && heroSurp)) return 'heroes';
    return null;
  }, [participants, surprised, counts]);

  function toggleSurprised(id: string) {
    setSurprised((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function send(winner: Side, rolledD10?: number) {
    onRoll({ winner, surprised: [...surprised], rolledD10 });
  }

  function onRollClick() {
    if (autoPick) {
      // Surprise auto-pick — skip d10, send directly.
      send(autoPick);
      return;
    }
    const d10 = rollD10();
    setRolledValue(d10);
    setMode('reveal');
    // Reveal then auto-confirm pattern handled in the reveal-view JSX below.
  }

  // === Render ===
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-ink-0/80 backdrop-blur-sm"
      role="dialog"
      aria-label="Roll initiative"
    >
      <div className="w-full max-w-md bg-ink-1 border border-line p-6 flex flex-col gap-4">
        <h2 className="font-mono uppercase text-lg tracking-wider">Roll Initiative</h2>
        <div className="text-text-dim text-sm">
          {counts.heroes} HEROES · {counts.foes} FOES
        </div>
        {surprised.size > 0 && (
          <div className="font-mono uppercase text-xs text-foe">
            {surprised.size} surprised
          </div>
        )}
        {autoPick && (
          <div className="font-mono uppercase text-xs text-accent">
            Auto-pick: {autoPick} (one side fully surprised)
          </div>
        )}

        {mode === 'default' && (
          <>
            <button
              type="button"
              className="bg-accent text-ink-0 px-4 py-3 font-mono uppercase tracking-wider"
              onClick={onRollClick}
            >
              Roll d10
            </button>
            <button
              type="button"
              className="font-mono uppercase text-xs text-text-mute hover:text-accent"
              onClick={() => setMode('pick-manual')}
            >
              Pick manually →
            </button>
          </>
        )}

        {mode === 'pick-manual' && (
          <>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 bg-hero text-ink-0 px-4 py-3 font-mono uppercase"
                onClick={() => send('heroes')}
                disabled={autoPick !== null && autoPick !== 'heroes'}
              >
                Players first
              </button>
              <button
                type="button"
                className="flex-1 bg-foe text-ink-0 px-4 py-3 font-mono uppercase"
                onClick={() => send('foes')}
                disabled={autoPick !== null && autoPick !== 'foes'}
              >
                Director first
              </button>
            </div>
            <button
              type="button"
              className="font-mono uppercase text-xs text-text-mute hover:text-accent"
              onClick={() => setMode('default')}
            >
              ← Back to roll
            </button>
          </>
        )}

        {mode === 'reveal' && rolledValue !== null && (
          <>
            <div className="text-6xl font-mono text-accent text-center my-4">{rolledValue}</div>
            <div className="text-text-dim text-sm text-center">
              {rolledValue >= 6 ? 'Players choose first' : 'Director chooses first'}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 bg-hero text-ink-0 px-4 py-3 font-mono uppercase"
                onClick={() => send('heroes', rolledValue)}
              >
                Players first
              </button>
              <button
                type="button"
                className="flex-1 bg-foe text-ink-0 px-4 py-3 font-mono uppercase"
                onClick={() => send('foes', rolledValue)}
              >
                Director first
              </button>
            </div>
          </>
        )}

        {isActingAsDirector && (
          <div className="border-t border-line-soft pt-4 flex flex-col gap-2">
            <div className="font-mono uppercase text-xs text-text-mute">Tap rows behind to mark surprised</div>
            {participants.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={surprised.has(p.id) || p.surprised}
                  disabled={p.surprised}
                  onChange={() => toggleSurprised(p.id)}
                />
                <span>{p.name}</span>
                <span className="font-mono uppercase text-xs text-text-mute">
                  ({sideOf(p)})
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

Note: the spec described "tap rows behind the overlay to toggle surprise" as the gesture. Pragmatic implementation for 2b1 ships with an in-overlay checkbox list — same outcome, simpler to implement, and avoids fighting with overlay z-index. If at smoke-test (Task 22) the user prefers the row-tap-through, switch the implementation; the overlay's component contract (`surprised: Set<string>` local state) stays the same.

- [ ] **Step 3: Wire `index.ts`**

Update `apps/web/src/pages/combat/initiative/index.ts`:

```ts
export { derivePickAffordance } from './PickerAffordance';
export { RollInitiativeOverlay } from './RollInitiativeOverlay';
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @ironyard/web typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/combat/initiative/RollInitiativeOverlay.tsx apps/web/src/pages/combat/initiative/index.ts
git commit -m "feat(web/combat): RollInitiativeOverlay — roll d10 / manual side / surprise marking"
```

---

## Task 17: Extend `InlineHeader` with picking-side pill

Add a new `pickingSide` prop that drives a `HEROES PICK` / `DIRECTOR PICKS` pill in the trailing slot when no turn is active.

**Files:**
- Modify: `apps/web/src/pages/combat/combat-header/InlineHeader.tsx`

- [ ] **Step 1: Read existing InlineHeader props**

```bash
grep -n "Props\|interface\|type Inline" apps/web/src/pages/combat/combat-header/InlineHeader.tsx | head
```

- [ ] **Step 2: Add new optional prop**

Extend the `InlineHeaderProps` type:

```ts
type InlineHeaderProps = {
  // ...existing props...
  pickingSide?: 'heroes' | 'foes' | null;
};
```

- [ ] **Step 3: Render the pill when a turn is not in progress**

The existing trailing slot already toggles between "End-turn button (active participant's owner)", "KORVA's turn (others)", and empty (per Pass-2a PS #9). Add a new branch that takes priority when no `activeParticipantId` is set:

```tsx
// Pseudo — adapt to existing render structure:
{!isAnyTurnActive && pickingSide && (
  <span className={`font-mono uppercase tracking-wider px-3 py-1 ${pickingSide === 'heroes' ? 'text-hero' : 'text-foe'}`}>
    {pickingSide === 'heroes' ? 'HEROES PICK' : 'DIRECTOR PICKS'}
  </span>
)}
```

`isAnyTurnActive` is whatever the existing component uses to determine "is there an active turn." If the component takes `activeParticipantName` or similar, use that as the truthiness check.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @ironyard/web typecheck`
Expected: clean.

Run: `pnpm --filter @ironyard/web test InlineHeader` (if a spec exists; if not, skip).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/combat/combat-header/InlineHeader.tsx
git commit -m "feat(web/combat): InlineHeader pickingSide pill between turns"
```

---

## Task 18: Wire `PartyRail` and `EncounterRail` to consume `pickAffordance`

Thread the new derivation through both rails.

**Files:**
- Modify: `apps/web/src/pages/combat/PartyRail.tsx`
- Modify: `apps/web/src/pages/combat/EncounterRail.tsx`

- [ ] **Step 1: Read both rail files to find their `ParticipantRow` invocations**

```bash
grep -n "ParticipantRow\|onSelect\|viewerRole" apps/web/src/pages/combat/PartyRail.tsx apps/web/src/pages/combat/EncounterRail.tsx
```

Note where they map participants to rows.

- [ ] **Step 2: Add the necessary props to each rail**

Each rail needs to accept (or compute from inputs already in scope):

- `currentPickingSide: 'heroes' | 'foes' | null`
- `actedThisRound: string[]`
- `viewerId: string | null`
- `isActingAsDirector: boolean`
- `onPick: (participantId: string) => void` — callback that dispatches `PickNextActor`

If these aren't already part of the rail's props, add them. For PartyRail and EncounterRail, the caller is `DirectorCombat` (Task 19 will pass them in).

- [ ] **Step 3: Derive `pickAffordance` per row**

Inside each rail, in the participant `.map(...)`:

```tsx
{participants.map((p) => {
  const pickAffordance = derivePickAffordance({
    participant: p,
    currentPickingSide,
    acted: actedThisRound,
    viewerId,
    isActingAsDirector,
    onPick: () => onPick(p.id),
  });
  return (
    <ParticipantRow
      key={p.id}
      // ...existing props...
      isActed={actedThisRound.includes(p.id)}
      isSurprised={p.surprised}
      pickAffordance={pickAffordance}
    />
  );
})}
```

Import `derivePickAffordance` from `./initiative`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @ironyard/web typecheck`
Expected: failures in DirectorCombat where it constructs the rails without the new props. Those are fixed in Task 19.

- [ ] **Step 5: Commit (atomic; will leave DirectorCombat broken — defer commit to Task 19)**

Don't commit yet. Continue to Task 19 first, then commit Tasks 18 + 19 together.

---

## Task 19: Integrate the overlay + picking-phase chrome in `DirectorCombat`

The integration point. Mount the overlay when `firstSide === null`; pass picking-phase state down to InlineHeader, PartyRail, EncounterRail.

**Files:**
- Modify: `apps/web/src/pages/combat/DirectorCombat.tsx`

- [ ] **Step 1: Read the page structure to find the SplitPane and dispatch helpers**

```bash
grep -n "SplitPane\|PartyRail\|EncounterRail\|InlineHeader\|dispatch\|useSessionSocket" apps/web/src/pages/combat/DirectorCombat.tsx | head -30
```

- [ ] **Step 2: Derive picking-phase state from `activeEncounter`**

Near the top of `DirectorCombat` (after the existing `useSessionSocket` call), add:

```ts
const firstSide = activeEncounter?.firstSide ?? null;
const currentPickingSide = activeEncounter?.currentPickingSide ?? null;
const actedThisRound = activeEncounter?.actedThisRound ?? [];
const viewerId = me.data?.user.id ?? null;
```

- [ ] **Step 3: Add a `handlePickNextActor` dispatcher**

Below the existing dispatch helpers (e.g. `handleEndTurn`):

```ts
const handlePickNextActor = useCallback(
  (participantId: string) => {
    const participant = activeEncounter?.participants.find(
      (p): p is Participant => 'id' in p && p.id === participantId,
    );
    if (!participant) return;
    // Pre-roll a d3 if this PC has a d3-gain heroic resource.
    const resource = participant.heroicResources[0];
    const config = resource ? HEROIC_RESOURCES[resource.name] : undefined;
    const needsD3 = config?.baseGain.onTurnStart.kind === 'd3';
    const payload = needsD3
      ? { participantId, rolls: { d3: 1 + Math.floor(Math.random() * 3) } }
      : { participantId };
    dispatch({ type: IntentTypes.PickNextActor, payload });
  },
  [activeEncounter, dispatch],
);
```

Imports needed:
```ts
import { HEROIC_RESOURCES } from '@ironyard/rules';
// If HEROIC_RESOURCES isn't exported from rules root, export it.
import { IntentTypes } from '@ironyard/shared';
import type { Participant } from '@ironyard/shared';
import { useCallback } from 'react';
```

- [ ] **Step 4: Add a `handleRollInitiative` dispatcher**

```ts
const handleRollInitiative = useCallback(
  (payload: { winner: 'heroes' | 'foes'; surprised: string[]; rolledD10?: number }) => {
    dispatch({ type: IntentTypes.RollInitiative, payload });
  },
  [dispatch],
);
```

- [ ] **Step 5: Mount the overlay**

In the JSX, find the SplitPane that contains the rails. Wrap it (or the left-pane half) in a `<div className="relative">` so the overlay's `absolute inset-0` positions correctly. Then conditionally render the overlay:

```tsx
{activeEncounter && firstSide === null && (
  <RollInitiativeOverlay
    participants={activeEncounter.participants.filter(
      (p): p is Participant => 'id' in p,
    )}
    isActingAsDirector={isActingAsDirector}
    onRoll={handleRollInitiative}
  />
)}
```

Import: `import { RollInitiativeOverlay } from './initiative';`

- [ ] **Step 6: Pass picking-phase props to rails + InlineHeader**

To `<PartyRail ...>` and `<EncounterRail ...>`:

```tsx
<PartyRail
  // ...existing props...
  currentPickingSide={currentPickingSide}
  actedThisRound={actedThisRound}
  viewerId={viewerId}
  isActingAsDirector={isActingAsDirector}
  onPick={handlePickNextActor}
/>
```

(Same for `EncounterRail`.)

To `<InlineHeader ...>`:

```tsx
<InlineHeader
  // ...existing props...
  pickingSide={currentPickingSide && !activeEncounter?.activeParticipantId ? currentPickingSide : null}
/>
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @ironyard/web typecheck`
Expected: clean.

Run: `pnpm --filter @ironyard/web test`
Expected: existing tests pass (the new code paths aren't unit-tested at the page level).

- [ ] **Step 8: Commit Tasks 18 + 19 together**

```bash
git add apps/web/src/pages/combat/PartyRail.tsx apps/web/src/pages/combat/EncounterRail.tsx apps/web/src/pages/combat/DirectorCombat.tsx
git commit -m "feat(web/combat): mount RollInitiativeOverlay + picking-phase chrome in DirectorCombat"
```

---

## Task 20: Add `2b.11 — Minion squads` row to `docs/phases.md`

Documents the sub-epic the spec promised, with sequencing notes.

**Files:**
- Modify: `docs/phases.md`

- [ ] **Step 1: Find the Phase 2b sub-epic table**

```bash
grep -n "^| \*\*2b\." docs/phases.md
```

- [ ] **Step 2: Append the new row**

After the existing `| **2b.10** | ...` row, before the `### Sequencing notes` heading, add:

```markdown
| **2b.11** | **Minion squads** — N minions sharing one row + one Turn-flow; squad-level action-economy bookkeeping; consecutive-act semantics when a squad is picked in zipper initiative; encounter-builder grouping UI (canon § 8.6 initiative groups). Composes with Pass 5 Layer 1 Pass 2b1's side-aware picker without schema rework | new SquadParticipant entity (or `participant.squadId`); EncounterBuilder grouping UI; PickNextActor extension for squad-as-target; consecutive-turn cascade | 🚧 — blocked by Pass 5 Layer 1 Pass 2b1 |
```

- [ ] **Step 3: Add a sequencing note**

In the existing `### Sequencing notes` block, add a bullet:

```markdown
- **2b.11 is blocked on Pass 5 Layer 1 Pass 2b1.** The squad-pick UX builds on zipper initiative's side-aware picker; 2b1 must ship first.
```

- [ ] **Step 4: Commit**

```bash
git add docs/phases.md
git commit -m "docs(phases): Phase 2b adds 2b.11 minion squads sub-epic"
```

---

## Task 21: Manual smoke test + screenshots

Final acceptance verification.

**Files:** none (screenshots and a PS commit if anything's off).

- [ ] **Step 1: Start the dev servers**

In one terminal: `pnpm --filter @ironyard/api dev` (verify port 8787 free first).
In another: `pnpm --filter @ironyard/web dev` (5173 or 5174).

- [ ] **Step 2: Set up a fresh encounter via the UI**

1. Log in as a director user (dev login is OK).
2. Create a campaign, approve a couple of test characters, build an encounter (3-monster preset is fine), start it.
3. Confirm the **RollInitiativeOverlay** appears over the left-pane rails as soon as the encounter starts.

Resize the browser to iPad-portrait (810×1080) and iPhone-portrait (390×844) to confirm responsive layout. Screenshot both.

- [ ] **Step 3: Test the auto-pick rule**

Open the overlay; check the surprise checkboxes for every foe. Click Roll. Confirm:
- The d10 is skipped (auto-pick prediction line was shown).
- The intent dispatches with `winner: 'heroes'`.
- The overlay dismisses; rails enter picking mode with `HEROES PICK` in InlineHeader.

- [ ] **Step 4: Test the d10 roll path**

Restart the encounter. This time leave no surprise marked. Click Roll. Confirm:
- The d10 reveal shows.
- The chooser appears with Players first / Director first.
- Pick a side; dispatch fires; overlay dismisses.

- [ ] **Step 5: Test picking-phase chrome**

With `HEROES PICK` showing:
- As the director-on-own-PC view: should see `I'LL GO NOW` on own-PC row + `Pick for them` on other PCs.
- As a player view (open a second browser, log in as a player whose PC is in the encounter): should see `I'LL GO NOW` on own row only.
- Acted rows render dimmed with `ACTED`.

Pick a PC → turn flow runs as it does today (Pass 2a's Turn flow is unchanged). End the turn → `DIRECTOR PICKS` shows, foe rows become tappable in director view.

- [ ] **Step 6: Test the run-out rule**

Have all foes act; confirm `HEROES PICK` re-engages for the remaining heroes. Have all heroes act; confirm `currentPickingSide` becomes null and `StartRound` is the next legal action (manually dispatch via the InlineHeader if a button exists, otherwise observe the logs for the round-end pending message).

- [ ] **Step 7: Test round 2 first-side persistence**

Start round 2 manually. Confirm `currentPickingSide` resets to whatever `firstSide` was (the round-1 winner). `ACTED` tags clear.

- [ ] **Step 8: Test surprise sweep**

Mark someone surprised at round-1 start. After round 1 ends, confirm the `SURPRISED` tag is gone from the row.

- [ ] **Step 9: Test pre-2b1 snapshot migration (if a live encounter exists from before this work)**

If a campaign has an in-flight encounter started under the old model, reload the page. Confirm:
- The overlay shows (because `firstSide` defaults to null after migration).
- Re-rolling restores normal play.

If you don't have a pre-existing encounter, manually verify the schema-default path by editing a snapshot in D1 to set `firstSide: null` and reloading.

- [ ] **Step 10: Final test/typecheck/lint**

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Expected: all green.

- [ ] **Step 11: Document any rough edges in the spec's PS**

If anything was awkward in the smoke test, append a numbered PS entry to the spec at `docs/superpowers/specs/2026-05-14-phase-5-layer-1-base-pass-2b1-zipper-initiative-design.md`. Commit with `docs(spec): Pass-2b1 PS — <symptom>`.

- [ ] **Step 12: Final integration commit (only if no code changes needed)**

If smoke passed cleanly with no code-side fixes, no commit needed — the task chain already covered everything. If you made a fix during smoke, commit it with a `fix(...)` message and add a PS entry.

---

## Self-Review

**Spec coverage check** — every section of the spec mapped to tasks:

- ✅ Engine state shape (spec § "Engine: state shape") — Task 2
- ✅ `Participant.surprised` (spec § "Engine: state shape") — Task 2
- ✅ `RollInitiative` (spec § "Engine: new intents") — Tasks 3 + 4
- ✅ `PickNextActor` + d3 threading (spec § "Engine: new intents") — Task 5
- ✅ `MarkSurprised` (spec § "Engine: new intents") — Task 6
- ✅ `StartEncounter` init (spec § "Engine: existing intent changes") — Task 7
- ✅ `EndTurn` rewrite (spec § "Engine: existing intent changes") — Task 8
- ✅ `StartRound` reset (spec § "Engine: existing intent changes") — Task 9
- ✅ `EndRound` surprise sweep (spec § "Engine: existing intent changes") — Task 10
- ✅ `participantSide` + `nextPickingSide` (spec § "Engine: existing intent changes" / helpers) — Task 1
- ✅ WS mirror reflect cases (spec § "UI: state reflection") — Task 11
- ✅ `SetInitiative` + `turnOrder` removal (spec § "Engine: existing intent changes") — Task 12
- ✅ Backwards compat (spec § "Engine: backwards compat") — schema defaults handle it; Task 12 final cleanup; Task 21 smoke step 9
- ✅ `intentDescribe` cases (implied by toast story in spec § "Constraints and risks") — Task 13
- ✅ `ParticipantRow` props (spec § "UI: ParticipantRow primitive additions") — Task 14
- ✅ `derivePickAffordance` (spec § "UI: picking-phase chrome") — Task 15
- ✅ `RollInitiativeOverlay` (spec § "UI: RollInitiativeOverlay") — Task 16
- ✅ `InlineHeader` pill (spec § "UI: picking-phase chrome") — Task 17
- ✅ PartyRail / EncounterRail wiring (spec § "UI: picking-phase chrome") — Tasks 18 + 19
- ✅ DirectorCombat integration (spec § "UI: picking-phase chrome") — Task 19
- ✅ Phase 2b umbrella 2b.11 update (spec § "Phase 2b umbrella update") — Task 20
- ✅ Acceptance criteria smoke (spec § "Acceptance") — Task 21

**Placeholder scan:** every "TODO"-shaped step (`// adapt to existing render structure`, `// pseudo`) is either supplied with concrete code or wraps a contextual gap that the implementer reads from the file first. No naked TBDs.

**Type consistency check:**
- `participantSide` returns `'heroes' | 'foes'` throughout (Task 1 + Tasks 5, 8, 11, 15).
- `nextPickingSide` returns `'heroes' | 'foes' | null` throughout (Task 1 + Tasks 8, 11).
- `RollInitiativePayload` shape (`winner` / `surprised[]` / `rolledD10?`) consistent across Tasks 3, 4, 11, 13, 16, 19.
- `PickNextActorPayload` shape (`participantId` / `rolls?.d3`) consistent across Tasks 5, 11, 13, 19.
- `MarkSurprisedPayload` shape consistent across Tasks 6, 11, 13.
- `pickAffordance` discriminated union (`'self' | 'other' | 'foe-tap'`) consistent across Tasks 14, 15, 18.

**Order check:** Task 12 (cleanup) runs after Tasks 1–11 (additive). Tasks 18 + 19 commit together since 18 leaves the build broken in isolation. Task 7 (StartEncounter init) is sequenced before Task 12 (turnOrder removal) so the in-between window still typechecks.

Plan is complete.
