# Phase 2b sub-epic 2b.0 — Combat-resource framework foundation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the universal § 5 mechanics (Director's Malice generation at encounter and round boundaries, heroic resource preload from per-character Victories, per-turn universal gain via an extended `StartTurn` payload, end-of-encounter cleanup), refactor Victories to per-character, and ship the foundational **Open Actions** framework (two intents, lobby-visible list component, no consumers in 2b.0).

**Architecture:** Per-character `character.victories` replaces `state.partyVictories` for resource generation. A static `HEROIC_RESOURCES` table in `packages/rules` (keyed on the existing `HeroicResourceName` enum) carries the per-class gain configs (`flat`/`d3`/`d3-plus`). `StartEncounter`, `StartRound`, `StartTurn`, `EndEncounter`, and `Respite` are extended; two new intents (`RaiseOpenAction` server-only, `ClaimOpenAction`) and one new state field (`CampaignState.openActions`) drop in via the existing intent → stamp → reducer pattern. `OpenActionsList.tsx` is one shared component visible to every connected user; per-user Claim-button enablement is the only difference between contexts.

**Tech Stack:** TypeScript + Zod (shared/rules), Hono + Cloudflare Workers (api), React + TanStack Query (web), Vitest (tests). Source spec: [`docs/superpowers/specs/2026-05-13-phase-2b-0-resource-framework-foundation-design.md`](../specs/2026-05-13-phase-2b-0-resource-framework-foundation-design.md).

---

## File Map

**Created:**

- `packages/shared/src/open-action.ts` — `OpenActionKindSchema` (empty enum), `OpenActionSchema`, types
- `packages/shared/src/open-action-copy.ts` — empty `OPEN_ACTION_COPY` registry
- `packages/shared/src/intents/raise-open-action.ts` — `RaiseOpenActionPayloadSchema`
- `packages/shared/src/intents/claim-open-action.ts` — `ClaimOpenActionPayloadSchema`
- `packages/shared/tests/intents/open-action.spec.ts` — payload schema tests
- `packages/rules/src/heroic-resources.ts` — `HEROIC_RESOURCES` config table + `getResourceConfigForParticipant` helper + `resolveFloor` helper
- `packages/rules/src/state-helpers.ts` — `aliveHeroes`, `averageVictoriesAlive`, `sumPartyVictories` helpers
- `packages/rules/src/intents/raise-open-action.ts` — reducer
- `packages/rules/src/intents/claim-open-action.ts` — reducer
- `packages/rules/tests/intents/raise-open-action.spec.ts` — reducer tests
- `packages/rules/tests/intents/claim-open-action.spec.ts` — reducer tests
- `packages/rules/tests/heroic-resources.spec.ts` — config table + integration tests
- `packages/rules/tests/state-helpers.spec.ts` — helper tests
- `apps/web/src/pages/combat/OpenActionsList.tsx` — shared lobby-visible component
- `apps/web/src/pages/combat/OpenActionsList.spec.tsx` — UI tests

**Modified:**

- `packages/shared/src/character.ts` — add `victories` field
- `packages/shared/src/resource.ts` — re-export `HEROIC_RESOURCE_NAMES` if not already (verify) — *audit, likely no-op*
- `packages/shared/src/intents/turn.ts` — extend `StartTurnPayloadSchema` with optional `rolls`
- `packages/shared/src/intents/index.ts` — add new IntentTypes + re-exports
- `packages/shared/src/index.ts` — re-export new OpenAction schemas + types
- `packages/rules/src/types.ts` — add `openActions` to `CampaignState`; update `emptyCampaignState`
- `packages/rules/src/intents/index.ts` — export new reducers
- `packages/rules/src/reducer.ts` — dispatch new intents
- `packages/rules/src/intents/start-encounter.ts` — heroic resource preload + initial Malice + round-1 tick
- `packages/rules/src/intents/turn.ts` — `applyStartRound` round-N Malice tick; `applyStartTurn` per-turn gain; `applyEndRound` OA expiry
- `packages/rules/src/intents/end-encounter.ts` — zero heroic resources + surges + clear OAs
- `packages/rules/src/intents/respite.ts` — per-character `victories` increment
- `apps/api/src/lobby-do.ts` — add `'RaiseOpenAction'` to `SERVER_ONLY_INTENTS`; mirror new state field if needed
- `apps/web/src/ws/useSessionSocket.ts` — reflect `openActions` from snapshot; reflect new state fields after RaiseOpenAction / ClaimOpenAction
- `apps/web/src/pages/combat/CombatRun.tsx` — mount `OpenActionsList`; surface Malice in top bar
- `apps/web/src/pages/character/PlayerSheetPanel.tsx` — Victories chip, heroic resource display, mount `OpenActionsList` rail

**Existing tests to update:**

- `packages/rules/tests/intents/start-encounter.spec.ts` — assert heroic resource preload + initial Malice
- `packages/rules/tests/intents/turn.spec.ts` (or wherever StartRound/StartTurn/EndRound tests live) — assert round-N Malice tick + per-turn gain + OA expiry
- `packages/rules/tests/intents/end-encounter.spec.ts` — assert heroic resource + surge zeroing + OA clear
- `packages/rules/tests/intents/respite.spec.ts` — assert per-character victories increment
- Any test fixture that seeds participants with `heroicResources: []` and dispatches `StartTurn` may need to provide `rolls.d3` for d3-classes or use a flat-class test character

---

## Task 1 — `CharacterSchema.victories` field

**Files:**

- Modify: `packages/shared/src/character.ts`
- Test: `packages/shared/tests/character.spec.ts` (or co-located — find the existing test file for character schema; create if absent)

