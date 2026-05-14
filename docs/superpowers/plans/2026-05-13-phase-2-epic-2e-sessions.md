# Phase 2 Epic 2E — Sessions Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a play-session boundary as a thin scaffold: new `sessions` D1 table, `currentSessionId` on Campaign, five new intents (`StartSession` / `EndSession` / `UpdateSessionAttendance` / `GainHeroToken` / `SpendHeroToken`), and the UI/API plumbing so that `StartEncounter` requires an active session and hero tokens initialize from session attendance.

**Architecture:** Sessions live in D1; their live values (`currentSessionId`, `attendingCharacterIds`, `heroTokens`) mirror onto `CampaignState` so the reducer and UI don't have to join across tables on every read. Five intents follow the existing intent → stamp → reducer → side-effect → broadcast pattern. The CampaignView's existing approved-character listing becomes the StartSession picker when no session is active. PlayerSheetPanel gains two cheap hero-token spend buttons (`+2 surges` / regain stamina); retroactive variants defer to a follow-up epic.

**Tech Stack:** TypeScript + Zod (shared/rules), Hono + Drizzle + Cloudflare Workers D1 (api), React + TanStack Query (web), Vitest (tests). Source spec: [`docs/superpowers/specs/2026-05-13-phase-2-epic-2e-sessions-design.md`](../specs/2026-05-13-phase-2-epic-2e-sessions-design.md).

---

## File Map

**Created:**
- `apps/api/drizzle/0003_sessions.sql` — Drizzle migration: sessions table + campaigns.current_session_id column
- `packages/shared/src/intents/start-session.ts` — payload schema
- `packages/shared/src/intents/end-session.ts` — payload schema
- `packages/shared/src/intents/update-session-attendance.ts` — payload schema
- `packages/shared/src/intents/gain-hero-token.ts` — payload schema
- `packages/shared/src/intents/spend-hero-token.ts` — payload schema
- `packages/shared/tests/intents/start-session.spec.ts` — payload-schema tests (one file covers all five intents for brevity)
- `packages/rules/src/intents/start-session.ts` — reducer
- `packages/rules/src/intents/end-session.ts` — reducer
- `packages/rules/src/intents/update-session-attendance.ts` — reducer
- `packages/rules/src/intents/gain-hero-token.ts` — reducer
- `packages/rules/src/intents/spend-hero-token.ts` — reducer
- `packages/rules/tests/intents/start-session.spec.ts` — reducer tests
- `packages/rules/tests/intents/end-session.spec.ts` — reducer tests
- `packages/rules/tests/intents/update-session-attendance.spec.ts` — reducer tests
- `packages/rules/tests/intents/gain-hero-token.spec.ts` — reducer tests
- `packages/rules/tests/intents/spend-hero-token.spec.ts` — reducer tests
- `apps/api/tests/sessions-side-effects.spec.ts` — mock-D1 unit tests for the three new side-effects
- `apps/api/tests/integration/sessions-flow.spec.ts` — full StartSession → StartEncounter → EndSession integration test

**Modified:**
- `apps/api/src/db/schema.ts` — add `sessions` table, add `currentSessionId` column to `campaigns`
- `packages/rules/src/types.ts` — add `currentSessionId`, `attendingCharacterIds`, `heroTokens` to `CampaignState`; update `emptyCampaignState`
- `packages/rules/src/intents/index.ts` — export new reducers
- `packages/rules/src/reducer.ts` — wire new intents into the dispatcher
- `packages/rules/src/intents/start-encounter.ts` — add `no_active_session` precondition
- `packages/rules/tests/start-encounter.spec.ts` — seed `currentSessionId` in fixtures; add reject test
- `packages/rules/tests/intents/test-utils.ts` — `baseState` defaults `currentSessionId: 'sess-test'`
- `packages/shared/src/intents/index.ts` — export new payload schemas; add `IntentTypes.StartSession` / `EndSession` / `UpdateSessionAttendance` / `GainHeroToken` / `SpendHeroToken`
- `packages/shared/src/index.ts` — re-export new schemas + types
- `apps/api/src/lobby-do.ts` — load `currentSessionId` + `attendingCharacterIds` from D1 on DO init
- `apps/api/src/lobby-do-stampers.ts` — `stampStartSession` validates attending list against approved roster; assigns default name
- `apps/api/src/lobby-do-side-effects.ts` — `sideEffectStartSession`, `sideEffectEndSession`, `sideEffectUpdateSessionAttendance`
- `apps/api/tests/integration/lobby-ws-flow.spec.ts` — dispatch StartSession before StartEncounter in existing flows
- `apps/web/src/ws/useSessionSocket.ts` — mirror new state fields; reflect new intents
- `apps/web/src/pages/CampaignView.tsx` — start-session panel when no session; active-session badge + Edit attendance + End session when active; filter approved list to attending
- `apps/web/src/pages/EncounterBuilder.tsx` — pre-check from `attendingCharacterIds`; show no-session banner
- `apps/web/src/pages/combat/PlayerSheetPanel.tsx` — hero-token spend buttons (`+2 surges`, regain stamina)
- `docs/intent-protocol.md` — add Sessions section
- `docs/phases.md` — Phase 2 Epic 2E shipping note
- `CLAUDE.md` — replace "Session" reservation row with active definition

---

## Task 1 — D1 schema + Drizzle migration

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0003_sessions.sql`

- [ ] **Step 1: Add `sessions` table + `currentSessionId` to schema.ts**

  Open `apps/api/src/db/schema.ts`. After the `campaigns` table definition (around line 45), add the `currentSessionId` column to `campaigns`. Then before the `campaignMemberships` table, add the new `sessions` table.

  Update `campaigns`:

  ```ts
  export const campaigns = sqliteTable('campaigns', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    inviteCode: text('invite_code').notNull().unique(),
    campaignSettings: text('campaign_settings'),
    currentSessionId: text('current_session_id'),  // FK to sessions(id), nullable
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  });
  ```

  Add the new table (after `campaigns`, before `campaignMemberships`):

  ```ts
  export const sessions = sqliteTable(
    'sessions',
    {
      id: text('id').primaryKey(),
      campaignId: text('campaign_id')
        .notNull()
        .references(() => campaigns.id, { onDelete: 'cascade' }),
      name: text('name').notNull(),
      startedAt: integer('started_at').notNull(),
      endedAt: integer('ended_at'),
      attendingCharacterIds: text('attending_character_ids').notNull(), // JSON-encoded string[]
      heroTokensStart: integer('hero_tokens_start').notNull(),
      heroTokensEnd: integer('hero_tokens_end'),
    },
    (table) => ({
      campaignIdx: index('idx_sessions_campaign').on(table.campaignId, table.startedAt),
    }),
  );
  ```

- [ ] **Step 2: Write the migration SQL**

  Create `apps/api/drizzle/0003_sessions.sql`:

  ```sql
  ALTER TABLE `campaigns` ADD `current_session_id` text;

  CREATE TABLE `sessions` (
    `id` text PRIMARY KEY NOT NULL,
    `campaign_id` text NOT NULL,
    `name` text NOT NULL,
    `started_at` integer NOT NULL,
    `ended_at` integer,
    `attending_character_ids` text NOT NULL,
    `hero_tokens_start` integer NOT NULL,
    `hero_tokens_end` integer,
    FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE
  );

  CREATE INDEX `idx_sessions_campaign` ON `sessions` (`campaign_id`, `started_at`);
  ```

- [ ] **Step 3: Typecheck the schema change**

  ```bash
  pnpm --filter @ironyard/api typecheck
  ```

  Expected: **PASS**.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/api/src/db/schema.ts apps/api/drizzle/0003_sessions.sql
  git commit -m "feat(api): sessions D1 table + campaigns.current_session_id"
  ```

---

## Task 2 — CampaignState extension

**Files:**
- Modify: `packages/rules/src/types.ts`
- Modify: `packages/rules/tests/intents/test-utils.ts`

- [ ] **Step 1: Add fields to `CampaignState`**

  Open `packages/rules/src/types.ts`. Find the `CampaignState` type. Add three fields:

  ```ts
  export type CampaignState = {
    // ... existing fields ...
    currentSessionId: string | null;
    attendingCharacterIds: string[];
    heroTokens: number;
  };
  ```

- [ ] **Step 2: Update `emptyCampaignState`**

  Same file. Find the `emptyCampaignState` function (around line 101) and add the three new defaults:

  ```ts
  export function emptyCampaignState(campaignId: string, ownerId: string): CampaignState {
    return {
      // ... existing defaults ...
      currentSessionId: null,
      attendingCharacterIds: [],
      heroTokens: 0,
    };
  }
  ```

- [ ] **Step 3: Update test-utils `baseState` to default a session for existing tests**

  Open `packages/rules/tests/intents/test-utils.ts`. Update `baseState`:

  ```ts
  export function baseState(overrides: Partial<CampaignState> = {}): CampaignState {
    return {
      ...emptyCampaignState(CAMPAIGN_ID, OWNER_ID),
      // Default to an active session so existing reducer tests don't fail the new
      // no_active_session precondition on StartEncounter (Task 9). Tests that
      // exercise the session-required gating pass `currentSessionId: null` explicitly.
      currentSessionId: 'sess-test',
      attendingCharacterIds: [],
      heroTokens: 0,
      ...overrides,
    };
  }
  ```

- [ ] **Step 4: Run rules tests**

  ```bash
  pnpm --filter @ironyard/rules test
  ```

  Expected: **PASS** (defaults filter through; no behavior change yet).

- [ ] **Step 5: Commit**

  ```bash
  git add packages/rules/src/types.ts packages/rules/tests/intents/test-utils.ts
  git commit -m "feat(rules): CampaignState gains currentSessionId + attendingCharacterIds + heroTokens"
  ```

---

## Task 3 — `StartSession` payload schema + IntentTypes

**Files:**
- Create: `packages/shared/src/intents/start-session.ts`
- Modify: `packages/shared/src/intents/index.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/tests/intents/start-session.spec.ts`

- [ ] **Step 1: Write failing schema test**

  Create `packages/shared/tests/intents/start-session.spec.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { StartSessionPayloadSchema } from '../../src/intents/start-session';

  describe('StartSessionPayloadSchema', () => {
    it('parses a minimal valid payload', () => {
      const parsed = StartSessionPayloadSchema.parse({
        attendingCharacterIds: ['char-1', 'char-2'],
      });
      expect(parsed.attendingCharacterIds).toEqual(['char-1', 'char-2']);
      expect(parsed.name).toBeUndefined();
      expect(parsed.heroTokens).toBeUndefined();
    });

    it('parses an explicit name and heroTokens override', () => {
      const parsed = StartSessionPayloadSchema.parse({
        name: 'Bandit Camp',
        attendingCharacterIds: ['c1'],
        heroTokens: 5,
      });
      expect(parsed.name).toBe('Bandit Camp');
      expect(parsed.heroTokens).toBe(5);
    });

    it('rejects empty attending list', () => {
      expect(() =>
        StartSessionPayloadSchema.parse({ attendingCharacterIds: [] }),
      ).toThrow();
    });

    it('rejects negative heroTokens override', () => {
      expect(() =>
        StartSessionPayloadSchema.parse({
          attendingCharacterIds: ['c1'],
          heroTokens: -1,
        }),
      ).toThrow();
    });
  });
  ```

