# Campaigns restructure — backend implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the backend half of the campaigns restructure spec (`docs/superpowers/specs/2026-05-10-campaigns-restructure-design.md`): D1 schema diff, shared schemas, reducer state shape, new + updated intents, HTTP routes, and DO changes. Frontend gets a follow-on plan.

**Architecture:** Sessions become Campaigns (long-lived containers). The reducer's `SessionState` becomes `CampaignState` and is restructured to host a lobby-persistent participant roster alongside a transient encounter phase. Three-tier permission (Owner / Director permission / Active Director, with `JumpBehindScreen` for handoff). New tables: `encounter_templates`, `campaign_characters`. Drop dormant `encounters`.

**Tech Stack:** TypeScript strict, Zod, Drizzle ORM, Cloudflare Workers + Durable Objects, D1, Hono, pnpm workspaces, Vitest.

**Pre-flight reading:** Engineers MUST read the spec before starting any phase. It's the authoritative source for behavior and edge cases. This plan focuses on execution order, file inventory, and verification gates.

---

## File inventory

The work touches three workspaces. Listed by phase below; the full set is summarised here so worktree-isolated agents can plan their own concurrency.

### `packages/shared`

- **Modify:** `src/index.ts`, `src/intent.ts`, `src/intents/index.ts`, `src/intents/join-session.ts`, `src/intents/leave-session.ts`, `src/intents/start-encounter.ts`, `src/intents/end-encounter.ts`, `src/intents/bring-character-into-encounter.ts`, `src/session.ts` (rename to `src/campaign.ts`)
- **Create:** `src/campaign.ts` (renamed `session.ts`), `src/schemas/encounter-template.ts`, `src/schemas/campaign-character.ts`, `src/intents/join-lobby.ts`, `src/intents/leave-lobby.ts`, `src/intents/add-monster.ts`, `src/intents/remove-participant.ts`, `src/intents/clear-lobby.ts`, `src/intents/load-encounter-template.ts`, `src/intents/submit-character.ts`, `src/intents/approve-character.ts`, `src/intents/deny-character.ts`, `src/intents/remove-approved-character.ts`, `src/intents/kick-player.ts`, `src/intents/jump-behind-screen.ts`
- **Tests:** `tests/intents/` (one spec per new payload schema; payload validity + edge cases)

### `apps/api`

- **Modify:** `src/db/schema.ts`, `src/index.ts`, `src/sessions/routes.ts` (rename → `src/campaigns/routes.ts`), `src/session-do.ts` (rename → `src/lobby-do.ts`), `src/session-do-build-intent.ts` (rename → `src/lobby-do-build-intent.ts`), `wrangler.toml`, `drizzle.config.ts`, `tests/session-do-source.spec.ts` (rename → `lobby-do-source.spec.ts`)
- **Create:** `src/campaigns/templates.ts` (template CRUD), `src/campaigns/director.ts` (grant/revoke), `src/campaigns/characters.ts` (GET list), `drizzle/0001_campaigns_restructure.sql` (Drizzle migration to be generated)
- **Tests:** `tests/campaigns/routes.spec.ts`, `tests/campaigns/templates.spec.ts`, `tests/campaigns/director.spec.ts`, `tests/lobby-do.spec.ts` (rename/expand existing)

### `packages/rules`

- **Modify:** `src/types.ts`, `src/reducer.ts`, `src/index.ts`, `src/intents/index.ts`, plus every existing handler in `src/intents/` (state-shape adjustment from `state.activeEncounter.participants` → `state.participants` / `state.encounter`)
- **Create:** `src/intents/add-monster.ts`, `src/intents/remove-participant.ts`, `src/intents/clear-lobby.ts`, `src/intents/load-encounter-template.ts`, `src/intents/submit-character.ts`, `src/intents/approve-character.ts`, `src/intents/deny-character.ts`, `src/intents/remove-approved-character.ts`, `src/intents/kick-player.ts`, `src/intents/jump-behind-screen.ts`
- **Tests:** one spec per new handler in `tests/intents/`; updated specs for existing handlers reflecting new state shape

### `docs/`

- **Modify:** `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/data-pipeline.md`, `docs/intent-protocol.md`, `docs/rules-engine.md`, `docs/phases.md`

---

## Phase ordering & dispatch strategy

Phases A and B run sequentially in the main worktree (everything else blocks on them). After Phase B lands, Phase C and Phase D can run in parallel worktrees per the established pattern (memory: "parallel agents via worktree isolation for disjoint slices"). Phase E (docs) runs last in the main worktree.

```
[A. Mechanical rename pass] → [B. Shared schemas + D1 migration]
                                          │
                          ┌───────────────┴───────────────┐
                          ▼                               ▼
              [C. Reducer + new intents]    [D. HTTP routes + DO updates]
                          │                               │
                          └───────────────┬───────────────┘
                                          ▼
                                  [E. Docs sweep]
```

---

## Phase A: Mechanical rename pass (sequential)

**Goal:** Pure rename. No semantic changes. `pnpm test`, `pnpm typecheck`, `pnpm lint` must all still pass at the end of this phase. This phase exists to keep the semantic-change diffs in later phases legible.

**Files:**
- Repo-wide search-and-replace on the identifiers below, plus targeted file renames.

### Identifier renames (use IDE refactor where possible, fall back to grep+sed)

| Old | New | Scope |
|---|---|---|
| `SessionDO` | `LobbyDO` | TypeScript identifiers across `apps/api` and `apps/web` |
| `SessionState` | `CampaignState` | TypeScript across all packages |
| `emptySessionState` | `emptyCampaignState` | TypeScript across all packages (signature change comes in Phase C) |
| `sessionId` (the campaign-level id) | `campaignId` | TypeScript across all packages |
| `session_id` (D1 column) | `campaign_id` | `intents` table only — sessions table itself is being renamed |
| `directorId` (campaigns row) | `ownerId` | TypeScript + D1 (`campaigns.director_id` → `owner_id`) |
| `CreateSessionRequest*` | `CreateCampaignRequest*` | Shared + API + web |
| `JoinSessionRequest*` | `JoinCampaignRequest*` | Shared + API + web |
| `JoinSession` intent type literal | `JoinLobby` | Shared, rules, API |
| `LeaveSession` intent type literal | `LeaveLobby` | Shared, rules, API |
| `JoinSessionPayload*` | `JoinLobbyPayload*` | Shared, rules |
| `LeaveSessionPayload*` | `LeaveLobbyPayload*` | Shared, rules |
| `/api/sessions` path | `/api/campaigns` path | API routes + web fetchers |
| `x-session-id` header | `x-campaign-id` header | DO + API + web WS client |
| `SESSION_DO` DO binding | `LOBBY_DO` | `wrangler.toml`, `apps/api/src/types.ts`, callers |
| `sessions` (D1 table name) | `campaigns` | Drizzle schema, raw SQL |
| `memberships` (D1 table name) | `campaign_memberships` | Drizzle schema, raw SQL |
| `session_snapshots` (D1 table name) | `campaign_snapshots` | Drizzle schema, raw SQL |
| `activeEncounter` field | `encounter` | `CampaignState` shape — name change only; restructure is Phase C |

### File renames

| Old path | New path |
|---|---|
| `apps/api/src/sessions/routes.ts` | `apps/api/src/campaigns/routes.ts` |
| `apps/api/src/session-do.ts` | `apps/api/src/lobby-do.ts` |
| `apps/api/src/session-do-build-intent.ts` | `apps/api/src/lobby-do-build-intent.ts` |
| `apps/api/tests/session-do-source.spec.ts` | `apps/api/tests/lobby-do-source.spec.ts` |
| `packages/shared/src/session.ts` | `packages/shared/src/campaign.ts` |
| `packages/shared/src/intents/join-session.ts` | `packages/shared/src/intents/join-lobby.ts` |
| `packages/shared/src/intents/leave-session.ts` | `packages/shared/src/intents/leave-lobby.ts` |
| `packages/rules/src/intents/join-session.ts` | `packages/rules/src/intents/join-lobby.ts` |
| `packages/rules/src/intents/leave-session.ts` | `packages/rules/src/intents/leave-lobby.ts` |

### Tasks

- [ ] **A1: Branch & survey**

  ```bash
  git switch -c campaigns-restructure/phase-a-rename
  rg -l "SessionDO|SessionState|emptySessionState" packages apps | wc -l
  rg -l "JoinSession|LeaveSession" packages apps | wc -l
  ```

  Sanity-check the rename surface. Note the file counts — they're the expected diff size after this phase.