- [ ] **Step 1: Write the failing test**

  Open the character schema test file. If it doesn't exist, create `packages/shared/tests/character.spec.ts`. Add:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { CharacterSchema } from '../src/character';

  describe('CharacterSchema.victories', () => {
    it('defaults to 0 when omitted', () => {
      const parsed = CharacterSchema.parse({
        id: 'char-1',
        ownerId: 'user-1',
        name: 'Test',
        level: 1,
        // ...other required fields the existing minimal fixture uses; copy from
        // an existing test or src/character.ts default if needed.
      });
      expect(parsed.victories).toBe(0);
    });

    it('accepts a non-negative integer', () => {
      const parsed = CharacterSchema.parse({ /* required fields */, victories: 5 });
      expect(parsed.victories).toBe(5);
    });

    it('rejects negative victories', () => {
      expect(() =>
        CharacterSchema.parse({ /* required fields */, victories: -1 }),
      ).toThrow();
    });
  });
  ```

- [ ] **Step 2: Run the failing test**

  ```
  pnpm --filter @ironyard/shared test character.spec
  ```

  Expected: FAIL with `Cannot read properties of undefined (reading 'victories')` or similar.

- [ ] **Step 3: Add the field**

  In `packages/shared/src/character.ts`, find the `CharacterSchema` definition (around the existing `xp` field). Add:

  ```ts
  victories: z.number().int().min(0).default(0),
  ```

  Place it next to `xp` so related counters cluster. The Zod default ensures existing characters in D1 (which won't have the field yet) still parse cleanly.

- [ ] **Step 4: Run the tests**

  ```
  pnpm --filter @ironyard/shared test character.spec
  ```

  Expected: PASS for all three new cases.

- [ ] **Step 5: Run typecheck**

  ```
  pnpm typecheck
  ```

  Expected: clean. Any place that currently constructs a `Character` without `victories` is OK because of the Zod default.

- [ ] **Step 6: Commit**

  ```
  git add packages/shared/src/character.ts packages/shared/tests/character.spec.ts
  git commit -m "feat(shared): CharacterSchema.victories — per-character counter (canon § 8.1)"
  ```

---

## Task 2 — `sumPartyVictories` helper

**Files:**

- Create: `packages/rules/src/state-helpers.ts`
- Test: `packages/rules/tests/state-helpers.spec.ts`

- [ ] **Step 1: Write the failing test**

  Create `packages/rules/tests/state-helpers.spec.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { sumPartyVictories } from '../src/state-helpers';
  import type { CampaignState } from '../src/types';

  function stateWithPCs(victoriesByPc: number[]): CampaignState {
    return {
      // Use the existing emptyCampaignState() if exported, otherwise inline:
      seq: 0,
      ownerId: 'owner',
      activeDirectorId: 'owner',
      participants: victoriesByPc.map((v, i) => ({
        id: `pc-${i}`,
        kind: 'pc',
        name: `PC ${i}`,
        ownerId: 'owner',
        characterId: `char-${i}`,
        level: 1,
        currentStamina: 20,
        maxStamina: 20,
        // Other required participant fields with minimal placeholders.
        // Copy from an existing test fixture for participant shape:
        characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
        immunities: [],
        weaknesses: [],
        conditions: [],
        heroicResources: [],
        extras: [],
        surges: 0,
        recoveries: { current: 8, max: 8 },
        recoveryValue: 5,
        weaponDamageBonus: 0,
        activeAbilities: [],
        victories: v,
      })),
      encounter: null,
      partyVictories: 0,
      currentSessionId: null,
      attendingCharacterIds: [],
      heroTokens: 0,
      openActions: [],
    } as unknown as CampaignState;
  }

  describe('sumPartyVictories', () => {
    it('returns 0 for an empty party', () => {
      expect(sumPartyVictories(stateWithPCs([]))).toBe(0);
    });

    it('sums per-PC victories', () => {
      expect(sumPartyVictories(stateWithPCs([1, 2, 3]))).toBe(6);
    });

    it('ignores monsters', () => {
      const s = stateWithPCs([2, 2]);
      s.participants = [
        ...s.participants,
        { id: 'mob-1', kind: 'monster' } as never, // partial — sum ignores non-PCs
      ];
      expect(sumPartyVictories(s)).toBe(4);
    });
  });
  ```

  > **Note for the engineer.** The state fixture above includes future fields (`openActions`, `victories` on participant — wait, `victories` is on `character`, not `participant`). Reconcile against the actual schema: the per-character `victories` lives on `Character`. **For the participant-level helper, `sumPartyVictories` reads `participant.victories` only if the participant carries it; otherwise it sources from a state-side lookup.** Pick one: either materialize `victories` onto the PC participant during `StartEncounter` (recommended — matches `currentStamina` / `recoveriesUsed` pattern), or have the helper look it up via `characterId`. **Materialization is simpler and matches Epic 2D's encounter-lifecycle pattern.** Update Task 14 (StartEncounter) to seed `participant.victories` from `character.victories`. Update this test's participant fixture to use the materialized field.

- [ ] **Step 2: Run the failing test**

  ```
  pnpm --filter @ironyard/rules test state-helpers
  ```

  Expected: FAIL with "Cannot find module '../src/state-helpers'".

- [ ] **Step 3: Add `victories: number` to the Participant schema**

  Open `packages/shared/src/participant.ts`. Find the `ParticipantSchema` definition. After `recoveriesUsed` (or near other PC-runtime numeric fields), add:

  ```ts
  // Per-character Victories (canon § 8.1) materialized onto the participant at
  // StartEncounter for cheap reducer access. Sourced from `character.victories`.
  victories: z.number().int().min(0).default(0),
  ```

  This puts the field on every participant; monster participants will have `0` (Zod default) and the helper filters PCs anyway.

- [ ] **Step 4: Create the helper file**

  Create `packages/rules/src/state-helpers.ts`:

  ```ts
  import type { CampaignState, Participant } from './types';
  import { isParticipant } from './types';

  /**
   * Sum of per-character Victories across all PC participants in the lobby.
   * Replacement for the deprecated `state.partyVictories` field — that field
   * stays on `CampaignState` until 2b.10 housekeeping removes it after all
   * callers migrate.
   */
  export function sumPartyVictories(state: CampaignState): number {
    return state.participants
      .filter((p): p is Participant => isParticipant(p) && p.kind === 'pc')
      .reduce((total, p) => total + (p.victories ?? 0), 0);
  }
  ```

- [ ] **Step 5: Run tests**

  ```
  pnpm --filter @ironyard/rules test state-helpers
  pnpm --filter @ironyard/shared test
  pnpm typecheck
  ```

  Expected: PASS. The Zod default keeps every existing participant valid.

- [ ] **Step 6: Commit**

  ```
  git add packages/shared/src/participant.ts packages/rules/src/state-helpers.ts packages/rules/tests/state-helpers.spec.ts
  git commit -m "feat(rules): participant.victories + sumPartyVictories helper (canon § 8.1)"
  ```

---

## Task 3 — `Respite` increments per-character victories

**Files:**

- Modify: `packages/rules/src/intents/respite.ts`
- Test: `packages/rules/tests/intents/respite.spec.ts` (existing — extend)

- [ ] **Step 1: Write the failing test**

  Add to the existing `respite.spec.ts`:

  ```ts
  it('increments each attending PC\'s victories by 1', () => {
    const s = baseStateWithThreePcs({ victoriesEach: 2, attending: ['char-a', 'char-b'] });
    const intent = makeRespiteIntent({ /* required RespitePayload fields */ });
    const result = applyRespite(s, intent);
    const charA = result.state.participants.find(p => p.characterId === 'char-a');
    const charB = result.state.participants.find(p => p.characterId === 'char-b');
    const charC = result.state.participants.find(p => p.characterId === 'char-c');
    expect(charA?.victories).toBe(3);
    expect(charB?.victories).toBe(3);
    expect(charC?.victories).toBe(2);  // not attending
  });
  ```

  > **Note for the engineer.** Use the existing `baseState` test helper or its equivalent — see `packages/rules/tests/intents/test-utils.ts` for the pattern. Add a `victoriesEach` option to the helper if absent. Attendance is sourced from `state.attendingCharacterIds` (introduced by Epic 2E).

- [ ] **Step 2: Run the failing test**

  ```
  pnpm --filter @ironyard/rules test respite
  ```

  Expected: FAIL — current Respite doesn't touch per-PC victories.

- [ ] **Step 3: Extend `applyRespite`**

  Open `packages/rules/src/intents/respite.ts:49–58`. The current PC mapping returns `{ ...entry, recoveries, currentStamina, heroicResources }`. Extend to also bump `victories` for attending PCs:

  ```ts
  const attending = new Set(state.attendingCharacterIds);
  const newParticipants = state.participants.map((entry) => {
    if (!isParticipant(entry) || entry.kind !== 'pc') return entry;
    const fixedResources = entry.heroicResources.map((r) => (r.value < 0 ? { ...r, value: 0 } : r));
    const victoriesNext =
      attending.has(entry.characterId) ? (entry.victories ?? 0) + 1 : (entry.victories ?? 0);
    return {
      ...entry,
      recoveries: { current: entry.recoveries.max, max: entry.recoveries.max },
      currentStamina: entry.maxStamina,
      heroicResources: fixedResources,
      victories: victoriesNext,
    };
  });
  ```

  Update the log line at `respite.ts:93–96` to mention the per-PC victories increment:

  ```ts
  text: `Respite: refilled recoveries for ${heroCount} hero${heroCount !== 1 ? 'es' : ''}; ${xpAwarded} XP each; +1 victory for each attending hero.`,
  ```

- [ ] **Step 4: Run tests**

  ```
  pnpm --filter @ironyard/rules test respite
  pnpm --filter @ironyard/rules test
  ```

  Expected: PASS. Existing Respite tests should still pass since the existing assertions are about recoveries / stamina / clarity floor / XP conversion — all unchanged.

- [ ] **Step 5: Commit**

  ```
  git add packages/rules/src/intents/respite.ts packages/rules/tests/intents/respite.spec.ts
  git commit -m "feat(rules): Respite increments per-character victories (canon § 8.1)"
  ```

---

## Task 4 — `HEROIC_RESOURCES` static config table

**Files:**

- Create: `packages/rules/src/heroic-resources.ts`
- Test: `packages/rules/tests/heroic-resources.spec.ts`

- [ ] **Step 1: Write the failing test**

  Create `packages/rules/tests/heroic-resources.spec.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { HEROIC_RESOURCE_NAMES } from '@ironyard/shared';
  import { HEROIC_RESOURCES, resolveFloor } from '../src/heroic-resources';

  describe('HEROIC_RESOURCES table', () => {
    it('has an entry for every HeroicResourceName', () => {
      for (const name of HEROIC_RESOURCE_NAMES) {
        expect(HEROIC_RESOURCES[name]).toBeDefined();
        expect(HEROIC_RESOURCES[name].name).toBe(name);
      }
    });

    it('Censor (wrath) gains +2 flat per turn', () => {
      expect(HEROIC_RESOURCES.wrath.baseGain.onTurnStart).toEqual({ kind: 'flat', amount: 2 });
    });

    it('Conduit (piety) rolls 1d3 per turn', () => {
      expect(HEROIC_RESOURCES.piety.baseGain.onTurnStart).toEqual({ kind: 'd3' });
    });

    it('Talent (clarity) has a negative-floor formula', () => {
      expect(HEROIC_RESOURCES.clarity.floor).toEqual({ formula: 'negative_one_plus_reason' });
    });

    it('all other resources floor at 0', () => {
      for (const name of HEROIC_RESOURCE_NAMES) {
        if (name === 'clarity') continue;
        expect(HEROIC_RESOURCES[name].floor).toBe(0);
      }
    });

    it('every resource preloads from victories on encounter start', () => {
      for (const name of HEROIC_RESOURCE_NAMES) {
        expect(HEROIC_RESOURCES[name].baseGain.onEncounterStart).toBe('victories');
      }
    });
  });

  describe('resolveFloor', () => {
    it('returns 0 for a numeric floor', () => {
      expect(resolveFloor(0, { reason: 2, might: 0, agility: 0, intuition: 0, presence: 0 })).toBe(0);
    });

    it('returns -(1 + reason) for the clarity formula', () => {
      expect(
        resolveFloor(
          { formula: 'negative_one_plus_reason' },
          { reason: 2, might: 0, agility: 0, intuition: 0, presence: 0 },
        ),
      ).toBe(-3);
    });

    it('returns -1 when reason is 0', () => {
      expect(
        resolveFloor(
          { formula: 'negative_one_plus_reason' },
          { reason: 0, might: 0, agility: 0, intuition: 0, presence: 0 },
        ),
      ).toBe(-1);
    });
  });
  ```

- [ ] **Step 2: Run the failing test**

  ```
  pnpm --filter @ironyard/rules test heroic-resources
  ```

  Expected: FAIL with "Cannot find module '../src/heroic-resources'".

- [ ] **Step 3: Create the config table file**

  Create `packages/rules/src/heroic-resources.ts`:

  ```ts
  import type { HeroicResourceName } from '@ironyard/shared';

  // Canon § 5.3 / § 5.4 / § 5.4.9. Static per-class config consumed by
  // StartEncounter (encounter-start preload) and StartTurn (per-turn gain).
  // The 9 resources are a closed canon set; extending requires a canon edit
  // and an entry here.

  export type ResourceFloor = 0 | { formula: 'negative_one_plus_reason' };

  export type TurnStartGain =
    | { kind: 'flat'; amount: number }
    | { kind: 'd3' }
    | { kind: 'd3-plus'; bonus: number }; // 2b.0.1 wires 10th-level Psion 1d3+2

  export type HeroicResourceConfig = {
    name: HeroicResourceName;
    floor: ResourceFloor;
    ceiling: null;
    baseGain: {
      onEncounterStart: 'victories';
      onTurnStart: TurnStartGain;
    };
  };

  export const HEROIC_RESOURCES: Record<HeroicResourceName, HeroicResourceConfig> = {
    wrath:      { name: 'wrath',      floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'flat', amount: 2 } } },
    piety:      { name: 'piety',      floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } } },
    essence:    { name: 'essence',    floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'flat', amount: 2 } } },
    ferocity:   { name: 'ferocity',   floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } } },
    discipline: { name: 'discipline', floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'flat', amount: 2 } } },
    insight:    { name: 'insight',    floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } } },
    focus:      { name: 'focus',      floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'flat', amount: 2 } } },
    drama:      { name: 'drama',      floor: 0, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } } },
    clarity:    { name: 'clarity',    floor: { formula: 'negative_one_plus_reason' }, ceiling: null, baseGain: { onEncounterStart: 'victories', onTurnStart: { kind: 'd3' } } },
  };

  /**
   * Resolve a config-level `ResourceFloor` to a numeric floor for the given
   * character characteristics. Used at StartEncounter participant materialization
   * to compute Talent's per-character `-(1 + reason)` floor.
   */
  export function resolveFloor(
    floor: ResourceFloor,
    characteristics: { reason: number },
  ): number {
    if (typeof floor === 'number') return floor;
    if (floor.formula === 'negative_one_plus_reason') {
      return -(1 + characteristics.reason);
    }
    // Exhaustive switch — TypeScript would catch a new formula at compile time
    // if a new branch was added without handling.
    const _exhaustive: never = floor.formula;
    void _exhaustive;
    return 0;
  }
  ```

- [ ] **Step 4: Run the tests**

  ```
  pnpm --filter @ironyard/rules test heroic-resources
  ```

  Expected: PASS for all 9 entries + `resolveFloor` cases.

- [ ] **Step 5: Commit**

  ```
  git add packages/rules/src/heroic-resources.ts packages/rules/tests/heroic-resources.spec.ts
  git commit -m "feat(rules): HEROIC_RESOURCES static config table for all 9 classes (canon § 5.3/§ 5.4)"
  ```

---

## Task 5 — `aliveHeroes` + `averageVictoriesAlive` helpers

**Files:**

- Modify: `packages/rules/src/state-helpers.ts`
- Modify: `packages/rules/tests/state-helpers.spec.ts`

- [ ] **Step 1: Write the failing tests**

  Append to `packages/rules/tests/state-helpers.spec.ts`:

  ```ts
  import { aliveHeroes, averageVictoriesAlive } from '../src/state-helpers';

  describe('aliveHeroes', () => {
    it('returns PCs whose currentStamina > -windedValue', () => {
      const s = stateWithPCs([2, 2, 2]);
      // windedValue for a PC is maxStamina / 2 (floor). For maxStamina = 20,
      // windedValue = 10, so the boundary is currentStamina > -10.
      s.participants[0].currentStamina = 5;       // healthy
      s.participants[1].currentStamina = 0;       // dying but alive
      s.participants[2].currentStamina = -11;     // past -windedValue; dead-ish
      expect(aliveHeroes(s)).toHaveLength(2);
    });

    it('returns empty when no PCs', () => {
      expect(aliveHeroes(stateWithPCs([]))).toEqual([]);
    });
  });

  describe('averageVictoriesAlive', () => {
    it('floors the average across alive PCs', () => {
      const s = stateWithPCs([2, 3, 4]);  // avg 3
      expect(averageVictoriesAlive(s)).toBe(3);
    });

    it('floors fractional averages', () => {
      const s = stateWithPCs([1, 2, 4]);  // avg 7/3 = 2.33 → 2
      expect(averageVictoriesAlive(s)).toBe(2);
    });

    it('returns 0 when no alive PCs', () => {
      const s = stateWithPCs([]);
      expect(averageVictoriesAlive(s)).toBe(0);
    });

    it('excludes "dead" PCs from the average', () => {
      const s = stateWithPCs([5, 5, 1]);
      s.participants[2].currentStamina = -11;  // dead
      expect(averageVictoriesAlive(s)).toBe(5);  // (5+5)/2 = 5
    });
  });
  ```

- [ ] **Step 2: Run the failing tests**

  ```
  pnpm --filter @ironyard/rules test state-helpers
  ```

  Expected: FAIL — helpers don't exist.

- [ ] **Step 3: Add `windedValue` (if not already present)**

  Search for an existing `windedValue` helper:

  ```
  grep -rn "windedValue\|winded\b" packages/rules/src/
  ```

  If absent, add to `state-helpers.ts`:

  ```ts
  /**
   * The Winded threshold for a PC (canon § 2.7 — formal state transitions
   * land in 2b.5). Today: `floor(maxStamina / 2)`. Used as the permissive
   * alive-check in 2b.0 (`currentStamina > -windedValue` ⇒ still in the fight).
   */
  export function windedValue(p: { maxStamina: number }): number {
    return Math.floor(p.maxStamina / 2);
  }
  ```

- [ ] **Step 4: Implement `aliveHeroes` and `averageVictoriesAlive`**

  Add to `packages/rules/src/state-helpers.ts`:

  ```ts
  /**
   * PCs still in the fight by the permissive 2b.0 alive-check
   * (`currentStamina > -windedValue`). 2b.5 replaces with the formal
   * winded/dying/dead state machine.
   */
  export function aliveHeroes(state: CampaignState): Participant[] {
    return state.participants
      .filter((p): p is Participant => isParticipant(p) && p.kind === 'pc')
      .filter((p) => p.currentStamina > -windedValue(p));
  }

  /**
   * `floor(sumVictories / aliveCount)` over `aliveHeroes`. Returns 0 if no
   * alive PCs. Drives Director's Malice initial preload at canon § 5.5.
   */
  export function averageVictoriesAlive(state: CampaignState): number {
    const alive = aliveHeroes(state);
    if (alive.length === 0) return 0;
    const sum = alive.reduce((t, p) => t + (p.victories ?? 0), 0);
    return Math.floor(sum / alive.length);
  }
  ```

- [ ] **Step 5: Run tests**

  ```
  pnpm --filter @ironyard/rules test state-helpers
  ```

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```
  git add packages/rules/src/state-helpers.ts packages/rules/tests/state-helpers.spec.ts
  git commit -m "feat(rules): aliveHeroes + averageVictoriesAlive helpers (canon § 5.5)"
  ```

---

## Task 6 — `OpenAction` shared schema

**Files:**

- Create: `packages/shared/src/open-action.ts`
- Test: `packages/shared/tests/open-action.spec.ts`

- [ ] **Step 1: Write the failing test**

  Create `packages/shared/tests/open-action.spec.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { OpenActionSchema, OpenActionKindSchema } from '../src/open-action';

  describe('OpenActionKindSchema', () => {
    it('is an empty enum in 2b.0 (consumers register kinds in 2b.0.1)', () => {
      // Smoke check — schema accepts no values today.
      expect(() => OpenActionKindSchema.parse('pray-to-the-gods')).toThrow();
    });
  });

  describe('OpenActionSchema', () => {
    it('rejects an unknown kind', () => {
      expect(() =>
        OpenActionSchema.parse({
          id: '01H',
          kind: 'made-up',
          participantId: 'pc-1',
          raisedAtRound: 1,
          raisedByIntentId: 'i-1',
          expiresAtRound: null,
          payload: {},
        }),
      ).toThrow();
    });

    it('accepts the shape once a kind is added (smoke)', () => {
      // 2b.0 ships the enum empty. This test stands ready for 2b.0.1.
      expect(OpenActionSchema).toBeDefined();
    });
  });
  ```

- [ ] **Step 2: Run the failing test**

  ```
  pnpm --filter @ironyard/shared test open-action
  ```

  Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Create the schema file**

  Create `packages/shared/src/open-action.ts`:

  ```ts
  import { z } from 'zod';

  /**
   * Open Action kinds. Empty in 2b.0 — first entries (pray-to-the-gods,
   * the four spatial triggers, etc.) are added by 2b.0.1 alongside their
   * raisers and copy registry entries. Each new kind extends this enum;
   * the OpenActionSchema validator picks them up automatically.
   */
  export const OpenActionKindSchema = z.enum([
    // 2b.0.1 adds entries here. Keep the array literal with at least one
    // sentinel string until 2b.0.1 lands; until then the enum is functionally
    // empty (z.enum requires ≥1 element).
    '__sentinel_2b_0__',
  ]);

  export type OpenActionKind = z.infer<typeof OpenActionKindSchema>;

  /**
   * A single open-action queue entry. Non-blocking: visible to every user
   * in the lobby, claimable only by the targeted participant's owner or the
   * active director. Unclaimed entries auto-expire when `expiresAtRound` is
   * reached (or at EndEncounter unconditionally). See 2b.0 spec §2.
   */
  export const OpenActionSchema = z.object({
    id: z.string().min(1),
    kind: OpenActionKindSchema,
    participantId: z.string().min(1),
    raisedAtRound: z.number().int().nonnegative(),
    raisedByIntentId: z.string().min(1),
    expiresAtRound: z.number().int().nonnegative().nullable(),
    payload: z.record(z.string(), z.unknown()),
  });

  export type OpenAction = z.infer<typeof OpenActionSchema>;
  ```

  > **Note for the engineer.** Zod's `z.enum` requires a non-empty tuple. The `__sentinel_2b_0__` placeholder is intentional — it makes the schema valid TypeScript while 2b.0.1 fills in real kinds. **Remove the sentinel in 2b.0.1's first kind-add commit.** Verify the unit test above still passes after the sentinel is removed; if not, update the test to reflect the now-non-empty enum.

- [ ] **Step 4: Run the tests**

  ```
  pnpm --filter @ironyard/shared test open-action
  ```

  Expected: PASS.

- [ ] **Step 5: Re-export from the shared index**

  Edit `packages/shared/src/index.ts`. Add exports near the existing schema re-exports:

  ```ts
  export { OpenActionSchema, OpenActionKindSchema } from './open-action';
  export type { OpenAction, OpenActionKind } from './open-action';
  ```

- [ ] **Step 6: Run typecheck**

  ```
  pnpm typecheck
  ```

  Expected: clean.

- [ ] **Step 7: Commit**

  ```
  git add packages/shared/src/open-action.ts packages/shared/src/index.ts packages/shared/tests/open-action.spec.ts
  git commit -m "feat(shared): OpenAction schema (kinds empty in 2b.0; 2b.0.1 populates)"
  ```

---

## Task 7 — `CampaignState.openActions` field

**Files:**

- Modify: `packages/rules/src/types.ts`
- Test: existing reducer tests must still pass after the field is added

- [ ] **Step 1: Find the existing `emptyCampaignState`**

  ```
  grep -n "emptyCampaignState\|CampaignState" packages/rules/src/types.ts
  ```

  Locate the `CampaignState` type definition and the `emptyCampaignState()` factory.

- [ ] **Step 2: Add the field to the type and factory**

  Open `packages/rules/src/types.ts`. Add `openActions: OpenAction[]` to the `CampaignState` type (next to `partyVictories`):

  ```ts
  import type { OpenAction } from '@ironyard/shared';

  export type CampaignState = {
    // ...existing fields...
    partyVictories: number;
    openActions: OpenAction[];   // canon-engine — non-blocking lobby-visible claim queue
    // ...existing fields...
  };
  ```

  Update `emptyCampaignState()`:

  ```ts
  export function emptyCampaignState(/* existing args */): CampaignState {
    return {
      // ...existing fields...
      partyVictories: 0,
      openActions: [],
      // ...existing fields...
    };
  }
  ```

- [ ] **Step 3: Run all tests**

  ```
  pnpm --filter @ironyard/rules test
  pnpm typecheck
  ```

  Expected: PASS. Any test that hand-constructs a `CampaignState` may need `openActions: []` added — fix as you find failures.

- [ ] **Step 4: Update lobby-do state load**

  Open `apps/api/src/lobby-do.ts`. Find where the DO loads or initializes `CampaignState` (search for `emptyCampaignState` or where the DO restores from `campaign_snapshots`). Ensure the snapshot-restore path produces a state with `openActions: []` if the snapshot pre-dates 2b.0. The simplest approach: when reading the snapshot, add the field with a default:

  ```ts
  const loaded = JSON.parse(snapshotJson) as Partial<CampaignState>;
  this.state = {
    ...emptyCampaignState(/* args */),
    ...loaded,
    openActions: loaded.openActions ?? [],
  };
  ```

  Find the exact location — the comment in the spec at `apps/api/src/lobby-do.ts` notes the load path; pattern-match against Epic 2E's `currentSessionId` load handling.

- [ ] **Step 5: Run all tests + typecheck again**

  ```
  pnpm test
  pnpm typecheck
  ```

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```
  git add packages/rules/src/types.ts apps/api/src/lobby-do.ts
  git commit -m "feat(rules): CampaignState.openActions field + DO snapshot back-compat"
  ```

---

## Task 8 — `RaiseOpenAction` + `ClaimOpenAction` payload schemas

**Files:**

- Create: `packages/shared/src/intents/raise-open-action.ts`
- Create: `packages/shared/src/intents/claim-open-action.ts`
- Modify: `packages/shared/src/intents/index.ts` — add IntentTypes + re-exports
- Test: `packages/shared/tests/intents/open-action.spec.ts`

- [ ] **Step 1: Write the failing tests**

  Create `packages/shared/tests/intents/open-action.spec.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import {
    RaiseOpenActionPayloadSchema,
    ClaimOpenActionPayloadSchema,
  } from '../../src/intents/raise-open-action';

  describe('RaiseOpenActionPayloadSchema', () => {
    it('accepts a well-formed payload', () => {
      expect(
        RaiseOpenActionPayloadSchema.safeParse({
          kind: '__sentinel_2b_0__',
          participantId: 'pc-1',
          expiresAtRound: 3,
          payload: {},
        }).success,
      ).toBe(true);
    });

    it('rejects an unknown kind', () => {
      expect(
        RaiseOpenActionPayloadSchema.safeParse({
          kind: 'unknown',
          participantId: 'pc-1',
          payload: {},
        }).success,
      ).toBe(false);
    });

    it('expiresAtRound defaults to null (persist until claimed/encounter end)', () => {
      const r = RaiseOpenActionPayloadSchema.parse({
        kind: '__sentinel_2b_0__',
        participantId: 'pc-1',
        payload: {},
      });
      expect(r.expiresAtRound).toBeNull();
    });
  });

  describe('ClaimOpenActionPayloadSchema', () => {
    it('accepts an id and optional choice', () => {
      expect(
        ClaimOpenActionPayloadSchema.safeParse({ openActionId: '01H', choice: 'a' }).success,
      ).toBe(true);
      expect(
        ClaimOpenActionPayloadSchema.safeParse({ openActionId: '01H' }).success,
      ).toBe(true);
    });

    it('rejects empty openActionId', () => {
      expect(ClaimOpenActionPayloadSchema.safeParse({ openActionId: '' }).success).toBe(false);
    });
  });
  ```

- [ ] **Step 2: Run the failing tests**

  ```
  pnpm --filter @ironyard/shared test open-action
  ```

  Expected: FAIL — modules don't exist.

- [ ] **Step 3: Create payload files**

  Create `packages/shared/src/intents/raise-open-action.ts`:

  ```ts
  import { z } from 'zod';
  import { OpenActionKindSchema } from '../open-action';

  /**
   * Server-only intent — the DO emits this as a derived intent from
   * event-source intents (a damage application, a roll result, a forced
   * movement) when a class-specific or spatial condition might allow a
   * player to claim a heroic-resource gain or other rule effect.
   *
   * The reducer appends a new `OpenAction` to `state.openActions`. The
   * intent envelope's id becomes the OpenAction's `raisedByIntentId`.
   */
  export const RaiseOpenActionPayloadSchema = z.object({
    kind: OpenActionKindSchema,
    participantId: z.string().min(1),
    expiresAtRound: z.number().int().nonnegative().nullable().default(null),
    payload: z.record(z.string(), z.unknown()).default({}),
  });
  export type RaiseOpenActionPayload = z.infer<typeof RaiseOpenActionPayloadSchema>;

  /**
   * Player or active-director dispatches this to claim a pending OpenAction.
   * Reducer authorizes (owner OR active director); removes the OA; emits any
   * derived intents the kind's resolver registers. Non-blocking — there is
   * no `DismissOpenAction`; unclaimed entries auto-expire.
   */
  export const ClaimOpenActionPayloadSchema = z.object({
    openActionId: z.string().min(1),
    // `choice` is a kind-specific discriminator (e.g. pray-to-the-gods may
    // surface a Yes/No; spatial triggers don't need it). Free-form for now;
    // 2b.0.1 consumers narrow it per kind.
    choice: z.string().optional(),
  });
  export type ClaimOpenActionPayload = z.infer<typeof ClaimOpenActionPayloadSchema>;
  ```

  (One file holds both — consistent with how `set-resource.ts` etc. bundle related payloads.)

- [ ] **Step 4: Add to `IntentTypes` enum + re-exports**

  Open `packages/shared/src/intents/index.ts`. Find the `IntentTypes` const-as-enum. Add:

  ```ts
  export const IntentTypes = {
    // ...existing values...
    RaiseOpenAction: 'RaiseOpenAction',
    ClaimOpenAction: 'ClaimOpenAction',
  } as const;
  ```

  Re-export the schemas:

  ```ts
  export {
    RaiseOpenActionPayloadSchema,
    ClaimOpenActionPayloadSchema,
  } from './raise-open-action';
  export type {
    RaiseOpenActionPayload,
    ClaimOpenActionPayload,
  } from './raise-open-action';
  ```

- [ ] **Step 5: Run tests + typecheck**

  ```
  pnpm --filter @ironyard/shared test
  pnpm typecheck
  ```

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```
  git add packages/shared/src/intents/raise-open-action.ts packages/shared/src/intents/index.ts packages/shared/tests/intents/open-action.spec.ts
  git commit -m "feat(shared): RaiseOpenAction + ClaimOpenAction payload schemas"
  ```

---

## Task 9 — `applyRaiseOpenAction` reducer

**Files:**

- Create: `packages/rules/src/intents/raise-open-action.ts`
- Test: `packages/rules/tests/intents/raise-open-action.spec.ts`

- [ ] **Step 1: Write the failing test**

  Create `packages/rules/tests/intents/raise-open-action.spec.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { applyRaiseOpenAction } from '../../src/intents/raise-open-action';
  import { baseStateWithEncounter, makeIntent } from './test-utils';
  // Use existing test-utils; if absent, copy from start-encounter.spec.ts pattern.

  describe('applyRaiseOpenAction', () => {
    it('appends a new OpenAction with a ulid id', () => {
      const s = baseStateWithEncounter();
      const intent = makeIntent({
        type: 'RaiseOpenAction',
        payload: {
          kind: '__sentinel_2b_0__',
          participantId: 'pc-1',
          expiresAtRound: 2,
          payload: { foo: 'bar' },
        },
      });
      const result = applyRaiseOpenAction(s, intent);
      expect(result.errors ?? []).toEqual([]);
      expect(result.state.openActions).toHaveLength(1);
      const oa = result.state.openActions[0];
      expect(oa.id).toMatch(/^oa_/);
      expect(oa.kind).toBe('__sentinel_2b_0__');
      expect(oa.participantId).toBe('pc-1');
      expect(oa.raisedAtRound).toBe(s.encounter!.currentRound);
      expect(oa.raisedByIntentId).toBe(intent.id);
      expect(oa.expiresAtRound).toBe(2);
      expect(oa.payload).toEqual({ foo: 'bar' });
    });

    it('rejects a malformed payload', () => {
      const s = baseStateWithEncounter();
      const intent = makeIntent({
        type: 'RaiseOpenAction',
        payload: { kind: 'unknown', participantId: '', payload: {} },
      });
      const result = applyRaiseOpenAction(s, intent);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].code).toBe('invalid_payload');
      expect(result.state.openActions).toHaveLength(0);
    });

    it('rejects when there is no active encounter', () => {
      const s = { ...baseStateWithEncounter(), encounter: null };
      const intent = makeIntent({
        type: 'RaiseOpenAction',
        payload: {
          kind: '__sentinel_2b_0__',
          participantId: 'pc-1',
          payload: {},
        },
      });
      const result = applyRaiseOpenAction(s, intent);
      expect(result.errors?.[0].code).toBe('no_active_encounter');
    });
  });
  ```

- [ ] **Step 2: Run the failing test**

  ```
  pnpm --filter @ironyard/rules test raise-open-action
  ```

  Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the reducer**

  Create `packages/rules/src/intents/raise-open-action.ts`:

  ```ts
  import { RaiseOpenActionPayloadSchema } from '@ironyard/shared';
  import { ulid } from 'ulid';
  import type { CampaignState, IntentResult, StampedIntent } from '../types';

  export function applyRaiseOpenAction(
    state: CampaignState,
    intent: StampedIntent,
  ): IntentResult {
    const parsed = RaiseOpenActionPayloadSchema.safeParse(intent.payload);
    if (!parsed.success) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `RaiseOpenAction rejected: ${parsed.error.message}`,
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
        log: [
          {
            kind: 'error',
            text: 'RaiseOpenAction rejected: no active encounter',
            intentId: intent.id,
          },
        ],
        errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
      };
    }

    const id = `oa_${ulid()}`;
    const nextOpenActions = [
      ...state.openActions,
      {
        id,
        kind: parsed.data.kind,
        participantId: parsed.data.participantId,
        raisedAtRound: state.encounter.currentRound ?? 0,
        raisedByIntentId: intent.id,
        expiresAtRound: parsed.data.expiresAtRound,
        payload: parsed.data.payload,
      },
    ];

    return {
      state: {
        ...state,
        seq: state.seq + 1,
        openActions: nextOpenActions,
      },
      derived: [],
      log: [
        {
          kind: 'info',
          text: `OpenAction raised (${parsed.data.kind}) for ${parsed.data.participantId}`,
          intentId: intent.id,
        },
      ],
    };
  }
  ```

- [ ] **Step 4: Run the tests**

  ```
  pnpm --filter @ironyard/rules test raise-open-action
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```
  git add packages/rules/src/intents/raise-open-action.ts packages/rules/tests/intents/raise-open-action.spec.ts
  git commit -m "feat(rules): applyRaiseOpenAction reducer"
  ```