- [ ] **Step 2: Run to confirm it fails**

  ```bash
  pnpm --filter @ironyard/shared test -- start-session
  ```

  Expected: FAIL — `Cannot find module '../../src/intents/start-session'`.

- [ ] **Step 3: Implement the schema**

  Create `packages/shared/src/intents/start-session.ts`:

  ```ts
  import { z } from 'zod';

  // Director-only. Opens a new play session, declares attending characters,
  // initializes the hero token pool. Rejects if a session is already active or
  // if any attendingCharacterId references a non-approved character (the latter
  // is validated by the DO stamper against D1; the schema enforces shape only).
  //
  // `sessionId` is an optional client-suggested id (same pattern as
  // StartEncounter's `encounterId?`). If absent the reducer generates one via
  // ulid(). The client SHOULD generate it ahead of time so the optimistic
  // mirror in useSessionSocket can set `currentSessionId` directly from the
  // applied envelope without waiting for a snapshot.
  //
  // See docs/superpowers/specs/2026-05-13-phase-2-epic-2e-sessions-design.md.
  export const StartSessionPayloadSchema = z.object({
    sessionId: z.string().min(1).optional(),
    name: z.string().min(1).max(120).optional(),
    attendingCharacterIds: z.array(z.string().min(1)).min(1),
    heroTokens: z.number().int().min(0).optional(),
  });
  export type StartSessionPayload = z.infer<typeof StartSessionPayloadSchema>;
  ```

- [ ] **Step 4: Add to intents/index.ts**

  Open `packages/shared/src/intents/index.ts`. Add the export (keep alphabetical):

  ```ts
  export { StartSessionPayloadSchema } from './start-session';
  export type { StartSessionPayload } from './start-session';
  ```

  In the `IntentTypes` const (around line 113), add (keep alphabetical):

  ```ts
    StartSession: 'StartSession',
  ```

- [ ] **Step 5: Re-export from shared/src/index.ts**

  Open `packages/shared/src/index.ts`. Find the intents re-export block (around line 36) and add `StartSessionPayloadSchema` to the value re-exports and `StartSessionPayload` to the type re-exports (alphabetical).

- [ ] **Step 6: Re-run test, expect PASS**

  ```bash
  pnpm --filter @ironyard/shared test -- start-session
  ```

  Expected: **PASS** (4 tests).

- [ ] **Step 7: Commit**

  ```bash
  git add packages/shared/src/intents/start-session.ts packages/shared/src/intents/index.ts packages/shared/src/index.ts packages/shared/tests/intents/start-session.spec.ts
  git commit -m "feat(shared): StartSession payload schema"
  ```

---

## Task 4 — `EndSession` payload schema

**Files:**
- Create: `packages/shared/src/intents/end-session.ts`
- Modify: `packages/shared/src/intents/index.ts`, `packages/shared/src/index.ts`

- [ ] **Step 1: Append to the existing shared test file**

  Edit `packages/shared/tests/intents/start-session.spec.ts`. After the existing `describe('StartSessionPayloadSchema')` block, append:

  ```ts
  import { EndSessionPayloadSchema } from '../../src/intents/end-session';

  describe('EndSessionPayloadSchema', () => {
    it('parses an empty payload', () => {
      const parsed = EndSessionPayloadSchema.parse({});
      expect(parsed).toEqual({});
    });

    it('rejects extra fields', () => {
      expect(() => EndSessionPayloadSchema.parse({ unknown: 1 })).toThrow();
    });
  });
  ```

- [ ] **Step 2: Run to confirm failure**

  ```bash
  pnpm --filter @ironyard/shared test -- start-session
  ```

  Expected: FAIL — module not found for end-session.

- [ ] **Step 3: Implement**

  Create `packages/shared/src/intents/end-session.ts`:

  ```ts
  import { z } from 'zod';

  // Director-only. Closes the active session. Reducer reads currentSessionId
  // from state; no payload data needed. Strict — rejects unexpected fields.
  export const EndSessionPayloadSchema = z.object({}).strict();
  export type EndSessionPayload = z.infer<typeof EndSessionPayloadSchema>;
  ```

- [ ] **Step 4: Export + re-export (same pattern as Task 3)**

  Add to `packages/shared/src/intents/index.ts`:

  ```ts
  export { EndSessionPayloadSchema } from './end-session';
  export type { EndSessionPayload } from './end-session';
  ```

  Add `EndSession: 'EndSession'` to `IntentTypes`.

  Add `EndSessionPayloadSchema` + `EndSessionPayload` to `packages/shared/src/index.ts` re-exports.

- [ ] **Step 5: Run, expect PASS**

  ```bash
  pnpm --filter @ironyard/shared test -- start-session
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add packages/shared/src/intents/end-session.ts packages/shared/src/intents/index.ts packages/shared/src/index.ts packages/shared/tests/intents/start-session.spec.ts
  git commit -m "feat(shared): EndSession payload schema"
  ```

---

## Task 5 — `UpdateSessionAttendance` payload schema

**Files:**
- Create: `packages/shared/src/intents/update-session-attendance.ts`
- Modify: `packages/shared/src/intents/index.ts`, `packages/shared/src/index.ts`
- Modify: `packages/shared/tests/intents/start-session.spec.ts`

- [ ] **Step 1: Append test cases**

  In `packages/shared/tests/intents/start-session.spec.ts`, after the EndSession describe block:

  ```ts
  import { UpdateSessionAttendancePayloadSchema } from '../../src/intents/update-session-attendance';

  describe('UpdateSessionAttendancePayloadSchema', () => {
    it('parses add-only', () => {
      const p = UpdateSessionAttendancePayloadSchema.parse({ add: ['c1'] });
      expect(p.add).toEqual(['c1']);
      expect(p.remove).toBeUndefined();
    });

    it('parses remove-only', () => {
      const p = UpdateSessionAttendancePayloadSchema.parse({ remove: ['c2'] });
      expect(p.remove).toEqual(['c2']);
    });

    it('parses mixed', () => {
      const p = UpdateSessionAttendancePayloadSchema.parse({
        add: ['c1'],
        remove: ['c2'],
      });
      expect(p.add).toEqual(['c1']);
      expect(p.remove).toEqual(['c2']);
    });

    it('rejects empty payload (must have at least one of add/remove)', () => {
      expect(() => UpdateSessionAttendancePayloadSchema.parse({})).toThrow();
    });
  });
  ```

- [ ] **Step 2: Implement**

  Create `packages/shared/src/intents/update-session-attendance.ts`:

  ```ts
  import { z } from 'zod';

  // Director-only. Adjust the attending-character list mid-session for late
  // arrivals or early departures. Does NOT auto-grant or revoke hero tokens —
  // canon ties tokens to session-start. Director uses GainHeroToken explicitly
  // if they want to be generous. At least one of add/remove must be present.
  export const UpdateSessionAttendancePayloadSchema = z
    .object({
      add: z.array(z.string().min(1)).optional(),
      remove: z.array(z.string().min(1)).optional(),
    })
    .refine((p) => (p.add && p.add.length > 0) || (p.remove && p.remove.length > 0), {
      message: 'must specify at least one of add or remove',
    });
  export type UpdateSessionAttendancePayload = z.infer<typeof UpdateSessionAttendancePayloadSchema>;
  ```

- [ ] **Step 3: Export + re-export + IntentTypes addition**

  Same pattern. Add `UpdateSessionAttendance: 'UpdateSessionAttendance'` to `IntentTypes`.

- [ ] **Step 4: Run + commit**

  ```bash
  pnpm --filter @ironyard/shared test -- start-session
  ```

  Expected: PASS.

  ```bash
  git add packages/shared/src/intents/update-session-attendance.ts packages/shared/src/intents/index.ts packages/shared/src/index.ts packages/shared/tests/intents/start-session.spec.ts
  git commit -m "feat(shared): UpdateSessionAttendance payload schema"
  ```

---

## Task 6 — `GainHeroToken` + `SpendHeroToken` payload schemas

**Files:**
- Create: `packages/shared/src/intents/gain-hero-token.ts`
- Create: `packages/shared/src/intents/spend-hero-token.ts`
- Modify: `packages/shared/src/intents/index.ts`, `packages/shared/src/index.ts`
- Modify: `packages/shared/tests/intents/start-session.spec.ts`

- [ ] **Step 1: Append test cases**

  ```ts
  import { GainHeroTokenPayloadSchema } from '../../src/intents/gain-hero-token';
  import { SpendHeroTokenPayloadSchema } from '../../src/intents/spend-hero-token';

  describe('GainHeroTokenPayloadSchema', () => {
    it('parses positive amount', () => {
      const p = GainHeroTokenPayloadSchema.parse({ amount: 2 });
      expect(p.amount).toBe(2);
    });

    it('rejects zero or negative', () => {
      expect(() => GainHeroTokenPayloadSchema.parse({ amount: 0 })).toThrow();
      expect(() => GainHeroTokenPayloadSchema.parse({ amount: -1 })).toThrow();
    });
  });

  describe('SpendHeroTokenPayloadSchema', () => {
    it('parses surge_burst with amount 1', () => {
      const p = SpendHeroTokenPayloadSchema.parse({
        amount: 1,
        reason: 'surge_burst',
        participantId: 'pc:alice',
      });
      expect(p.reason).toBe('surge_burst');
    });

    it('parses regain_stamina with amount 2', () => {
      const p = SpendHeroTokenPayloadSchema.parse({
        amount: 2,
        reason: 'regain_stamina',
        participantId: 'pc:bob',
      });
      expect(p.amount).toBe(2);
    });

    it('parses narrative with arbitrary positive amount', () => {
      const p = SpendHeroTokenPayloadSchema.parse({
        amount: 3,
        reason: 'narrative',
        participantId: 'pc:cleric',
      });
      expect(p.amount).toBe(3);
    });

    it('rejects unknown reason', () => {
      expect(() =>
        SpendHeroTokenPayloadSchema.parse({
          amount: 1,
          reason: 'whatever',
          participantId: 'pc:x',
        }),
      ).toThrow();
    });

    it('rejects amount < 1', () => {
      expect(() =>
        SpendHeroTokenPayloadSchema.parse({
          amount: 0,
          reason: 'narrative',
          participantId: 'pc:x',
        }),
      ).toThrow();
    });
  });
  ```