- [ ] **A2: Rename in `packages/shared`**

  Apply identifier renames listed above. Move `session.ts` → `campaign.ts`. Move `intents/join-session.ts` → `intents/join-lobby.ts` and `intents/leave-session.ts` → `intents/leave-lobby.ts`. Update `index.ts` and `intents/index.ts` re-exports. Update `IntentTypes` constant entries `JoinSession`/`LeaveSession` → `JoinLobby`/`LeaveLobby`.

  Verify:
  ```bash
  pnpm -F @ironyard/shared typecheck && pnpm -F @ironyard/shared test
  ```
  Both green before moving on.

- [ ] **A3: Rename in `packages/rules`**

  `SessionState` → `CampaignState`, `emptySessionState` → `emptyCampaignState`. Rename intent handler files `join-session.ts` → `join-lobby.ts`, `leave-session.ts` → `leave-lobby.ts`. Update reducer registry and `intents/index.ts` re-exports. Update internal references to `JoinSession`/`LeaveSession` literals → `JoinLobby`/`LeaveLobby`.

  Verify:
  ```bash
  pnpm -F @ironyard/rules typecheck && pnpm -F @ironyard/rules test
  ```

- [ ] **A4: Rename in `apps/api` source**

  - `src/session-do.ts` → `src/lobby-do.ts`; class `SessionDO` → `LobbyDO`.
  - `src/session-do-build-intent.ts` → `src/lobby-do-build-intent.ts`.
  - `src/sessions/routes.ts` → `src/campaigns/routes.ts`; export `campaignRoutes` (renamed from `sessionRoutes`).
  - `src/index.ts`: update DO export name `SessionDO` → `LobbyDO`, mount routes at `/api/campaigns`.
  - `src/types.ts`: `SESSION_DO` binding → `LOBBY_DO`.
  - `src/db/schema.ts`: rename tables `sessions` → `campaigns`, `memberships` → `campaign_memberships`, `session_snapshots` → `campaign_snapshots`. Rename `intents.sessionId` (Drizzle property) → `campaignId`. Rename `campaigns.directorId` → `ownerId`. Rename index `idx_intents_session_seq` → `idx_intents_campaign_seq`, `idx_memberships_user` → `idx_campaign_memberships_user`.
  - `wrangler.toml`: rename DO binding `SESSION_DO` → `LOBBY_DO` and migrations entry; rename `script_name` if necessary; update `class_name`.
  - `x-session-id` header references → `x-campaign-id` everywhere in `lobby-do.ts` and route handlers.

  Verify:
  ```bash
  pnpm -F @ironyard/api typecheck
  ```

  Tests will fail until A5. That's fine.

- [ ] **A5: Rename in `apps/api` tests**

  Rename `tests/session-do-source.spec.ts` → `tests/lobby-do-source.spec.ts`. Apply identifier renames within. Update import paths.

  Verify:
  ```bash
  pnpm -F @ironyard/api test
  ```

- [ ] **A6: Rename in `apps/web`**

  - All `/api/sessions/*` fetcher URLs → `/api/campaigns/*` in `apps/web/src/api/`.
  - `x-session-id` header (if the WS client sends one) → `x-campaign-id`.
  - `SessionState` type imports → `CampaignState`.
  - Route paths that include the word "session" stay as-is for now — Phase F (frontend follow-on plan) will revisit user-facing URLs. We only touch API URLs in this phase.
  - Page filenames stay as-is for this phase.

  Verify:
  ```bash
  pnpm -F @ironyard/web typecheck && pnpm -F @ironyard/web build
  ```

- [ ] **A7: Generate migration for table renames**

  ```bash
  cd apps/api
  pnpm drizzle-kit generate --name rename_sessions_to_campaigns
  ```

  Inspect the generated SQL (`drizzle/0001_rename_sessions_to_campaigns.sql`). Drizzle-kit may emit DROP/CREATE for renamed tables instead of `ALTER TABLE ... RENAME`. **If so, hand-edit the SQL to use `ALTER TABLE ... RENAME TO ...` and `ALTER TABLE ... RENAME COLUMN ... TO ...`** — preserves data, which we don't actually need (pre-launch) but keeps the migration legible.

  Apply against the local D1:
  ```bash
  pnpm db:reset
  ```

  Run the full backend test suite:
  ```bash
  pnpm -F @ironyard/api test
  ```

- [ ] **A8: Full-repo verification**

  ```bash
  pnpm typecheck && pnpm lint && pnpm test
  ```

  All three green. If anything fails, fix in place — DO NOT proceed to Phase B until this is clean.

