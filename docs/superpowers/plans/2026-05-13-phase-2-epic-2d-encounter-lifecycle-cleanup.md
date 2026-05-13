# Phase 2 Epic 2D — Encounter Lifecycle Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kill the `BringCharacterIntoEncounter` + `PcPlaceholder` two-step; `StartEncounter` becomes the single moment participants exist; `EndEncounter` writes character state back to D1.

**Architecture:** The director builds an encounter draft in local `EncounterBuilder` component state (`selectedCharacterIds`, `selectedMonsters`), then dispatches one `StartEncounter` with all character IDs + monster entries. The DO stamper resolves character blobs from D1 and monster stat blocks from static data; the reducer materializes all participants atomically, replacing the existing lobby roster. `EndEncounter` fires a D1 side-effect writing `currentStamina` + `recoveriesUsed` back to each PC's character row. `Respite` side-effect extended to reset those same fields to `null`/`0`.

**Tech Stack:** TypeScript + Zod (shared/rules), Hono + Drizzle + Cloudflare Workers D1 (api), React + TanStack Query (web), Vitest (tests)

---

## File Map

**Modified:**
- `packages/shared/src/character.ts` — add `currentStamina` + `recoveriesUsed` fields to `CharacterSchema`
- `packages/shared/src/intents/start-encounter.ts` — new payload schema (`characterIds`, `monsters[]`, `stampedPcs[]`, `stampedMonsters[]`)
- `packages/shared/src/intents/kick-player.ts` — remove `placeholderCharacterIdsToRemove` field
- `packages/shared/src/intents/index.ts` — remove BCIE exports + `IntentTypes.BringCharacterIntoEncounter`; add new StartEncounter exports
- `packages/rules/src/types.ts` — remove `PcPlaceholder` type; narrow `RosterEntry = Participant`
- `packages/rules/src/intents/index.ts` — remove `applyBringCharacterIntoEncounter` export
- `packages/rules/src/intents/start-encounter.ts` — rewrite `applyStartEncounter` (atomic materialization; replaces lobby roster)
- `packages/rules/src/intents/kick-player.ts` — remove placeholder eviction logic
- `apps/api/src/lobby-do-stampers.ts` — rewrite `stampStartEncounter`; delete `stampBringCharacterIntoEncounter`; update `stampKickPlayer`
- `apps/api/src/lobby-do-side-effects.ts` — add `sideEffectEndEncounter`; extend `sideEffectRespite` to write stamina/recoveries
- `apps/web/src/pages/EncounterBuilder.tsx` — rewrite as local draft (character checklist + monster picker → local state → StartEncounter)
- `apps/web/src/pages/CampaignView.tsx` — remove "Bring into lobby" button, "in lobby" badge, `lobbyPlaceholderCharacterIds`
- `apps/web/src/ws/useSessionSocket.ts` — remove `PcPlaceholderEntry` type; remove BCIE branch from `reflect()`
- `packages/rules/tests/fixtures/character-runtime.ts` — add new fields to `buildFuryL1Fixture`
- `packages/rules/tests/start-encounter.spec.ts` — rewrite for new payload shape
- `apps/api/tests/lobby-do-pc-materialization.spec.ts` — rewrite for new stamper + reducer shape
- `apps/api/tests/lobby-do-stampers.spec.ts` — update StartEncounter stamper section

**Deleted:**
- `packages/shared/src/intents/bring-character-into-encounter.ts`
- `packages/rules/src/intents/bring-character-into-encounter.ts`
- `packages/rules/tests/intents/bring-character-into-encounter.spec.ts`

---

## Task 1 — Character Schema Extension (Slice 1)

**Files:**
- Modify: `packages/shared/src/character.ts`
- Modify: `packages/rules/tests/fixtures/character-runtime.ts`

- [ ] **Step 1: Add two fields to `CharacterSchema` in `packages/shared/src/character.ts`**

  After the `inventory` field (around line 194), add:

  ```ts
  // Runtime-mutable stamina state. Written by EndEncounter side-effect (current
  // HP at encounter end) and cleared to null by Respite side-effect. Read by
  // stampStartEncounter to resume HP across encounters. null = use derived max.
  currentStamina: z.number().int().nullable().default(null),

  // Recoveries spent since last Respite. Written by EndEncounter side-effect.
  // Cleared to 0 by Respite side-effect. stampStartEncounter computes
  // recoveries.current = recoveriesMax - recoveriesUsed.
  recoveriesUsed: z.number().int().nonnegative().default(0),
  ```

- [ ] **Step 2: Update `buildFuryL1Fixture` in `packages/rules/tests/fixtures/character-runtime.ts`**

  Add the two new fields with their default values so the fixture satisfies the `Character` output type:

  ```ts
  // After the existing `xp: 0` line:
  currentStamina: null,
  recoveriesUsed: 0,
  ```