- [ ] **Step 2: Implement GainHeroToken**

  Create `packages/shared/src/intents/gain-hero-token.ts`:

  ```ts
  import { z } from 'zod';

  // Director awards bonus hero tokens mid-session (e.g. clever play, late arrival).
  // Pool lives on CampaignState.heroTokens. Requires an active session (reducer
  // gate); schema enforces shape only.
  export const GainHeroTokenPayloadSchema = z.object({
    amount: z.number().int().min(1),
  });
  export type GainHeroTokenPayload = z.infer<typeof GainHeroTokenPayloadSchema>;
  ```

- [ ] **Step 3: Implement SpendHeroToken**

  Create `packages/shared/src/intents/spend-hero-token.ts`:

  ```ts
  import { z } from 'zod';

  // Player or director spends from the hero token pool. Three reason paths:
  //   surge_burst    — amount 1, derives GainResource { name: 'surges', amount: 2 }
  //   regain_stamina — amount 2, derives ApplyHeal { amount: recoveryValue }
  //   narrative      — any amount ≥ 1, no derived intent (table narrates)
  // Reducer validates (reason, amount) coherence; schema enforces base shape.
  export const SpendHeroTokenPayloadSchema = z.object({
    amount: z.number().int().min(1),
    reason: z.enum(['surge_burst', 'regain_stamina', 'narrative']),
    participantId: z.string().min(1),
  });
  export type SpendHeroTokenPayload = z.infer<typeof SpendHeroTokenPayloadSchema>;
  ```

- [ ] **Step 4: Export + IntentTypes additions**

  Add to intents/index.ts:

  ```ts
  export { GainHeroTokenPayloadSchema } from './gain-hero-token';
  export type { GainHeroTokenPayload } from './gain-hero-token';
  export { SpendHeroTokenPayloadSchema } from './spend-hero-token';
  export type { SpendHeroTokenPayload } from './spend-hero-token';
  ```

  Add to `IntentTypes`:

  ```ts
    GainHeroToken: 'GainHeroToken',
    SpendHeroToken: 'SpendHeroToken',
  ```

  Re-export from `packages/shared/src/index.ts`.

- [ ] **Step 5: Run + commit**

  ```bash
  pnpm --filter @ironyard/shared test
  ```

  Expected: all PASS (full shared suite).

  ```bash
  git add packages/shared/src/intents/gain-hero-token.ts packages/shared/src/intents/spend-hero-token.ts packages/shared/src/intents/index.ts packages/shared/src/index.ts packages/shared/tests/intents/start-session.spec.ts
  git commit -m "feat(shared): GainHeroToken + SpendHeroToken payload schemas"
  ```

---

## Task 7 — `applyStartSession` reducer

**Files:**
- Create: `packages/rules/src/intents/start-session.ts`
- Create: `packages/rules/tests/intents/start-session.spec.ts`
- Modify: `packages/rules/src/intents/index.ts`

- [ ] **Step 1: Write failing reducer tests**

  Create `packages/rules/tests/intents/start-session.spec.ts`:

  ```ts
  import { IntentTypes } from '@ironyard/shared';
  import { describe, expect, it } from 'vitest';
  import { applyIntent } from '../../src/reducer';
  import { baseState, ownerActor, stamped } from './test-utils';

  describe('applyStartSession', () => {
    it('opens a session with explicit name and default heroTokens', () => {
      const state = baseState({ currentSessionId: null });

      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.StartSession,
          actor: ownerActor,
          payload: {
            name: 'Bandit Camp',
            attendingCharacterIds: ['c1', 'c2', 'c3'],
          },
        }),
      );

      expect(result.errors).toBeUndefined();
      expect(result.state.currentSessionId).toMatch(/^sess_/);
      expect(result.state.attendingCharacterIds).toEqual(['c1', 'c2', 'c3']);
      expect(result.state.heroTokens).toBe(3);
    });

    it('honors heroTokens override', () => {
      const state = baseState({ currentSessionId: null });
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.StartSession,
          actor: ownerActor,
          payload: { attendingCharacterIds: ['c1'], heroTokens: 5 },
        }),
      );
      expect(result.state.heroTokens).toBe(5);
    });

    it('rejects if a session is already active', () => {
      const state = baseState({ currentSessionId: 'sess-existing' });
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.StartSession,
          actor: ownerActor,
          payload: { attendingCharacterIds: ['c1'] },
        }),
      );
      expect(result.errors?.[0]?.code).toBe('session_already_active');
    });

    it('rejects an invalid payload', () => {
      const state = baseState({ currentSessionId: null });
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.StartSession,
          actor: ownerActor,
          payload: { attendingCharacterIds: [] },
        }),
      );
      expect(result.errors?.[0]?.code).toBe('invalid_payload');
    });
  });
  ```

- [ ] **Step 2: Run, confirm FAIL**

  ```bash
  pnpm --filter @ironyard/rules test -- start-session
  ```

  Expected: FAIL — handler returns the default "no handler" error or the test imports fail.

- [ ] **Step 3: Implement the reducer**

  Create `packages/rules/src/intents/start-session.ts`:

  ```ts
  import { StartSessionPayloadSchema, ulid } from '@ironyard/shared';
  import type { CampaignState, IntentResult, StampedIntent } from '../types';

  // Notes:
  //   - approved-character validation is the DO stamper's job (it reads D1);
  //     the reducer trusts what's on the stamped payload.
  //   - the canonical session id is generated by the reducer via ulid(); if the
  //     stamper provided one (future extension), we'd honor it, but the spec
  //     doesn't currently use that path.
  //   - default name 'Session N' is set by the stamper from D1's session count;
  //     the reducer falls back to 'Session' if name is omitted (defensive).
  export function applyStartSession(state: CampaignState, intent: StampedIntent): IntentResult {
    const parsed = StartSessionPayloadSchema.safeParse(intent.payload);
    if (!parsed.success) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `StartSession rejected: ${parsed.error.message}`,
            intentId: intent.id,
          },
        ],
        errors: [{ code: 'invalid_payload', message: parsed.error.message }],
      };
    }
    if (state.currentSessionId !== null) {
      return {
        state,
        derived: [],
        log: [{ kind: 'error', text: 'session already active', intentId: intent.id }],
        errors: [
          { code: 'session_already_active', message: 'end the active session first' },
        ],
      };
    }

    const { sessionId: suggestedId, name, attendingCharacterIds, heroTokens } = parsed.data;
    const sessionId = suggestedId ?? `sess_${ulid()}`;
    const tokens = heroTokens ?? attendingCharacterIds.length;
    const sessionName = name ?? 'Session';

    return {
      state: {
        ...state,
        seq: state.seq + 1,
        currentSessionId: sessionId,
        attendingCharacterIds: [...attendingCharacterIds],
        heroTokens: tokens,
      },
      derived: [],
      log: [
        {
          kind: 'info',
          text: `session ${sessionId} (${sessionName}) started with ${attendingCharacterIds.length} attending, ${tokens} hero token(s)`,
          intentId: intent.id,
        },
      ],
    };
  }
  ```

- [ ] **Step 4: Wire reducer into dispatcher (small edit)**

  Open `packages/rules/src/intents/index.ts`. Add:

  ```ts
  export { applyStartSession } from './start-session';
  ```

  Open `packages/rules/src/reducer.ts`. Add import:

  ```ts
  import {
    // ...existing...
    applyStartSession,
  } from './intents';
  ```

  Add case in the switch (keep alphabetical):

  ```ts
      case IntentTypes.StartSession:
        return applyStartSession(state, intent);
  ```