- [ ] **A9: Commit Phase A**

  ```bash
  git add -A
  git commit -m "refactor: rename sessions → campaigns, SessionDO → LobbyDO, mechanical pass

  Pre-cursor to the campaigns restructure. No semantic changes; the
  reducer state shape, intent semantics, and DO behavior are identical.
  Tests still pass.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Phase B: Shared schemas + D1 migration (sequential)

**Goal:** Land the new D1 schema (tables + columns) and the new Zod schemas in `packages/shared`. The reducer and routes don't use them yet; this phase is pure plumbing.

### Tasks

- [ ] **B1: Branch from A**

  ```bash
  git switch -c campaigns-restructure/phase-b-schemas
  ```

- [ ] **B2: Define `EncounterTemplateSchema` in shared**

  Create `packages/shared/src/schemas/encounter-template.ts`:

  ```ts
  import { z } from 'zod';

  export const EncounterTemplateEntrySchema = z.object({
    monsterId: z.string().min(1),
    quantity: z.number().int().min(1).max(50),
    nameOverride: z.string().min(1).max(80).optional(),
  });
  export type EncounterTemplateEntry = z.infer<typeof EncounterTemplateEntrySchema>;

  export const EncounterTemplateDataSchema = z.object({
    monsters: z.array(EncounterTemplateEntrySchema),
    notes: z.string().max(2000).optional(),
  });
  export type EncounterTemplateData = z.infer<typeof EncounterTemplateDataSchema>;

  export const EncounterTemplateSchema = z.object({
    id: z.string().min(1),
    campaignId: z.string().min(1),
    name: z.string().min(1).max(120),
    data: EncounterTemplateDataSchema,
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  });
  export type EncounterTemplate = z.infer<typeof EncounterTemplateSchema>;
  ```

  Re-export from `packages/shared/src/index.ts`.

  Add test `packages/shared/tests/schemas/encounter-template.spec.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { EncounterTemplateDataSchema } from '../../src/schemas/encounter-template';

  describe('EncounterTemplateDataSchema', () => {
    it('accepts a valid monster bundle', () => {
      const parsed = EncounterTemplateDataSchema.parse({
        monsters: [{ monsterId: 'goblin-warrior-1', quantity: 6 }],
        notes: 'Forest ambush',
      });
      expect(parsed.monsters[0].quantity).toBe(6);
    });

    it('rejects zero-quantity entries', () => {
      expect(() =>
        EncounterTemplateDataSchema.parse({
          monsters: [{ monsterId: 'goblin', quantity: 0 }],
        }),
      ).toThrow();
    });

    it('rejects quantities above the cap', () => {
      expect(() =>
        EncounterTemplateDataSchema.parse({
          monsters: [{ monsterId: 'goblin', quantity: 51 }],
        }),
      ).toThrow();
    });
  });
  ```

  Run: `pnpm -F @ironyard/shared test`. Expect green.

- [ ] **B3: Define `CampaignCharacterSchema` in shared**

  Create `packages/shared/src/schemas/campaign-character.ts`:

  ```ts
  import { z } from 'zod';

  export const CampaignCharacterStatusSchema = z.enum(['pending', 'approved']);
  export type CampaignCharacterStatus = z.infer<typeof CampaignCharacterStatusSchema>;

  export const CampaignCharacterSchema = z.object({
    campaignId: z.string().min(1),
    characterId: z.string().min(1),
    status: CampaignCharacterStatusSchema,
    submittedAt: z.number().int().nonnegative(),
    decidedAt: z.number().int().nonnegative().nullable(),
    decidedBy: z.string().min(1).nullable(),
  });
  export type CampaignCharacter = z.infer<typeof CampaignCharacterSchema>;
  ```

  Re-export from `packages/shared/src/index.ts`. Add a parse-validity test in `packages/shared/tests/schemas/campaign-character.spec.ts`.

  Run: `pnpm -F @ironyard/shared test`. Expect green.

- [ ] **B4: Update D1 Drizzle schema — new tables**

  Edit `apps/api/src/db/schema.ts`:

  Add to the imports section:
  ```ts
  // (no change to imports; index/integer/primaryKey/sqliteTable/text/unique already imported)
  ```

  Add after the existing `campaigns` table definition (note: `campaigns` is the renamed `sessions` from Phase A; the column `ownerId` is already renamed):

  ```ts
  // Replaces the old `role` enum on memberships. `is_director` is a boolean
  // flag granted by the owner. Owner has it implicitly (and the create-campaign
  // route sets it to 1 for the owner's row at creation).
  // (modify the existing campaign_memberships table)
  export const campaignMemberships = sqliteTable(
    'campaign_memberships',
    {
      campaignId: text('campaign_id')
        .notNull()
        .references(() => campaigns.id, { onDelete: 'cascade' }),
      userId: text('user_id')
        .notNull()
        .references(() => users.id),
      isDirector: integer('is_director').notNull().default(0),
      joinedAt: integer('joined_at').notNull(),
    },
    (table) => ({
      pk: primaryKey({ columns: [table.campaignId, table.userId] }),
      userIdx: index('idx_campaign_memberships_user').on(table.userId),
    }),
  );

  export const campaignCharacters = sqliteTable(
    'campaign_characters',
    {
      campaignId: text('campaign_id')
        .notNull()
        .references(() => campaigns.id, { onDelete: 'cascade' }),
      characterId: text('character_id')
        .notNull()
        .references(() => characters.id, { onDelete: 'cascade' }),
      status: text('status', { enum: ['pending', 'approved'] }).notNull(),
      submittedAt: integer('submitted_at').notNull(),
      decidedAt: integer('decided_at'),
      decidedBy: text('decided_by').references(() => users.id),
    },
    (table) => ({
      pk: primaryKey({ columns: [table.campaignId, table.characterId] }),
      campaignIdx: index('idx_campaign_characters_campaign').on(table.campaignId),
    }),
  );

  export const encounterTemplates = sqliteTable(
    'encounter_templates',
    {
      id: text('id').primaryKey(),
      campaignId: text('campaign_id')
        .notNull()
        .references(() => campaigns.id, { onDelete: 'cascade' }),
      name: text('name').notNull(),
      data: text('data').notNull(), // JSON, validated by EncounterTemplateDataSchema at the app boundary
      createdAt: integer('created_at').notNull(),
      updatedAt: integer('updated_at').notNull(),
    },
    (table) => ({
      campaignIdx: index('idx_encounter_templates_campaign').on(table.campaignId),
    }),
  );
  ```

  **Drop** the dormant `encounters` table from the schema entirely. Remove the `export const encounters` block.

- [ ] **B5: Generate the schema migration**

  ```bash
  cd apps/api
  pnpm drizzle-kit generate --name campaigns_data_model
  ```

  Inspect `drizzle/0002_campaigns_data_model.sql`. Verify:
  - Old `memberships` column `role` is dropped; new column `is_director INTEGER NOT NULL DEFAULT 0` added.
  - `encounter_templates` and `campaign_characters` tables created with correct foreign keys and indexes.
  - Old `encounters` table dropped.

  If Drizzle generates a destructive recreate for memberships (drop-and-recreate to swap the column), accept it — the project is pre-launch.

  Apply locally:
  ```bash
  pnpm db:reset
  ```

  Verify schema with:
  ```bash
  pnpm wrangler d1 execute ironyard-dev --local --command ".schema"
  ```

- [ ] **B6: Update `pnpm db:reset` fixtures**

  Locate the seed script (typically `apps/api/scripts/db-reset.ts` or similar — find it via `package.json`). Add fixture rows for:
  - One owner user
  - One campaign with that user as owner; `campaign_memberships` row with `is_director = 1`
  - One additional player member; `campaign_memberships` row with `is_director = 0`
  - One character owned by the player
  - One `campaign_characters` row for that character with `status = 'approved'`
  - One `encounter_templates` row with a small Goblin-Patrol-style monster bundle

  Run: `pnpm db:reset`, then run the test suite to ensure the seed loads cleanly.

- [ ] **B7: Full-repo verification**

  ```bash
  pnpm typecheck && pnpm lint && pnpm test
  ```

  Expect green. The new shared schemas and tables exist but nothing consumes them yet.

- [ ] **B8: Commit Phase B**

  ```bash
  git add -A
  git commit -m "feat(schema): add encounter_templates + campaign_characters; replace role with is_director

  Lands the D1 schema diff for the campaigns restructure spec without
  yet wiring the new tables into reducers or routes. The dormant
  encounters table is dropped.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Phase C: Reducer + new intents (parallelizable with Phase D)

**Goal:** Restructure `CampaignState` to pull `participants` out of the encounter phase, add `ownerId` and `activeDirectorId`, and implement every new intent handler. Update existing handlers to the new state shape.

**Worktree:** Per the parallel-agents memory, dispatch this in its own git worktree so Phase D can proceed concurrently. Use `superpowers:using-git-worktrees`.

### C1: Reducer state shape restructure

**Files:**
- Modify: `packages/rules/src/types.ts`
- Modify: every file in `packages/rules/src/intents/` (state-shape adjustment)
- Modify: `packages/rules/src/reducer.ts`

- [ ] **C1.1: Write failing test for the new state shape**

  Create `packages/rules/tests/types.spec.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { emptyCampaignState } from '../src/types';

  describe('emptyCampaignState', () => {
    it('creates state with empty participants array at the top level', () => {
      const s = emptyCampaignState('camp-1', 'user-owner');
      expect(s.campaignId).toBe('camp-1');
      expect(s.ownerId).toBe('user-owner');
      expect(s.activeDirectorId).toBe('user-owner');
      expect(s.participants).toEqual([]);
      expect(s.encounter).toBeNull();
    });
  });
  ```

  Run: `pnpm -F @ironyard/rules test types`. Expect FAIL (signature change).

- [ ] **C1.2: Update `CampaignState` and `emptyCampaignState`**

  Edit `packages/rules/src/types.ts`:

  ```ts
  import type { Intent, MaliceState, Member, Participant } from '@ironyard/shared';

  export type StampedIntent = Intent & { timestamp: number };
  export type DerivedIntent = Omit<Intent, 'id' | 'timestamp' | 'sessionId'>;

  export type NoteEntry = {
    intentId: string;
    actorId: string;
    text: string;
    timestamp: number;
  };

  export type TurnState = {
    dazeActionUsedThisTurn: boolean;
  };

  export type EncounterPhase = {
    id: string;
    currentRound: number | null;
    turnOrder: string[];
    activeParticipantId: string | null;
    turnState: Record<string, TurnState>;
    malice: MaliceState;
  };

  export type CampaignState = {
    campaignId: string;
    ownerId: string;
    activeDirectorId: string;
    seq: number;
    connectedMembers: Member[];
    notes: NoteEntry[];
    participants: Participant[];
    encounter: EncounterPhase | null;
  };

  export type LogEntry = { kind: 'info' | 'error'; text: string; intentId: string };
  export type ValidationError = { code: string; message: string };
  export type IntentResult = {
    state: CampaignState;
    derived: DerivedIntent[];
    log: LogEntry[];
    errors?: ValidationError[];
  };

  export function emptyCampaignState(campaignId: string, ownerId: string): CampaignState {
    return {
      campaignId,
      ownerId,
      activeDirectorId: ownerId,
      seq: 0,
      connectedMembers: [],
      notes: [],
      participants: [],
      encounter: null,
    };
  }
  ```

  Run: `pnpm -F @ironyard/rules test types`. Expect PASS.

- [ ] **C1.3: Update every existing handler to the new state shape**

  Every existing handler that reads or writes `state.activeEncounter.participants` must be updated. The mapping is:

  | Old reference | New reference |
  |---|---|
  | `state.activeEncounter` | `state.encounter` (renamed in Phase A) |
  | `state.activeEncounter.participants` | `state.participants` |
  | `state.activeEncounter.<phase field>` | `state.encounter.<phase field>` |
  | `activeEncounter: { participants: [...], ... }` | top-level `participants: [...]` and `encounter: { ... }` separately |

  Handlers to update (verify against `packages/rules/src/intents/`):
  - `apply-damage.ts`
  - `apply-heal.ts`
  - `bring-character-into-encounter.ts` (semantics change in Phase C2)
  - `end-encounter.ts` (semantics change in Phase C2)
  - `gain-malice.ts`
  - `gain-resource.ts`
  - `note.ts`
  - `remove-condition.ts`
  - `roll-power.ts`
  - `roll-resistance.ts`
  - `set-condition.ts`
  - `set-resource.ts`
  - `set-stamina.ts`
  - `spend-malice.ts`
  - `spend-recovery.ts`
  - `spend-resource.ts`
  - `spend-surge.ts`
  - `start-encounter.ts` (semantics change in Phase C2)
  - `turn.ts` (start/end turn, start/end round, set-initiative)
  - `undo.ts`
  - `join-lobby.ts` / `leave-lobby.ts` (already renamed; state-shape touch only)

  Strategy: do the literal substitutions only, no semantic changes. Existing tests should pass after each handler is updated.

  Run after each handler: `pnpm -F @ironyard/rules test <intent-name>`.

  When all handlers are updated:
  ```bash
  pnpm -F @ironyard/rules test
  ```
  Expect green.