---

## Task 10 — `applyClaimOpenAction` reducer

**Files:**

- Create: `packages/rules/src/intents/claim-open-action.ts`
- Test: `packages/rules/tests/intents/claim-open-action.spec.ts`

- [ ] **Step 1: Write the failing tests**

  Create `packages/rules/tests/intents/claim-open-action.spec.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { applyClaimOpenAction } from '../../src/intents/claim-open-action';
  import { baseStateWithEncounterAndPcs, makeIntent } from './test-utils';

  function stateWithOA(opts: { participantId: string; ownerId: string }) {
    const s = baseStateWithEncounterAndPcs([
      { id: opts.participantId, ownerId: opts.ownerId, kind: 'pc' },
      { id: 'pc-other', ownerId: 'other-user', kind: 'pc' },
    ]);
    s.openActions = [
      {
        id: 'oa-1',
        kind: '__sentinel_2b_0__',
        participantId: opts.participantId,
        raisedAtRound: 1,
        raisedByIntentId: 'i-prev',
        expiresAtRound: null,
        payload: {},
      },
    ];
    return s;
  }

  describe('applyClaimOpenAction', () => {
    it('owner of the targeted PC can claim — OA removed', () => {
      const s = stateWithOA({ participantId: 'pc-1', ownerId: 'alice' });
      const intent = makeIntent({
        actor: { userId: 'alice' },
        type: 'ClaimOpenAction',
        payload: { openActionId: 'oa-1' },
      });
      const result = applyClaimOpenAction(s, intent);
      expect(result.errors ?? []).toEqual([]);
      expect(result.state.openActions).toHaveLength(0);
    });

    it('active director can claim on behalf of a player', () => {
      const s = stateWithOA({ participantId: 'pc-1', ownerId: 'alice' });
      s.activeDirectorId = 'gm';
      const intent = makeIntent({
        actor: { userId: 'gm' },
        type: 'ClaimOpenAction',
        payload: { openActionId: 'oa-1' },
      });
      const result = applyClaimOpenAction(s, intent);
      expect(result.errors ?? []).toEqual([]);
      expect(result.state.openActions).toHaveLength(0);
    });

    it('rejects when actor is neither owner nor active director', () => {
      const s = stateWithOA({ participantId: 'pc-1', ownerId: 'alice' });
      const intent = makeIntent({
        actor: { userId: 'bob' },
        type: 'ClaimOpenAction',
        payload: { openActionId: 'oa-1' },
      });
      const result = applyClaimOpenAction(s, intent);
      expect(result.errors?.[0].code).toBe('not_authorized');
      expect(result.state.openActions).toHaveLength(1);
    });

    it('rejects an unknown openActionId', () => {
      const s = stateWithOA({ participantId: 'pc-1', ownerId: 'alice' });
      const intent = makeIntent({
        actor: { userId: 'alice' },
        type: 'ClaimOpenAction',
        payload: { openActionId: 'missing' },
      });
      const result = applyClaimOpenAction(s, intent);
      expect(result.errors?.[0].code).toBe('not_found');
    });

    it('rejects a malformed payload', () => {
      const s = stateWithOA({ participantId: 'pc-1', ownerId: 'alice' });
      const intent = makeIntent({
        actor: { userId: 'alice' },
        type: 'ClaimOpenAction',
        payload: { openActionId: '' },
      });
      const result = applyClaimOpenAction(s, intent);
      expect(result.errors?.[0].code).toBe('invalid_payload');
    });
  });
  ```