- [ ] **Step 5: Run, expect PASS**

  ```bash
  pnpm --filter @ironyard/rules test -- start-session
  ```

  Expected: 4 PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/rules/src/intents/start-session.ts packages/rules/src/intents/index.ts packages/rules/src/reducer.ts packages/rules/tests/intents/start-session.spec.ts
  git commit -m "feat(rules): applyStartSession reducer"
  ```

---

## Task 8 — `applyEndSession` reducer

**Files:**
- Create: `packages/rules/src/intents/end-session.ts`
- Create: `packages/rules/tests/intents/end-session.spec.ts`
- Modify: `packages/rules/src/intents/index.ts`, `packages/rules/src/reducer.ts`

- [ ] **Step 1: Failing test**

  Create `packages/rules/tests/intents/end-session.spec.ts`:

  ```ts
  import { IntentTypes } from '@ironyard/shared';
  import { describe, expect, it } from 'vitest';
  import { applyIntent } from '../../src/reducer';
  import { baseState, ownerActor, stamped } from './test-utils';

  describe('applyEndSession', () => {
    it('closes the active session', () => {
      const state = baseState({
        currentSessionId: 'sess-1',
        attendingCharacterIds: ['c1', 'c2'],
        heroTokens: 2,
      });
      const result = applyIntent(
        state,
        stamped({ type: IntentTypes.EndSession, actor: ownerActor, payload: {} }),
      );
      expect(result.errors).toBeUndefined();
      expect(result.state.currentSessionId).toBeNull();
      expect(result.state.attendingCharacterIds).toEqual([]);
      // heroTokens preserved as historical snapshot; pool inaccessible w/o session
      expect(result.state.heroTokens).toBe(2);
    });

    it('rejects when no session is active', () => {
      const state = baseState({ currentSessionId: null });
      const result = applyIntent(
        state,
        stamped({ type: IntentTypes.EndSession, actor: ownerActor, payload: {} }),
      );
      expect(result.errors?.[0]?.code).toBe('no_active_session');
    });
  });
  ```

- [ ] **Step 2: Run, FAIL**

  ```bash
  pnpm --filter @ironyard/rules test -- end-session
  ```

- [ ] **Step 3: Implement**

  Create `packages/rules/src/intents/end-session.ts`:

  ```ts
  import { EndSessionPayloadSchema } from '@ironyard/shared';
  import type { CampaignState, IntentResult, StampedIntent } from '../types';

  export function applyEndSession(state: CampaignState, intent: StampedIntent): IntentResult {
    const parsed = EndSessionPayloadSchema.safeParse(intent.payload);
    if (!parsed.success) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `EndSession rejected: ${parsed.error.message}`,
            intentId: intent.id,
          },
        ],
        errors: [{ code: 'invalid_payload', message: parsed.error.message }],
      };
    }
    if (state.currentSessionId === null) {
      return {
        state,
        derived: [],
        log: [{ kind: 'error', text: 'no active session to end', intentId: intent.id }],
        errors: [{ code: 'no_active_session', message: 'no session is active' }],
      };
    }

    const closedId = state.currentSessionId;

    return {
      state: {
        ...state,
        seq: state.seq + 1,
        currentSessionId: null,
        attendingCharacterIds: [],
        // heroTokens left as-is so the snapshot can land in the D1 row via side-effect.
      },
      derived: [],
      log: [
        { kind: 'info', text: `session ${closedId} ended`, intentId: intent.id },
      ],
    };
  }
  ```

- [ ] **Step 4: Wire into index.ts + reducer.ts (same pattern as Task 7)**

- [ ] **Step 5: Run, PASS; Commit**

  ```bash
  pnpm --filter @ironyard/rules test -- end-session
  git add packages/rules/src/intents/end-session.ts packages/rules/src/intents/index.ts packages/rules/src/reducer.ts packages/rules/tests/intents/end-session.spec.ts
  git commit -m "feat(rules): applyEndSession reducer"
  ```

---

## Task 9 — `applyUpdateSessionAttendance` reducer

**Files:**
- Create: `packages/rules/src/intents/update-session-attendance.ts`
- Create: `packages/rules/tests/intents/update-session-attendance.spec.ts`
- Modify: `packages/rules/src/intents/index.ts`, `packages/rules/src/reducer.ts`

- [ ] **Step 1: Failing test**

  Create `packages/rules/tests/intents/update-session-attendance.spec.ts`:

  ```ts
  import { IntentTypes } from '@ironyard/shared';
  import { describe, expect, it } from 'vitest';
  import { applyIntent } from '../../src/reducer';
  import { baseState, ownerActor, stamped } from './test-utils';

  describe('applyUpdateSessionAttendance', () => {
    it('adds new character ids', () => {
      const state = baseState({
        currentSessionId: 'sess-1',
        attendingCharacterIds: ['c1'],
      });
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.UpdateSessionAttendance,
          actor: ownerActor,
          payload: { add: ['c2', 'c3'] },
        }),
      );
      expect(result.errors).toBeUndefined();
      expect(result.state.attendingCharacterIds).toEqual(['c1', 'c2', 'c3']);
    });

    it('removes character ids', () => {
      const state = baseState({
        currentSessionId: 'sess-1',
        attendingCharacterIds: ['c1', 'c2', 'c3'],
      });
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.UpdateSessionAttendance,
          actor: ownerActor,
          payload: { remove: ['c2'] },
        }),
      );
      expect(result.state.attendingCharacterIds).toEqual(['c1', 'c3']);
    });

    it('mixed add + remove in one intent', () => {
      const state = baseState({
        currentSessionId: 'sess-1',
        attendingCharacterIds: ['c1', 'c2'],
      });
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.UpdateSessionAttendance,
          actor: ownerActor,
          payload: { add: ['c3'], remove: ['c1'] },
        }),
      );
      expect(result.state.attendingCharacterIds).toEqual(['c2', 'c3']);
    });

    it('idempotent on duplicate adds', () => {
      const state = baseState({
        currentSessionId: 'sess-1',
        attendingCharacterIds: ['c1'],
      });
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.UpdateSessionAttendance,
          actor: ownerActor,
          payload: { add: ['c1'] },
        }),
      );
      expect(result.state.attendingCharacterIds).toEqual(['c1']);
    });

    it('rejects when no session is active', () => {
      const state = baseState({ currentSessionId: null });
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.UpdateSessionAttendance,
          actor: ownerActor,
          payload: { add: ['c1'] },
        }),
      );
      expect(result.errors?.[0]?.code).toBe('no_active_session');
    });
  });
  ```

- [ ] **Step 2: Run, FAIL**

- [ ] **Step 3: Implement**

  Create `packages/rules/src/intents/update-session-attendance.ts`:

  ```ts
  import { UpdateSessionAttendancePayloadSchema } from '@ironyard/shared';
  import type { CampaignState, IntentResult, StampedIntent } from '../types';

  export function applyUpdateSessionAttendance(
    state: CampaignState,
    intent: StampedIntent,
  ): IntentResult {
    const parsed = UpdateSessionAttendancePayloadSchema.safeParse(intent.payload);
    if (!parsed.success) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `UpdateSessionAttendance rejected: ${parsed.error.message}`,
            intentId: intent.id,
          },
        ],
        errors: [{ code: 'invalid_payload', message: parsed.error.message }],
      };
    }
    if (state.currentSessionId === null) {
      return {
        state,
        derived: [],
        log: [{ kind: 'error', text: 'no active session', intentId: intent.id }],
        errors: [{ code: 'no_active_session', message: 'no session is active' }],
      };
    }

    const { add = [], remove = [] } = parsed.data;
    const removeSet = new Set(remove);
    const next = state.attendingCharacterIds.filter((id) => !removeSet.has(id));
    for (const id of add) {
      if (!next.includes(id)) next.push(id);
    }

    return {
      state: {
        ...state,
        seq: state.seq + 1,
        attendingCharacterIds: next,
      },
      derived: [],
      log: [
        {
          kind: 'info',
          text: `attendance updated: +${add.length} / -${remove.length} (${next.length} attending)`,
          intentId: intent.id,
        },
      ],
    };
  }
  ```

- [ ] **Step 4: Wire + run + commit (same pattern)**

  ```bash
  git add packages/rules/src/intents/update-session-attendance.ts packages/rules/src/intents/index.ts packages/rules/src/reducer.ts packages/rules/tests/intents/update-session-attendance.spec.ts
  git commit -m "feat(rules): applyUpdateSessionAttendance reducer"
  ```

---

## Task 10 — `applyGainHeroToken` reducer

**Files:**
- Create: `packages/rules/src/intents/gain-hero-token.ts`
- Create: `packages/rules/tests/intents/gain-hero-token.spec.ts`
- Modify: `packages/rules/src/intents/index.ts`, `packages/rules/src/reducer.ts`

- [ ] **Step 1: Failing test**

  Create `packages/rules/tests/intents/gain-hero-token.spec.ts`:

  ```ts
  import { IntentTypes } from '@ironyard/shared';
  import { describe, expect, it } from 'vitest';
  import { applyIntent } from '../../src/reducer';
  import { baseState, ownerActor, stamped } from './test-utils';

  describe('applyGainHeroToken', () => {
    it('adds to the pool', () => {
      const state = baseState({ currentSessionId: 'sess-1', heroTokens: 2 });
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.GainHeroToken,
          actor: ownerActor,
          payload: { amount: 3 },
        }),
      );
      expect(result.errors).toBeUndefined();
      expect(result.state.heroTokens).toBe(5);
    });

    it('rejects when no session is active', () => {
      const state = baseState({ currentSessionId: null, heroTokens: 0 });
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.GainHeroToken,
          actor: ownerActor,
          payload: { amount: 1 },
        }),
      );
      expect(result.errors?.[0]?.code).toBe('no_active_session');
    });

    it('rejects invalid payload (amount < 1)', () => {
      const state = baseState({ currentSessionId: 'sess-1' });
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.GainHeroToken,
          actor: ownerActor,
          payload: { amount: 0 },
        }),
      );
      expect(result.errors?.[0]?.code).toBe('invalid_payload');
    });
  });
  ```

- [ ] **Step 2: Run FAIL → implement**

  Create `packages/rules/src/intents/gain-hero-token.ts`:

  ```ts
  import { GainHeroTokenPayloadSchema } from '@ironyard/shared';
  import type { CampaignState, IntentResult, StampedIntent } from '../types';

  export function applyGainHeroToken(state: CampaignState, intent: StampedIntent): IntentResult {
    const parsed = GainHeroTokenPayloadSchema.safeParse(intent.payload);
    if (!parsed.success) {
      return {
        state,
        derived: [],
        log: [
          { kind: 'error', text: `GainHeroToken rejected: ${parsed.error.message}`, intentId: intent.id },
        ],
        errors: [{ code: 'invalid_payload', message: parsed.error.message }],
      };
    }
    if (state.currentSessionId === null) {
      return {
        state,
        derived: [],
        log: [{ kind: 'error', text: 'no active session', intentId: intent.id }],
        errors: [{ code: 'no_active_session', message: 'no session is active' }],
      };
    }

    return {
      state: {
        ...state,
        seq: state.seq + 1,
        heroTokens: state.heroTokens + parsed.data.amount,
      },
      derived: [],
      log: [
        {
          kind: 'info',
          text: `+${parsed.data.amount} hero token(s) (now ${state.heroTokens + parsed.data.amount})`,
          intentId: intent.id,
        },
      ],
    };
  }
  ```

- [ ] **Step 3: Wire, run, commit (same pattern)**

  ```bash
  git commit -m "feat(rules): applyGainHeroToken reducer"
  ```

---

## Task 11 — `applySpendHeroToken` reducer (with derived intents)

**Files:**
- Create: `packages/rules/src/intents/spend-hero-token.ts`
- Create: `packages/rules/tests/intents/spend-hero-token.spec.ts`
- Modify: `packages/rules/src/intents/index.ts`, `packages/rules/src/reducer.ts`

- [ ] **Step 1: Failing tests covering all three reason paths**

  Create `packages/rules/tests/intents/spend-hero-token.spec.ts`:

  ```ts
  import { IntentTypes } from '@ironyard/shared';
  import { describe, expect, it } from 'vitest';
  import { applyIntent } from '../../src/reducer';
  import {
    baseState,
    makeHeroParticipant,
    makeRunningEncounterPhase,
    ownerActor,
    stamped,
  } from './test-utils';

  const PC_ID = 'pc:alice';

  function statefulBase(heroTokens = 2) {
    const hero = makeHeroParticipant(PC_ID, { recoveryValue: 8, currentStamina: 10, maxStamina: 30 });
    return baseState({
      currentSessionId: 'sess-1',
      heroTokens,
      attendingCharacterIds: [PC_ID],
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1', { turnOrder: [PC_ID] }),
    });
  }

  describe('applySpendHeroToken', () => {
    it('surge_burst — spends 1, derives GainResource surges +2', () => {
      const state = statefulBase(2);
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.SpendHeroToken,
          actor: ownerActor,
          payload: { amount: 1, reason: 'surge_burst', participantId: PC_ID },
        }),
      );
      expect(result.errors).toBeUndefined();
      expect(result.state.heroTokens).toBe(1);
      expect(result.derived).toHaveLength(1);
      expect(result.derived[0]?.type).toBe(IntentTypes.GainResource);
      expect(result.derived[0]?.payload).toMatchObject({
        participantId: PC_ID,
        name: 'surges',
        amount: 2,
      });
    });

    it('regain_stamina — spends 2, derives ApplyHeal of recoveryValue', () => {
      const state = statefulBase(2);
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.SpendHeroToken,
          actor: ownerActor,
          payload: { amount: 2, reason: 'regain_stamina', participantId: PC_ID },
        }),
      );
      expect(result.errors).toBeUndefined();
      expect(result.state.heroTokens).toBe(0);
      expect(result.derived).toHaveLength(1);
      expect(result.derived[0]?.type).toBe(IntentTypes.ApplyHeal);
      expect(result.derived[0]?.payload).toMatchObject({
        targetId: PC_ID,
        amount: 8,
      });
    });

    it('narrative — spends amount, no derived intent', () => {
      const state = statefulBase(3);
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.SpendHeroToken,
          actor: ownerActor,
          payload: { amount: 1, reason: 'narrative', participantId: PC_ID },
        }),
      );
      expect(result.errors).toBeUndefined();
      expect(result.state.heroTokens).toBe(2);
      expect(result.derived).toHaveLength(0);
    });

    it('rejects surge_burst with amount != 1', () => {
      const state = statefulBase(2);
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.SpendHeroToken,
          actor: ownerActor,
          payload: { amount: 2, reason: 'surge_burst', participantId: PC_ID },
        }),
      );
      expect(result.errors?.[0]?.code).toBe('invalid_spend_reason');
    });

    it('rejects regain_stamina with amount != 2', () => {
      const state = statefulBase(3);
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.SpendHeroToken,
          actor: ownerActor,
          payload: { amount: 1, reason: 'regain_stamina', participantId: PC_ID },
        }),
      );
      expect(result.errors?.[0]?.code).toBe('invalid_spend_reason');
    });

    it('rejects when pool insufficient', () => {
      const state = statefulBase(0);
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.SpendHeroToken,
          actor: ownerActor,
          payload: { amount: 1, reason: 'narrative', participantId: PC_ID },
        }),
      );
      expect(result.errors?.[0]?.code).toBe('insufficient_tokens');
    });

    it('rejects when no session is active', () => {
      const state = statefulBase(2);
      state.currentSessionId = null;
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.SpendHeroToken,
          actor: ownerActor,
          payload: { amount: 1, reason: 'narrative', participantId: PC_ID },
        }),
      );
      expect(result.errors?.[0]?.code).toBe('no_active_session');
    });

    it('regain_stamina rejects when participant is not in encounter', () => {
      const state = baseState({
        currentSessionId: 'sess-1',
        heroTokens: 2,
        attendingCharacterIds: [PC_ID],
        // no participants, no encounter
      });
      const result = applyIntent(
        state,
        stamped({
          type: IntentTypes.SpendHeroToken,
          actor: ownerActor,
          payload: { amount: 2, reason: 'regain_stamina', participantId: PC_ID },
        }),
      );
      expect(result.errors?.[0]?.code).toBe('participant_not_in_encounter');
    });
  });
  ```

- [ ] **Step 2: Run FAIL → implement**

  Create `packages/rules/src/intents/spend-hero-token.ts`:

  ```ts
  import { IntentTypes, SpendHeroTokenPayloadSchema } from '@ironyard/shared';
  import type {
    CampaignState,
    DerivedIntent,
    IntentResult,
    StampedIntent,
  } from '../types';
  import { isParticipant } from '../types';

  export function applySpendHeroToken(state: CampaignState, intent: StampedIntent): IntentResult {
    const parsed = SpendHeroTokenPayloadSchema.safeParse(intent.payload);
    if (!parsed.success) {
      return {
        state,
        derived: [],
        log: [
          { kind: 'error', text: `SpendHeroToken rejected: ${parsed.error.message}`, intentId: intent.id },
        ],
        errors: [{ code: 'invalid_payload', message: parsed.error.message }],
      };
    }
    if (state.currentSessionId === null) {
      return {
        state,
        derived: [],
        log: [{ kind: 'error', text: 'no active session', intentId: intent.id }],
        errors: [{ code: 'no_active_session', message: 'no session is active' }],
      };
    }

    const { amount, reason, participantId } = parsed.data;

    // Reason / amount coherence: surge_burst must be 1, regain_stamina must be 2.
    if (reason === 'surge_burst' && amount !== 1) {
      return {
        state,
        derived: [],
        log: [{ kind: 'error', text: 'surge_burst requires amount 1', intentId: intent.id }],
        errors: [
          { code: 'invalid_spend_reason', message: 'surge_burst requires amount 1' },
        ],
      };
    }
    if (reason === 'regain_stamina' && amount !== 2) {
      return {
        state,
        derived: [],
        log: [{ kind: 'error', text: 'regain_stamina requires amount 2', intentId: intent.id }],
        errors: [
          { code: 'invalid_spend_reason', message: 'regain_stamina requires amount 2' },
        ],
      };
    }

    if (state.heroTokens < amount) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `insufficient tokens (have ${state.heroTokens}, need ${amount})`,
            intentId: intent.id,
          },
        ],
        errors: [
          { code: 'insufficient_tokens', message: `have ${state.heroTokens}, need ${amount}` },
        ],
      };
    }

    // Build derived intent per reason.
    const derived: DerivedIntent[] = [];

    if (reason === 'surge_burst') {
      derived.push({
        type: IntentTypes.GainResource,
        campaignId: state.campaignId,
        actor: intent.actor,
        source: 'auto',
        causedBy: intent.id,
        payload: { participantId, name: 'surges', amount: 2 },
      });
    } else if (reason === 'regain_stamina') {
      // ApplyHeal needs participant.recoveryValue; require participant in encounter.
      const participant = state.participants
        .filter(isParticipant)
        .find((p) => p.id === participantId);
      if (!participant) {
        return {
          state,
          derived: [],
          log: [
            {
              kind: 'error',
              text: `participant ${participantId} not in active encounter`,
              intentId: intent.id,
            },
          ],
          errors: [
            {
              code: 'participant_not_in_encounter',
              message: `${participantId} must be in the active encounter to regain stamina`,
            },
          ],
        };
      }
      derived.push({
        type: IntentTypes.ApplyHeal,
        campaignId: state.campaignId,
        actor: intent.actor,
        source: 'auto',
        causedBy: intent.id,
        payload: { targetId: participantId, amount: participant.recoveryValue },
      });
    }
    // 'narrative' emits nothing — table narrates.

    return {
      state: {
        ...state,
        seq: state.seq + 1,
        heroTokens: state.heroTokens - amount,
      },
      derived,
      log: [
        {
          kind: 'info',
          text: `${participantId} spends ${amount} hero token(s) — ${reason}`,
          intentId: intent.id,
        },
      ],
    };
  }
  ```

- [ ] **Step 3: Wire, run, commit**

  ```bash
  pnpm --filter @ironyard/rules test -- spend-hero-token
  git commit -m "feat(rules): applySpendHeroToken with 3 reason paths"
  ```

---

## Task 12 — `StartEncounter` no_active_session precondition

**Files:**
- Modify: `packages/rules/src/intents/start-encounter.ts`
- Modify: `packages/rules/tests/start-encounter.spec.ts`

- [ ] **Step 1: Write failing test asserting the rejection**

  At the bottom of `packages/rules/tests/start-encounter.spec.ts`, add:

  ```ts
  it('rejects with no_active_session when currentSessionId is null', () => {
    const result = applyIntent(
      baseState({ currentSessionId: null }),
      makeIntent({ characterIds: [], monsters: [], stampedPcs: [], stampedMonsters: [] }),
    );
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'no_active_session' })]),
    );
  });
  ```

- [ ] **Step 2: Update existing baseState references in this file to include currentSessionId**

  Find the existing `baseState` helper in this file (around line 29). Update it to default `currentSessionId: 'sess-test'`:

  ```ts
  function baseState(overrides: Partial<CampaignState> = {}): CampaignState {
    return { ...emptyCampaignState(CAMPAIGN, 'user-owner'), currentSessionId: 'sess-test', ...overrides };
  }
  ```

- [ ] **Step 3: Run test — should fail with the new assertion (rejection not happening)**

  ```bash
  pnpm --filter @ironyard/rules test -- start-encounter
  ```

  Expected: the new test FAILS (no rejection yet); other tests PASS (session now seeded).

- [ ] **Step 4: Add the precondition in applyStartEncounter**

  Open `packages/rules/src/intents/start-encounter.ts`. After the existing payload-parse block and BEFORE the encounter-active check (around line 38), add:

  ```ts
    if (state.currentSessionId === null) {
      return {
        state,
        derived: [],
        log: [
          { kind: 'error', text: 'start a session before running combat', intentId: intent.id },
        ],
        errors: [{ code: 'no_active_session', message: 'start a session before running combat' }],
      };
    }
  ```

- [ ] **Step 5: Re-run, expect PASS**

- [ ] **Step 6: Commit**

  ```bash
  git add packages/rules/src/intents/start-encounter.ts packages/rules/tests/start-encounter.spec.ts
  git commit -m "feat(rules): StartEncounter requires an active session"
  ```

---

## Task 13 — DO stampers + side-effects + state loading

**Files:**
- Modify: `apps/api/src/lobby-do-stampers.ts` — add `stampStartSession`
- Modify: `apps/api/src/lobby-do-side-effects.ts` — three new side-effects
- Modify: `apps/api/src/lobby-do.ts` — load session state on init
- Create: `apps/api/tests/sessions-side-effects.spec.ts` — mocked-D1 unit tests

- [ ] **Step 1: Stamper test (extend lobby-do-stampers.spec.ts)**

  Open `apps/api/tests/lobby-do-stampers.spec.ts`. Append:

  ```ts
  import { stampStartSession } from '../src/lobby-do-stampers';

  describe('stampStartSession', () => {
    it('validates attending characters and stamps the default name', async () => {
      // mockDbResult will be used by both the approved-character query and the
      // sessions-count query — write helpers below assume the test is alone.
      mockDbResult = [
        { characterId: 'c1' },
        { characterId: 'c2' },
      ];
      // After the approved-character validation, the stamper queries
      // count(sessions.id) for the campaign — we tell the mock to return a count.
      // The simple mockDbResult shape doesn't carry that; the stamper takes an
      // optional default-name fallback so we don't need a second mock for v1.

      const intent = makeIntent('StartSession', {
        attendingCharacterIds: ['c1', 'c2'],
      });
      const result = await stampStartSession(intent, makeCampaignState(), mockEnv);
      expect(result).toBeNull();
      const payload = intent.payload as {
        name?: string;
        attendingCharacterIds: string[];
      };
      expect(payload.name).toMatch(/^Session/);
      expect(payload.attendingCharacterIds).toEqual(['c1', 'c2']);
    });

    it('rejects an unknown character id', async () => {
      mockDbResult = [{ characterId: 'c1' }]; // only c1 approved
      const intent = makeIntent('StartSession', {
        attendingCharacterIds: ['c1', 'c-ghost'],
      });
      const result = await stampStartSession(intent, makeCampaignState(), mockEnv);
      expect(result).toMatch(/^unknown_character/);
    });
  });
  ```

- [ ] **Step 2: Implement stampStartSession**

  Open `apps/api/src/lobby-do-stampers.ts`. Append (after the existing stampers):

  ```ts
  /**
   * StartSession — validates that every attendingCharacterId references a
   * campaign-approved character (queries campaign_characters), assigns a
   * default 'Session N' name when omitted, and stamps both onto the payload.
   * Hero tokens default is computed by the reducer, not stamped here.
   */
  export async function stampStartSession(
    intent: Intent & { timestamp: number },
    campaignState: CampaignState,
    env: Bindings,
  ): Promise<StampResult> {
    const payload = intent.payload as MutablePayload;
    const requested = Array.isArray(payload.attendingCharacterIds)
      ? (payload.attendingCharacterIds.filter((id): id is string => typeof id === 'string' && id.length > 0))
      : [];
    if (requested.length === 0) return 'invalid_payload: attendingCharacterIds required';

    const conn = db(env.DB);

    // Validate every id is approved on this campaign.
    const approvedRows = await conn
      .select({ characterId: campaignCharacters.characterId })
      .from(campaignCharacters)
      .where(
        and(
          eq(campaignCharacters.campaignId, campaignState.campaignId),
          eq(campaignCharacters.status, 'approved'),
        ),
      )
      .all();
    const approvedSet = new Set(approvedRows.map((r) => r.characterId));
    for (const id of requested) {
      if (!approvedSet.has(id)) return `unknown_character: ${id}`;
    }

    // Default name: 'Session N' where N = sessions count for this campaign + 1.
    if (typeof payload.name !== 'string' || payload.name.trim().length === 0) {
      const countRow = await conn
        .select({ count: sql<number>`count(*)` })
        .from(sessions)
        .where(eq(sessions.campaignId, campaignState.campaignId))
        .get();
      const n = (countRow?.count ?? 0) + 1;
      payload.name = `Session ${n}`;
    }
    payload.attendingCharacterIds = requested;
    return null;
  }
  ```

  Add necessary imports at the top of the file (`sql` from drizzle-orm, `sessions` from `./db/schema`).

- [ ] **Step 3: Wire stamper into the intent → stamper map**

  Find the `stampIntent` dispatcher (in `apps/api/src/lobby-do-stampers.ts`). Add the case:

  ```ts
      case 'StartSession':
        return stampStartSession(intent, campaignState, env);
  ```

  The other four session intents (EndSession, UpdateSessionAttendance, GainHeroToken, SpendHeroToken) need no stamping — they fall through to the default `null` return.

- [ ] **Step 4: Implement the three side-effects**

  Open `apps/api/src/lobby-do-side-effects.ts`. Append three handlers:

  ```ts
  // StartSession — INSERT sessions row + UPDATE campaigns.current_session_id.
  async function sideEffectStartSession(
    intent: Intent & { timestamp: number },
    stateAfter: CampaignState,
    env: Bindings,
  ): Promise<void> {
    const conn = db(env.DB);
    if (stateAfter.currentSessionId === null) return; // reducer rejected; nothing to do
    const payload = intent.payload as {
      name: string;
      attendingCharacterIds: string[];
    };
    await conn.insert(sessions).values({
      id: stateAfter.currentSessionId,
      campaignId: stateAfter.campaignId,
      name: payload.name,
      startedAt: intent.timestamp,
      endedAt: null,
      attendingCharacterIds: JSON.stringify(stateAfter.attendingCharacterIds),
      heroTokensStart: stateAfter.heroTokens,
      heroTokensEnd: null,
    });
    await conn
      .update(campaigns)
      .set({ currentSessionId: stateAfter.currentSessionId, updatedAt: intent.timestamp })
      .where(eq(campaigns.id, stateAfter.campaignId));
  }

  // EndSession — UPDATE sessions.ended_at + hero_tokens_end + UPDATE campaigns.
  async function sideEffectEndSession(
    intent: Intent & { timestamp: number },
    stateBefore: CampaignState,
    env: Bindings,
  ): Promise<void> {
    if (stateBefore.currentSessionId === null) return;
    const conn = db(env.DB);
    await conn
      .update(sessions)
      .set({ endedAt: intent.timestamp, heroTokensEnd: stateBefore.heroTokens })
      .where(eq(sessions.id, stateBefore.currentSessionId));
    await conn
      .update(campaigns)
      .set({ currentSessionId: null, updatedAt: intent.timestamp })
      .where(eq(campaigns.id, stateBefore.campaignId));
  }

  // UpdateSessionAttendance — UPDATE sessions.attending_character_ids.
  async function sideEffectUpdateSessionAttendance(
    intent: Intent & { timestamp: number },
    stateAfter: CampaignState,
    env: Bindings,
  ): Promise<void> {
    if (stateAfter.currentSessionId === null) return;
    const conn = db(env.DB);
    await conn
      .update(sessions)
      .set({ attendingCharacterIds: JSON.stringify(stateAfter.attendingCharacterIds) })
      .where(eq(sessions.id, stateAfter.currentSessionId));
  }
  ```

  Update the `handleSideEffect` signature to also accept `stateAfter`. `apps/api/src/lobby-do-side-effects.ts` currently has:

  ```ts
  export async function handleSideEffect(
    intent: Intent & { timestamp: number },
    campaignId: string,
    env: Bindings,
    stateBefore?: CampaignState,
  ): Promise<void>
  ```

  Add the new parameter:

  ```ts
  export async function handleSideEffect(
    intent: Intent & { timestamp: number },
    campaignId: string,
    env: Bindings,
    stateBefore?: CampaignState,
    stateAfter?: CampaignState,
  ): Promise<void>
  ```

  Update the call site in `apps/api/src/lobby-do.ts` (the `_applyOne` method around line 649) to pass it:

  ```ts
  await handleSideEffect(intent, this.campaignId, this.env, stateBefore, this.campaignState);
  ```

  (`this.campaignState` was overwritten at line 621 with the post-reducer state, so it serves as `stateAfter`.)

  Add three case branches inside `handleSideEffect`'s switch (alongside `EndEncounter` / `Respite`):

  ```ts
      case 'StartSession':
        if (stateAfter !== undefined) {
          await sideEffectStartSession(intent, stateAfter, env);
        }
        break;
      case 'EndSession':
        if (stateBefore !== undefined) {
          await sideEffectEndSession(intent, stateBefore, env);
        }
        break;
      case 'UpdateSessionAttendance':
        if (stateAfter !== undefined) {
          await sideEffectUpdateSessionAttendance(intent, stateAfter, env);
        }
        break;
  ```

  `sideEffectStartSession` and `sideEffectUpdateSessionAttendance` use the post-reducer state (the session id + attendance list are populated there). `sideEffectEndSession` uses the pre-reducer state (so we still have `currentSessionId` and `heroTokens` before they were cleared).

  Add imports to `lobby-do-side-effects.ts`: `sessions` and `campaigns` from `./db/schema`. The function signatures shown for the three side-effects already match this convention (`sideEffectStartSession(intent, stateAfter, env)`).

- [ ] **Step 5: DO state load — read currentSessionId on init**

  Open `apps/api/src/lobby-do.ts`. Find the state-restore block (around lines 79–96). After `state = JSON.parse(snapshot.state)` and the `activeAbilities` patch, add a session-row read to populate `currentSessionId`, `attendingCharacterIds`, and `heroTokens`:

  ```ts
      // Forward-compat: load active session data from D1 so the in-memory
      // state mirrors the persisted session row.
      const campaignRow = await conn
        .select({ currentSessionId: campaigns.currentSessionId })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .get();
      const currentSessionId = campaignRow?.currentSessionId ?? null;
      if (currentSessionId) {
        const sessionRow = await conn
          .select()
          .from(sessions)
          .where(eq(sessions.id, currentSessionId))
          .get();
        if (sessionRow) {
          state.currentSessionId = currentSessionId;
          state.attendingCharacterIds = JSON.parse(sessionRow.attendingCharacterIds);
          // heroTokens stays at whatever the snapshot/replay produced — that's
          // the live mutable pool. The D1 row only stores hero_tokens_start.
        } else {
          // Orphan currentSessionId pointer — clear it.
          state.currentSessionId = null;
          state.attendingCharacterIds = [];
        }
      }
  ```

  Add the necessary imports for `sessions`, `campaigns`, `eq` if not present.

- [ ] **Step 6: Side-effects test file**

  Create `apps/api/tests/sessions-side-effects.spec.ts`. Mirror the existing `respite.spec.ts` mock pattern. Test:
  - `sideEffectStartSession` issues one INSERT + one UPDATE in that order with the right values
  - `sideEffectEndSession` issues two UPDATEs (sessions + campaigns) with the right values
  - `sideEffectUpdateSessionAttendance` issues one UPDATE on sessions

  Use the same `vi.mock('../src/db', ...)` + `vi.mock('../src/db/schema', ...)` pattern as `respite.spec.ts`. Capture INSERTs and UPDATEs in module-level arrays. Each `it` resets the arrays in `beforeEach`.

  Length budget for this file: ~250 lines, three describe blocks (one per side-effect), each with 1-3 cases. See `respite.spec.ts` for the exact pattern.

- [ ] **Step 7: Run + commit**

  ```bash
  pnpm --filter @ironyard/api test
  ```

  Expected: all PASS including the new sessions-side-effects.spec.

  ```bash
  git add apps/api/src/lobby-do-stampers.ts apps/api/src/lobby-do-side-effects.ts apps/api/src/lobby-do.ts apps/api/tests/lobby-do-stampers.spec.ts apps/api/tests/sessions-side-effects.spec.ts
  git commit -m "feat(api): session stampers + side-effects + DO state load"
  ```

---

## Task 14 — WebSocket mirror: reflect new state fields

**Files:**
- Modify: `apps/web/src/ws/useSessionSocket.ts`

- [ ] **Step 1: Extend the local mirror types**

  Open `apps/web/src/ws/useSessionSocket.ts`. Find the state shape exposed by the hook. Add:

  ```ts
    currentSessionId: string | null;
    attendingCharacterIds: string[];
    heroTokens: number;
  ```

  Default them to `null` / `[]` / `0` in the initial state.

- [ ] **Step 2: Reflect the new intents**

  Find the `reflect()` function in the same file. Add cases (the function is a big switch on intent type):

  ```ts
      case IntentTypes.StartSession: {
        const payload = intent.payload as StartSessionPayload;
        // Client-suggested sessionId is on the payload (see Task 7 schema).
        // The reducer honors it; if absent it generates one and the snapshot
        // catches up. The CampaignView dispatch site SHOULD always supply one.
        if (payload.sessionId) {
          setCurrentSessionId(payload.sessionId);
        }
        setAttendingCharacterIds(payload.attendingCharacterIds);
        const tokens = payload.heroTokens ?? payload.attendingCharacterIds.length;
        setHeroTokens(tokens);
        break;
      }
      case IntentTypes.EndSession: {
        setCurrentSessionId(null);
        setAttendingCharacterIds([]);
        // heroTokens left as-is; the next StartSession overwrites
        break;
      }
      case IntentTypes.UpdateSessionAttendance: {
        const payload = intent.payload as UpdateSessionAttendancePayload;
        setAttendingCharacterIds((prev) => {
          const removeSet = new Set(payload.remove ?? []);
          const next = prev.filter((id) => !removeSet.has(id));
          for (const id of payload.add ?? []) if (!next.includes(id)) next.push(id);
          return next;
        });
        break;
      }
      case IntentTypes.GainHeroToken: {
        const payload = intent.payload as GainHeroTokenPayload;
        setHeroTokens((prev) => prev + payload.amount);
        break;
      }
      case IntentTypes.SpendHeroToken: {
        const payload = intent.payload as SpendHeroTokenPayload;
        setHeroTokens((prev) => Math.max(0, prev - payload.amount));
        // surge_burst / regain_stamina derived intents flow through their own reflect cases
        break;
      }
  ```

  Note on session-id flow: the reducer (Task 7) accepts a client-suggested `sessionId` in the payload, falling back to `ulid()` generation. The CampaignView dispatch site (Task 15) MUST generate the id ahead of dispatch (`import { ulid } from '@ironyard/shared'; const sessionId = \`sess_${ulid()}\`;`) and put it on the payload. The mirror then reads it back from the same payload — no envelope shape change required, no snapshot round-trip.