- [ ] **C1.4: Update reducer's empty-state caller**

  The reducer or test scaffolding likely calls `emptyCampaignState(id)` somewhere. Update all call sites to pass the second `ownerId` argument. For tests, use `'user-owner'` as a placeholder.

  Run: `pnpm -F @ironyard/rules test`. Expect green.

- [ ] **C1.5: Commit C1**

  ```bash
  git add -A
  git commit -m "refactor(rules): pull participants up to CampaignState; split encounter phase

  Adds ownerId and activeDirectorId. participants[] is lobby-persistent;
  encounter is the transient phase. Every existing handler updated to the
  new state shape; semantics unchanged.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### C2: Updated semantics for StartEncounter / EndEncounter / BringCharacterIntoEncounter

- [ ] **C2.1: Update `BringCharacterIntoEncounter` semantics — write failing test**

  The intent now appends to `state.participants` regardless of whether an encounter is active. It does NOT add to `encounter.turnOrder` automatically — that happens at StartEncounter, or via SetInitiative if mid-combat (deferred to a later slice).

  Add to `packages/rules/tests/intents/bring-character-into-encounter.spec.ts`:

  ```ts
  it('adds participant to the lobby roster even with no active encounter', () => {
    const state = emptyCampaignState('camp-1', 'owner-1');
    const intent = stamped({
      type: 'BringCharacterIntoEncounter',
      actor: { userId: 'owner-1', role: 'director' },
      payload: { participant: makeHeroParticipant('hero-1') },
    });
    const result = applyIntent(state, intent);
    expect(result.errors).toBeUndefined();
    expect(result.state.participants).toHaveLength(1);
    expect(result.state.encounter).toBeNull();
  });
  ```

  (Assumes `stamped` and `makeHeroParticipant` test helpers exist; create them in `tests/test-utils.ts` if not.)

  Run: `pnpm -F @ironyard/rules test bring-character-into-encounter`. Expect FAIL (existing handler likely guards on encounter being active).

- [ ] **C2.2: Update the handler**

  Edit `packages/rules/src/intents/bring-character-into-encounter.ts`. Remove any "active encounter required" guard. Append to `state.participants` and bump `state.seq`. No interaction with `state.encounter`.

  Run the test. Expect PASS. Run all existing tests in this file to ensure no regression: `pnpm -F @ironyard/rules test bring-character-into-encounter`.

- [ ] **C2.3: Update `StartEncounter` — write failing test**

  Semantics: no monster lineup payload; the intent engages whoever's currently on the roster.

  Add to `packages/rules/tests/intents/start-encounter.spec.ts`:

  ```ts
  it('engages the current roster — no lineup arg', () => {
    const state = {
      ...emptyCampaignState('camp-1', 'owner-1'),
      participants: [makeHeroParticipant('hero-1'), makeMonsterParticipant('goblin-1')],
    };
    const intent = stamped({
      type: 'StartEncounter',
      actor: { userId: 'owner-1', role: 'director' },
      payload: {},
    });
    const result = applyIntent(state, intent);
    expect(result.errors).toBeUndefined();
    expect(result.state.encounter).not.toBeNull();
    expect(result.state.encounter!.currentRound).toBe(1);
    expect(result.state.encounter!.id).toMatch(/.{20,}/); // ULID
    expect(result.state.participants).toHaveLength(2); // roster preserved
  });

  it('rejects when an encounter is already active', () => {
    const state = {
      ...emptyCampaignState('camp-1', 'owner-1'),
      participants: [],
      encounter: {
        id: 'enc-1',
        currentRound: 1,
        turnOrder: [],
        activeParticipantId: null,
        turnState: {},
        malice: { current: 0, lastMaliciousStrikeRound: null },
      },
    };
    const intent = stamped({ type: 'StartEncounter', actor: ownerActor, payload: {} });
    const result = applyIntent(state, intent);
    expect(result.errors).toBeDefined();
  });
  ```

  Update `StartEncounterPayloadSchema` in `packages/shared/src/intents/start-encounter.ts` to `z.object({})` (no fields), and rebuild types if necessary.

  Run: `pnpm -F @ironyard/rules test start-encounter`. Expect FAIL.

- [ ] **C2.4: Update the handler**

  Edit `packages/rules/src/intents/start-encounter.ts`:

  ```ts
  import { StartEncounterPayloadSchema, ulid } from '@ironyard/shared';
  import type { IntentResult, CampaignState, StampedIntent, EncounterPhase } from '../types';

  export function applyStartEncounter(state: CampaignState, intent: StampedIntent): IntentResult {
    const parsed = StartEncounterPayloadSchema.safeParse(intent.payload);
    if (!parsed.success) {
      return {
        state,
        derived: [],
        log: [{ kind: 'error', text: `StartEncounter rejected: ${parsed.error.message}`, intentId: intent.id }],
        errors: [{ code: 'invalid_payload', message: parsed.error.message }],
      };
    }

    if (state.encounter !== null) {
      return {
        state,
        derived: [],
        log: [{ kind: 'error', text: 'encounter already active', intentId: intent.id }],
        errors: [{ code: 'encounter_already_active', message: 'an encounter is already in progress' }],
      };
    }

    const encounter: EncounterPhase = {
      id: ulid(),
      currentRound: 1,
      turnOrder: state.participants.map((p) => p.id),
      activeParticipantId: null,
      turnState: {},
      malice: { current: 0, lastMaliciousStrikeRound: null },
    };

    return {
      state: { ...state, seq: state.seq + 1, encounter },
      derived: [],
      log: [{ kind: 'info', text: `encounter ${encounter.id} started with ${state.participants.length} participants`, intentId: intent.id }],
    };
  }
  ```

  Run the tests. Expect PASS for both.

- [ ] **C2.5: Update `EndEncounter` semantics — write failing test**

  The structural change: after EndEncounter, `state.participants` is preserved (only `state.encounter` is nulled). Conditions, heroic resources, etc. are reset via the existing `resetParticipantForEndOfEncounter` helper.

  Add to `packages/rules/tests/intents/end-encounter.spec.ts`:

  ```ts
  it('preserves participants in the roster after ending the encounter', () => {
    const state = {
      ...emptyCampaignState('camp-1', 'owner-1'),
      participants: [
        withConditions(makeHeroParticipant('hero-1'), [endOfEncounterCondition('Dazed')]),
        makeMonsterParticipant('goblin-1'),
      ],
      encounter: makeRunningEncounterPhase('enc-1'),
    };
    const intent = stamped({
      type: 'EndEncounter',
      actor: ownerActor,
      payload: { encounterId: 'enc-1' },
    });
    const result = applyIntent(state, intent);
    expect(result.errors).toBeUndefined();
    expect(result.state.encounter).toBeNull();
    expect(result.state.participants).toHaveLength(2);
    expect(result.state.participants[0].conditions).toHaveLength(0); // end_of_encounter conditions cleared
    expect(result.state.participants[1].id).toBe('goblin-1');
  });
  ```

  Run: `pnpm -F @ironyard/rules test end-encounter`. Expect FAIL.

- [ ] **C2.6: Update the handler**

  Edit `packages/rules/src/intents/end-encounter.ts`. Use the existing `resetParticipantForEndOfEncounter` helper (which already handles conditions + resources per canon), but map it across `state.participants` and return the result at the top level rather than discarding it:

  ```ts
  const resetParticipants = state.participants.map(resetParticipantForEndOfEncounter);

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: resetParticipants,
      encounter: null,
    },
    derived: [],
    log: [/* ... */],
  };
  ```

  Run the tests. Expect PASS. Existing tests for resource resets etc. should still pass.

- [ ] **C2.7: Commit C2**

  ```bash
  git add -A
  git commit -m "feat(rules): EndEncounter preserves roster; StartEncounter engages current roster; BringCharacter is lobby-additive

  Implements the lobby-persistent roster semantics. Conditions still
  cleared per canon (end_of_encounter duration). Heroic resources,
  extras, surges still reset.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### C3: New roster intents (AddMonster, RemoveParticipant, ClearLobby, LoadEncounterTemplate)