- [ ] **Step 2: Run the failing test**

  ```
  pnpm --filter @ironyard/rules test claim-open-action
  ```

  Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the reducer**

  Create `packages/rules/src/intents/claim-open-action.ts`:

  ```ts
  import { ClaimOpenActionPayloadSchema } from '@ironyard/shared';
  import type { CampaignState, IntentResult, StampedIntent } from '../types';
  import { isParticipant } from '../types';

  export function applyClaimOpenAction(
    state: CampaignState,
    intent: StampedIntent,
  ): IntentResult {
    const parsed = ClaimOpenActionPayloadSchema.safeParse(intent.payload);
    if (!parsed.success) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `ClaimOpenAction rejected: ${parsed.error.message}`,
            intentId: intent.id,
          },
        ],
        errors: [{ code: 'invalid_payload', message: parsed.error.message }],
      };
    }

    const oa = state.openActions.find((o) => o.id === parsed.data.openActionId);
    if (!oa) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `ClaimOpenAction: ${parsed.data.openActionId} not found`,
            intentId: intent.id,
          },
        ],
        errors: [
          { code: 'not_found', message: `openAction ${parsed.data.openActionId} not found` },
        ],
      };
    }

    // Authorization: targeted participant's owner OR active director.
    const target = state.participants.find(
      (p) => isParticipant(p) && p.id === oa.participantId,
    );
    const targetOwnerId = target && isParticipant(target) ? target.ownerId : null;
    const actorId = intent.actor.userId;
    const isOwner = targetOwnerId !== null && actorId === targetOwnerId;
    const isDirector = actorId === state.activeDirectorId;
    if (!isOwner && !isDirector) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `ClaimOpenAction: ${actorId} not authorized for ${oa.id}`,
            intentId: intent.id,
          },
        ],
        errors: [
          {
            code: 'not_authorized',
            message: `actor ${actorId} is neither owner of ${oa.participantId} nor active director`,
          },
        ],
      };
    }

    // Remove the OA. Kind-specific resolvers (the derived intents emitted
    // here) are registered in 2b.0.1; for now Claim just clears the entry.
    const nextOpenActions = state.openActions.filter((o) => o.id !== oa.id);

    return {
      state: {
        ...state,
        seq: state.seq + 1,
        openActions: nextOpenActions,
      },
      derived: [],
      log: [
        {
          kind: 'info',
          text: `OpenAction ${oa.id} (${oa.kind}) claimed by ${actorId}`,
          intentId: intent.id,
        },
      ],
    };
  }
  ```

- [ ] **Step 4: Run the tests**

  ```
  pnpm --filter @ironyard/rules test claim-open-action
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```
  git add packages/rules/src/intents/claim-open-action.ts packages/rules/tests/intents/claim-open-action.spec.ts
  git commit -m "feat(rules): applyClaimOpenAction reducer + owner-or-director auth"
  ```

---

## Task 11 — `EndRound` OA auto-expiry

**Files:**

- Modify: `packages/rules/src/intents/turn.ts` — extend `applyEndRound`
- Test: existing `turn.spec.ts` — extend

- [ ] **Step 1: Write the failing test**

  Append to `packages/rules/tests/intents/turn.spec.ts` (or the equivalent file — locate `applyEndRound` tests):

  ```ts
  describe('applyEndRound + OpenAction expiry', () => {
    it('removes OAs whose expiresAtRound === currentRound', () => {
      const s = baseStateWithEncounter();
      s.encounter!.currentRound = 3;
      s.openActions = [
        { id: 'oa-now', kind: '__sentinel_2b_0__', participantId: 'pc-1', raisedAtRound: 3, raisedByIntentId: 'x', expiresAtRound: 3, payload: {} },
        { id: 'oa-later', kind: '__sentinel_2b_0__', participantId: 'pc-1', raisedAtRound: 3, raisedByIntentId: 'x', expiresAtRound: 5, payload: {} },
        { id: 'oa-null', kind: '__sentinel_2b_0__', participantId: 'pc-1', raisedAtRound: 3, raisedByIntentId: 'x', expiresAtRound: null, payload: {} },
      ];
      const result = applyEndRound(s, makeIntent({ type: 'EndRound', payload: {} }));
      const remainingIds = result.state.openActions.map(o => o.id);
      expect(remainingIds).toEqual(['oa-later', 'oa-null']);
    });
  });
  ```

- [ ] **Step 2: Run the failing test**

  ```
  pnpm --filter @ironyard/rules test turn
  ```

  Expected: FAIL — current EndRound doesn't touch openActions.

- [ ] **Step 3: Extend `applyEndRound`**

  Open `packages/rules/src/intents/turn.ts`. In `applyEndRound` (around line 78–119), after the early-out for `currentRound === null` and before the return, compute the next openActions:

  ```ts
  const currentRound = guard.encounter.currentRound;
  const nextOpenActions = state.openActions.filter(
    (o) => o.expiresAtRound === null || o.expiresAtRound !== currentRound,
  );
  ```

  Update the return:

  ```ts
  return {
    state: {
      ...state,
      seq: state.seq + 1,
      openActions: nextOpenActions,
      encounter: {
        ...guard.encounter,
        activeParticipantId: null,
      },
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `round ${guard.encounter.currentRound} ends`,
        intentId: intent.id,
      },
    ],
  };
  ```

- [ ] **Step 4: Run the tests**

  ```
  pnpm --filter @ironyard/rules test turn
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```
  git add packages/rules/src/intents/turn.ts packages/rules/tests/intents/turn.spec.ts
  git commit -m "feat(rules): EndRound auto-expires OAs whose expiresAtRound === currentRound"
  ```