- [ ] **Step 3: Wire payload imports**

  Add imports at the top of the file:

  ```ts
  import type {
    StartSessionPayload,
    UpdateSessionAttendancePayload,
    GainHeroTokenPayload,
    SpendHeroTokenPayload,
  } from '@ironyard/shared';
  ```

- [ ] **Step 4: Typecheck + run web tests**

  ```bash
  pnpm typecheck
  pnpm --filter @ironyard/web test
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/src/ws/useSessionSocket.ts
  git commit -m "feat(web): reflect session + hero-token intents in WS mirror"
  ```

---

## Task 15 — CampaignView: start-session panel + active badge + edit attendance + end session

**Files:**
- Modify: `apps/web/src/pages/CampaignView.tsx`

- [ ] **Step 1: Identify the current "approved characters" section in CampaignView**

  Open `apps/web/src/pages/CampaignView.tsx`. Find the section that lists approved characters today (likely a component named `ApprovedCharacters` or inline JSX referencing `useApprovedCharactersFull`).

- [ ] **Step 2: Add `currentSessionId` / `attendingCharacterIds` / `heroTokens` from the socket hook**

  Pull `currentSessionId`, `attendingCharacterIds`, `heroTokens` from `useSessionSocket(id)` in the component body.

- [ ] **Step 3: Conditional rendering — three panels**

  When `currentSessionId === null`, render a `<StartSessionPanel>`. When non-null, render an `<ActiveSessionBadge>` AND a filtered approved-characters list. Layout:

  ```tsx
  {currentSessionId === null ? (
    <StartSessionPanel
      approvedCharacters={approvedCharacters}
      onStart={(partial) => sock.dispatch(buildIntent({
        campaignId: id,
        type: IntentTypes.StartSession,
        // Client-generated sessionId so the optimistic mirror picks it up
        // immediately without waiting for a snapshot. Same pattern as
        // StartEncounter.encounterId.
        payload: { ...partial, sessionId: `sess_${ulid()}` },
        actor: { userId: me.data.user.id, role: 'director' },
      }))}
    />
  ) : (
    <ActiveSessionBadge
      sessionId={currentSessionId}
      attendingCharacterIds={attendingCharacterIds}
      heroTokens={heroTokens}
      approvedCharacters={approvedCharacters}
      onUpdateAttendance={(payload) => sock.dispatch(buildIntent({
        campaignId: id,
        type: IntentTypes.UpdateSessionAttendance,
        payload,
        actor: { userId: me.data.user.id, role: 'director' },
      }))}
      onGainTokens={(amount) => sock.dispatch(buildIntent({
        campaignId: id,
        type: IntentTypes.GainHeroToken,
        payload: { amount },
        actor: { userId: me.data.user.id, role: 'director' },
      }))}
      onEnd={() => sock.dispatch(buildIntent({
        campaignId: id,
        type: IntentTypes.EndSession,
        payload: {},
        actor: { userId: me.data.user.id, role: 'director' },
      }))}
    />
  )}
  ```