- [ ] **C3.1: Define `AddMonsterPayloadSchema` in shared**

  Create `packages/shared/src/intents/add-monster.ts`:

  ```ts
  import { z } from 'zod';

  export const AddMonsterPayloadSchema = z.object({
    monsterId: z.string().min(1),
    quantity: z.number().int().min(1).max(50),
    nameOverride: z.string().min(1).max(80).optional(),
  });
  export type AddMonsterPayload = z.infer<typeof AddMonsterPayloadSchema>;
  ```

  Re-export from `packages/shared/src/intents/index.ts`. Add to `IntentTypes`: `AddMonster: 'AddMonster'`.

- [ ] **C3.2: Implement `applyAddMonster` handler — TDD**

  Reducer behavior: appends N new monster participants to `state.participants` by reading the monster's stat block from a side-channel. The reducer is pure, so it needs the monster data either inlined into the payload by the DO, OR resolved from a snapshot of monster data. Implementation choice: **payload includes the resolved monster stat block.** The DO is responsible for stamping it (Phase D). The client only needs to send `monsterId + quantity`, but the reducer sees the resolved data.

  Update `AddMonsterPayloadSchema` to include the resolved data (server-stamped):

  ```ts
  import { z } from 'zod';
  import { MonsterSchema } from '../data/monster';

  // Client sends: { monsterId, quantity, nameOverride? }
  // DO stamps: { ...client fields, monster: <resolved MonsterSchema> }
  export const AddMonsterPayloadSchema = z.object({
    monsterId: z.string().min(1),
    quantity: z.number().int().min(1).max(50),
    nameOverride: z.string().min(1).max(80).optional(),
    monster: MonsterSchema, // stamped by DO before reducer sees it
  });
  export type AddMonsterPayload = z.infer<typeof AddMonsterPayloadSchema>;
  ```

  Write failing test `packages/rules/tests/intents/add-monster.spec.ts`:

  ```ts
  it('appends N monsters to the roster', () => {
    const state = emptyCampaignState('camp-1', 'owner-1');
    const intent = stamped({
      type: 'AddMonster',
      actor: ownerActor,
      payload: {
        monsterId: 'goblin-warrior-1',
        quantity: 3,
        monster: makeMonsterFixture({ name: 'Goblin Warrior', level: 1 }),
      },
    });
    const result = applyIntent(state, intent);
    expect(result.errors).toBeUndefined();
    expect(result.state.participants).toHaveLength(3);
    expect(result.state.participants[0].name).toMatch(/Goblin Warrior/);
    expect(result.state.participants[0].id).not.toEqual(result.state.participants[1].id);
  });

  it('rejects when actor is not the active director', () => {
    const state = emptyCampaignState('camp-1', 'owner-1');
    const intent = stamped({
      type: 'AddMonster',
      actor: { userId: 'random-player', role: 'player' },
      payload: { monsterId: 'goblin-1', quantity: 1, monster: makeMonsterFixture({}) },
    });
    const result = applyIntent(state, intent);
    expect(result.errors?.[0].code).toBe('not_active_director');
  });
  ```

  Create handler `packages/rules/src/intents/add-monster.ts`:

  ```ts
  import { AddMonsterPayloadSchema, ulid } from '@ironyard/shared';
  import type { CampaignState, IntentResult, StampedIntent } from '../types';
  import { participantFromMonster } from '../participant-from-monster'; // helper to be confirmed/created

  export function applyAddMonster(state: CampaignState, intent: StampedIntent): IntentResult {
    if (intent.actor.userId !== state.activeDirectorId) {
      return {
        state,
        derived: [],
        log: [{ kind: 'error', text: 'AddMonster requires active director', intentId: intent.id }],
        errors: [{ code: 'not_active_director', message: 'only the active director may add monsters' }],
      };
    }
    const parsed = AddMonsterPayloadSchema.safeParse(intent.payload);
    if (!parsed.success) {
      return {
        state,
        derived: [],
        log: [{ kind: 'error', text: `AddMonster rejected: ${parsed.error.message}`, intentId: intent.id }],
        errors: [{ code: 'invalid_payload', message: parsed.error.message }],
      };
    }
    const { quantity, nameOverride, monster } = parsed.data;
    const newParticipants = Array.from({ length: quantity }).map((_, i) => {
      const suffix = quantity > 1 ? ` ${i + 1}` : '';
      const baseName = nameOverride ?? monster.name;
      return participantFromMonster(monster, { id: ulid(), name: `${baseName}${suffix}` });
    });

    return {
      state: { ...state, seq: state.seq + 1, participants: [...state.participants, ...newParticipants] },
      derived: [],
      log: [{ kind: 'info', text: `added ${quantity}× ${monster.name}`, intentId: intent.id }],
    };
  }
  ```

  If `participantFromMonster` doesn't exist, look in `packages/rules/src/` for an existing helper that converts a `Monster` → `Participant` (used today by `bring-character-into-encounter` or `start-encounter` to build participants from monsters). Reuse it; do NOT duplicate the conversion logic.

  Register the handler in `packages/rules/src/reducer.ts`'s intent dispatch table.

  Run: `pnpm -F @ironyard/rules test add-monster`. Expect PASS.

- [ ] **C3.3: Implement `RemoveParticipant` — TDD**

  Payload schema in `packages/shared/src/intents/remove-participant.ts`:

  ```ts
  import { z } from 'zod';
  export const RemoveParticipantPayloadSchema = z.object({
    participantId: z.string().min(1),
  });
  export type RemoveParticipantPayload = z.infer<typeof RemoveParticipantPayloadSchema>;
  ```

  Failing tests `packages/rules/tests/intents/remove-participant.spec.ts`:

  ```ts
  it('removes the named participant', () => {
    const state = {
      ...emptyCampaignState('camp-1', 'owner-1'),
      participants: [makeHeroParticipant('hero-1'), makeMonsterParticipant('goblin-1')],
    };
    const intent = stamped({
      type: 'RemoveParticipant',
      actor: ownerActor,
      payload: { participantId: 'goblin-1' },
    });
    const result = applyIntent(state, intent);
    expect(result.errors).toBeUndefined();
    expect(result.state.participants.map((p) => p.id)).toEqual(['hero-1']);
  });

  it('rejects when target is the currently active participant', () => {
    const state = {
      ...emptyCampaignState('camp-1', 'owner-1'),
      participants: [makeMonsterParticipant('goblin-1')],
      encounter: {
        ...makeRunningEncounterPhase('enc-1'),
        activeParticipantId: 'goblin-1',
      },
    };
    const intent = stamped({
      type: 'RemoveParticipant',
      actor: ownerActor,
      payload: { participantId: 'goblin-1' },
    });
    const result = applyIntent(state, intent);
    expect(result.errors?.[0].code).toBe('participant_is_active');
  });

  it('rejects non-active-director actors', () => { /* analogous */ });
  ```

  Implement the handler with the active-director check first, then payload parse, then participant lookup, then activeParticipantId check, then array filter and turnOrder filter.

  Run: `pnpm -F @ironyard/rules test remove-participant`. Expect PASS.

- [ ] **C3.4: Implement `ClearLobby` — TDD**

  Payload schema in `packages/shared/src/intents/clear-lobby.ts`: `z.object({})`.

  Failing tests:
  - clears all participants when no encounter is active
  - rejects when an encounter is active
  - rejects non-active-director actors

  Implement the handler. Verify.