---

## Task 12 — Wire `RaiseOpenAction` + `ClaimOpenAction` into dispatcher + SERVER_ONLY

**Files:**

- Modify: `packages/rules/src/intents/index.ts`
- Modify: `packages/rules/src/reducer.ts`
- Modify: `apps/api/src/lobby-do.ts`

- [ ] **Step 1: Re-export the reducers**

  Open `packages/rules/src/intents/index.ts`. Add:

  ```ts
  export { applyRaiseOpenAction } from './raise-open-action';
  export { applyClaimOpenAction } from './claim-open-action';
  ```

  In the bulk-imports re-export block (around line 39), include them with the alphabetized list.

- [ ] **Step 2: Dispatch from the reducer**

  Open `packages/rules/src/reducer.ts`. In the dispatcher switch, add:

  ```ts
  case 'RaiseOpenAction':
    return applyRaiseOpenAction(state, intent);
  case 'ClaimOpenAction':
    return applyClaimOpenAction(state, intent);
  ```

  Place alphabetically (after `Push`/`Pull`/etc. — find your reducer's existing ordering).

- [ ] **Step 3: Add `RaiseOpenAction` to `SERVER_ONLY_INTENTS`**

  Open `apps/api/src/lobby-do.ts:475`. Change:

  ```ts
  private readonly SERVER_ONLY_INTENTS = new Set(['JoinLobby', 'LeaveLobby', 'ApplyDamage', 'RaiseOpenAction']);
  ```

  `ClaimOpenAction` stays client-dispatchable.

- [ ] **Step 4: Run all tests + typecheck**

  ```
  pnpm test
  pnpm typecheck
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```
  git add packages/rules/src/intents/index.ts packages/rules/src/reducer.ts apps/api/src/lobby-do.ts
  git commit -m "feat(rules,api): wire OpenAction intents; RaiseOpenAction is server-only"
  ```

---

## Task 13 — Empty `OPEN_ACTION_COPY` registry

**Files:**

- Create: `packages/shared/src/open-action-copy.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the registry file**

  Create `packages/shared/src/open-action-copy.ts`:

  ```ts
  import type { OpenAction, OpenActionKind } from './open-action';

  /**
   * Per-kind UI copy for OpenActionsList. Empty in 2b.0; populated by 2b.0.1
   * consumers as they register their kinds.
   *
   * `OpenActionsList.tsx` reads from this registry. If a kind is missing,
   * the component falls back to a generic title (`Open Action: <kind>`)
   * and disables the Claim button — that's the signal to the implementer
   * that they need to register copy for the new kind.
   */
  export type OpenActionCopy = {
    title: (oa: OpenAction) => string;
    body: (oa: OpenAction) => string;
    claimLabel: (oa: OpenAction) => string;
  };

  export const OPEN_ACTION_COPY: Partial<Record<OpenActionKind, OpenActionCopy>> = {
    // 2b.0.1 entries land here. Example shape (do not commit until consumer ships):
    // 'pray-to-the-gods': {
    //   title: (oa) => 'Pray to the Gods',
    //   body: (oa) => 'Roll 1d3 of piety risk for a domain effect or +1 piety.',
    //   claimLabel: () => 'Pray',
    // },
  };
  ```

- [ ] **Step 2: Re-export from shared index**

  Open `packages/shared/src/index.ts`. Add:

  ```ts
  export { OPEN_ACTION_COPY } from './open-action-copy';
  export type { OpenActionCopy } from './open-action-copy';
  ```

- [ ] **Step 3: Run typecheck**

  ```
  pnpm typecheck
  ```

  Expected: clean.

- [ ] **Step 4: Commit**

  ```
  git add packages/shared/src/open-action-copy.ts packages/shared/src/index.ts
  git commit -m "feat(shared): OPEN_ACTION_COPY registry scaffolding (empty in 2b.0)"
  ```

---

## Task 14 — `StartEncounter` heroic resource preload + initial Malice + round-1 tick

**Files:**

- Modify: `packages/rules/src/intents/start-encounter.ts`
- Test: `packages/rules/tests/intents/start-encounter.spec.ts` (existing — extend)

- [ ] **Step 1: Write the failing tests**

  Append to the existing `start-encounter.spec.ts` (find the test file via `find packages/rules/tests -name "start-encounter*"`):

  ```ts
  describe('StartEncounter heroic resource preload', () => {
    it('seeds each PC\'s heroic resource pool from character.victories', () => {
      const s = baseStateNoEncounter();
      const intent = makeStartEncounterIntent({
        characterIds: ['char-talent', 'char-censor'],
        monsters: [],
        stampedPcs: [
          { characterId: 'char-talent', character: { ...minimalCharacter, victories: 4, classId: 'talent' }, name: 'Mira', ownerId: 'alice' },
          { characterId: 'char-censor', character: { ...minimalCharacter, victories: 2, classId: 'censor' }, name: 'Drax', ownerId: 'bob' },
        ],
        stampedMonsters: [],
      });
      const result = applyStartEncounter(s, intent);
      const pcs = result.state.participants.filter(p => isParticipant(p) && p.kind === 'pc');
      const talent = pcs.find(p => p.characterId === 'char-talent');
      const censor = pcs.find(p => p.characterId === 'char-censor');
      expect(talent?.heroicResources).toHaveLength(1);
      expect(talent?.heroicResources[0]).toMatchObject({ name: 'clarity', value: 4 });
      expect(censor?.heroicResources).toHaveLength(1);
      expect(censor?.heroicResources[0]).toMatchObject({ name: 'wrath', value: 2, floor: 0 });
    });

    it('sets clarity.floor to -(1 + reason)', () => {
      const s = baseStateNoEncounter();
      const intent = makeStartEncounterIntent({
        characterIds: ['char-talent'],
        monsters: [],
        stampedPcs: [{
          characterId: 'char-talent',
          character: { ...minimalCharacter, victories: 0, classId: 'talent', characteristics: { reason: 3, might: 0, agility: 0, intuition: 0, presence: 0 } },
          name: 'Mira',
          ownerId: 'alice',
        }],
        stampedMonsters: [],
      });
      const result = applyStartEncounter(s, intent);
      const talent = result.state.participants.find(p => isParticipant(p) && p.kind === 'pc');
      expect(talent?.heroicResources[0].floor).toBe(-4); // -(1 + 3)
    });

    it('materializes participant.victories from character.victories', () => {
      const s = baseStateNoEncounter();
      const intent = makeStartEncounterIntent({
        characterIds: ['char-1'],
        monsters: [],
        stampedPcs: [{ characterId: 'char-1', character: { ...minimalCharacter, victories: 7, classId: 'tactician' }, name: 'Pet', ownerId: 'alice' }],
        stampedMonsters: [],
      });
      const result = applyStartEncounter(s, intent);
      const pc = result.state.participants.find(p => isParticipant(p) && p.kind === 'pc');
      expect(pc?.victories).toBe(7);
    });
  });

  describe('StartEncounter Malice generation', () => {
    it('5 PCs with 3 victories each → malice = 3 + 5 + 1 = 9 (canon § 5.5 worked example)', () => {
      const s = baseStateNoEncounter();
      const intent = makeStartEncounterIntent({
        characterIds: Array.from({ length: 5 }, (_, i) => `char-${i}`),
        monsters: [],
        stampedPcs: Array.from({ length: 5 }, (_, i) => ({
          characterId: `char-${i}`,
          character: { ...minimalCharacter, victories: 3, classId: 'tactician' },
          name: `PC ${i}`,
          ownerId: 'alice',
        })),
        stampedMonsters: [],
      });
      const result = applyStartEncounter(s, intent);
      expect(result.state.encounter!.malice.current).toBe(9);
    });

    it('empty PC roster → malice 0 + 0 + 1 = 1 (formula yields, no special case)', () => {
      const s = baseStateNoEncounter();
      const intent = makeStartEncounterIntent({
        characterIds: [],
        monsters: [{ monsterId: 'goblin', quantity: 1 }],
        stampedPcs: [],
        stampedMonsters: [{ monster: minimalMonster, quantity: 1 }],
      });
      const result = applyStartEncounter(s, intent);
      expect(result.state.encounter!.malice.current).toBe(1);
    });
  });
  ```

  > **Note for the engineer.** Adjust `minimalCharacter` / `minimalMonster` / fixtures to match the existing test-utils shape. The key new assertions: per-PC `heroicResources[0]` materialized; `participant.victories` set; `malice.current = floor(avg) + aliveHeroes + 1`. Existing assertions in the file should still pass.

- [ ] **Step 2: Run the failing tests**

  ```
  pnpm --filter @ironyard/rules test start-encounter
  ```

  Expected: FAIL — current StartEncounter has `heroicResources: []` and `malice.current: 0`.

- [ ] **Step 3: Extend the PC materialization in `applyStartEncounter`**

  Open `packages/rules/src/intents/start-encounter.ts`. Around line 80–112 the PC participant materialization happens. Update:

  ```ts
  import { HEROIC_RESOURCES, resolveFloor } from '../heroic-resources';

  // ...

  const pcParticipants: Participant[] = parsed.data.stampedPcs.map((stamped) => {
    const runtime = deriveCharacterRuntime(stamped.character, ctx.staticData);
    const currentStamina = stamped.character.currentStamina ?? runtime.maxStamina;
    const recoveriesUsed = stamped.character.recoveriesUsed;
    const recoveriesCurrent = Math.max(0, runtime.recoveriesMax - recoveriesUsed);

    const resourceName = runtime.heroicResource.name as keyof typeof HEROIC_RESOURCES;
    const config = HEROIC_RESOURCES[resourceName];
    const heroicResources = config
      ? [{
          name: config.name,
          value: stamped.character.victories ?? 0,
          floor: resolveFloor(config.floor, runtime.characteristics),
        }]
      : [];

    return {
      id: `pc:${stamped.characterId}`,
      // ...existing fields...
      heroicResources,
      // ...
      victories: stamped.character.victories ?? 0,
      // ...
    };
  });
  ```

  Existing fields that remain: `currentStamina`, `maxStamina`, `characteristics`, `immunities`, `weaknesses`, `conditions`, `extras`, `surges`, `recoveries`, `recoveryValue`, `weaponDamageBonus`, `activeAbilities`. Add the new `victories` field.

  > **Note.** If `runtime.heroicResource.name` is `'unknown'` (the fallback when `character.classId` is missing or unmapped), `config` is `undefined` and `heroicResources = []`. That's fine — the PC simply has no resource pool. Add a test fixture if needed for the unmapped-class case to confirm graceful degradation.

- [ ] **Step 4: Add Malice initial preload + round-1 tick**

  Lower in the same file (around line 132–139 where the `encounter` object is constructed), replace the `malice` literal:

  ```ts
  import { averageVictoriesAlive, aliveHeroes } from '../state-helpers';

  // ...

  // Construct the state mid-fold so the alive-check sees the new PC participants.
  const interimState = { ...state, participants: allParticipants };
  const initialMalice =
    averageVictoriesAlive(interimState) + aliveHeroes(interimState).length + 1;

  const encounter: EncounterPhase = {
    id: encounterId,
    currentRound: 1,
    turnOrder: allParticipants.map((p) => p.id),
    activeParticipantId: null,
    turnState: {},
    malice: { current: initialMalice, lastMaliciousStrikeRound: null },
  };
  ```

- [ ] **Step 5: Run the tests**

  ```
  pnpm --filter @ironyard/rules test start-encounter
  pnpm --filter @ironyard/rules test
  ```

  Expected: PASS for new tests. Existing tests may need fixture updates if they asserted `heroicResources: []` or `malice.current: 0` — update the assertions to reflect canon.

- [ ] **Step 6: Commit**

  ```
  git add packages/rules/src/intents/start-encounter.ts packages/rules/tests/intents/start-encounter.spec.ts
  git commit -m "feat(rules): StartEncounter heroic resource preload + initial Malice + round-1 tick (canon § 5.4/§ 5.5)"
  ```

---

## Task 15 — `StartRound` round-N Malice tick

**Files:**

- Modify: `packages/rules/src/intents/turn.ts` — extend `applyStartRound`
- Test: existing `turn.spec.ts` — extend

- [ ] **Step 1: Write the failing test**

  Append to `turn.spec.ts`:

  ```ts
  describe('applyStartRound Malice tick', () => {
    it('round 2 with 5 alive heroes → malice += 7', () => {
      const s = baseStateWithEncounterAndPcs(5);  // 5 PCs, currentStamina default healthy
      s.encounter!.currentRound = 1;
      s.encounter!.malice.current = 9;  // from round-1 init
      const result = applyStartRound(s, makeIntent({ type: 'StartRound', payload: {} }));
      // After StartRound: currentRound = 2; malice += aliveHeroes(5) + 2 = 7.
      expect(result.state.encounter!.currentRound).toBe(2);
      expect(result.state.encounter!.malice.current).toBe(16);
    });

    it('hero death drops the alive count for subsequent ticks', () => {
      const s = baseStateWithEncounterAndPcs(5);
      s.encounter!.currentRound = 2;
      s.encounter!.malice.current = 16;
      // Kill one PC (currentStamina past -windedValue).
      const dead = s.participants.find(p => isParticipant(p) && p.kind === 'pc');
      if (dead) (dead as Participant).currentStamina = -100;
      const result = applyStartRound(s, makeIntent({ type: 'StartRound', payload: {} }));
      // currentRound becomes 3; aliveHeroes = 4; malice += 4 + 3 = 7.
      expect(result.state.encounter!.malice.current).toBe(23);
    });
  });
  ```

- [ ] **Step 2: Run the failing test**

  ```
  pnpm --filter @ironyard/rules test turn
  ```

  Expected: FAIL — current StartRound doesn't touch malice.

- [ ] **Step 3: Extend `applyStartRound`**

  Open `packages/rules/src/intents/turn.ts:41–76`. Modify:

  ```ts
  import { aliveHeroes } from '../state-helpers';

  export function applyStartRound(state: CampaignState, intent: StampedIntent): IntentResult {
    const parsed = StartRoundPayloadSchema.safeParse(intent.payload);
    if (!parsed.success) { /* existing error path */ }
    const guard = requireEncounter(state, intent, 'StartRound');
    if (!guard.ok) return guard.result;

    const round = (guard.encounter.currentRound ?? 0) + 1;
    const firstId = guard.encounter.turnOrder[0] ?? null;

    // Canon § 5.5: at the start of each round (including round 1), the
    // Director gains `aliveHeroes + roundNumber` malice. Round 1 was
    // applied at StartEncounter time; rounds 2+ apply here.
    const interimState = { ...state, participants: state.participants };
    const aliveCount = aliveHeroes(interimState).length;
    const nextMalice = guard.encounter.malice.current + aliveCount + round;

    return {
      state: {
        ...state,
        seq: state.seq + 1,
        encounter: {
          ...guard.encounter,
          currentRound: round,
          activeParticipantId: firstId,
          malice: {
            ...guard.encounter.malice,
            current: nextMalice,
          },
        },
      },
      derived: [],
      log: [{ kind: 'info', text: `round ${round} starts; +${aliveCount + round} malice`, intentId: intent.id }],
    };
  }
  ```

- [ ] **Step 4: Run the tests**

  ```
  pnpm --filter @ironyard/rules test turn
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```
  git add packages/rules/src/intents/turn.ts packages/rules/tests/intents/turn.spec.ts
  git commit -m "feat(rules): StartRound adds aliveHeroes + N malice per canon § 5.5"
  ```

---

## Task 16 — `StartTurn` payload extension + per-turn heroic resource gain

**Files:**

- Modify: `packages/shared/src/intents/turn.ts` — extend `StartTurnPayloadSchema`
- Modify: `packages/rules/src/intents/turn.ts` — extend `applyStartTurn`
- Test: extend `turn.spec.ts`

- [ ] **Step 1: Write the failing test**

  Append to `turn.spec.ts`:

  ```ts
  describe('applyStartTurn per-turn heroic resource gain', () => {
    it('flat-class (Censor) gains +2 wrath on turn start with no rolls payload', () => {
      const s = baseStateWithEncounterAndPcs([{ id: 'pc-censor', resourceName: 'wrath', startValue: 0 }]);
      const intent = makeIntent({
        type: 'StartTurn',
        payload: { participantId: 'pc-censor' },
      });
      const result = applyStartTurn(s, intent);
      expect(result.errors ?? []).toEqual([]);
      const pc = result.state.participants.find(p => isParticipant(p) && p.id === 'pc-censor');
      expect(pc?.heroicResources[0].value).toBe(2);
    });

    it('d3-class (Talent) gains rolls.d3 clarity on turn start', () => {
      const s = baseStateWithEncounterAndPcs([{ id: 'pc-talent', resourceName: 'clarity', startValue: 0 }]);
      const intent = makeIntent({
        type: 'StartTurn',
        payload: { participantId: 'pc-talent', rolls: { d3: 3 } },
      });
      const result = applyStartTurn(s, intent);
      expect(result.errors ?? []).toEqual([]);
      const pc = result.state.participants.find(p => isParticipant(p) && p.id === 'pc-talent');
      expect(pc?.heroicResources[0].value).toBe(3);
    });

    it('flat-class with rolls.d3 set → rejected (wrong_payload_shape)', () => {
      const s = baseStateWithEncounterAndPcs([{ id: 'pc-censor', resourceName: 'wrath', startValue: 0 }]);
      const intent = makeIntent({
        type: 'StartTurn',
        payload: { participantId: 'pc-censor', rolls: { d3: 2 } },
      });
      const result = applyStartTurn(s, intent);
      expect(result.errors?.[0].code).toBe('wrong_payload_shape');
    });

    it('d3-class with rolls.d3 missing → rejected', () => {
      const s = baseStateWithEncounterAndPcs([{ id: 'pc-talent', resourceName: 'clarity', startValue: 0 }]);
      const intent = makeIntent({
        type: 'StartTurn',
        payload: { participantId: 'pc-talent' },
      });
      const result = applyStartTurn(s, intent);
      expect(result.errors?.[0].code).toBe('missing_dice');
    });

    it('d3 out of range (4) → rejected at schema layer', () => {
      const s = baseStateWithEncounterAndPcs([{ id: 'pc-talent', resourceName: 'clarity', startValue: 0 }]);
      const intent = makeIntent({
        type: 'StartTurn',
        payload: { participantId: 'pc-talent', rolls: { d3: 4 } },
      });
      const result = applyStartTurn(s, intent);
      expect(result.errors?.[0].code).toBe('invalid_payload');
    });

    it('gain is additive — does not zero existing value', () => {
      const s = baseStateWithEncounterAndPcs([{ id: 'pc-censor', resourceName: 'wrath', startValue: 5 }]);
      const intent = makeIntent({
        type: 'StartTurn',
        payload: { participantId: 'pc-censor' },
      });
      const result = applyStartTurn(s, intent);
      const pc = result.state.participants.find(p => isParticipant(p) && p.id === 'pc-censor');
      expect(pc?.heroicResources[0].value).toBe(7);
    });

    it('Talent with negative clarity still gains normally (no clamp)', () => {
      const s = baseStateWithEncounterAndPcs([{ id: 'pc-talent', resourceName: 'clarity', startValue: -2, floor: -4 }]);
      const intent = makeIntent({
        type: 'StartTurn',
        payload: { participantId: 'pc-talent', rolls: { d3: 2 } },
      });
      const result = applyStartTurn(s, intent);
      const pc = result.state.participants.find(p => isParticipant(p) && p.id === 'pc-talent');
      expect(pc?.heroicResources[0].value).toBe(0);
    });
  });
  ```

- [ ] **Step 2: Run the failing test**

  ```
  pnpm --filter @ironyard/rules test turn
  ```

  Expected: FAIL — current StartTurn doesn't apply per-turn gain.

- [ ] **Step 3: Extend the payload schema**

  Open `packages/shared/src/intents/turn.ts:9–12`. Replace:

  ```ts
  export const StartTurnPayloadSchema = z.object({
    participantId: z.string().min(1),
    rolls: z.object({
      d3: z.number().int().min(1).max(3),
    }).optional(),
  });
  export type StartTurnPayload = z.infer<typeof StartTurnPayloadSchema>;
  ```

- [ ] **Step 4: Extend `applyStartTurn`**

  Open `packages/rules/src/intents/turn.ts:121–173`. After the existing `requireEncounter` check and `participantId` lookup, before the final return, add the gain logic:

  ```ts
  import { HEROIC_RESOURCES } from '../heroic-resources';

  // ... within applyStartTurn, after the participant-missing guard ...

  const participant = state.participants.find(
    (p): p is Participant => isParticipant(p) && p.id === participantId,
  );

  // Only PCs gain heroic resources on turn start. Monsters skip this block.
  let nextParticipants = state.participants;
  if (participant && participant.kind === 'pc' && participant.heroicResources.length > 0) {
    const resource = participant.heroicResources[0];
    const config = HEROIC_RESOURCES[resource.name];
    if (config) {
      const gain = config.baseGain.onTurnStart;
      const providedD3 = parsed.data.rolls?.d3;

      if (gain.kind === 'flat') {
        if (providedD3 !== undefined) {
          return {
            state,
            derived: [],
            log: [
              {
                kind: 'error',
                text: `StartTurn rejected: ${resource.name} is flat-gain; rolls.d3 not allowed`,
                intentId: intent.id,
              },
            ],
            errors: [
              {
                code: 'wrong_payload_shape',
                message: `${resource.name} uses flat gain; do not provide rolls.d3`,
              },
            ],
          };
        }
        const newValue = resource.value + gain.amount;
        nextParticipants = state.participants.map((p) =>
          isParticipant(p) && p.id === participantId
            ? { ...p, heroicResources: [{ ...resource, value: newValue }] }
            : p,
        );
      } else if (gain.kind === 'd3') {
        if (providedD3 === undefined) {
          return {
            state,
            derived: [],
            log: [
              {
                kind: 'error',
                text: `StartTurn rejected: ${resource.name} requires rolls.d3 (dispatcher pre-rolls)`,
                intentId: intent.id,
              },
            ],
            errors: [
              { code: 'missing_dice', message: `${resource.name} requires rolls.d3` },
            ],
          };
        }
        const newValue = resource.value + providedD3;
        nextParticipants = state.participants.map((p) =>
          isParticipant(p) && p.id === participantId
            ? { ...p, heroicResources: [{ ...resource, value: newValue }] }
            : p,
        );
      } else {
        // 'd3-plus' is stubbed for 2b.0.1 (10th-level Psion 1d3+2).
        return {
          state,
          derived: [],
          log: [
            {
              kind: 'error',
              text: `StartTurn rejected: ${gain.kind} gain not yet supported (2b.0.1)`,
              intentId: intent.id,
            },
          ],
          errors: [{ code: 'not_yet_supported', message: `gain ${gain.kind} not yet wired` }],
        };
      }
    }
  }
  ```

  Then in the existing return, use `nextParticipants`:

  ```ts
  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: nextParticipants,
      encounter: {
        ...guard.encounter,
        activeParticipantId: participantId,
        turnState: nextTurnState,
      },
    },
    derived: [],
    log: [{ kind: 'info', text: `${participantId} starts their turn`, intentId: intent.id }],
  };
  ```

- [ ] **Step 5: Run the tests**

  ```
  pnpm --filter @ironyard/rules test turn
  ```

  Expected: PASS.

- [ ] **Step 6: Update existing test fixtures**

  Any test that calls `applyStartTurn` for a PC with a d3-class will now need `rolls: { d3: N }` in its payload. Run the full rules suite:

  ```
  pnpm --filter @ironyard/rules test
  ```

  Fix any fixture that fails by adding the missing `rolls.d3` or changing the PC's class to a flat-gain class.

- [ ] **Step 7: Commit**

  ```
  git add packages/shared/src/intents/turn.ts packages/rules/src/intents/turn.ts packages/rules/tests/intents/turn.spec.ts
  git commit -m "feat(rules): StartTurn applies per-turn heroic resource gain (canon § 5.3/§ 5.4)"
  ```

---

## Task 17 — `EndEncounter` heroic resource + surge zeroing + OA clear

**Files:**

- Modify: `packages/rules/src/intents/end-encounter.ts`
- Test: `packages/rules/tests/intents/end-encounter.spec.ts`

- [ ] **Step 1: Write the failing tests**

  Append to `end-encounter.spec.ts`:

  ```ts
  describe('EndEncounter cleanup', () => {
    it('zeros every PC\'s heroic resource value (positive)', () => {
      const s = baseStateWithEncounterAndPcs([
        { id: 'pc-1', resourceName: 'wrath', startValue: 10 },
        { id: 'pc-2', resourceName: 'focus', startValue: 5 },
      ]);
      const result = applyEndEncounter(s, makeIntent({ type: 'EndEncounter', payload: {} }));
      result.state.participants
        .filter(p => isParticipant(p) && p.kind === 'pc')
        .forEach(p => {
          if (p.heroicResources.length > 0) expect(p.heroicResources[0].value).toBe(0);
        });
    });

    it('zeros negative clarity to 0 (canon § 5.3 lifecycle)', () => {
      const s = baseStateWithEncounterAndPcs([
        { id: 'pc-talent', resourceName: 'clarity', startValue: -3 },
      ]);
      const result = applyEndEncounter(s, makeIntent({ type: 'EndEncounter', payload: {} }));
      const pc = result.state.participants.find(p => isParticipant(p) && p.id === 'pc-talent');
      expect(pc?.heroicResources[0].value).toBe(0);
    });

    it('zeros surges to 0 (canon § 5.6)', () => {
      const s = baseStateWithEncounterAndPcs([
        { id: 'pc-1', surges: 4 },
      ]);
      const result = applyEndEncounter(s, makeIntent({ type: 'EndEncounter', payload: {} }));
      const pc = result.state.participants.find(p => isParticipant(p) && p.id === 'pc-1');
      expect(pc?.surges).toBe(0);
    });

    it('clears all open actions', () => {
      const s = baseStateWithEncounterAndPcs([{ id: 'pc-1' }]);
      s.openActions = [{
        id: 'oa-1', kind: '__sentinel_2b_0__', participantId: 'pc-1',
        raisedAtRound: 1, raisedByIntentId: 'x', expiresAtRound: null, payload: {},
      }];
      const result = applyEndEncounter(s, makeIntent({ type: 'EndEncounter', payload: {} }));
      expect(result.state.openActions).toEqual([]);
    });
  });
  ```

- [ ] **Step 2: Run the failing tests**

  ```
  pnpm --filter @ironyard/rules test end-encounter
  ```

  Expected: FAIL.

- [ ] **Step 3: Extend `applyEndEncounter`**

  Open `packages/rules/src/intents/end-encounter.ts:49+`. After the existing teardown logic (which may already touch participants for D1 writeback — `currentStamina` / `recoveriesUsed` per Epic 2D), insert:

  ```ts
  // Canon § 5.4 lifecycle + § 5.6 surge loss: every PC's heroic resource
  // pool resets to 0 (both positive and negative); surges reset to 0.
  const cleanedParticipants = state.participants.map((p) => {
    if (!isParticipant(p) || p.kind !== 'pc') return p;
    return {
      ...p,
      heroicResources: p.heroicResources.map((r) => ({ ...r, value: 0 })),
      surges: 0,
    };
  });
  ```

  Update the return state to use `cleanedParticipants` and `openActions: []`:

  ```ts
  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: cleanedParticipants,
      openActions: [],
      encounter: null,
      // ...any existing fields (partyVictories etc.)...
    },
    // ...
  };
  ```

  Reconcile with the existing reducer body — preserve any logic that writes `currentStamina` back to the character row, captures victories, etc.

- [ ] **Step 4: Run the tests**

  ```
  pnpm --filter @ironyard/rules test end-encounter
  pnpm --filter @ironyard/rules test
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```
  git add packages/rules/src/intents/end-encounter.ts packages/rules/tests/intents/end-encounter.spec.ts
  git commit -m "feat(rules): EndEncounter zeros heroic resources + surges + clears OAs (canon § 5.4/§ 5.6)"
  ```