- [ ] **Step 4: Implement the two new sub-components**

  Inline in `CampaignView.tsx`:

  ```tsx
  function StartSessionPanel({ approvedCharacters, onStart }: {
    approvedCharacters: CharacterResponse[];
    // Parent generates sessionId at dispatch time; this callback receives the
    // rest of the payload.
    onStart: (partial: Omit<StartSessionPayload, 'sessionId'>) => void;
  }) {
    const [name, setName] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set(approvedCharacters.map((c) => c.id)));
    const [tokens, setTokens] = useState(approvedCharacters.length);

    // Keep tokens synced to the selected count, but allow override.
    useEffect(() => { setTokens(selected.size); }, [selected]);

    const submit = (e: React.FormEvent) => {
      e.preventDefault();
      if (selected.size === 0) return;
      onStart({
        name: name.trim() || undefined,
        attendingCharacterIds: Array.from(selected),
        heroTokens: tokens,
      });
    };

    return (
      <section className="rounded-lg border border-neutral-800 p-5 space-y-4">
        <h2 className="font-semibold">Start a new session</h2>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            Session name (optional)
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bandit Camp"
              className="mt-1 w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2"
            />
          </label>
          <div>
            <h3 className="text-sm text-neutral-300 mb-2">Who's playing tonight?</h3>
            <ul className="space-y-1">
              {approvedCharacters.map((c) => (
                <li key={c.id}>
                  <label className="flex items-center gap-3 min-h-11">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(c.id);
                        else next.delete(c.id);
                        setSelected(next);
                      }}
                      className="h-5 w-5"
                    />
                    <span className="flex-1">
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-2 text-xs text-neutral-500">L{c.data.level}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <label className="block text-sm">
            Hero tokens at start
            <input
              type="number"
              min={0}
              value={tokens}
              onChange={(e) => setTokens(Math.max(0, parseInt(e.target.value || '0', 10)))}
              className="mt-1 w-24 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 font-mono"
            />
            <span className="ml-2 text-xs text-neutral-500">default: # attending</span>
          </label>
          <button
            type="submit"
            disabled={selected.size === 0}
            className="min-h-11 rounded-md bg-neutral-100 text-neutral-900 px-4 py-2 font-medium disabled:opacity-60"
          >
            Start session
          </button>
        </form>
      </section>
    );
  }

  function ActiveSessionBadge({
    sessionId,
    attendingCharacterIds,
    heroTokens,
    approvedCharacters,
    onUpdateAttendance,
    onGainTokens,
    onEnd,
  }: {
    sessionId: string;
    attendingCharacterIds: string[];
    heroTokens: number;
    approvedCharacters: CharacterResponse[];
    onUpdateAttendance: (payload: UpdateSessionAttendancePayload) => void;
    onGainTokens: (amount: number) => void;
    onEnd: () => void;
  }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<Set<string>>(new Set(attendingCharacterIds));
    const [bonus, setBonus] = useState(1);

    const commitAttendance = () => {
      const add = Array.from(draft).filter((id) => !attendingCharacterIds.includes(id));
      const remove = attendingCharacterIds.filter((id) => !draft.has(id));
      if (add.length === 0 && remove.length === 0) {
        setEditing(false);
        return;
      }
      onUpdateAttendance({ add: add.length ? add : undefined, remove: remove.length ? remove : undefined });
      setEditing(false);
    };

    return (
      <section className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-4 space-y-3">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-emerald-300">
              Session active
            </p>
            <p className="text-sm text-neutral-200 mt-1">
              {attendingCharacterIds.length} attending · {heroTokens} hero tokens
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="min-h-11 px-3 rounded-md border border-neutral-700 text-sm hover:bg-neutral-900"
            >
              {editing ? 'Cancel' : 'Edit attendance'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('End this session?')) onEnd();
              }}
              className="min-h-11 px-3 rounded-md border border-rose-700 text-rose-300 text-sm hover:bg-rose-900/30"
            >
              End session
            </button>
          </div>
        </header>

        {editing && (
          <div className="space-y-3 border-t border-neutral-800 pt-3">
            <ul className="space-y-1">
              {approvedCharacters.map((c) => (
                <li key={c.id}>
                  <label className="flex items-center gap-3 min-h-11">
                    <input
                      type="checkbox"
                      checked={draft.has(c.id)}
                      onChange={(e) => {
                        const next = new Set(draft);
                        if (e.target.checked) next.add(c.id);
                        else next.delete(c.id);
                        setDraft(next);
                      }}
                      className="h-5 w-5"
                    />
                    <span className="flex-1 text-sm">{c.name}</span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={commitAttendance}
              className="min-h-11 px-3 rounded-md bg-neutral-100 text-neutral-900 text-sm font-medium"
            >
              Save attendance
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-neutral-800 pt-3">
          <span className="text-xs text-neutral-400">Award tokens:</span>
          <input
            type="number"
            min={1}
            value={bonus}
            onChange={(e) => setBonus(Math.max(1, parseInt(e.target.value || '1', 10)))}
            className="w-16 rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1 text-sm font-mono"
          />
          <button
            type="button"
            onClick={() => onGainTokens(bonus)}
            className="min-h-9 px-3 rounded-md bg-violet-500 text-neutral-900 text-xs font-medium"
          >
            + Grant
          </button>
        </div>
      </section>
    );
  }
  ```

  Add necessary imports at the top of the file. Replace the existing campaign-overview body where the approved-characters section sits.