- [ ] **C3.5: Implement `LoadEncounterTemplate` — TDD**

  Reducer-side: the intent payload includes the resolved monster list (DO stamps it in Phase D). The reducer fans into derived `AddMonster` intents.

  Payload schema in `packages/shared/src/intents/load-encounter-template.ts`:

  ```ts
  import { z } from 'zod';
  import { MonsterSchema } from '../data/monster';

  export const LoadEncounterTemplateClientPayloadSchema = z.object({
    templateId: z.string().min(1),
  });
  export type LoadEncounterTemplateClientPayload = z.infer<typeof LoadEncounterTemplateClientPayloadSchema>;

  // DO stamps the resolved entries onto the payload before reducer sees it.
  export const LoadEncounterTemplateResolvedEntrySchema = z.object({
    monsterId: z.string(),
    quantity: z.number().int().min(1),
    nameOverride: z.string().optional(),
    monster: MonsterSchema,
  });
  export const LoadEncounterTemplatePayloadSchema = z.object({
    templateId: z.string().min(1),
    entries: z.array(LoadEncounterTemplateResolvedEntrySchema).min(1),
  });
  export type LoadEncounterTemplatePayload = z.infer<typeof LoadEncounterTemplatePayloadSchema>;
  ```

  Failing test:

  ```ts
  it('fans into derived AddMonster intents — one per entry', () => {
    const state = emptyCampaignState('camp-1', 'owner-1');
    const intent = stamped({
      type: 'LoadEncounterTemplate',
      actor: ownerActor,
      payload: {
        templateId: 'tpl-1',
        entries: [
          { monsterId: 'goblin', quantity: 6, monster: makeMonsterFixture({ name: 'Goblin' }) },
          { monsterId: 'sniper', quantity: 1, monster: makeMonsterFixture({ name: 'Sniper' }) },
        ],
      },
    });
    const result = applyIntent(state, intent);
    expect(result.errors).toBeUndefined();
    expect(result.derived).toHaveLength(2);
    expect(result.derived[0].type).toBe('AddMonster');
    expect((result.derived[0].payload as any).quantity).toBe(6);
  });
  ```

  Implement the handler — emit one derived `AddMonster` per entry, return `state` unchanged at this level (the derived intents advance seq and participants when the DO re-feeds them).

  Run tests. Expect PASS.

- [ ] **C3.6: Commit C3**

  ```bash
  git add -A
  git commit -m "feat(rules): new roster intents — AddMonster, RemoveParticipant, ClearLobby, LoadEncounterTemplate

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### C4: New permission intents (JumpBehindScreen + character lifecycle + KickPlayer)

- [ ] **C4.1: Implement `JumpBehindScreen` — TDD**

  Payload schema in `packages/shared/src/intents/jump-behind-screen.ts`:

  ```ts
  import { z } from 'zod';

  // Client sends: {} — actor identity carries the request.
  // DO stamps: { permitted } from D1 is_director lookup.
  export const JumpBehindScreenPayloadSchema = z.object({
    permitted: z.boolean(),
  });
  export type JumpBehindScreenPayload = z.infer<typeof JumpBehindScreenPayloadSchema>;
  ```

  Failing tests in `packages/rules/tests/intents/jump-behind-screen.spec.ts`:

  ```ts
  it('owner can jump regardless of permitted flag', () => {
    const state = emptyCampaignState('camp-1', 'owner-1');
    const intent = stamped({
      type: 'JumpBehindScreen',
      actor: { userId: 'owner-1', role: 'director' },
      payload: { permitted: false },
    });
    const result = applyIntent(state, intent);
    expect(result.errors).toBeUndefined();
    expect(result.state.activeDirectorId).toBe('owner-1');
  });

  it('director-permitted member can jump', () => {
    const state = { ...emptyCampaignState('camp-1', 'owner-1'), activeDirectorId: 'owner-1' };
    const intent = stamped({
      type: 'JumpBehindScreen',
      actor: { userId: 'co-dm', role: 'player' },
      payload: { permitted: true },
    });
    const result = applyIntent(state, intent);
    expect(result.errors).toBeUndefined();
    expect(result.state.activeDirectorId).toBe('co-dm');
  });

  it('rejects when not permitted and not owner', () => {
    const state = emptyCampaignState('camp-1', 'owner-1');
    const intent = stamped({
      type: 'JumpBehindScreen',
      actor: { userId: 'random', role: 'player' },
      payload: { permitted: false },
    });
    const result = applyIntent(state, intent);
    expect(result.errors?.[0].code).toBe('not_director_permitted');
  });
  ```

  Implement the handler. Verify.

- [ ] **C4.2: Implement `SubmitCharacter` (side-effect intent) — TDD**

  Payload schema:

  ```ts
  export const SubmitCharacterPayloadSchema = z.object({
    characterId: z.string().min(1),
    // DO stamps: ownsCharacter, isCampaignMember
    ownsCharacter: z.boolean(),
    isCampaignMember: z.boolean(),
  });
  ```

  Failing tests: accepts when caller owns the character and is a member; rejects otherwise. Reducer does NOT touch state.participants or state.encounter — this is a side-effect intent. Only state.seq is bumped.

  Implement the handler. The D1 row write happens in the DO (Phase D6); the reducer just validates and logs.

- [ ] **C4.3: Implement `ApproveCharacter` — TDD**

  Payload: `z.object({ characterId: z.string().min(1) })`.

  Active-director-gated. Side-effect intent — reducer logs, DO writes.

  Failing test, implement, verify.

- [ ] **C4.4: Implement `DenyCharacter`, `RemoveApprovedCharacter`, `KickPlayer`**

  All active-director gated (KickPlayer additionally rejects when `userId === state.ownerId`). All side-effect intents — reducer validates + bumps seq + logs; DO does the D1 write.

  KickPlayer has an additional effect: if any of the kicked user's characters are currently participants in the lobby roster, REMOVE them. Implementation: KickPlayer emits derived `RemoveParticipant` intents for each affected participant. The DO will know which participants belong to the kicked user by looking up `campaign_characters` rows owned by that user — that mapping is stamped onto the intent payload by the DO.

  Failing tests for each. Implement. Verify.

- [ ] **C4.5: Commit C4**

  ```bash
  git add -A
  git commit -m "feat(rules): permission intents — JumpBehindScreen, character lifecycle, KickPlayer

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### C5: Wire all new intents into the reducer registry

- [ ] **C5.1: Update `packages/rules/src/reducer.ts`**

  Add a dispatch entry for each new intent type: `AddMonster`, `RemoveParticipant`, `ClearLobby`, `LoadEncounterTemplate`, `JumpBehindScreen`, `SubmitCharacter`, `ApproveCharacter`, `DenyCharacter`, `RemoveApprovedCharacter`, `KickPlayer`.

  Update `packages/rules/src/intents/index.ts` to re-export the new handlers.

  Update `packages/shared/src/intents/index.ts` `IntentTypes` const to include all new entries.

- [ ] **C5.2: Full reducer suite green**

  ```bash
  pnpm -F @ironyard/rules test
  ```

  Expect green. If any prior handler test fails because of the new state shape, fix in place — no semantic changes intended for those handlers.