---

## Task 18 — Integration test: full encounter cycle

**Files:**

- Create: `packages/rules/tests/heroic-resources.spec.ts` — already created in Task 4 for config; add a new `describe` block

- [ ] **Step 1: Write the integration test**

  Extend `packages/rules/tests/heroic-resources.spec.ts`:

  ```ts
  describe('full encounter resource generation cycle (canon § 5 worked example)', () => {
    it('5-PC party with 3 victories each: encounter start → 3 rounds → end (matches canon § 5.5)', () => {
      // Materialize 5 PCs covering 5 different classes (Censor flat, Conduit d3,
      // Tactician flat, Fury d3, Talent d3). Each starts with victories = 3.
      const pcs = [
        { characterId: 'char-censor',    classId: 'censor',    resourceName: 'wrath',    gainKind: 'flat' as const },
        { characterId: 'char-conduit',   classId: 'conduit',   resourceName: 'piety',    gainKind: 'd3'   as const },
        { characterId: 'char-tactician', classId: 'tactician', resourceName: 'focus',    gainKind: 'flat' as const },
        { characterId: 'char-fury',      classId: 'fury',      resourceName: 'ferocity', gainKind: 'd3'   as const },
        { characterId: 'char-talent',    classId: 'talent',    resourceName: 'clarity',  gainKind: 'd3'   as const },
      ];

      const s0 = baseStateNoEncounter();
      const startIntent = makeStartEncounterIntent({
        characterIds: pcs.map(p => p.characterId),
        monsters: [],
        stampedPcs: pcs.map(p => ({
          characterId: p.characterId,
          character: { ...minimalCharacter, victories: 3, classId: p.classId },
          name: p.characterId,
          ownerId: 'alice',
        })),
        stampedMonsters: [],
      });
      let s = applyStartEncounter(s0, startIntent).state;

      // Encounter-start preload: each PC has their resource at 3 (== victories).
      pcs.forEach(p => {
        const pc = s.participants.find(x => isParticipant(x) && x.characterId === p.characterId);
        expect(pc?.heroicResources[0].value).toBe(3);
      });
      // Round 1 malice: avg(3) + 5 alive + 1 round = 9.
      expect(s.encounter!.malice.current).toBe(9);

      // Run 3 turns of round 1: each PC starts their turn with the appropriate
      // rolls payload.
      for (const p of pcs) {
        const payload: { participantId: string; rolls?: { d3: number } } = {
          participantId: `pc:${p.characterId}`,
        };
        if (p.gainKind === 'd3') payload.rolls = { d3: 2 };  // pin to 2 for determinism
        s = applyStartTurn(s, makeIntent({ type: 'StartTurn', payload })).state;
        // After StartTurn, end the turn so the next PC can start theirs.
        s = applyEndTurn(s, makeIntent({ type: 'EndTurn', payload: {} })).state;
      }

      // After all 5 turns this round:
      // - Censor wrath: 3 + 2 = 5
      // - Conduit piety: 3 + 2 = 5
      // - Tactician focus: 3 + 2 = 5
      // - Fury ferocity: 3 + 2 = 5
      // - Talent clarity: 3 + 2 = 5
      pcs.forEach(p => {
        const pc = s.participants.find(x => isParticipant(x) && x.characterId === p.characterId);
        expect(pc?.heroicResources[0].value).toBe(5);
      });

      // End the round and start round 2.
      s = applyEndRound(s, makeIntent({ type: 'EndRound', payload: {} })).state;
      s = applyStartRound(s, makeIntent({ type: 'StartRound', payload: {} })).state;
      // Round 2 malice: 9 + (5 alive + 2 round) = 16.
      expect(s.encounter!.malice.current).toBe(16);

      // End the encounter.
      s = applyEndEncounter(s, makeIntent({ type: 'EndEncounter', payload: {} })).state;
      // Every PC's resource pool zeroed; surges zeroed; open actions cleared.
      s.participants.filter(p => isParticipant(p) && p.kind === 'pc').forEach(pc => {
        if (pc.heroicResources.length > 0) expect(pc.heroicResources[0].value).toBe(0);
        expect(pc.surges).toBe(0);
      });
      expect(s.openActions).toEqual([]);
    });
  });
  ```