- [ ] **Step 3: Run the rules test suite to confirm defaults keep existing tests parseable**

  ```bash
  cd packages/rules && pnpm test
  ```

  Expected: all existing tests **PASS** (Zod defaults fill in new fields for any fixture that doesn't set them).

- [ ] **Step 4: Run typecheck across the repo**

  ```bash
  pnpm typecheck
  ```

  Expected: **PASS** (new fields have defaults; `buildFuryL1Fixture` now satisfies `Character`).

- [ ] **Step 5: Commit**

  ```bash
  git add packages/shared/src/character.ts packages/rules/tests/fixtures/character-runtime.ts
  git commit -m "feat(shared): add currentStamina + recoveriesUsed to CharacterSchema"
  ```

---

## Task 2 — New `StartEncounter` Payload Schema (Slice 2a)

**Files:**
- Modify: `packages/shared/src/intents/start-encounter.ts`
- Modify: `packages/shared/src/intents/index.ts`

- [ ] **Step 1: Rewrite `packages/shared/src/intents/start-encounter.ts`**

  Replace the entire file content:

  ```ts
  import { z } from 'zod';
  import { CharacterSchema } from '../character';
  import { MonsterSchema } from '../data/monster';

  // ── Stamped PC entry (DO resolves character blob + owner from D1) ─────────────

  export const StartEncounterStampedPcSchema = z.object({
    characterId: z.string().min(1),
    ownerId: z.string().min(1),
    name: z.string().min(1),  // from characters.name column
    character: CharacterSchema, // full blob parsed from characters.data
  });
  export type StartEncounterStampedPc = z.infer<typeof StartEncounterStampedPcSchema>;

  // ── Monster entry (client-sent) ───────────────────────────────────────────────

  export const MonsterEntrySchema = z.object({
    monsterId: z.string().min(1),
    quantity: z.number().int().min(1).max(50),
    nameOverride: z.string().min(1).max(80).optional(),
  });
  export type MonsterEntry = z.infer<typeof MonsterEntrySchema>;

  // ── Stamped monster entry (DO resolves stat block from static data) ───────────

  export const StartEncounterStampedMonsterSchema = z.object({
    monsterId: z.string().min(1),
    quantity: z.number().int().min(1).max(50),
    nameOverride: z.string().min(1).max(80).optional(),
    monster: MonsterSchema, // resolved by DO stamper
  });
  export type StartEncounterStampedMonster = z.infer<typeof StartEncounterStampedMonsterSchema>;

  // ── Full payload ──────────────────────────────────────────────────────────────
  //
  // Client sends: { encounterId?, characterIds[], monsters[], stampedPcs: [], stampedMonsters: [] }
  // DO stamper fills in stampedPcs (reads D1 character blobs) and stampedMonsters
  // (resolves static monster data). The reducer ignores characterIds/monsters once
  // stamped — stampedPcs and stampedMonsters are the authoritative inputs.

  export const StartEncounterPayloadSchema = z.object({
    // Optional optimistic id. The reducer generates the canonical id via ulid()
    // if absent; the client may suggest one for optimistic local state.
    encounterId: z.string().min(1).optional(),

    // Character IDs to include. DO stamper resolves → stampedPcs.
    characterIds: z.array(z.string().min(1)).default([]),

    // Monster entries. DO stamper resolves → stampedMonsters.
    monsters: z.array(MonsterEntrySchema).default([]),

    // DO-stamped PC blobs. Client sends []; DO fills before reducer.
    stampedPcs: z.array(StartEncounterStampedPcSchema).default([]),

    // DO-stamped monster blobs. Client sends []; DO fills before reducer.
    stampedMonsters: z.array(StartEncounterStampedMonsterSchema).default([]),
  });
  export type StartEncounterPayload = z.infer<typeof StartEncounterPayloadSchema>;
  ```

- [ ] **Step 2: Update `packages/shared/src/intents/index.ts`**

  Replace the `StartEncounter` export block (around lines 80-81) with the new exports:

  ```ts
  export {
    MonsterEntrySchema,
    StartEncounterPayloadSchema,
    StartEncounterStampedMonsterSchema,
    StartEncounterStampedPcSchema,
  } from './start-encounter';
  export type {
    MonsterEntry,
    StartEncounterPayload,
    StartEncounterStampedMonster,
    StartEncounterStampedPc,
  } from './start-encounter';
  ```

- [ ] **Step 3: Typecheck shared package**

  ```bash
  cd packages/shared && pnpm typecheck
  ```

  Expected: **PASS** (no callers of the old schema yet, they come in later tasks).

---

## Task 3 — Delete BCIE Intent Files; Update IntentTypes (Slice 2b)

**Files:**
- Delete: `packages/shared/src/intents/bring-character-into-encounter.ts`
- Modify: `packages/shared/src/intents/index.ts`
- Modify: `packages/shared/src/intents/kick-player.ts`

- [ ] **Step 1: Delete the BCIE shared intent file**

  ```bash
  rm packages/shared/src/intents/bring-character-into-encounter.ts
  ```

- [ ] **Step 2: Remove BCIE from `packages/shared/src/intents/index.ts`**

  Remove these lines:

  ```ts
  export { BringCharacterIntoEncounterPayloadSchema } from './bring-character-into-encounter';
  export type { BringCharacterIntoEncounterPayload } from './bring-character-into-encounter';
  ```

  And remove `BringCharacterIntoEncounter: 'BringCharacterIntoEncounter',` from the `IntentTypes` object.

- [ ] **Step 3: Update `KickPlayerPayloadSchema` in `packages/shared/src/intents/kick-player.ts`**

  Remove `placeholderCharacterIdsToRemove` from the schema. Replace the file:

  ```ts
  import { z } from 'zod';

  // Client sends: { userId }
  // DO stamps: { participantIdsToRemove } — participant IDs of the kicked user's
  // full Participants (pc kind) currently on the roster.
  export const KickPlayerPayloadSchema = z.object({
    userId: z.string().min(1),
    participantIdsToRemove: z.array(z.string().min(1)), // stamped by DO
  });
  export type KickPlayerPayload = z.infer<typeof KickPlayerPayloadSchema>;
  ```

- [ ] **Step 4: Typecheck shared — expect failures in other packages (that's ok for now)**

  ```bash
  cd packages/shared && pnpm typecheck
  ```

  Expected: shared itself **PASS**. Other packages (rules, api, web) will fail because they still reference BCIE types — that gets fixed in the next tasks.

---

## Task 4 — Remove `PcPlaceholder`; Rewrite `applyStartEncounter`; Update Rules (Slice 2c)

**Files:**
- Modify: `packages/rules/src/types.ts`
- Modify: `packages/rules/src/intents/start-encounter.ts`
- Modify: `packages/rules/src/intents/kick-player.ts`
- Modify: `packages/rules/src/intents/index.ts`
- Delete: `packages/rules/src/intents/bring-character-into-encounter.ts`

- [ ] **Step 1: Rewrite `packages/rules/src/types.ts`**

  Remove the `PcPlaceholder` type and simplify `RosterEntry`:

  ```ts
  import type { Intent, MaliceState, Member, Participant } from '@ironyard/shared';
  import type { StaticDataBundle } from './static-data';

  // After Epic 2D: the roster only holds fully-materialized participants.
  // PcPlaceholder was removed — participants are now created atomically
  // at StartEncounter, not pre-staged via BringCharacterIntoEncounter.
  export type RosterEntry = Participant;

  /** Type guard — kept for call-site compatibility; always true after Epic 2D. */
  export function isParticipant(e: RosterEntry): e is Participant {
    return e.kind === 'pc' || e.kind === 'monster';
  }

  export type ReducerContext = { staticData: StaticDataBundle };

  export type StampedIntent = Intent & { timestamp: number };

  export type DerivedIntent = Omit<Intent, 'id' | 'timestamp' | 'campaignId'>;

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

  export type ActiveEncounter = EncounterPhase;

  export type CampaignState = {
    campaignId: string;
    ownerId: string;
    activeDirectorId: string;
    seq: number;
    connectedMembers: Member[];
    notes: NoteEntry[];
    // Participants for the current encounter. Empty between encounters.
    // StartEncounter replaces this list atomically.
    participants: RosterEntry[];
    encounter: EncounterPhase | null;
    partyVictories: number;
  };

  export type LogEntry = {
    kind: 'info' | 'error' | 'warning';
    text: string;
    intentId: string;
  };

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
      partyVictories: 0,
    };
  }
  ```

- [ ] **Step 2: Rewrite `packages/rules/src/intents/start-encounter.ts`**

  ```ts
  import {
    type Participant,
    StartEncounterPayloadSchema,
    type TypedResistance,
    ulid,
  } from '@ironyard/shared';
  import { participantFromMonster } from './add-monster';
  import { deriveCharacterRuntime } from '../derive-character-runtime';
  import type {
    CampaignState,
    EncounterPhase,
    IntentResult,
    ReducerContext,
    StampedIntent,
  } from '../types';

  export function applyStartEncounter(
    state: CampaignState,
    intent: StampedIntent,
    ctx: ReducerContext,
  ): IntentResult {
    const parsed = StartEncounterPayloadSchema.safeParse(intent.payload);
    if (!parsed.success) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `StartEncounter rejected: ${parsed.error.message}`,
            intentId: intent.id,
          },
        ],
        errors: [{ code: 'invalid_payload', message: parsed.error.message }],
      };
    }

    if (state.encounter !== null) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `cannot start encounter: ${state.encounter.id} is already active`,
            intentId: intent.id,
          },
        ],
        errors: [
          {
            code: 'encounter_already_active',
            message: 'an encounter is already in progress',
          },
        ],
      };
    }

    // Materialize PC participants from DO-stamped character blobs.
    const pcParticipants: Participant[] = parsed.data.stampedPcs.map((stamped) => {
      const runtime = deriveCharacterRuntime(stamped.character, ctx.staticData);

      // Apply persisted stamina: null means fresh (use derived max).
      const currentStamina =
        stamped.character.currentStamina !== null
          ? Math.min(stamped.character.currentStamina, runtime.maxStamina)
          : runtime.maxStamina;

      // Recoveries: start with max, subtract how many were used before respite.
      const recoveriesUsed = stamped.character.recoveriesUsed;
      const recoveriesCurrent = Math.max(0, runtime.recoveriesMax - recoveriesUsed);

      return {
        id: `pc:${stamped.characterId}`,
        name: stamped.name,
        kind: 'pc',
        ownerId: stamped.ownerId,
        characterId: stamped.characterId,
        level: stamped.character.level,
        currentStamina,
        maxStamina: runtime.maxStamina,
        characteristics: runtime.characteristics,
        immunities: runtime.immunities.map((r) => ({
          type: r.kind as TypedResistance['type'],
          value: r.value,
        })),
        weaknesses: runtime.weaknesses.map((r) => ({
          type: r.kind as TypedResistance['type'],
          value: r.value,
        })),
        conditions: [],
        heroicResources: [],
        extras: [],
        surges: 0,
        recoveries: {
          current: recoveriesCurrent,
          max: runtime.recoveriesMax,
        },
        recoveryValue: runtime.recoveryValue,
        weaponDamageBonus: runtime.weaponDamageBonus,
      };
    });

    // Materialize monster participants from DO-stamped monster stat blocks.
    const monsterParticipants: Participant[] = parsed.data.stampedMonsters.flatMap((entry) => {
      const baseName = entry.nameOverride ?? entry.monster.name;
      return Array.from({ length: entry.quantity }, (_, i) => {
        const suffix = entry.quantity > 1 ? ` ${i + 1}` : '';
        return participantFromMonster(entry.monster, {
          id: ulid(),
          name: `${baseName}${suffix}`,
        });
      });
    });

    const allParticipants: Participant[] = [...pcParticipants, ...monsterParticipants];
    const encounterId = parsed.data.encounterId ?? ulid();

    const encounter: EncounterPhase = {
      id: encounterId,
      currentRound: 1,
      turnOrder: allParticipants.map((p) => p.id),
      activeParticipantId: null,
      turnState: {},
      malice: { current: 0, lastMaliciousStrikeRound: null },
    };

    return {
      state: {
        ...state,
        seq: state.seq + 1,
        // REPLACE the existing roster — the new encounter is the single source of truth.
        participants: allParticipants,
        encounter,
      },
      derived: [],
      log: [
        {
          kind: 'info',
          text: `encounter ${encounterId} started with ${pcParticipants.length} PC(s) and ${monsterParticipants.length} monster(s)`,
          intentId: intent.id,
        },
      ],
    };
  }
  ```

- [ ] **Step 3: Update `packages/rules/src/intents/kick-player.ts`**

  Remove the `placeholderCharacterIdsToRemove` handling. Replace the relevant section in `applyKickPlayer`:

  Remove the `placeholderCharacterIdsToRemove` destructuring and the block that filters placeholders. The function should become:

  ```ts
  import { KickPlayerPayloadSchema } from '@ironyard/shared';
  import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';

  export function applyKickPlayer(state: CampaignState, intent: StampedIntent): IntentResult {
    if (intent.actor.userId !== state.activeDirectorId) {
      return {
        state,
        derived: [],
        log: [{ kind: 'error', text: 'KickPlayer requires active director', intentId: intent.id }],
        errors: [
          { code: 'not_active_director', message: 'only the active director may kick players' },
        ],
      };
    }

    const parsed = KickPlayerPayloadSchema.safeParse(intent.payload);
    if (!parsed.success) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `KickPlayer rejected: ${parsed.error.message}`,
            intentId: intent.id,
          },
        ],
        errors: [{ code: 'invalid_payload', message: parsed.error.message }],
      };
    }

    const { userId, participantIdsToRemove } = parsed.data;

    if (userId === state.ownerId) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: 'KickPlayer rejected: cannot kick the campaign owner',
            intentId: intent.id,
          },
        ],
        errors: [
          {
            code: 'cannot_kick_owner',
            message: 'cannot kick the campaign owner from their own campaign',
          },
        ],
      };
    }

    const derived: DerivedIntent[] = participantIdsToRemove.map((participantId) => ({
      type: 'RemoveParticipant',
      campaignId: state.campaignId,
      actor: intent.actor,
      source: intent.source,
      causedBy: intent.id,
      payload: { participantId },
    }));

    const removedCount = participantIdsToRemove.length;

    return {
      state: { ...state, seq: state.seq + 1 },
      derived,
      log: [
        {
          kind: 'info',
          text: `player ${userId} kicked${removedCount ? `; removing ${removedCount} roster entry(ies)` : ''}`,
          intentId: intent.id,
        },
      ],
    };
  }
  ```

- [ ] **Step 4: Delete the BCIE rules intent file**

  ```bash
  rm packages/rules/src/intents/bring-character-into-encounter.ts
  ```

- [ ] **Step 5: Update `packages/rules/src/intents/index.ts`**

  Remove this line:

  ```ts
  export { applyBringCharacterIntoEncounter } from './bring-character-into-encounter';
  ```

- [ ] **Step 6: Typecheck the rules package**

  ```bash
  cd packages/rules && pnpm typecheck
  ```

  Expected: **PASS** after all the above edits. Fix any residual type errors before continuing.

---

## Task 5 — Rewrite `stampStartEncounter`; Update `stampKickPlayer` (Slice 2d)

**Files:**
- Modify: `apps/api/src/lobby-do-stampers.ts`

- [ ] **Step 1: Rewrite `stampStartEncounter` in `apps/api/src/lobby-do-stampers.ts`**

  Replace the existing `stampStartEncounter` function with:

  ```ts
  /**
   * StartEncounter — resolve character blobs from D1 for each characterId in the
   * payload, and resolve monster stat blocks from static data for each monster entry.
   * Stamps `stampedPcs` and `stampedMonsters` onto the payload.
   *
   * Characters not found in D1 are silently skipped (they simply won't appear
   * as participants). Monsters not found in static data are also skipped.
   * Does NOT reject — the reducer handles an empty stampedPcs/stampedMonsters gracefully.
   */
  export async function stampStartEncounter(
    intent: Intent & { timestamp: number },
    _campaignState: CampaignState,
    env: Bindings,
  ): Promise<StampResult> {
    const payload = intent.payload as MutablePayload;
    const characterIds = Array.isArray(payload.characterIds)
      ? (payload.characterIds as string[]).filter((id) => typeof id === 'string' && id.length > 0)
      : [];
    const monsters = Array.isArray(payload.monsters)
      ? (payload.monsters as Array<{ monsterId: string; quantity: number; nameOverride?: string }>)
      : [];

    // Resolve character blobs from D1.
    let stampedPcs: Array<{
      characterId: string;
      ownerId: string;
      name: string;
      character: unknown;
    }> = [];
    if (characterIds.length > 0) {
      const conn = db(env.DB);
      const rows = await conn
        .select({
          id: characters.id,
          ownerId: characters.ownerId,
          name: characters.name,
          data: characters.data,
        })
        .from(characters)
        .where(inArray(characters.id, characterIds))
        .all();

      stampedPcs = rows
        .map((row) => {
          try {
            const parsed = CharacterSchema.safeParse(JSON.parse(row.data));
            if (!parsed.success) return null;
            return {
              characterId: row.id,
              ownerId: row.ownerId,
              name: row.name,
              character: parsed.data,
            };
          } catch {
            return null;
          }
        })
        .filter((e): e is NonNullable<typeof e> => e !== null);
    }

    // Resolve monster stat blocks from static data.
    const stampedMonsters = monsters
      .map((entry) => {
        const monster = loadMonsterById(entry.monsterId);
        if (!monster) return null;
        return {
          monsterId: entry.monsterId,
          quantity: entry.quantity,
          ...(entry.nameOverride !== undefined ? { nameOverride: entry.nameOverride } : {}),
          monster,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    payload.stampedPcs = stampedPcs;
    payload.stampedMonsters = stampedMonsters;
    return null;
  }
  ```

- [ ] **Step 2: Delete `stampBringCharacterIntoEncounter` from `apps/api/src/lobby-do-stampers.ts`**

  Remove the entire `stampBringCharacterIntoEncounter` function (approximately lines 482–510).

- [ ] **Step 3: Update `stampKickPlayer` in `apps/api/src/lobby-do-stampers.ts`**

  Remove the `placeholderCharacterIdsToRemove` stamping block. The function should end after stamping `participantIdsToRemove`:

  ```ts
  // In stampKickPlayer, remove the "Also collect characterIds for any pc-placeholder" block
  // that sets payload.placeholderCharacterIdsToRemove. Only stamp participantIdsToRemove.
  payload.participantIdsToRemove = participantIdsToRemove;
  return null;
  ```

  Also remove the `PcPlaceholder` import from the top of the file since it's no longer needed.

- [ ] **Step 4: Remove BCIE from the `stampIntent` dispatch switch**

  Delete the `case 'BringCharacterIntoEncounter':` branch:

  ```ts
  // Remove:
  case 'BringCharacterIntoEncounter':
    return stampBringCharacterIntoEncounter(intent, campaignState, env);
  ```

- [ ] **Step 5: Typecheck the api package**

  ```bash
  cd apps/api && pnpm typecheck
  ```

  Expected: **PASS**. Fix any residual import or type errors.

---

## Task 6 — Rewrite Tests; Delete BCIE Test (Slice 2e)

**Files:**
- Delete: `packages/rules/tests/intents/bring-character-into-encounter.spec.ts`
- Rewrite: `packages/rules/tests/start-encounter.spec.ts`
- Rewrite: `apps/api/tests/lobby-do-pc-materialization.spec.ts`

- [ ] **Step 1: Delete the BCIE test**

  ```bash
  rm packages/rules/tests/intents/bring-character-into-encounter.spec.ts
  ```

- [ ] **Step 2: Write failing tests — rewrite `packages/rules/tests/start-encounter.spec.ts`**

  ```ts
  import type { Character, Participant } from '@ironyard/shared';
  import { describe, expect, it } from 'vitest';
  import {
    type CampaignState,
    type ReducerContext,
    type StampedIntent,
    applyIntent,
    emptyCampaignState,
    isParticipant,
  } from '../src/index';
  import { buildBundleWithFury, buildFuryL1Fixture } from './fixtures/character-runtime';

  const T = 1_700_000_000_000;
  const CAMPAIGN = 'sess_start_enc';

  function makeIntent(payload: unknown): StampedIntent {
    return {
      id: `i_${Math.random().toString(36).slice(2)}`,
      campaignId: CAMPAIGN,
      actor: { userId: 'user-owner', role: 'director' },
      timestamp: T,
      source: 'manual',
      type: 'StartEncounter',
      payload,
      causedBy: undefined,
    };
  }

  function baseState(overrides: Partial<CampaignState> = {}): CampaignState {
    return { ...emptyCampaignState(CAMPAIGN, 'user-owner'), ...overrides };
  }

  describe('applyStartEncounter — new atomic payload shape', () => {
    it('materializes a PC from stampedPcs with ownerId and characterId', () => {
      const character = buildFuryL1Fixture();
      const ctx: ReducerContext = { staticData: buildBundleWithFury() };
      const s = baseState();

      const result = applyIntent(
        s,
        makeIntent({
          characterIds: ['c1'],
          monsters: [],
          stampedPcs: [{ characterId: 'c1', name: 'Hero', ownerId: 'user-1', character }],
          stampedMonsters: [],
        }),
        ctx,
      );

      expect(result.errors).toBeUndefined();
      expect(result.state.encounter).not.toBeNull();

      const pc = result.state.participants.find(
        (p): p is Participant => isParticipant(p) && p.kind === 'pc',
      );
      expect(pc).toBeDefined();
      expect(pc?.ownerId).toBe('user-1');
      expect(pc?.characterId).toBe('c1');
      expect(pc?.id).toBe('pc:c1');
    });

    it('applies persisted currentStamina from the character blob (clamped to max)', () => {
      const character = buildFuryL1Fixture({ currentStamina: 10 });
      const ctx: ReducerContext = { staticData: buildBundleWithFury() };

      const result = applyIntent(
        baseState(),
        makeIntent({
          characterIds: ['c1'],
          monsters: [],
          stampedPcs: [{ characterId: 'c1', name: 'Hero', ownerId: 'u1', character }],
          stampedMonsters: [],
        }),
        ctx,
      );

      const pc = result.state.participants.find(
        (p): p is Participant => isParticipant(p) && p.kind === 'pc',
      );
      expect(pc?.currentStamina).toBe(10);
    });

    it('uses derived maxStamina when character.currentStamina is null (fresh encounter)', () => {
      // buildFuryL1Fixture has currentStamina: null by default
      const character = buildFuryL1Fixture({ currentStamina: null });
      const ctx: ReducerContext = { staticData: buildBundleWithFury() };

      const result = applyIntent(
        baseState(),
        makeIntent({
          characterIds: ['c1'],
          monsters: [],
          stampedPcs: [{ characterId: 'c1', name: 'Hero', ownerId: 'u1', character }],
          stampedMonsters: [],
        }),
        ctx,
      );

      const pc = result.state.participants.find(
        (p): p is Participant => isParticipant(p) && p.kind === 'pc',
      );
      // Fury L1 (buildBundleWithFury): startingStamina=21, staminaPerLevel=9, kit wrecker staminaBonus=0
      expect(pc?.currentStamina).toBe(21);
      expect(pc?.maxStamina).toBe(21);
    });

    it('applies recoveriesUsed to compute recoveries.current', () => {
      // 3 recoveries used out of 10 → 7 remaining
      const character = buildFuryL1Fixture({ recoveriesUsed: 3 });
      const ctx: ReducerContext = { staticData: buildBundleWithFury() };

      const result = applyIntent(
        baseState(),
        makeIntent({
          characterIds: ['c1'],
          monsters: [],
          stampedPcs: [{ characterId: 'c1', name: 'Hero', ownerId: 'u1', character }],
          stampedMonsters: [],
        }),
        ctx,
      );

      const pc = result.state.participants.find(
        (p): p is Participant => isParticipant(p) && p.kind === 'pc',
      );
      // buildBundleWithFury: recoveries = 10 (from class fixture)
      expect(pc?.recoveries.max).toBe(10);
      expect(pc?.recoveries.current).toBe(7);
    });

    it('materializes monsters from stampedMonsters (respects quantity)', () => {
      const monster = {
        id: 'goblin',
        name: 'Goblin',
        level: 1,
        roles: [],
        ancestry: [],
        ev: { ev: 2 },
        stamina: { base: 15 },
        speed: 5,
        movement: [],
        size: '1S',
        stability: 0,
        freeStrike: 2,
        characteristics: { might: 0, agility: 1, reason: -1, intuition: 0, presence: -1 },
        immunities: [],
        weaknesses: [],
        abilities: [],
      };

      const result = applyIntent(
        baseState(),
        makeIntent({
          characterIds: [],
          monsters: [{ monsterId: 'goblin', quantity: 3 }],
          stampedPcs: [],
          stampedMonsters: [{ monsterId: 'goblin', quantity: 3, monster }],
        }),
      );

      expect(result.errors).toBeUndefined();
      const monsters = result.state.participants.filter(
        (p): p is Participant => isParticipant(p) && p.kind === 'monster',
      );
      expect(monsters).toHaveLength(3);
      expect(monsters[0].name).toBe('Goblin 1');
      expect(monsters[1].name).toBe('Goblin 2');
      expect(monsters[2].name).toBe('Goblin 3');
    });

    it('REPLACES the existing participant roster (no duplicate carry-over)', () => {
      // Previous encounter had a monster lingering in participants.
      const oldMonster: Participant = {
        id: 'old-monster-1',
        name: 'Old Orc',
        kind: 'monster',
        level: 3,
        currentStamina: 0,
        maxStamina: 40,
        characteristics: { might: 2, agility: 0, reason: -1, intuition: 0, presence: -1 },
        immunities: [],
        weaknesses: [],
        conditions: [],
        heroicResources: [],
        extras: [],
        surges: 0,
        recoveries: { current: 0, max: 0 },
        recoveryValue: 0,
        ownerId: null,
        characterId: null,
        weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
      };
      const s = baseState({ participants: [oldMonster] });

      const result = applyIntent(
        s,
        makeIntent({
          characterIds: [],
          monsters: [],
          stampedPcs: [],
          stampedMonsters: [],
        }),
      );

      expect(result.state.participants).toHaveLength(0);
    });

    it('rejects if an encounter is already active', () => {
      const s = baseState({
        encounter: {
          id: 'enc-1',
          currentRound: 1,
          turnOrder: [],
          activeParticipantId: null,
          turnState: {},
          malice: { current: 0, lastMaliciousStrikeRound: null },
        },
      });

      const result = applyIntent(s, makeIntent({ characterIds: [], monsters: [], stampedPcs: [], stampedMonsters: [] }));

      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'encounter_already_active' })]),
      );
    });

    it('accepts an empty payload (no PCs, no monsters) — valid but empty encounter', () => {
      const result = applyIntent(
        baseState(),
        makeIntent({ characterIds: [], monsters: [], stampedPcs: [], stampedMonsters: [] }),
      );

      expect(result.errors).toBeUndefined();
      expect(result.state.encounter).not.toBeNull();
      expect(result.state.participants).toHaveLength(0);
    });
  });
  ```

- [ ] **Step 3: Run the new tests — expect them to FAIL first (verify the test harness works)**

  ```bash
  cd packages/rules && pnpm test -- start-encounter
  ```

  Expected: tests that reference the new payload shape should fail with "unexpected field" or shape mismatch until the reducer is correct. If the reducer was already rewritten in Task 4, these should **PASS** now.

- [ ] **Step 4: Rewrite `apps/api/tests/lobby-do-pc-materialization.spec.ts`**

  Replace the file content with tests for the new stamper:

  ```ts
  // Tests that applyIntent(StartEncounter) materializes PCs from stampedPcs
  // with correct stamina and recoveries, and handles recoveriesUsed.

  import { applyIntent, emptyCampaignState } from '@ironyard/rules';
  import type { CampaignState, ReducerContext } from '@ironyard/rules';
  import { describe, expect, it } from 'vitest';

  const FURY_CLASS_ID = 'fury';

  const furyBundle: ReducerContext['staticData'] = {
    ancestries: new Map(),
    careers: new Map(),
    classes: new Map([
      [
        FURY_CLASS_ID,
        {
          id: FURY_CLASS_ID,
          name: 'Fury',
          heroicResource: 'wrath',
          startingStamina: 21,
          staminaPerLevel: 9,
          recoveries: 12,
          characteristicArrays: [],
          lockedCharacteristics: [],
          subclasses: [],
          kitTypes: [],
          levelFeatures: {},
        } as unknown as ReducerContext['staticData']['classes'] extends Map<string, infer V>
          ? V
          : never,
      ],
    ]),
    kits: new Map(),
    abilities: new Map(),
    items: new Map(),
    titles: new Map(),
  };

  const baseCharacter = {
    level: 1,
    classId: FURY_CLASS_ID,
    kitId: null,
    ancestryId: null,
    characteristicArray: null,
    characteristicSlots: null,
    culture: {},
    careerChoices: {},
    levelChoices: {},
    subclassId: null,
    careerId: null,
    complicationId: null,
    titleId: null,
    inventory: [],
    campaignId: null,
    xp: 0,
    currentStamina: null,
    recoveriesUsed: 0,
  };

  function makeState(overrides: Partial<CampaignState> = {}): CampaignState {
    return { ...emptyCampaignState('campaign-test', 'owner-1'), ...overrides };
  }

  function makeIntent(stampedPcs: unknown[]) {
    return {
      id: 'i-test',
      campaignId: 'campaign-test',
      actor: { userId: 'owner-1', role: 'director' as const },
      timestamp: 1_700_000_000_000,
      source: 'manual' as const,
      type: 'StartEncounter',
      payload: {
        characterIds: stampedPcs.map((p: any) => p.characterId),
        monsters: [],
        stampedPcs,
        stampedMonsters: [],
      },
    };
  }

  describe('StartEncounter PC materialization (new atomic shape)', () => {
    it('materializes a PC with maxStamina > 0 when class data is in the bundle', () => {
      const result = applyIntent(
        makeState(),
        makeIntent([{ characterId: 'c1', ownerId: 'owner-1', name: 'Test Fury', character: baseCharacter }]),
        { staticData: furyBundle },
      );

      expect(result.errors).toBeUndefined();
      const pc = result.state.participants.find((p) => p.kind === 'pc' && p.id === 'pc:c1');
      expect(pc).toBeDefined();
      if (!pc || pc.kind !== 'pc') throw new Error('not a pc');
      expect(pc.maxStamina).toBe(21);
      expect(pc.recoveries.max).toBe(12);
    });

    it('applies persisted currentStamina from character blob', () => {
      const character = { ...baseCharacter, currentStamina: 8 };
      const result = applyIntent(
        makeState(),
        makeIntent([{ characterId: 'c1', ownerId: 'owner-1', name: 'Hero', character }]),
        { staticData: furyBundle },
      );
      const pc = result.state.participants.find((p) => p.kind === 'pc');
      if (!pc || pc.kind !== 'pc') throw new Error('not a pc');
      expect(pc.currentStamina).toBe(8);
    });

    it('clamps persisted currentStamina to maxStamina if over', () => {
      const character = { ...baseCharacter, currentStamina: 999 };
      const result = applyIntent(
        makeState(),
        makeIntent([{ characterId: 'c1', ownerId: 'owner-1', name: 'Hero', character }]),
        { staticData: furyBundle },
      );
      const pc = result.state.participants.find((p) => p.kind === 'pc');
      if (!pc || pc.kind !== 'pc') throw new Error('not a pc');
      expect(pc.currentStamina).toBe(21); // clamped to maxStamina
    });

    it('applies recoveriesUsed to compute recoveries.current (12 max - 4 used = 8)', () => {
      const character = { ...baseCharacter, recoveriesUsed: 4 };
      const result = applyIntent(
        makeState(),
        makeIntent([{ characterId: 'c1', ownerId: 'owner-1', name: 'Hero', character }]),
        { staticData: furyBundle },
      );
      const pc = result.state.participants.find((p) => p.kind === 'pc');
      if (!pc || pc.kind !== 'pc') throw new Error('not a pc');
      expect(pc.recoveries.current).toBe(8);
      expect(pc.recoveries.max).toBe(12);
    });

    it('replaces any existing participants (no carry-over from previous encounter)', () => {
      const stateWithOldMonster = makeState({
        participants: [
          {
            id: 'old-m1',
            name: 'Old Monster',
            kind: 'monster',
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
            ownerId: null,
            characterId: null,
            weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
          },
        ],
      });

      const result = applyIntent(
        stateWithOldMonster,
        { id: 'i', campaignId: 'campaign-test', actor: { userId: 'owner-1', role: 'director' as const },
          timestamp: 0, source: 'manual' as const, type: 'StartEncounter',
          payload: { characterIds: [], monsters: [], stampedPcs: [], stampedMonsters: [] } },
      );

      // Old monster should be gone — StartEncounter replaces the roster.
      expect(result.state.participants.find((p) => p.id === 'old-m1')).toBeUndefined();
    });
  });
  ```

- [ ] **Step 5: Run all rules + api tests**

  ```bash
  cd packages/rules && pnpm test
  cd apps/api && pnpm test
  ```

  Expected: **PASS** after the above rewrites. Fix failures before continuing.

- [ ] **Step 6: Full typecheck + lint — Slice 2 green gate**

  ```bash
  pnpm typecheck && pnpm lint
  ```

  Expected: **PASS** repo-wide.

- [ ] **Step 7: Commit Slice 2**

  ```bash
  git add -p   # stage all Slice 2 changes selectively
  git commit -m "feat(rules): atomic StartEncounter — replaces BCIE + PcPlaceholder two-step"
  ```

---

## Task 7 — EncounterBuilder Rewrite (Slice 3a)

**Files:**
- Modify: `apps/web/src/pages/EncounterBuilder.tsx`

- [ ] **Step 1: Replace `EncounterBuilder.tsx` with the local-draft implementation**

  Key design decisions locked in before writing:
  - `selectedCharacterIds: Set<string>` — defaults to all approved character IDs on load
  - `selectedMonsters: Array<{ monsterId: string; quantity: number }>` — local pick list
  - Templates are loaded into `selectedMonsters` (not dispatched as `LoadEncounterTemplate`)
  - `handleStartFight` dispatches `StartEncounter` with full payload, then `StartRound`, then navigates
  - Remove `QuickPcForm` (character checklist replaces it)
  - `handleAddMonster` increments local monster quantity (merges by monsterId)

  ```tsx
  import type {
    CharacterResponse,
    EncounterTemplate,
    Monster,
    StartEncounterPayload,
    StartRoundPayload,
  } from '@ironyard/shared';
  import { IntentTypes, ulid } from '@ironyard/shared';
  import { Link, useNavigate, useParams } from '@tanstack/react-router';
  import { useEffect, useMemo, useState } from 'react';
  import { buildIntent } from '../api/dispatch';
  import { useCreateEncounterTemplate, useDeleteEncounterTemplate } from '../api/mutations';
  import {
    useApprovedCharactersFull,
    useCampaign,
    useEncounterTemplates,
    useMe,
    useMonsters,
  } from '../api/queries';
  import { useSessionSocket } from '../ws/useSessionSocket';

  type MonsterPick = { monsterId: string; quantity: number };

  export function EncounterBuilder() {
    const { id: sessionId } = useParams({ from: '/campaigns/$id/build' });
    const navigate = useNavigate();
    const me = useMe();
    const session = useCampaign(sessionId);
    const { status, dispatch } = useSessionSocket(sessionId);
    const templates = useEncounterTemplates(sessionId);
    const createTemplate = useCreateEncounterTemplate(sessionId);
    const deleteTemplate = useDeleteEncounterTemplate(sessionId);
    const { data: approvedChars, isLoading: approvedLoading } = useApprovedCharactersFull(sessionId);

    // Local encounter-draft state.
    const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<string>>(new Set());
    const [selectedMonsters, setSelectedMonsters] = useState<MonsterPick[]>([]);
    const [didInitChars, setDidInitChars] = useState(false);
    const [saveModalOpen, setSaveModalOpen] = useState(false);
    const [templateName, setTemplateName] = useState('');

    // Default-check all approved characters once they load.
    useEffect(() => {
      if (!approvedLoading && approvedChars.length > 0 && !didInitChars) {
        setSelectedCharacterIds(new Set(approvedChars.map((c) => c.id)));
        setDidInitChars(true);
      }
    }, [approvedLoading, approvedChars, didInitChars]);

    const monsters = useMonsters();

    const monsterById = useMemo<Map<string, Monster>>(() => {
      if (!monsters.data) return new Map();
      return new Map(monsters.data.monsters.map((m) => [m.id, m]));
    }, [monsters.data]);

    if (me.isLoading || session.isLoading) {
      return (
        <main className="mx-auto max-w-6xl p-6">
          <p className="text-neutral-400">Loading…</p>
        </main>
      );
    }

    if (!me.data) {
      return (
        <main className="mx-auto max-w-6xl p-6">
          <p className="text-neutral-400">
            Not signed in.{' '}
            <Link to="/" className="underline">
              Go home
            </Link>
            .
          </p>
        </main>
      );
    }

    if (session.error || !session.data) {
      return (
        <main className="mx-auto max-w-6xl p-6 space-y-2">
          <p className="text-rose-400">
            {(session.error as Error)?.message ?? 'Campaign not found.'}
          </p>
          <Link to="/" className="underline text-neutral-300">
            Back home
          </Link>
        </main>
      );
    }

    const actor = {
      userId: me.data.user.id,
      role: (session.data.isDirector ? 'director' : 'player') as 'director' | 'player',
    };
    const isDirector = session.data.isDirector;
    const wsOpen = status === 'open';

    const totalParticipants = selectedCharacterIds.size + selectedMonsters.reduce((s, m) => s + m.quantity, 0);

    const handleAddMonster = (monster: Monster) => {
      setSelectedMonsters((prev) => {
        const existing = prev.find((m) => m.monsterId === monster.id);
        if (existing) {
          return prev.map((m) =>
            m.monsterId === monster.id ? { ...m, quantity: m.quantity + 1 } : m,
          );
        }
        return [...prev, { monsterId: monster.id, quantity: 1 }];
      });
    };

    const handleRemoveMonster = (monsterId: string) => {
      setSelectedMonsters((prev) => prev.filter((m) => m.monsterId !== monsterId));
    };

    const handleToggleCharacter = (charId: string) => {
      setSelectedCharacterIds((prev) => {
        const next = new Set(prev);
        if (next.has(charId)) next.delete(charId);
        else next.add(charId);
        return next;
      });
    };

    const handleLoadTemplate = (template: EncounterTemplate) => {
      // Apply template monster list into local draft state (client-side only,
      // no WS intent dispatched — templates are now a UI convenience).
      setSelectedMonsters((prev) => {
        const next = [...prev];
        for (const entry of template.data.monsters) {
          const idx = next.findIndex((m) => m.monsterId === entry.monsterId);
          if (idx >= 0) {
            next[idx] = { ...next[idx], quantity: next[idx].quantity + entry.quantity };
          } else {
            next.push({ monsterId: entry.monsterId, quantity: entry.quantity });
          }
        }
        return next;
      });
    };

    const handleSaveTemplate = (e: React.FormEvent) => {
      e.preventDefault();
      const name = templateName.trim();
      if (!name || selectedMonsters.length === 0) return;
      createTemplate.mutate(
        { name, data: { monsters: selectedMonsters } },
        {
          onSuccess: () => {
            setSaveModalOpen(false);
            setTemplateName('');
          },
        },
      );
    };

    const handleStartFight = () => {
      if (totalParticipants === 0 || !wsOpen) return;

      const startPayload: StartEncounterPayload = {
        encounterId: ulid(),
        characterIds: Array.from(selectedCharacterIds),
        monsters: selectedMonsters.filter((m) => m.quantity > 0),
        stampedPcs: [],    // DO fills these in
        stampedMonsters: [], // DO fills these in
      };

      const startOk = dispatch(
        buildIntent({
          campaignId: sessionId,
          type: IntentTypes.StartEncounter,
          payload: startPayload,
          actor,
        }),
      );
      if (!startOk) return;

      const roundOk = dispatch(
        buildIntent({
          campaignId: sessionId,
          type: IntentTypes.StartRound,
          payload: {} as StartRoundPayload,
          actor,
        }),
      );

      if (roundOk) {
        navigate({ to: '/campaigns/$id/play', params: { id: sessionId } });
      }
    };

    return (
      <main className="mx-auto max-w-6xl p-4 sm:p-6 space-y-5">
        <header className="flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold">Build encounter</h1>
            <p className="text-xs text-neutral-500 mt-1">
              {session.data.name}
              <span className="ml-2 align-middle">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    status === 'open'
                      ? 'bg-emerald-900/40 text-emerald-300'
                      : status === 'connecting'
                        ? 'bg-amber-900/40 text-amber-300'
                        : 'bg-rose-900/40 text-rose-300'
                  }`}
                >
                  {status}
                </span>
              </span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/campaigns/$id"
              params={{ id: sessionId }}
              className="text-sm text-neutral-400 hover:text-neutral-200"
            >
              ← Lobby
            </Link>
            {isDirector && selectedMonsters.length > 0 && (
              <button
                type="button"
                onClick={() => setSaveModalOpen(true)}
                className="min-h-11 rounded-md border border-neutral-700 bg-neutral-900 text-sm px-3 py-2 hover:bg-neutral-800"
              >
                Save as template
              </button>
            )}
            <button
              type="button"
              onClick={handleStartFight}
              disabled={totalParticipants === 0 || !wsOpen}
              className="min-h-11 rounded-md bg-emerald-500 text-neutral-950 px-4 py-2 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start the fight →
            </button>
          </div>
        </header>

        {/* Save-as-template modal */}
        {saveModalOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-5 w-full max-w-sm space-y-4">
              <h2 className="font-semibold">Save as encounter template</h2>
              <p className="text-xs text-neutral-400">
                Saves the {selectedMonsters.reduce((s, m) => s + m.quantity, 0)} monster(s) in the
                draft.
              </p>
              <form onSubmit={handleSaveTemplate} className="space-y-3">
                <label className="block text-sm text-neutral-300">
                  Template name
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Goblin patrol"
                    className="mt-1 w-full min-h-11 rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 outline-none focus:border-neutral-500"
                  />
                </label>
                {createTemplate.error && (
                  <p className="text-sm text-rose-400">{(createTemplate.error as Error).message}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={createTemplate.isPending || !templateName.trim()}
                    className="flex-1 min-h-11 rounded-md bg-neutral-100 text-neutral-900 font-medium disabled:opacity-60"
                  >
                    {createTemplate.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSaveModalOpen(false);
                      setTemplateName('');
                    }}
                    className="min-h-11 px-4 rounded-md border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Monster picker */}
          <section className="lg:col-span-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
            <MonsterPicker onAdd={handleAddMonster} />
          </section>

          {/* Draft preview */}
          <section className="lg:col-span-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
            <DraftPreview
              selectedCharacters={approvedChars.filter((c) => selectedCharacterIds.has(c.id))}
              selectedMonsters={selectedMonsters}
              monsterById={monsterById}
              onRemoveMonster={handleRemoveMonster}
            />
          </section>

          {/* Character checklist + Templates */}
          <section className="lg:col-span-4 space-y-4">
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <CharacterChecklist
                characters={approvedChars}
                isLoading={approvedLoading}
                selectedIds={selectedCharacterIds}
                onToggle={handleToggleCharacter}
              />
            </div>
            {isDirector && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
                <TemplatePicker
                  templates={templates.data ?? []}
                  isLoading={templates.isLoading}
                  onLoad={handleLoadTemplate}
                  onDelete={(tid) => deleteTemplate.mutate(tid)}
                  disabled={!wsOpen}
                />
              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  function CharacterChecklist({
    characters,
    isLoading,
    selectedIds,
    onToggle,
  }: {
    characters: CharacterResponse[];
    isLoading: boolean;
    selectedIds: Set<string>;
    onToggle: (id: string) => void;
  }) {
    return (
      <div className="space-y-3">
        <h2 className="font-semibold">Characters</h2>
        {isLoading && <p className="text-sm text-neutral-400">Loading…</p>}
        {!isLoading && characters.length === 0 && (
          <p className="text-sm text-neutral-500">No approved characters yet.</p>
        )}
        <ul className="space-y-1">
          {characters.map((cr) => {
            const checked = selectedIds.has(cr.id);
            return (
              <li
                key={cr.id}
                className="flex items-center gap-3 rounded-md bg-neutral-900/60 px-3 py-2"
              >
                <input
                  type="checkbox"
                  id={`char-${cr.id}`}
                  checked={checked}
                  onChange={() => onToggle(cr.id)}
                  className="h-5 w-5 min-w-[20px] rounded accent-emerald-500"
                />
                <label htmlFor={`char-${cr.id}`} className="flex-1 text-sm cursor-pointer">
                  {cr.name}
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  function DraftPreview({
    selectedCharacters,
    selectedMonsters,
    monsterById,
    onRemoveMonster,
  }: {
    selectedCharacters: CharacterResponse[];
    selectedMonsters: MonsterPick[];
    monsterById: Map<string, Monster>;
    onRemoveMonster: (monsterId: string) => void;
  }) {
    const total = selectedCharacters.length + selectedMonsters.reduce((s, m) => s + m.quantity, 0);
    return (
      <div className="space-y-3">
        <header className="flex items-baseline justify-between">
          <h2 className="font-semibold">Encounter Draft</h2>
          <span className="text-xs text-neutral-500">{total} participant{total !== 1 ? 's' : ''}</span>
        </header>

        {total === 0 && (
          <div className="rounded-md border border-dashed border-neutral-800 px-4 py-6 text-center">
            <p className="text-sm text-neutral-400">Empty draft.</p>
            <p className="text-xs text-neutral-500 mt-1">
              Check characters and add monsters to build the encounter.
            </p>
          </div>
        )}

        {selectedCharacters.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">PCs</p>
            {selectedCharacters.map((cr) => (
              <div
                key={cr.id}
                className="flex items-center gap-3 rounded-md bg-neutral-900/60 px-3 py-2"
              >
                <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold bg-sky-900/40 text-sky-200">
                  PC
                </span>
                <span className="flex-1 text-sm truncate">{cr.name}</span>
              </div>
            ))}
          </div>
        )}

        {selectedMonsters.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Monsters</p>
            {selectedMonsters.map((pick) => {
              const monster = monsterById.get(pick.monsterId);
              return (
                <div
                  key={pick.monsterId}
                  className="flex items-center gap-3 rounded-md bg-neutral-900/60 px-3 py-2"
                >
                  <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold bg-rose-900/40 text-rose-200">
                    M
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{monster?.name ?? pick.monsterId}</p>
                    <p className="text-xs text-neutral-500 font-mono tabular-nums">×{pick.quantity}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveMonster(pick.monsterId)}
                    className="min-h-11 w-9 flex items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-800 hover:text-rose-400"
                    aria-label={`Remove ${monster?.name ?? pick.monsterId}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function TemplatePicker({
    templates,
    isLoading,
    onLoad,
    onDelete,
    disabled,
  }: {
    templates: EncounterTemplate[];
    isLoading: boolean;
    onLoad: (t: EncounterTemplate) => void;
    onDelete: (id: string) => void;
    disabled: boolean;
  }) {
    return (
      <div className="space-y-3">
        <h2 className="font-semibold">Saved encounters</h2>
        {isLoading && <p className="text-sm text-neutral-400">Loading…</p>}
        {!isLoading && templates.length === 0 && (
          <p className="text-sm text-neutral-500">
            No saved templates. Build a monster roster and click "Save as template".
          </p>
        )}
        <ul className="space-y-1">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-md bg-neutral-900/60 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{t.name}</p>
                <p className="text-xs text-neutral-500">
                  {t.data.monsters.reduce((sum, m) => sum + m.quantity, 0)} monsters
                </p>
              </div>
              <button
                type="button"
                onClick={() => onLoad(t)}
                disabled={disabled}
                className="min-h-11 px-3 rounded-md bg-neutral-700 text-sm hover:bg-neutral-600 disabled:opacity-50"
              >
                Load
              </button>
              <button
                type="button"
                onClick={() => onDelete(t.id)}
                className="min-h-11 w-9 flex items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-800 hover:text-rose-400"
                aria-label="Delete template"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  function MonsterPicker({ onAdd }: { onAdd: (m: Monster) => void }) {
    const monsters = useMonsters();
    const [query, setQuery] = useState('');

    const filtered = useMemo<Monster[]>(() => {
      if (!monsters.data) return [];
      const q = query.trim().toLowerCase();
      const rows = q
        ? monsters.data.monsters.filter((m) => m.name.toLowerCase().includes(q))
        : monsters.data.monsters;
      return [...rows].sort((a, b) => a.name.localeCompare(b.name) || a.level - b.level);
    }, [monsters.data, query]);

    return (
      <div className="space-y-3">
        <header className="flex items-baseline justify-between">
          <h2 className="font-semibold">Monsters</h2>
          {monsters.data && (
            <span className="text-xs text-neutral-500">{monsters.data.count} total</span>
          )}
        </header>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name"
          className="w-full min-h-11 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:border-neutral-600"
        />
        {monsters.isLoading && <p className="text-neutral-400 text-sm">Loading monsters…</p>}
        {monsters.error && (
          <p className="text-rose-400 text-sm">{(monsters.error as Error).message}</p>
        )}
        {monsters.data && (
          <>
            <p className="text-xs text-neutral-500">
              Showing {filtered.length}
              {filtered.length !== monsters.data.count && ` of ${monsters.data.count}`}
            </p>
            <ul className="space-y-1 max-h-[28rem] overflow-y-auto pr-1">
              {filtered.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onAdd(m)}
                    className="w-full min-h-11 flex items-center justify-between gap-3 rounded-md bg-neutral-900/60 hover:bg-neutral-800 active:bg-neutral-700 px-3 py-2 text-left transition-colors"
                  >
                    <span className="truncate">{m.name}</span>
                    <span className="shrink-0 rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs font-mono tabular-nums">
                      L{m.level}
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="text-sm text-neutral-500 px-1 py-2">No matches.</li>
              )}
            </ul>
          </>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 2: Typecheck the web package**

  ```bash
  cd apps/web && pnpm typecheck
  ```

  Expected: **PASS**. Fix any import or type errors.

---

## Task 8 — CampaignView Cleanup (Slice 3b)

**Files:**
- Modify: `apps/web/src/pages/CampaignView.tsx`

- [ ] **Step 1: Remove `BringCharacterIntoEncounterPayload` import from `CampaignView.tsx`**

  Remove from the import block at the top:

  ```ts
  // Remove:
  BringCharacterIntoEncounterPayload,
  ```

- [ ] **Step 2: Remove `lobbyPlaceholderCharacterIds` derivation from `CampaignView`**

  Remove these lines (around lines 57–61):

  ```ts
  // Remove:
  const lobbyPlaceholderCharacterIds = new Set<string>(
    (activeEncounter?.participants ?? []).flatMap((p) =>
      p.kind === 'pc-placeholder' ? [p.characterId] : [],
    ),
  );
  ```

- [ ] **Step 3: Remove the `lobbyPlaceholderCharacterIds` prop from the `<ApprovedRosterPanel>` call**

  Around line 258, remove the prop:

  ```tsx
  // Before:
  <ApprovedRosterPanel
    ...
    lobbyPlaceholderCharacterIds={lobbyPlaceholderCharacterIds}
  />

  // After:
  <ApprovedRosterPanel
    campaignId={id}
    actor={actor}
    dispatch={dispatch}
    wsOpen={status === 'open'}
    isDirector={isDirector}
  />
  ```

- [ ] **Step 4: Rewrite the `ApprovedRosterPanel` function**

  Remove the `handleBring`, `lobbyPlaceholderCharacterIds` prop, the "Bring into lobby" button, and the "in lobby" badge. The panel becomes a simple approved character list:

  ```tsx
  function ApprovedRosterPanel({
    campaignId,
    actor,
    dispatch,
    wsOpen,
    isDirector,
  }: {
    campaignId: string;
    actor: { userId: string; role: 'director' | 'player' };
    dispatch: (intent: unknown) => boolean;
    wsOpen: boolean;
    isDirector: boolean;
  }) {
    const approved = useCampaignCharacters(campaignId, 'approved');
    const items = useItems();
    const [pushItemOpen, setPushItemOpen] = useState(false);

    const handlePushItem = (targetCharacterId: string, itemId: string, quantity: number) => {
      const payload = { targetCharacterId, itemId, quantity } as unknown as PushItemPayload;
      dispatch(
        buildIntent({
          campaignId,
          type: IntentTypes.PushItem,
          payload,
          actor,
        }),
      );
      setPushItemOpen(false);
    };

    const charactersForModal =
      approved.data?.map((cc) => ({
        id: cc.characterId,
        name: `${cc.characterId.slice(0, 8)}…`,
      })) ?? [];

    if (approved.isLoading) return null;

    return (
      <section className="rounded-lg border border-neutral-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Approved roster ({approved.data?.length ?? 0})</h2>
          {isDirector && (
            <button
              type="button"
              onClick={() => setPushItemOpen(true)}
              disabled={!wsOpen || !items.data || (approved.data?.length ?? 0) === 0}
              className="min-h-11 px-3 rounded-md border border-neutral-700 text-xs hover:bg-neutral-800 disabled:opacity-50"
            >
              Push item to player
            </button>
          )}
        </div>
        {(!approved.data || approved.data.length === 0) && (
          <p className="text-xs text-neutral-500">No approved characters yet.</p>
        )}
        {approved.data && approved.data.length > 0 && (
          <ul className="space-y-1">
            {approved.data.map((cc) => (
              <li
                key={cc.characterId}
                className="flex items-center gap-3 rounded-md bg-neutral-900/60 px-3 py-2"
              >
                <span className="flex-1 text-sm font-mono text-neutral-300">
                  {cc.characterId.slice(0, 8)}…
                </span>
              </li>
            ))}
          </ul>
        )}
        {pushItemOpen && items.data && (
          <PushItemModal
            items={items.data}
            characters={charactersForModal}
            onPush={handlePushItem}
            onClose={() => setPushItemOpen(false)}
          />
        )}
      </section>
    );
  }
  ```

- [ ] **Step 5: Typecheck web**

  ```bash
  cd apps/web && pnpm typecheck
  ```

  Expected: **PASS**.

---

## Task 9 — `useSessionSocket` Cleanup + Slice 3 Green Gate (Slice 3c)

**Files:**
- Modify: `apps/web/src/ws/useSessionSocket.ts`

- [ ] **Step 1: Remove `PcPlaceholderEntry` type and simplify `RosterEntry`**

  Remove:
  ```ts
  // Remove this block:
  export type PcPlaceholderEntry = {
    kind: 'pc-placeholder';
    characterId: string;
    ownerId: string;
    position: number;
  };

  export type RosterEntry = Participant | PcPlaceholderEntry;
  ```

  Replace with:
  ```ts
  export type RosterEntry = Participant;
  ```

- [ ] **Step 2: Simplify `isParticipantEntry`**

  Since `RosterEntry = Participant`, `isParticipantEntry` is now trivially true for any entry. Keep it for call-site compatibility but simplify:

  ```ts
  /** Type guard — kept for call-site compatibility; RosterEntry is now always Participant. */
  export function isParticipantEntry(e: RosterEntry): e is Participant {
    return e.kind === 'pc' || e.kind === 'monster';
  }
  ```

- [ ] **Step 3: Remove BCIE branch from `reflect()`**

  Delete the `if (type === IntentTypes.BringCharacterIntoEncounter)` block (around lines 140–162).

- [ ] **Step 4: Remove BCIE import from the top of the file**

  Remove `BringCharacterIntoEncounterPayload` from the import block.

- [ ] **Step 5: Update `snapshotToEncounter` to filter unknown participant kinds**

  The `snapshotToEncounter` function reads `s.participants` from the server snapshot. In a transitional period, snapshots may include objects with unrecognized `kind` values from old state. Filter them out:

  In the function body, after extracting participants:
  ```ts
  // Filter out any unrecognized participant kinds (e.g. legacy pc-placeholder entries
  // from old state before Epic 2D migration).
  const participants = (topParticipants ?? enc.participants ?? []).filter(
    (p): p is Participant => p.kind === 'pc' || p.kind === 'monster',
  );
  ```

- [ ] **Step 6: Typecheck + test web**

  ```bash
  cd apps/web && pnpm typecheck
  ```

  Run any web tests:

  ```bash
  cd apps/web && pnpm test
  ```

  Expected: **PASS**.

- [ ] **Step 7: Full typecheck + lint — Slice 3 green gate**

  ```bash
  pnpm typecheck && pnpm lint
  ```

  Expected: **PASS** repo-wide.

- [ ] **Step 8: Commit Slice 3**

  ```bash
  git add apps/web/src/pages/EncounterBuilder.tsx apps/web/src/pages/CampaignView.tsx apps/web/src/ws/useSessionSocket.ts
  git commit -m "feat(web): EncounterBuilder local draft + remove Bring-into-lobby flow"
  ```

---

## Task 10 — `EndEncounter` D1 Writeback Side-Effect (Slice 4a)

**Files:**
- Modify: `apps/api/src/lobby-do-side-effects.ts`

- [ ] **Step 1: Write a failing test for `sideEffectEndEncounter`**

  In `apps/api/tests/respite.spec.ts` (or a new `apps/api/tests/end-encounter-writeback.spec.ts`), add:

  ```ts
  // Verify: after EndEncounter is applied and the side-effect runs, the character
  // row in D1 has currentStamina and recoveriesUsed updated.
  // (Integration test — uses the same in-memory D1 test harness as respite.spec.ts)
  ```

  Since the api tests use Workers test environment without a real D1, look at the pattern in `apps/api/tests/respite.spec.ts` to understand the test DB setup. Follow the same pattern.

  For now, write the unit test for the helper function logic (data mutation pattern), not the full D1 round-trip — the integration test in `lobby-ws-flow.spec.ts` covers the full flow:

  ```ts
  // In apps/api/tests/lobby-do-stampers.spec.ts, add a check that
  // EndEncounter is added to the side-effect handler switch.
  // The minimal test is: after StartEncounter + stamina damage + EndEncounter,
  // the character row reflects final stamina.
  ```

  For Slice 4, since the test setup is complex (requires real D1 in-memory), skip the isolated unit test and rely on the integration test in `lobby-ws-flow.spec.ts` — the acceptance criteria (#2) verifies the behavior end-to-end.

- [ ] **Step 2: Add `sideEffectEndEncounter` to `apps/api/src/lobby-do-side-effects.ts`**

  Add the new function after `sideEffectRespite`:

  ```ts
  // Writes currentStamina + recoveriesUsed back to each PC's character row in D1
  // after an encounter ends. Uses stateBefore (pre-EndEncounter state) because
  // stamina and recoveries are not changed by the EndEncounter reducer — the values
  // are the same in stateBefore and stateAfter, but stateBefore is already passed
  // by the lobby-do call site.
  async function sideEffectEndEncounter(
    intent: Intent & { timestamp: number },
    stateBefore: CampaignState,
    env: Bindings,
  ): Promise<void> {
    const pcParticipants = stateBefore.participants
      .filter(isParticipant)
      .filter((p) => p.kind === 'pc' && p.characterId !== null);

    if (pcParticipants.length === 0) return;

    const conn = db(env.DB);

    for (const pc of pcParticipants) {
      const charId = pc.characterId!;
      const recoveriesUsed = pc.recoveries.max - pc.recoveries.current;

      const row = await conn
        .select({ data: characters.data })
        .from(characters)
        .where(eq(characters.id, charId))
        .get();
      if (!row) continue;

      let data: ReturnType<typeof CharacterSchema.parse>;
      try {
        data = CharacterSchema.parse(JSON.parse(row.data));
      } catch {
        console.error(`[side-effect] EndEncounter: skipping ${charId} — invalid blob`);
        continue;
      }

      data.currentStamina = pc.currentStamina;
      data.recoveriesUsed = recoveriesUsed;

      await conn
        .update(characters)
        .set({ data: JSON.stringify(data), updatedAt: intent.timestamp })
        .where(eq(characters.id, charId));
    }
  }
  ```

- [ ] **Step 3: Add the `EndEncounter` case to `handleSideEffect`**

  In the `switch` block inside `handleSideEffect`, add before the `default`:

  ```ts
  case 'EndEncounter':
    if (stateBefore !== undefined) {
      await sideEffectEndEncounter(intent, stateBefore, env);
    }
    break;
  ```

  Note: `stateBefore` is already passed by `lobby-do.ts` for ALL intents (lines 259–260 and 595). No changes to `lobby-do.ts` are needed.

- [ ] **Step 4: Typecheck api**

  ```bash
  cd apps/api && pnpm typecheck
  ```

  Expected: **PASS**.

---

## Task 11 — Extend Respite Side-Effect + Final Green Gate (Slice 4b)

**Files:**
- Modify: `apps/api/src/lobby-do-side-effects.ts`

- [ ] **Step 1: Extend `sideEffectRespite` to write stamina reset to D1**

  In the existing per-character loop inside `sideEffectRespite`, add a reset write for XP-eligible PCs:

  ```ts
  // After the existing XP increment block (if (xpAwarded > 0 && pcCharIds.includes(charId))):

  // Reset stamina/recoveries if this is a PC that was in the lobby roster.
  // Respite refills to full: currentStamina = null (use derived max), recoveriesUsed = 0.
  if (pcCharIds.includes(charId)) {
    data.currentStamina = null;
    data.recoveriesUsed = 0;
    mutated = true;
  }
  ```

  The `pcCharIds` array is already computed at the top of `sideEffectRespite` from `stateBefore.participants`. After Epic 2D, all PC participants have `participant.characterId` directly — update the extraction to use the field instead of the id-prefix strip:

  ```ts
  // Replace:
  const pcCharIds = stateBefore.participants
    .filter(isParticipant)
    .filter((p) => p.kind === 'pc')
    .map((p) => p.id.replace(/^pc:/, ''));

  // With (cleaner now that characterId is always set on PC participants):
  const pcCharIds = stateBefore.participants
    .filter(isParticipant)
    .filter((p) => p.kind === 'pc' && p.characterId !== null)
    .map((p) => p.characterId!);
  ```

- [ ] **Step 2: Run the api test suite**

  ```bash
  cd apps/api && pnpm test
  ```

  Expected: **PASS**. The existing `respite.spec.ts` tests should still pass.

- [ ] **Step 3: Final repo-wide green gate**

  ```bash
  pnpm test && pnpm typecheck && pnpm lint
  ```

  Expected: **all PASS**.

- [ ] **Step 4: Commit Slice 4**

  ```bash
  git add apps/api/src/lobby-do-side-effects.ts
  git commit -m "feat(api): EndEncounter writes stamina/recoveries to D1; Respite resets them"
  ```

---

## Self-Review Checklist

### Spec coverage
- [x] `BringCharacterIntoEncounter` intent deleted — Tasks 3, 4
- [x] `PcPlaceholder` type deleted — Task 4
- [x] `StartEncounter` payload carries `characterIds` + `monsters` — Task 2
- [x] Stamper reads D1 for character blobs + static data for monster stat blocks — Task 5
- [x] Reducer materializes all participants atomically, replacing roster — Task 4
- [x] `currentStamina` / `recoveriesUsed` on `CharacterSchema` — Task 1
- [x] `EndEncounter` writes back stamina/recoveries to D1 — Task 10
- [x] `Respite` resets stamina/recoveries to null/0 in D1 — Task 11
- [x] `EncounterBuilder` is a local draft (no lobby state until StartEncounter) — Task 7
- [x] Approved characters default-checked; director can deselect — Task 7
- [x] "Bring into lobby" button removed from `ApprovedRosterPanel` — Task 8
- [x] "in lobby" badge removed — Task 8
- [x] `PcPlaceholderEntry` removed from `useSessionSocket` — Task 9
- [x] BCIE branch removed from `reflect()` — Task 9
- [x] `LoadEncounterTemplate` intent not dispatched from UI (client-side only now) — Task 7
- [x] All tests rewritten / deleted for BCIE — Task 6

### Acceptance verification
1. Director clicks "Start the fight" → PCs materialize without any prior "bring" step ✓ (Slice 2+3)
2. After encounter ends, stamina + recoveries in D1 reflect what happened ✓ (Slice 4)
3. Director can deselect characters from the draft ✓ (Slice 3, character checklist)
4. `BringCharacterIntoEncounter`, `PcPlaceholder`, materialization loop absent ✓ (Slices 2+3)
5. All tests green ✓ (green gates at each slice)

### Open questions resolved
- **`LoadEncounterTemplate` intent**: kept in codebase, UI now applies it client-side (no dispatch). Future cleanup can delete it if no other callers remain.
- **Mid-fight `AddCharacterToEncounter`**: deferred. Known gap documented in scope notes.
- **`useApprovedCharactersFull` N+1**: accepted as known issue per scope notes.