- [ ] **C5.3: Commit & merge worktree**

  ```bash
  git add -A
  git commit -m "feat(rules): wire all new intents into reducer registry

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

  Merge Phase C branch back to the integration branch (typically the parent of Phase A's branch). Coordinate with Phase D agent.

---

## Phase D: HTTP routes + DO updates (parallelizable with Phase C)

**Goal:** Wire the new intents into HTTP routes and the lobby DO. The DO does D1 stamping for `AddMonster`/`LoadEncounterTemplate`/`JumpBehindScreen`/character-lifecycle intents; new HTTP routes for templates, members, character listings, and director grant/revoke.

**Worktree:** Own worktree, parallel with Phase C. Phase C and Phase D share types from `packages/shared` but touch otherwise disjoint code.

### D1: Director grant/revoke routes

**Files:**
- Create: `apps/api/src/campaigns/director.ts`
- Modify: `apps/api/src/campaigns/routes.ts` (mount the new sub-routes)
- Test: `apps/api/tests/campaigns/director.spec.ts`

- [ ] **D1.1: Failing test**

  Create `apps/api/tests/campaigns/director.spec.ts`:

  ```ts
  describe('POST /api/campaigns/:id/members/:userId/director', () => {
    it('owner can grant director permission to a member', async () => {
      /* seed campaign + member, auth as owner, POST, assert is_director=1 in D1 */
    });

    it('non-owner cannot grant', async () => {
      /* auth as the member themselves, POST, assert 403 */
    });

    it('grant is idempotent (POSTing twice is fine)', async () => { /* ... */ });
  });

  describe('DELETE /api/campaigns/:id/members/:userId/director', () => {
    it('owner can revoke director permission', async () => { /* ... */ });

    it("revoking the active director triggers a synthetic JumpBehindScreen so the screen returns to the owner", async () => {
      /* seed: owner + co-dm with is_director=1; co-dm is activeDirectorId in DO state.
         Call DELETE. Assert: is_director=0 in D1 AND activeDirectorId=owner in DO state. */
    });

    it('rejects revoking the owner', async () => { /* assert 400 */ });
  });
  ```

  Run: `pnpm -F @ironyard/api test director`. Expect FAIL.

- [ ] **D1.2: Implement `apps/api/src/campaigns/director.ts`**

  ```ts
  import { Hono } from 'hono';
  import { and, eq } from 'drizzle-orm';
  import { requireAuth } from '../auth/middleware';
  import { db } from '../db';
  import { campaigns, campaignMemberships } from '../db/schema';
  import type { AppEnv } from '../types';

  export const directorRoutes = new Hono<AppEnv>();
  directorRoutes.use('*', requireAuth);

  async function loadOwner(c: any, campaignId: string) {
    const conn = db(c.env.DB);
    const campaign = await conn.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
    return campaign?.ownerId ?? null;
  }

  directorRoutes.post('/:userId/director', async (c) => {
    const user = c.get('user');
    const campaignId = c.req.param('id');
    const targetUserId = c.req.param('userId');
    const ownerId = await loadOwner(c, campaignId);
    if (!ownerId) return c.json({ error: 'campaign not found' }, 404);
    if (user.id !== ownerId) return c.json({ error: 'only the owner may grant director permission' }, 403);

    const conn = db(c.env.DB);
    await conn
      .update(campaignMemberships)
      .set({ isDirector: 1 })
      .where(and(eq(campaignMemberships.campaignId, campaignId), eq(campaignMemberships.userId, targetUserId)));

    return c.json({ ok: true });
  });

  directorRoutes.delete('/:userId/director', async (c) => {
    const user = c.get('user');
    const campaignId = c.req.param('id');
    const targetUserId = c.req.param('userId');
    const ownerId = await loadOwner(c, campaignId);
    if (!ownerId) return c.json({ error: 'campaign not found' }, 404);
    if (user.id !== ownerId) return c.json({ error: 'only the owner may revoke director permission' }, 403);
    if (targetUserId === ownerId) return c.json({ error: "owner's director permission is implicit and cannot be revoked" }, 400);

    const conn = db(c.env.DB);
    await conn
      .update(campaignMemberships)
      .set({ isDirector: 0 })
      .where(and(eq(campaignMemberships.campaignId, campaignId), eq(campaignMemberships.userId, targetUserId)));

    // If the revoked user is the active director, force a JumpBehindScreen back to owner.
    const stubId = c.env.LOBBY_DO.idFromName(campaignId);
    const stub = c.env.LOBBY_DO.get(stubId);
    await stub.fetch(
      new Request('https://internal/revoke-director', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revokedUserId: targetUserId }),
      }),
    );

    return c.json({ ok: true });
  });
  ```

  The DO endpoint `/revoke-director` is implemented in Phase D6.

  Mount in `apps/api/src/campaigns/routes.ts`:
  ```ts
  campaignRoutes.route('/:id/members', directorRoutes);
  ```

  Run the tests. Expect PASS for grant + reject-non-owner. The revoke-with-active-director test depends on Phase D6 being complete.

- [ ] **D1.3: Commit D1**

  ```bash
  git add -A
  git commit -m "feat(api): grant/revoke director permission routes (owner-only)

  Revoke route also pings the lobby DO so the active director chair can
  return to the owner atomically; DO-side handler lands in D6.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### D2: Encounter template CRUD routes

**Files:**
- Create: `apps/api/src/campaigns/templates.ts`
- Modify: `apps/api/src/campaigns/routes.ts`
- Test: `apps/api/tests/campaigns/templates.spec.ts`

- [ ] **D2.1: Failing tests**

  Cover: list (any member), create (active director), update (active director), delete (active director), reject when caller is not the active director. Active-director check requires reading the DO's state — for the route, use the simpler check "caller has is_director = 1 in campaign_memberships." If the spec demands stricter active-director gating at the HTTP layer, fetch state from the DO via an internal endpoint; for v1 the `is_director` check is acceptable since template CRUD is bench-time not in-combat. Document this decision in the file comment.

  Run: expect FAIL.

- [ ] **D2.2: Implement templates routes**

  Standard Drizzle CRUD against `encounter_templates`. Validate `data` body with `EncounterTemplateDataSchema` from shared.

  Run tests. Expect PASS.

- [ ] **D2.3: Commit D2**

  ```bash
  git add -A
  git commit -m "feat(api): encounter template CRUD routes

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### D3: Campaign-characters GET route

- [ ] **D3.1: Failing test + implement**

  `GET /api/campaigns/:id/characters?status=pending` — returns `CampaignCharacter[]` filtered by status. Any member can read.

  Run tests. Expect PASS.

- [ ] **D3.2: Commit D3**

  ```bash
  git commit -m "feat(api): GET /campaigns/:id/characters

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### D4: Campaigns list + metadata route updates

- [ ] **D4.1: Add `GET /api/campaigns`**

  Returns campaigns where the caller has a membership row. Failing test, implement, verify.

- [ ] **D4.2: Update `GET /api/campaigns/:id` response shape**

  Currently returns `{ id, name, inviteCode, role }`. Update to `{ id, name, inviteCode, isOwner, isDirector, activeDirectorId }`. The `activeDirectorId` requires a DO fetch — for v1, return `null` if the DO is hibernating (no snapshot) and fall back to `ownerId`. Document.

  Failing test, implement, verify.

- [ ] **D4.3: Update `POST /api/campaigns` (create)**

  Caller becomes owner. Set `campaigns.ownerId` to caller; insert `campaign_memberships` row with `isDirector = 1`. Failing test, implement, verify.

- [ ] **D4.4: Update `POST /api/campaigns/join` (redeem)**

  Caller becomes a member with `isDirector = 0`. Failing test, implement, verify.

- [ ] **D4.5: Commit D4**

### D5: LobbyDO — bootstrap, header rename, x-user-role removal

**Files:** `apps/api/src/lobby-do.ts`, `apps/api/src/lobby-do-build-intent.ts`

- [ ] **D5.1: Update DO bootstrap to read `campaigns.owner_id`**

  In `load()`, before constructing empty state, fetch `campaigns.ownerId` from D1. Pass it into `emptyCampaignState(sessionId, ownerId)` (renamed `campaignId`). If snapshot is non-null, the existing path already has `ownerId` baked into the snapshot state.

  Failing test: cold-start a fresh campaign DO; verify the initial state has `ownerId` and `activeDirectorId` set correctly.

  Implement. Verify.

- [ ] **D5.2: Remove `x-user-role` header from request handling**

  The DO previously stamped `actor.role` from the header. Remove that field from the stamping path; downstream reducers should derive authority from `state.ownerId` / `state.activeDirectorId`, not from `actor.role`. The `Actor` schema still has a `role` field for backwards compatibility with intent log entries; stamp it from the user's role in the campaign (`director` if `isDirector` flag in campaign_memberships, else `player`). This is informational only — reducer doesn't gate on it.

  Failing test: connect a WS without the `x-user-role` header; verify the DO still accepts the connection.

  Implement. Verify.