- [ ] **Step 2: Run the test**

  ```
  pnpm --filter @ironyard/rules test heroic-resources
  ```

  Expected: PASS.

- [ ] **Step 3: Commit**

  ```
  git add packages/rules/tests/heroic-resources.spec.ts
  git commit -m "test(rules): end-to-end § 5 resource cycle integration test"
  ```

---

## Task 19 — `OpenActionsList` shared UI component

**Files:**

- Create: `apps/web/src/pages/combat/OpenActionsList.tsx`
- Test: `apps/web/src/pages/combat/OpenActionsList.spec.tsx`

- [ ] **Step 1: Write the failing test**

  Create `apps/web/src/pages/combat/OpenActionsList.spec.tsx`:

  ```tsx
  import { describe, expect, it, vi } from 'vitest';
  import { render, screen, fireEvent } from '@testing-library/react';
  import { OpenActionsList } from './OpenActionsList';
  import type { OpenAction } from '@ironyard/shared';

  function fakeOA(overrides: Partial<OpenAction> = {}): OpenAction {
    return {
      id: 'oa-1',
      kind: '__sentinel_2b_0__',
      participantId: 'pc-1',
      raisedAtRound: 1,
      raisedByIntentId: 'i-1',
      expiresAtRound: null,
      payload: {},
      ...overrides,
    } as OpenAction;
  }

  describe('OpenActionsList', () => {
    it('shows the empty state when the list is empty', () => {
      render(<OpenActionsList openActions={[]} currentUserId="alice" activeDirectorId="alice" participantOwnerLookup={() => 'alice'} onClaim={() => {}} />);
      expect(screen.getByText(/no open actions/i)).toBeInTheDocument();
    });

    it('renders an entry with a generic title when the kind has no copy registered', () => {
      render(
        <OpenActionsList
          openActions={[fakeOA()]}
          currentUserId="alice"
          activeDirectorId="alice"
          participantOwnerLookup={() => 'alice'}
          onClaim={() => {}}
        />,
      );
      expect(screen.getByText(/__sentinel_2b_0__/)).toBeInTheDocument();
    });

    it('enables the Claim button for the targeted PC\'s owner', () => {
      const onClaim = vi.fn();
      render(
        <OpenActionsList
          openActions={[fakeOA({ participantId: 'pc-1' })]}
          currentUserId="alice"
          activeDirectorId="gm"
          participantOwnerLookup={(pid) => (pid === 'pc-1' ? 'alice' : null)}
          onClaim={onClaim}
        />,
      );
      const button = screen.getByRole('button', { name: /claim/i });
      expect(button).not.toBeDisabled();
      fireEvent.click(button);
      expect(onClaim).toHaveBeenCalledWith('oa-1');
    });

    it('enables the Claim button for the active director', () => {
      const onClaim = vi.fn();
      render(
        <OpenActionsList
          openActions={[fakeOA({ participantId: 'pc-1' })]}
          currentUserId="gm"
          activeDirectorId="gm"
          participantOwnerLookup={(pid) => (pid === 'pc-1' ? 'alice' : null)}
          onClaim={onClaim}
        />,
      );
      expect(screen.getByRole('button', { name: /claim/i })).not.toBeDisabled();
    });

    it('disables the Claim button for non-eligible users', () => {
      render(
        <OpenActionsList
          openActions={[fakeOA({ participantId: 'pc-1' })]}
          currentUserId="bob"
          activeDirectorId="gm"
          participantOwnerLookup={(pid) => (pid === 'pc-1' ? 'alice' : null)}
          onClaim={() => {}}
        />,
      );
      expect(screen.getByRole('button', { name: /claim/i })).toBeDisabled();
    });
  });
  ```

- [ ] **Step 2: Run the failing test**

  ```
  pnpm --filter @ironyard/web test OpenActionsList
  ```

  Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Create the component**

  Create `apps/web/src/pages/combat/OpenActionsList.tsx`:

  ```tsx
  import { OPEN_ACTION_COPY, type OpenAction } from '@ironyard/shared';

  type Props = {
    openActions: OpenAction[];
    currentUserId: string;
    activeDirectorId: string;
    /** Resolve a participantId → owner userId (or null if monster / missing). */
    participantOwnerLookup: (participantId: string) => string | null;
    onClaim: (openActionId: string) => void;
  };

  /**
   * Lobby-visible list of pending OpenActions. Visible to every connected user
   * (directors and players alike). The Claim button is enabled only for the
   * targeted participant's owner OR the active director.
   *
   * The same component mounts in CombatRun (director view) and PlayerSheetPanel
   * (player view). Per-user enablement is the only behavioral difference.
   */
  export function OpenActionsList(props: Props): JSX.Element {
    const { openActions, currentUserId, activeDirectorId, participantOwnerLookup, onClaim } = props;

    if (openActions.length === 0) {
      return (
        <div className="open-actions-list open-actions-list--empty">
          <p className="open-actions-list__empty">No open actions.</p>
        </div>
      );
    }

    const isDirector = currentUserId === activeDirectorId;

    return (
      <div className="open-actions-list">
        <h3 className="open-actions-list__heading">Open actions</h3>
        <ul className="open-actions-list__items">
          {openActions.map((oa) => {
            const copy = OPEN_ACTION_COPY[oa.kind];
            const title = copy?.title(oa) ?? `Open Action: ${oa.kind}`;
            const body = copy?.body(oa) ?? '';
            const claimLabel = copy?.claimLabel(oa) ?? 'Claim';
            const ownerId = participantOwnerLookup(oa.participantId);
            const isOwner = ownerId !== null && currentUserId === ownerId;
            const canClaim = isOwner || isDirector;

            return (
              <li key={oa.id} className="open-actions-list__row">
                <div className="open-actions-list__title">{title}</div>
                {body && <div className="open-actions-list__body">{body}</div>}
                <button
                  type="button"
                  className="open-actions-list__claim"
                  disabled={!canClaim}
                  onClick={() => canClaim && onClaim(oa.id)}
                  title={canClaim ? '' : 'Only the targeted player or the director can claim this'}
                >
                  {claimLabel}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
  ```