- [ ] **Step 5: Filter approved characters to attending during active session**

  In the existing approved-characters list rendering (lower in CampaignView), filter by `attendingCharacterIds` when `currentSessionId !== null`:

  ```tsx
  const displayed = currentSessionId !== null
    ? approvedCharacters.filter((c) => attendingCharacterIds.includes(c.id))
    : approvedCharacters;
  ```

  Use `displayed` in the list render.

- [ ] **Step 6: Typecheck + run web tests**

  ```bash
  pnpm typecheck
  pnpm --filter @ironyard/web test
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/src/pages/CampaignView.tsx
  git commit -m "feat(web): CampaignView session start panel + active badge + attendance editor"
  ```

---

## Task 16 — EncounterBuilder: pre-check from attendingCharacterIds + no-session banner

**Files:**
- Modify: `apps/web/src/pages/EncounterBuilder.tsx`

- [ ] **Step 1: Pull session state from the socket**

  Add `currentSessionId` and `attendingCharacterIds` to the `useSessionSocket(id)` destructure.

- [ ] **Step 2: Add the no-session banner at the top**

  Before the rest of the builder UI:

  ```tsx
  if (currentSessionId === null) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-md border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-200">
          <p className="font-medium">No active session.</p>
          <p className="mt-1">
            Start a session before building an encounter.{' '}
            <Link to="/campaigns/$id" params={{ id }} className="underline">
              Go to campaign page →
            </Link>
          </p>
        </div>
      </main>
    );
  }
  ```