- [ ] **D5.3: Commit D5**

  ```bash
  git commit -m "feat(api): LobbyDO reads campaigns.owner_id on bootstrap; remove x-user-role gate

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### D6: LobbyDO — intent stamping (AddMonster, LoadEncounterTemplate, JumpBehindScreen, character lifecycle)

- [ ] **D6.0: Make `monsters.json` accessible to the API Worker**

  **The blocker.** The DO needs to look up monster stat blocks by id to stamp `AddMonster` and `LoadEncounterTemplate` intents, but per CLAUDE.md the SteelCompendium data lives only in `apps/web/public/data/monsters.json` (gitignored, built at deploy time). The Worker has no path to read this today.

  **Decision for v1: bundle into the API.** Update `packages/data/build.ts` (or wherever the build script writes) to also emit a copy to `apps/api/src/data/monsters.json`, and import it as a JSON module in the DO. Workers natively support JSON imports.

  Steps:
  1. Update the data build script to write to both `apps/web/public/data/monsters.json` and `apps/api/src/data/monsters.json`.
  2. Add `apps/api/src/data/` to `.gitignore` so the API directory doesn't track generated data.
  3. Update `apps/api/tsconfig.json` to enable `resolveJsonModule: true` if not already set.
  4. Create `apps/api/src/data/index.ts` exporting `loadMonsterById(id: string): Monster | null` — module-level cache around the imported JSON.
  5. Test: confirm `pnpm build:data` produces the API-side file and the helper returns a parsed Monster.
  6. If `pnpm build:data` doesn't currently exist or is broken, fix it as part of this step — the DO needs this file or it can't ship.

  Run: `pnpm build:data && pnpm -F @ironyard/api typecheck`.

- [ ] **D6.1: Stamping pipeline**

  In the DO's `handleDispatch` path (`apps/api/src/lobby-do.ts`), introduce a per-intent-type stamping step that runs before `applyAndBroadcast`. The stamping step is responsible for D1 lookups (template data, membership flags, character ownership) and static-data lookups (monster stat blocks via `loadMonsterById` from D6.0).

  Implement stampers:
  - `AddMonster`: call `loadMonsterById(monsterId)`; attach `monster` to payload. If not found, reject with `monster_not_found`.
  - `LoadEncounterTemplate`: read `encounter_templates` by `templateId` and `campaignId`, then for each entry read the monster from `monsters.json`; build the `entries` array; reject with `template_not_found` or `monster_not_found` as appropriate.
  - `JumpBehindScreen`: read `campaign_memberships.is_director` for the actor; stamp `permitted` boolean.
  - `SubmitCharacter`: read `characters` row by `characterId`; check `ownerId === actor.userId`; check `campaign_memberships` row exists for actor; stamp `ownsCharacter` and `isCampaignMember`.
  - `ApproveCharacter`, `DenyCharacter`, `RemoveApprovedCharacter`: no stamping needed (active-director check is in the reducer); the DO performs the D1 write *after* the reducer accepts.
  - `KickPlayer`: read participants in current state that belong to characters owned by `userId`; stamp the list of `participantIdsToRemove` onto the payload (used by reducer to emit derived `RemoveParticipant` intents).

  The static `monsters.json` is bundled with the API. Add a helper `loadMonsterById(monsterId: string): Monster | null` that reads from a module-level cache (initialised once on cold start).

  Per-stamper failing tests in `apps/api/tests/lobby-do.spec.ts` (which is renamed from `tests/session-do-source.spec.ts` in Phase A — extend it). Implement. Verify.

- [ ] **D6.2: Post-reducer D1 writes for character-lifecycle intents**

  After the reducer accepts a `SubmitCharacter` / `ApproveCharacter` / `DenyCharacter` / `RemoveApprovedCharacter` / `KickPlayer` intent, the DO must perform the D1 row write inside the serialized op (right after `intentsTable` insert, before broadcast).

  Implement a `handleSideEffect(intent)` helper in `lobby-do.ts` that switches on intent type and dispatches to the appropriate Drizzle write. Idempotent semantics where possible.

  Tests: WS-level test that fires SubmitCharacter and verifies a `campaign_characters` row appears in D1.

  Implement. Verify.

- [ ] **D6.3: Implement internal `/revoke-director` endpoint on the DO**

  Add a non-WS `fetch` branch that accepts `POST /revoke-director` with body `{ revokedUserId }`. If `state.activeDirectorId === revokedUserId`, emit a synthetic `JumpBehindScreen` intent stamped with `actor = { userId: state.ownerId, role: 'director' }`, `source = 'server'`, `payload = { permitted: true }`. Push through `_applyOne`.

  Failing test: from the revoke HTTP route test in D1, assert that after DELETE the DO's `activeDirectorId` returns to ownerId.

  Implement. Verify.

- [ ] **D6.4: Server-only intents update**

  In `lobby-do.ts`, update `SERVER_ONLY_INTENTS` constant:
  ```ts
  private readonly SERVER_ONLY_INTENTS = new Set(['JoinLobby', 'LeaveLobby', 'ApplyDamage']);
  ```

  No other intents are server-only. Authority gating is reducer-side via `actor.userId` checks.

- [ ] **D6.5: Commit D6**

  ```bash
  git commit -m "feat(api): LobbyDO stamps + side-effect writes for new intents; synthetic JumpBehindScreen on revoke

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

### D7: Integration tests

- [ ] **D7.1: End-to-end happy paths**

  Add `apps/api/tests/integration/campaigns-flow.spec.ts`:

  1. **Campaign creation + invite redemption:** owner creates campaign, player redeems invite, both appear in `GET /campaigns/:id/members`.
  2. **Character submission + approval:** player calls `SubmitCharacter`, director sees pending row via `GET /:id/characters?status=pending`, director calls `ApproveCharacter`, row flips to approved.
  3. **Encounter template save + load:** director creates a template via HTTP, then dispatches `LoadEncounterTemplate` via WS; verify N participants appear in the lobby state.
  4. **EndEncounter preserves roster:** director starts encounter via `StartEncounter`, applies damage, ends via `EndEncounter`; verify participants persist with reduced stamina.
  5. **Director handoff:** owner grants director permission to a second user; second user dispatches `JumpBehindScreen` and becomes active director; owner revokes via HTTP; assert `activeDirectorId` returns to owner.

  Use Wrangler's in-process test harness if it's already set up; otherwise call the routes/DO directly via the same patterns the existing tests use.

  Implement. Verify.

- [ ] **D7.2: Commit D7**

- [ ] **D7.3: Merge Phase D worktree**

  Coordinate merge with Phase C — they must land together to keep the engine + server consistent.

---

## Phase E: Docs sweep (sequential, in main worktree, after C+D merge)

- [ ] **E1: Update `CLAUDE.md`**

  Add a "Terminology" section before "Read these in order" with: Campaign, Owner, Director permission, Active Director, Lobby, Encounter Template. Note "Session" is reserved.

- [ ] **E2: Update `docs/ARCHITECTURE.md`**

  Replace every "session" reference with the appropriate new term (Campaign for the persistent container, Lobby for the runtime, etc.). Update the data-flow diagram (or its prose) to show owner_id, campaign_memberships, campaign_characters, encounter_templates.

- [ ] **E3: Update `docs/data-pipeline.md`**

  Regenerate the D1 schema section to match `apps/api/src/db/schema.ts`. Drop the dormant `encounters` discussion. Add `encounter_templates` and `campaign_characters` sections with their JSON shapes (linked to the shared schemas).

- [ ] **E4: Update `docs/intent-protocol.md`**

  Add the new intents (AddMonster, RemoveParticipant, ClearLobby, LoadEncounterTemplate, JumpBehindScreen, SubmitCharacter, ApproveCharacter, DenyCharacter, RemoveApprovedCharacter, KickPlayer) with their payloads and authority levels. Update JoinSession → JoinLobby and LeaveSession → LeaveLobby references.

- [ ] **E5: Update `docs/rules-engine.md`**

  Update CampaignState shape, note participants live at top level, note encounter is the transient phase. Mention the three-tier permission model.

- [ ] **E6: Update `docs/phases.md`**

  Reword Phase 1 acceptance criteria using the new vocabulary. Reframe the encounter builder as a template builder. Add the in-lobby "Add" affordance.

- [ ] **E7: Commit E**

  ```bash
  git add -A
  git commit -m "docs: sweep terminology — sessions → campaigns + lobby; document new tables and intents

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

---

## Self-review checklist

After completing all phases, verify against the spec:

- [ ] Every D1 table change in spec §`Data model` has a corresponding schema change applied via migration.
- [ ] Every new intent in spec §`Intents` has: a payload schema in `packages/shared/src/intents/`, a handler in `packages/rules/src/intents/`, a reducer registry entry, and at least one TDD test.
- [ ] Every HTTP route in spec §`HTTP routes` is implemented and tested.
- [ ] `x-user-role` header is gone; `x-campaign-id` is the only campaign-identifying header.
- [ ] `SERVER_ONLY_INTENTS` matches the spec's enumeration.
- [ ] Revoke-while-active-director triggers the synthetic JumpBehindScreen path and is covered by an integration test.
- [ ] EndEncounter preserves `state.participants` and clears `state.encounter`; the existing condition/resource reset behavior per canon is preserved.
- [ ] StartEncounter rejects when an encounter is already active; engages the current `state.participants` as `turnOrder`.
- [ ] CampaignState shape matches the spec exactly: `campaignId`, `ownerId`, `activeDirectorId`, `seq`, `connectedMembers`, `notes`, `participants`, `encounter`.

---

## Frontend follow-on

The web app needs corresponding updates: route paths from `/sessions/*` to `/campaigns/*`, query/mutation hooks renamed, new UI for the Add menu (single monster / saved encounter / hero), template-save UI, character-submission flow, director handoff button.

The CLAUDE.md memory notes the UI is prototype-grade until the planned Phase 5 overhaul; the frontend follow-on plan should keep visual investment minimal — wire the new flows to the existing component patterns, no fresh design work. That plan is `docs/superpowers/plans/<future-date>-campaigns-restructure-frontend.md`.