- [ ] **Step 4: Run the tests**

  ```
  pnpm --filter @ironyard/web test OpenActionsList
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```
  git add apps/web/src/pages/combat/OpenActionsList.tsx apps/web/src/pages/combat/OpenActionsList.spec.tsx
  git commit -m "feat(web): OpenActionsList component — lobby-visible claim queue"
  ```

---

## Task 20 — Mount `OpenActionsList` in `CombatRun` + Malice display in top bar

**Files:**

- Modify: `apps/web/src/pages/combat/CombatRun.tsx`
- Modify: `apps/web/src/ws/useSessionSocket.ts` — reflect `openActions` from snapshot if not auto-pulled

- [ ] **Step 1: Update the WS mirror to reflect openActions**

  Open `apps/web/src/ws/useSessionSocket.ts`. Find where the snapshot is unpacked into local state (search for `partyVictories` or `currentSessionId`). Add the new field:

  ```ts
  openActions: snapshot.openActions ?? [],
  ```

  After RaiseOpenAction / ClaimOpenAction `applied` envelopes arrive, update `openActions` accordingly (or simpler: re-pull the snapshot on every applied envelope — match the existing pattern).

- [ ] **Step 2: Mount in CombatRun**

  Open `apps/web/src/pages/combat/CombatRun.tsx`. Find the layout (likely a two-column grid per the design handoff). Add the `OpenActionsList` under or near the intent log rail:

  ```tsx
  import { OpenActionsList } from './OpenActionsList';

  // Inside the right column or alongside the intent log rail:
  <OpenActionsList
    openActions={state.openActions}
    currentUserId={currentUser.id}
    activeDirectorId={state.activeDirectorId}
    participantOwnerLookup={(pid) => {
      const p = state.participants.find(x => x.id === pid);
      return p && 'ownerId' in p ? p.ownerId : null;
    }}
    onClaim={(id) => dispatch({ type: 'ClaimOpenAction', payload: { openActionId: id } })}
  />
  ```

- [ ] **Step 3: Surface Malice in the top bar**

  Find the existing combat-run top bar component (search for `currentRound` or `partyVictories` display). Add a Malice readout:

  ```tsx
  {state.encounter && (
    <div className="combat-top-bar__malice">
      Malice {state.encounter.malice.current}
    </div>
  )}
  ```

  Match the existing styling pattern for round / victories displays.

- [ ] **Step 4: Smoke-test the UI manually**

  ```
  pnpm dev
  ```

  Navigate to a campaign, start an encounter, observe:
  - Top bar shows "Malice <n>"
  - Open Actions section is visible but says "No open actions" (no consumers in 2b.0)

- [ ] **Step 5: Run tests + typecheck**

  ```
  pnpm test
  pnpm typecheck
  ```

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```
  git add apps/web/src/pages/combat/CombatRun.tsx apps/web/src/ws/useSessionSocket.ts
  git commit -m "feat(web): mount OpenActionsList + Malice display in CombatRun"
  ```

---

## Task 21 — Update `PlayerSheetPanel`: Victories chip + heroic resource display + OA rail

**Files:**

- Modify: `apps/web/src/pages/character/PlayerSheetPanel.tsx`

- [ ] **Step 1: Add the Victories chip**

  Open `PlayerSheetPanel.tsx`. Find the chip group that shows stamina / recoveries (search for `recoveries.current` or similar). Add:

  ```tsx
  <div className="sheet-chip">
    <span className="sheet-chip__label">Victories</span>
    <span className="sheet-chip__value">{character.victories ?? 0}</span>
  </div>
  ```

- [ ] **Step 2: Add the heroic resource display**

  Find the existing resource display (if any — there's a hero-token panel from 2E). Add a heroic resource chip showing the current value + max if any:

  ```tsx
  {participant.heroicResources[0] && (
    <div className="sheet-chip sheet-chip--heroic-resource">
      <span className="sheet-chip__label">{participant.heroicResources[0].name}</span>
      <span className="sheet-chip__value">{participant.heroicResources[0].value}</span>
    </div>
  )}
  ```

  For Talent's negative-clarity case, the chip just shows the negative value — no special UI in 2b.0 (Talent strained-spend UI is 2b.0.1).

- [ ] **Step 3: Mount the OpenActionsList rail**

  Add at an appropriate location (probably the bottom of the sheet or as a side rail):

  ```tsx
  import { OpenActionsList } from '../combat/OpenActionsList';

  <OpenActionsList
    openActions={state.openActions}
    currentUserId={currentUser.id}
    activeDirectorId={state.activeDirectorId}
    participantOwnerLookup={(pid) => {
      const p = state.participants.find(x => x.id === pid);
      return p && 'ownerId' in p ? p.ownerId : null;
    }}
    onClaim={(id) => dispatch({ type: 'ClaimOpenAction', payload: { openActionId: id } })}
  />
  ```

- [ ] **Step 4: Smoke-test**

  ```
  pnpm dev
  ```

  As a player, open the character sheet. Confirm:
  - Victories chip shows
  - Heroic resource chip shows (with the class's resource name + value)
  - Open Actions rail mounted, "No open actions" displayed

- [ ] **Step 5: Run tests + typecheck**

  ```
  pnpm test
  pnpm typecheck
  ```

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```
  git add apps/web/src/pages/character/PlayerSheetPanel.tsx
  git commit -m "feat(web): PlayerSheetPanel — Victories chip + heroic resource chip + OpenActions rail"
  ```

---

## Task 22 — Documentation

**Files:**

- Modify: `docs/intent-protocol.md` — add Open Actions section
- Modify: `docs/phases.md` — flip 2b.0 row to "shipping"

- [ ] **Step 1: Add Open Actions section to intent-protocol.md**

  Open `docs/intent-protocol.md`. After the existing Sessions section (added by Epic 2E), add a new section:

  ```markdown
  ### Open Actions

  Non-blocking, lobby-visible queue of rule-driven options a human may claim. Built in Phase 2b.0; consumers (spatial triggers, Conduit pray-to-the-gods, etc.) land in 2b.0.1.

  - `RaiseOpenAction { kind, participantId, expiresAtRound?, payload }` — server-only; the DO emits as a derived intent from event-source intents. Reducer appends an `OpenAction` to `state.openActions` with a fresh ulid id.
  - `ClaimOpenAction { openActionId, choice? }` — player owner of the targeted participant OR active director. Reducer removes the OA and emits any kind-specific derived intents the consumer registers.

  There is no `DismissOpenAction`. Unclaimed entries auto-expire at `EndRound` (if `expiresAtRound === currentRound`) or unconditionally at `EndEncounter`.

  Visibility: the OA list is part of `CampaignState`, which is broadcast to every connected client. The eligible-actor check (`owner || active director`) is enforced server-side in the reducer and mirrored in the UI as a per-row Claim-button enablement.
  ```

- [ ] **Step 2: Update phases.md**

  Open `docs/phases.md`. Find the 2b.0 row in the Phase 2b sub-epics table. Change the status cell from `🚧` to `✅ shipping` (or the project's convention — match the 2E row's wording).

  Add a paragraph below the table describing what shipped:

  ```markdown
  **Sub-epic 2b.0 — Combat-resource framework foundation** ([spec](superpowers/specs/2026-05-13-phase-2b-0-resource-framework-foundation-design.md), [plan](superpowers/plans/2026-05-13-phase-2b-0-resource-framework-foundation.md)) — **shipping**

  Wires canon § 5 boundary mechanics: per-character Victories (canon § 8.1) replaces party-wide tracking; StartEncounter preloads each PC's heroic resource from their personal Victories and computes initial Malice as `floor(avgVictoriesAlive) + aliveHeroes + 1`; StartRound ticks `+aliveHeroes + N` malice each round; StartTurn applies the class-specific per-turn gain (flat or 1d3 via extended payload); EndEncounter zeros every PC's heroic resource pool and surges. Lands the Open Actions framework as foundational scaffolding (two intents, lobby-visible component); first consumers land in 2b.0.1.
  ```

- [ ] **Step 3: Commit**

  ```
  git add docs/intent-protocol.md docs/phases.md
  git commit -m "docs: Open Actions in intent-protocol.md; 2b.0 shipping note in phases.md"
  ```

---

## Task 23 — Final verification

- [ ] **Step 1: Full repo test + lint + typecheck**

  ```
  pnpm test
  pnpm typecheck
  pnpm lint
  ```

  Expected: all clean.

- [ ] **Step 2: Verify the worked example by hand**

  Start dev, log in as director, create a campaign, approve a 5-PC party where each PC has 3 victories (set via DB or fixture), start a session, start an encounter. Confirm:

  - Top bar shows Malice = 9
  - Each PC's heroic resource chip on their sheet shows 3
  - Press StartRound → Malice = 16
  - Press StartRound again → Malice = 24

- [ ] **Step 3: Verify canon registry didn't regress**

  ```
  pnpm canon:gen
  pnpm canon:report
  ```

  Expected: no diff in `canon-status.generated.ts` (2b.0 doesn't flip any canon flags — that's 2b.10's job). The report still shows 🚧 on § 5 and § 10 parent sections.

- [ ] **Step 4: Confirm no carryover regressions**

  Smoke-test:
  - Respite: each attending PC's victories increments by 1
  - StartTurn on a Talent: dispatcher must provide `rolls.d3`; on a Censor: must omit it
  - EndEncounter: heroic resources zero out for all PCs (positive and negative); surges zero
  - OpenActionsList: empty state visible to all users; no claim affordance for non-actors

- [ ] **Step 5: Final commit if any cleanup landed during verification**

  ```
  git status
  # If there are changes: stage + commit them with an appropriate message.
  ```

---

## Notes for the implementing engineer

- **Pure reducer rule.** Never call `Math.random()` or `Date.now()` inside a reducer. The d3 for 1d3 turn-start gains lives in the intent payload; the dispatching client pre-rolls it. When server-side rolling lands in a later phase, the DO generates the d3 before assigning a seq — the intent shape doesn't change.
- **Per-character victories.** The field lives on `Character` (D1) and is materialized onto the PC participant at `StartEncounter`. Reads inside the active encounter prefer `participant.victories`; reads outside an encounter prefer `character.victories`. The `sumPartyVictories(state)` helper aggregates from the participant side.
- **The `__sentinel_2b_0__` value in `OpenActionKindSchema`.** Zod's `z.enum` requires a non-empty tuple. The sentinel is there to make the schema valid TypeScript while 2b.0.1 adds real kinds. Remove it in 2b.0.1's first kind-add commit.
- **Permissive alive-check.** `aliveHeroes(state)` uses `currentStamina > -windedValue(p)`. This is a stand-in for the formal § 2.7+ winded/dying/dead state machine landing in 2b.5. When 2b.5 ships, replace the helper's filter with the formal state check; the helper's call sites don't change.
- **Class config integration point.** `applyStartEncounter` looks up the heroic resource via `runtime.heroicResource.name` (already populated by `deriveCharacterRuntime` from `class.heroicResource`). If a PC has no class (`runtime.heroicResource.name === 'unknown'`), `HEROIC_RESOURCES[name]` is `undefined` and the PC gets an empty `heroicResources: []`. That's the graceful degradation path.
- **Existing test fixtures may need updates.** Any test that dispatches `StartTurn` for a d3-class PC needs `rolls: { d3: N }` in its payload. Tests that asserted `heroicResources: []` after `StartEncounter` or `malice.current: 0` need updated expectations. Fix as you find failures; don't pre-emptively rewrite the entire suite.
- **No canon flag flips in 2b.0.** § 5 stays 🚧 until 2b.0.1 ships and 2b.10 flips. Don't update `rules-canon.md` from this plan.
- **OpenActions visibility.** The list is in `CampaignState.openActions`; broadcasting `CampaignState` to all clients makes it visible to everyone in the lobby automatically. The eligible-actor check is in the reducer (Task 10) and mirrored as a per-row button enablement in the UI (Task 19).