- [ ] **Step 3: Pre-check `selectedCharacterIds` from `attendingCharacterIds`**

  Find the existing `selectedCharacterIds` `useState` initializer (the EncounterBuilder local draft from Epic 2D). Change the initial value:

  ```ts
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<string>>(
    () => new Set(attendingCharacterIds),
  );
  ```

  Also: filter the character checklist to only show `approvedCharacters` that are in `attendingCharacterIds`:

  ```ts
  const sessionCharacters = approvedCharacters.filter((c) => attendingCharacterIds.includes(c.id));
  ```

  Render `sessionCharacters` in the checklist instead of the full approved list.

- [ ] **Step 4: Typecheck + commit**

  ```bash
  pnpm typecheck
  git add apps/web/src/pages/EncounterBuilder.tsx
  git commit -m "feat(web): EncounterBuilder pre-checks attendance + no-session banner"
  ```

---

## Task 17 — PlayerSheetPanel: hero-token spend buttons

**Files:**
- Modify: `apps/web/src/pages/combat/PlayerSheetPanel.tsx`

- [ ] **Step 1: Add hero-token panel**

  Open `apps/web/src/pages/combat/PlayerSheetPanel.tsx`. Pull `currentSessionId` and `heroTokens` from the session-socket hook. After the existing Recovery button section, add:

  ```tsx
  {currentSessionId !== null && (
    <HeroTokenPanel
      heroTokens={heroTokens}
      participantId={myParticipant.id}
      campaignId={campaignId}
      userId={userId}
    />
  )}
  ```

- [ ] **Step 2: Implement the sub-component**

  Inline at the bottom of the file:

  ```tsx
  function HeroTokenPanel({
    heroTokens,
    participantId,
    campaignId,
    userId,
  }: {
    heroTokens: number;
    participantId: string;
    campaignId: string;
    userId: string;
  }) {
    const sock = useSessionSocket(campaignId);
    const spend = (amount: 1 | 2, reason: 'surge_burst' | 'regain_stamina') => {
      sock.dispatch(
        buildIntent({
          campaignId,
          type: IntentTypes.SpendHeroToken,
          payload: { amount, reason, participantId },
          actor: { userId, role: 'player' },
        }),
      );
    };
    return (
      <div className="rounded-md border border-violet-800/40 bg-violet-950/20 p-3 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Hero tokens</span>
          <span className="font-mono tabular-nums text-sm">{heroTokens}</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={heroTokens < 1}
            onClick={() => spend(1, 'surge_burst')}
            className="flex-1 min-h-11 rounded-md bg-violet-500 text-neutral-900 text-sm font-medium disabled:opacity-40"
          >
            +2 Surges (1)
          </button>
          <button
            type="button"
            disabled={heroTokens < 2}
            onClick={() => spend(2, 'regain_stamina')}
            className="flex-1 min-h-11 rounded-md bg-violet-500 text-neutral-900 text-sm font-medium disabled:opacity-40"
          >
            Regain Stamina (2)
          </button>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: Typecheck + commit**

  ```bash
  pnpm typecheck
  git add apps/web/src/pages/combat/PlayerSheetPanel.tsx
  git commit -m "feat(web): PlayerSheetPanel hero-token spend buttons"
  ```

---

## Task 18 — Integration test: full session lifecycle

**Files:**
- Create: `apps/api/tests/integration/sessions-flow.spec.ts`
- Modify: `apps/api/tests/integration/lobby-ws-flow.spec.ts` — dispatch StartSession before StartEncounter in existing flows

- [ ] **Step 1: Update existing lobby-ws-flow.spec to seed a session**

  Open `apps/api/tests/integration/lobby-ws-flow.spec.ts`. In every test that dispatches `StartEncounter`, add a `StartSession` dispatch first (with one approved character ID so the encounter has someone to materialize). Run:

  ```bash
  pnpm --filter @ironyard/api test -- lobby-ws-flow
  ```

  Expected: PASS (all existing integration tests now session-aware).

- [ ] **Step 2: Create the new integration test**

  Create `apps/api/tests/integration/sessions-flow.spec.ts`. Use the same harness setup as `campaigns-flow.spec.ts`. Cover:

  - StartSession dispatched via WS → session row appears in D1; `campaigns.current_session_id` set; CampaignState mirrors via WS broadcast
  - GainHeroToken / SpendHeroToken adjust the pool through the broadcast envelope
  - UpdateSessionAttendance updates the D1 row + WS state
  - EndSession clears `campaigns.current_session_id`; sets `sessions.ended_at` + `hero_tokens_end`
  - StartEncounter rejected with `no_active_session` when dispatched before StartSession

  Length budget: ~200 lines. Follow the structure of the existing integration spec files exactly.

- [ ] **Step 3: Run + commit**

  ```bash
  pnpm --filter @ironyard/api test
  git add apps/api/tests/integration/sessions-flow.spec.ts apps/api/tests/integration/lobby-ws-flow.spec.ts
  git commit -m "test(api): sessions integration flow + lobby-ws-flow session-aware"
  ```

---

## Task 19 — Documentation

**Files:**
- Modify: `docs/intent-protocol.md`
- Modify: `docs/phases.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Sessions section to intent-protocol.md**

  Open `docs/intent-protocol.md`. After the "Lobby / campaign management" section, add a new "Sessions" section:

  ```markdown
  ### Sessions

  - `StartSession { name?, attendingCharacterIds, heroTokens? }` — director-only. Opens a play session, declares attending characters, initializes the hero token pool. Rejects if a session is already active. DO stamper validates attendingCharacterIds against the campaign's approved roster and assigns a default `Session N` name.
  - `EndSession {}` — director-only. Closes the active session. Side-effect snapshots `hero_tokens_end` to D1 for history.
  - `UpdateSessionAttendance { add?, remove? }` — director-only. Adjusts attendance mid-session for late arrivals / departures. Does not auto-grant or revoke hero tokens.
  - `GainHeroToken { amount }` — director-only mid-session bonus award.
  - `SpendHeroToken { amount, reason, participantId }` — player or director. Reason is `surge_burst` (amount 1 → derived GainResource surges +2), `regain_stamina` (amount 2 → derived ApplyHeal of recoveryValue), or `narrative` (amount ≥ 1, no derived intent).

  **Precondition added to combat intents:** `StartEncounter` rejects with `no_active_session` if `state.currentSessionId === null`. Other encounter-scoped intents (turn, roll, damage, condition, resource) still work within an active encounter regardless of session state — sessions are an outer boundary, not a per-intent check.
  ```

  Also update the "What the DO stamps" table to add a row for StartSession.

- [ ] **Step 2: Add Phase 2 Epic 2E shipping note to phases.md**

  Open `docs/phases.md`. After the existing Phase 2 Epic 2D shipping note, add:

  ```markdown
  **Sub-epic 2E — Sessions layer (MVP)** ([spec](superpowers/specs/2026-05-13-phase-2-epic-2e-sessions-design.md), [plan](superpowers/plans/2026-05-13-phase-2-epic-2e-sessions.md)) — **shipping**

  Introduces a play-session boundary as a thin scaffold: new `sessions` D1 table, `currentSessionId` pointer on Campaign, five new intents (`StartSession` / `EndSession` / `UpdateSessionAttendance` / `GainHeroToken` / `SpendHeroToken`). Hero tokens initialize from session attendance per canon (party size at session start); two cheap spend paths land in this epic (+2 surges, regain stamina). Retroactive variants (reroll, succeed-on-fail-save) defer to a follow-up epic. `StartEncounter` now requires an active session. Forward-compatible with Phase 3 character sharing.
  ```

- [ ] **Step 3: Update CLAUDE.md terminology table**

  Open `CLAUDE.md`. Find the "Session | Reserved" row in the terminology table. Replace with:

  ```markdown
  | **Session** | A real-world play meeting bounded by `StartSession` / `EndSession` intents. Heroes start each session with hero tokens equal to attending PC count (canon: party size). Sessions group encounters chronologically within a campaign. Stored in `sessions` D1 table; current session id lives on `campaigns.current_session_id` and mirrors to `CampaignState.currentSessionId`. |
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add docs/intent-protocol.md docs/phases.md CLAUDE.md
  git commit -m "docs: Sessions in intent-protocol + phases.md + CLAUDE.md terminology"
  ```

---

## Task 20 — Final verification

- [ ] **Step 1: Full repo typecheck**

  ```bash
  pnpm typecheck
  ```

  Expected: all 5 packages pass.

- [ ] **Step 2: Full test suite**

  ```bash
  pnpm test
  ```

  Expected: all suites pass — rough count after 2E:
  - shared: ~210 (was 192, +~18 from session intent schemas)
  - data: 92 (unchanged)
  - rules: ~460 (was 436, +~24 from session reducers)
  - web: 27 (unchanged)
  - api: ~120 (was 107, +~13 from session side-effects + integration)

- [ ] **Step 3: Lint** (best-effort — pre-existing lint debt is acceptable to leave alone; just confirm we didn't add new issues)

  ```bash
  pnpm lint
  ```

- [ ] **Step 4: Push**

  ```bash
  git push origin master
  ```

---

## Notes for the implementing engineer

- **Test-driven flow**: every reducer task follows the same pattern (test → fail → implement → pass → commit). Don't skip the FAIL step — it confirms the test actually exercises new code and not a pre-existing path.
- **Don't pre-extract abstractions**: each session intent reducer is 30-50 lines of straightforward Zod-parse + state-check + state-mutation. Resist the urge to extract a shared "check for active session" helper until the third reducer has the same pattern (Task 11 makes that call concrete).
- **The `participantId` in `SpendHeroToken { reason: 'narrative' }`** is required by the schema but ignored by the reducer for `narrative` reason. That's fine — log attribution still uses it.
- **DO state load (Task 13 Step 5)**: this happens once on DO restart. The two new D1 queries (campaign row + session row) are sequential awaits but only fire on cold-start; they don't affect per-intent latency.
- **`SpendHeroToken { reason: 'regain_stamina' }`** is the only path that requires an active encounter (because it uses `participant.recoveryValue`). The others work outside encounters.
- **Hero tokens preserved past EndSession**: `applyEndSession` leaves `state.heroTokens` unchanged. The `D1 hero_tokens_end` column captures the snapshot, and the next `StartSession` overwrites the pool. Net effect: no-session state shows a stale `heroTokens` value but nothing can spend from it (every spend intent checks `currentSessionId`).
- **For Task 14**: if the `applied` envelope shape doesn't already carry `resultingState.currentSessionId`, prefer modifying the broadcast shape over deriving from the snapshot — it keeps the optimistic mirror in sync without a snapshot round-trip.
