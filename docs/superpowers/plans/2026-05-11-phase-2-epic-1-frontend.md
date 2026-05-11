# Phase 2 Epic 1 Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a prototype-grade character creation wizard, an interactive three-mode character sheet, and an in-encounter player panel that consumes the Phase 2 Epic 1 backend end-to-end.

**Architecture:** New routes under `/characters/...` follow the existing `apps/web/src/pages/` convention. Wizard is a controlled-state shell with one component per step; saves are PUTs on Save & Continue. Sheet has two physical surfaces: `Sheet.tsx` at `/characters/$id` (standalone + in-lobby-no-encounter + encounter-banner) and `PlayerSheetPanel.tsx` mounted inside `CombatRun.tsx` (in-encounter only). Two small backend additions: a nullable `ownerId` field on `ParticipantSchema` for the PlayerSheetPanel lookup, and a new `POST /api/characters/:id/attach` endpoint for retroactive standalone-to-campaign attach.

**Tech Stack:** React + Vite + TanStack Router + TanStack Query + Zustand + Tailwind (existing). vitest for backend tests (existing pattern). No new frontend test framework — manual verification via the 10-step acceptance walk per the spec.

**Spec:** `docs/superpowers/specs/2026-05-11-phase-2-epic-1-frontend-design.md`

---

## Notes on test strategy

**Backend:** unit tests for the two backend additions (Participant ownerId materialization, attach endpoint) follow the existing `apps/api/tests/` and `packages/rules/tests/` patterns.

**Frontend:** no RTL / jsdom in this repo today. Adding a test framework for code that Phase 5 will rebuild is over-investment per `memory/feedback_ui_is_prototype_until_overhaul.md`. The acceptance criterion is the 10-step manual walk-through in the spec. Verification before completion runs `pnpm typecheck`, `pnpm lint`, `pnpm test` (backend), and the manual walk.

## Notes on existing surfaces

- **Router** is `apps/web/src/router.tsx` (flat createRoute style — NOT Next-style routes/).
- **`useSessionSocket(campaignId)`** exposes `{ members, status, activeEncounter, dispatch, intentLog, lastSeq, activeDirectorId }`. `activeEncounter.participants` is the list of materialized Participants when an encounter is active; null otherwise. PlayerSheetPanel reads from this — there is no top-level `state.participants` exposed to the client.
- **`buildIntent`** at `apps/web/src/api/dispatch.ts` builds the Intent envelope for `dispatch()`.
- **`api.get` / `api.post` / `api.put` / `api.delete`** in `apps/web/src/api/client.ts` — REST client with `ApiError`.
- **`StaticDataBundle`** type in `packages/rules/src/static-data.ts` carries `{ ancestries, careers, classes, kits }` as Maps — only what derivation reads. The wizard needs a superset that also includes `complications`; introduce a separate `WizardStaticData` type rather than polluting the rules-engine bundle.

---

## Phase A — Backend schema + endpoint additions

### Task A1: Add `ownerId` to `ParticipantSchema`

**Files:**
- Modify: `packages/shared/src/participant.ts:10-52`
- Test: existing `packages/rules/tests/start-encounter.spec.ts`

- [ ] **Step 1: Write the failing test**

Append this to `packages/rules/tests/start-encounter.spec.ts` (find the most relevant `describe` block — likely "materialization"; if no good fit, add a new `describe`):

```ts
  it('materialized PC carries ownerId from the placeholder', () => {
    // Use whatever fixture builder is already in scope. The intent is:
    // start state has a pc-placeholder with ownerId 'user-1';
    // applyStartEncounter materializes it;
    // assert the resulting Participant has ownerId 'user-1'.
    const state = makeStateWithPlaceholder({ characterId: 'c1', ownerId: 'user-1' });
    const intent = makeStartEncounterIntent({
      stampedPcs: [{ characterId: 'c1', name: 'Hero', ownerId: 'user-1', character: minimalCharacter() }],
    });
    const result = applyIntent(state, intent, { staticData: testBundle });
    const pc = result.state.participants.find(
      (p) => 'kind' in p && p.kind === 'pc',
    ) as Participant;
    expect(pc.ownerId).toBe('user-1');
  });

  it('monsters carry ownerId: null', () => {
    const state = makeStateWithMonster({ id: 'm1' });
    const monster = state.participants.find((p) => 'kind' in p && p.kind === 'monster') as Participant;
    expect(monster.ownerId).toBeNull();
  });
```

Reuse the helpers / fixtures already in this spec file (look for `applyIntent`, `applyStartEncounter`, fixture builders). If the spec file doesn't already export helpers like `makeStateWithPlaceholder`, look at how existing tests construct state and follow the same pattern verbatim — do not introduce new helpers.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ironyard/rules test -- start-encounter`
Expected: FAIL — either the field doesn't exist on the parsed Participant or the materialization doesn't populate it.

- [ ] **Step 3: Add `ownerId` to `ParticipantSchema`**

Edit `packages/shared/src/participant.ts`. Inside the `z.object({ ... })` block, add the field after `kind`:

```ts
  // Phase 2 Epic 1: PC participants carry the owning user's id so the web
  // client can identify "the viewer's own participant" for the in-encounter
  // sheet panel. Monsters are owner-less (null). Nullable + default null
  // keeps older snapshots parseable.
  ownerId: z.string().nullable().default(null),
```

(Place it directly after the existing `kind: z.enum(['pc', 'monster']),` line.)

- [ ] **Step 4: Populate `ownerId` during materialization**

Edit `packages/rules/src/intents/start-encounter.ts`. Find the place where a PC placeholder is materialized into a Participant (search for `kind: 'pc'` near where the Participant object is constructed — currently around line 80 per the source grep). The construction block looks roughly like:

```ts
{
  id: ...,
  name: stamped.name,
  kind: 'pc',
  level: ...,
  // ...
}
```

Add `ownerId: stamped.ownerId,` to that object. For monster materialization paths (if `applyStartEncounter` constructs any monster Participants — it likely doesn't, monsters arrive via `AddMonster`; verify), confirm `ownerId` defaults to `null` via the schema default. No code change needed for monsters.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ironyard/rules test -- start-encounter`
Expected: PASS.

Run the full suite to catch regressions:

```
pnpm --filter @ironyard/rules test
pnpm --filter @ironyard/shared test
pnpm --filter @ironyard/api test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/participant.ts packages/rules/src/intents/start-encounter.ts packages/rules/tests/start-encounter.spec.ts
git commit -m "$(cat <<'EOF'
feat(shared, rules): add Participant.ownerId for PC sheet lookup

PlayerSheetPanel needs to identify the viewer's own materialized PC. Add
nullable ownerId to ParticipantSchema; populate from placeholder during
StartEncounter materialization. Monsters keep ownerId: null.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A2: New endpoint `POST /api/characters/:id/attach`

**Files:**
- Modify: `apps/api/src/routes/characters.ts` (add handler)
- Test: `apps/api/tests/characters/attach.spec.ts` (new file under the existing `characters/` directory)

- [ ] **Step 1: Read existing handlers for the conventions**

Read `apps/api/src/routes/characters.ts` end-to-end. Note:
- How auth is enforced (likely a `requireAuth` middleware or in-handler check).
- How the LobbyDO stub is obtained for dispatching SubmitCharacter (look at how `POST /characters` does the auto-submit flow).
- Where membership is upserted in the join path (`POST /characters` with `campaignCode`). The attach endpoint reuses that logic.
- The CharacterResponse construction.

- [ ] **Step 2: Write the failing test**

Create `apps/api/tests/characters/attach.spec.ts`. Mirror the structure of `apps/api/tests/characters/*.spec.ts` files (probably one called something like `create.spec.ts` or `list.spec.ts`). Tests required:

```ts
import { describe, expect, it } from 'vitest';
// import the existing test harness (search the characters/ folder for
// the harness file or setup pattern). Reuse the same imports the other
// character tests use — do not invent a new pattern.

describe('POST /characters/:id/attach', () => {
  it('returns 404 for an unknown invite code', async () => {
    // create user, create standalone character, attempt attach with bad code
    // expect res.status === 404
  });

  it('returns 403 if requester is not the character owner', async () => {
    // create user A, character owned by A, log in as user B, attempt attach
    // expect res.status === 403
  });

  it('attaches the character to the campaign and joins membership', async () => {
    // create campaign C owned by user X, with invite code IC
    // create standalone character owned by user A
    // user A POSTs /characters/:id/attach { campaignCode: IC }
    // expect res.status === 200
    // expect returned character.data.campaignId === C.id
    // expect campaign_memberships table has (A, C) row
  });

  it('is idempotent on membership', async () => {
    // user A already member of C
    // call attach again, no error, no duplicate row
  });

  it('auto-submits when existing data is complete', async () => {
    // standalone character with data passing CompleteCharacterSchema
    // attach
    // expect campaign_characters row exists with status 'pending'
    // expect intent log has a SubmitCharacter entry
  });

  it('does not auto-submit when data is incomplete', async () => {
    // standalone character with name only (incomplete data)
    // attach
    // expect campaign_characters row absent
    // expect no SubmitCharacter intent dispatched
  });
});
```

Fill in the test bodies using the existing test harness exactly as the sibling files do. If no sibling file exists in `apps/api/tests/characters/`, find the closest analogue in `apps/api/tests/integration/` or any character-touching test and reuse those primitives.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @ironyard/api test -- attach`
Expected: FAIL — endpoint doesn't exist; all six tests fail at the request.

- [ ] **Step 4: Implement the handler**

Add to `apps/api/src/routes/characters.ts`:

```ts
const AttachCharacterRequestSchema = z.object({
  campaignCode: z.string().length(6),
});

router.post('/:id/attach', requireAuth, async (c) => {
  const userId = c.get('userId') as string;
  const characterId = c.req.param('id');
  const body = AttachCharacterRequestSchema.parse(await c.req.json());

  // Load and verify ownership
  const row = await db
    .selectFrom('characters')
    .selectAll()
    .where('id', '=', characterId)
    .executeTakeFirst();
  if (!row) return c.notFound();
  if (row.owner_id !== userId) return c.json({ error: 'forbidden' }, 403);

  // Resolve campaign by invite code
  const campaign = await db
    .selectFrom('campaigns')
    .selectAll()
    .where('invite_code', '=', body.campaignCode)
    .executeTakeFirst();
  if (!campaign) return c.json({ error: 'invite code not found' }, 404);

  // Idempotent membership insert (reuse the existing pattern from POST /characters)
  await ensureMembership(db, campaign.id, userId);

  // Mutate characters.data.campaignId
  const parsed = CharacterSchema.parse(JSON.parse(row.data));
  const updated = { ...parsed, campaignId: campaign.id };
  await db
    .updateTable('characters')
    .set({ data: JSON.stringify(updated), updated_at: Date.now() })
    .where('id', '=', characterId)
    .execute();

  // Auto-submit if complete
  const completeCheck = CompleteCharacterSchema.safeParse(updated);
  if (completeCheck.success) {
    const stub = c.env.LOBBY_DO.get(c.env.LOBBY_DO.idFromName(campaign.id));
    await stub.fetch(new Request('http://lobby/dispatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        intent: buildSubmitCharacterIntent({ userId, characterId, campaignId: campaign.id }),
      }),
    }));
  }

  return c.json(toCharacterResponse({ ...row, data: JSON.stringify(updated) }));
});
```

The exact API of `c.env.LOBBY_DO.get` / `stub.fetch` is copied from the existing auto-submit path in the POST /characters handler — do not invent a new shape. Open `apps/api/src/routes/characters.ts` and grep for "SubmitCharacter" or "auto-submit" to find the existing pattern; reuse `buildSubmitCharacterIntent` / `ensureMembership` / `toCharacterResponse` helpers if they exist, or extract them inline matching how the POST handler does it.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ironyard/api test -- attach`
Expected: PASS — all six tests green.

Run full backend suite:

```
pnpm test
```

Expected: all green; existing 622 tests still pass plus the new ones.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/characters.ts apps/api/tests/characters/attach.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): POST /characters/:id/attach for retroactive campaign attach

Lets a player attach an existing standalone character to a campaign by
invite code. Idempotently joins membership; auto-submits if the
character's data already passes CompleteCharacterSchema, mirroring the
POST /characters one-shot flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase B — Web data layer

### Task B1: Static-data hooks

**Files:**
- Create: `apps/web/src/api/static-data.ts`

- [ ] **Step 1: Read existing static-data pattern**

Open `apps/web/src/api/queries.ts:108-125` (the `useMonsters` block) and confirm the pattern: fetch from `/data/<name>.json`, parse against a shared schema, long `staleTime`, no refetch on focus.

Check what's actually in `apps/web/public/data/`:
- ancestries.json ✓
- careers.json ✓
- classes.json ✓
- complications.json ✓
- monsters.json ✓
- **kits.json — MISSING** (file does not exist; the build emits `[]` per `packages/data/build.ts:46`)

The kits ingest is deferred to Epic 2. For Epic 1 we need `kits.json` to physically exist (even as `[]`) so `useKits` can fetch without 404. Step 2 covers that.

- [ ] **Step 2: Ensure `kits.json` exists**

Inspect `packages/data/build.ts` around line 46. If it currently builds the file as `[]` for the web output, run `pnpm --filter @ironyard/data build:data` and verify `apps/web/public/data/kits.json` appears (contents `[]`). If the build does not yet write `kits.json` to the web output dir, edit `packages/data/build.ts` to add a final write step that emits `[]` to `apps/web/public/data/kits.json`. Match the format of other web outputs in that file.

Run: `pnpm --filter @ironyard/data build:data`
Expected: `apps/web/public/data/kits.json` is created with contents `[]`.

- [ ] **Step 3: Write the static-data hooks file**

Create `apps/web/src/api/static-data.ts`:

```ts
import { z } from 'zod';
import {
  AncestrySchema,
  CareerSchema,
  ClassSchema,
  ComplicationSchema,
} from '@ironyard/shared';
import type { ResolvedKit } from '@ironyard/rules';
import { ResolvedKitSchema } from '@ironyard/rules';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from './client';

async function fetchData<T>(filename: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`/data/${filename}`);
  if (!res.ok) {
    throw new ApiError(res.status, `${filename}: ${res.statusText}`);
  }
  const json = await res.json();
  return schema.parse(json);
}

const STATIC = {
  staleTime: 60 * 60_000,
  refetchOnWindowFocus: false,
} as const;

export function useAncestries() {
  return useQuery({
    queryKey: ['data', 'ancestries'],
    queryFn: () => fetchData('ancestries.json', z.array(AncestrySchema)),
    ...STATIC,
  });
}

export function useCareers() {
  return useQuery({
    queryKey: ['data', 'careers'],
    queryFn: () => fetchData('careers.json', z.array(CareerSchema)),
    ...STATIC,
  });
}

export function useClasses() {
  return useQuery({
    queryKey: ['data', 'classes'],
    queryFn: () => fetchData('classes.json', z.array(ClassSchema)),
    ...STATIC,
  });
}

export function useComplications() {
  return useQuery({
    queryKey: ['data', 'complications'],
    queryFn: () => fetchData('complications.json', z.array(ComplicationSchema)),
    ...STATIC,
  });
}

export function useKits() {
  return useQuery({
    queryKey: ['data', 'kits'],
    queryFn: () => fetchData('kits.json', z.array(ResolvedKitSchema)),
    ...STATIC,
  });
}

// WizardStaticData — composite of all five maps the wizard needs.
// Built by the wizard shell from the individual hooks; nullable
// while any of the underlying queries are loading.
export type WizardStaticData = {
  ancestries: ReadonlyMap<string, z.infer<typeof AncestrySchema>>;
  careers: ReadonlyMap<string, z.infer<typeof CareerSchema>>;
  classes: ReadonlyMap<string, z.infer<typeof ClassSchema>>;
  complications: ReadonlyMap<string, z.infer<typeof ComplicationSchema>>;
  kits: ReadonlyMap<string, ResolvedKit>;
};

export function useWizardStaticData(): WizardStaticData | null {
  const a = useAncestries();
  const ca = useCareers();
  const cl = useClasses();
  const co = useComplications();
  const k = useKits();
  if (!a.data || !ca.data || !cl.data || !co.data || !k.data) return null;
  return {
    ancestries: new Map(a.data.map((x) => [x.id, x])),
    careers: new Map(ca.data.map((x) => [x.id, x])),
    classes: new Map(cl.data.map((x) => [x.id, x])),
    complications: new Map(co.data.map((x) => [x.id, x])),
    kits: new Map(k.data.map((x) => [x.id, x])),
  };
}
```

If any of the schemas (`AncestrySchema`, `CareerSchema`, `ClassSchema`, `ComplicationSchema`) are not yet exported from `@ironyard/shared`, check `packages/shared/src/index.ts` to find the actual export names. If they're under different names, use whatever's actually exported. Same for `ResolvedKitSchema` from `@ironyard/rules`.

- [ ] **Step 4: Verify typecheck and dev fetch**

Run: `pnpm --filter @ironyard/web typecheck`
Expected: PASS.

(Manually validate the fetches later, during the Phase H acceptance walk.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/static-data.ts apps/web/public/data/kits.json packages/data/build.ts
git commit -m "$(cat <<'EOF'
feat(web): static-data hooks for wizard

useAncestries / useCareers / useClasses / useComplications / useKits
mirror the existing useMonsters pattern. useWizardStaticData composes
all five into one map-of-maps the wizard steps consume. kits.json ships
as [] until Epic 2 lights up the parser.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B2: Character query + mutation hooks

**Files:**
- Modify: `apps/web/src/api/queries.ts`
- Modify: `apps/web/src/api/mutations.ts`

- [ ] **Step 1: Extend `queries.ts`**

In `apps/web/src/api/queries.ts`:

1. Replace the `OwnedCharacter` type (lines 94-99) with a full `CharacterResponse` import from `@ironyard/shared`. Update `useMyCharacters` accordingly:

```ts
import type { CharacterResponse } from '@ironyard/shared';

export function useMyCharacters() {
  return useQuery<CharacterResponse[]>({
    queryKey: ['my-characters'],
    queryFn: () => api.get<CharacterResponse[]>('/api/characters'),
  });
}

export function useCharacter(id: string | undefined) {
  return useQuery<CharacterResponse>({
    queryKey: ['character', id],
    queryFn: () => api.get<CharacterResponse>(`/api/characters/${id}`),
    enabled: !!id,
  });
}
```

Keep the existing `OwnedCharacter` export aliased to `CharacterResponse` for transition compatibility, OR find every callsite in `pages/CampaignView.tsx:367` and update. Prefer updating callsites directly — keeping a deprecated alias adds dead code.

2. Verify that `GET /api/characters` server-side returns the full `CharacterResponse` shape, not the minimal `OwnedCharacter` shape from before. Check `apps/api/src/routes/characters.ts` — the spec says this is what the backend already returns; if the API still returns a stripped shape, that's a backend bug that needs a follow-up commit (file the gap and adjust the server response to match `CharacterResponseSchema`).

- [ ] **Step 2: Extend `mutations.ts`**

In `apps/web/src/api/mutations.ts`, find the existing `useCreateCharacter` (line 79) and replace it with a version that accepts the full `CreateCharacterRequest`:

```ts
import type {
  CharacterResponse,
  CreateCharacterRequest,
  UpdateCharacterRequest,
} from '@ironyard/shared';

export function useCreateCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCharacterRequest) =>
      api.post<CharacterResponse>('/api/characters', input),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['my-characters'] });
      qc.setQueryData(['character', created.id], created);
    },
  });
}

export function useUpdateCharacter(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCharacterRequest) =>
      api.put<CharacterResponse>(`/api/characters/${id}`, input),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['my-characters'] });
      qc.setQueryData(['character', id], updated);
    },
  });
}

export function useDeleteCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/characters/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['my-characters'] });
      qc.removeQueries({ queryKey: ['character', id] });
    },
  });
}

export function useAttachCharacterToCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { campaignCode: string }) =>
      api.post<CharacterResponse>(`/api/characters/${id}/attach`, input),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['my-characters'] });
      qc.invalidateQueries({ queryKey: ['my-campaigns'] });
      qc.setQueryData(['character', id], updated);
    },
  });
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @ironyard/web typecheck`
Expected: PASS. If the existing `useCreateCharacter` callsite in `CampaignView.tsx` breaks (it passes `{ name }` only), update it to pass the new `CreateCharacterRequest` shape, which only requires `name`. The type is a superset of the old call shape — should still typecheck.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api/queries.ts apps/web/src/api/mutations.ts apps/web/src/pages/CampaignView.tsx
git commit -m "$(cat <<'EOF'
feat(web): character query + mutation hooks for wizard / sheet

Promote useMyCharacters to full CharacterResponse[]; add useCharacter,
useUpdateCharacter, useDeleteCharacter, useAttachCharacterToCampaign.
useCreateCharacter now takes the full CreateCharacterRequest.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — Wizard shell + router

### Task C1: Register the new routes

**Files:**
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: Add the three character routes**

Edit `apps/web/src/router.tsx`. After the existing route declarations (around line 44), add:

```tsx
import { Wizard } from './pages/characters/Wizard';
import { Sheet } from './pages/characters/Sheet';

const wizardNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/characters/new',
  component: Wizard,
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === 'string' ? search.code : undefined,
  }),
});

const wizardEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/characters/$id/edit',
  component: Wizard,
});

const sheetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/characters/$id',
  component: Sheet,
});
```

Add them to the `addChildren` array:

```tsx
const routeTree = rootRoute.addChildren([
  indexRoute,
  campaignRoute,
  encounterBuilderRoute,
  combatRunRoute,
  monsterCodexRoute,
  wizardNewRoute,
  wizardEditRoute,
  sheetRoute,
]);
```

- [ ] **Step 2: Create placeholder Wizard + Sheet**

These need to exist so typecheck passes before the real implementations land.

Create `apps/web/src/pages/characters/Wizard.tsx`:

```tsx
export function Wizard() {
  return <main className="mx-auto max-w-2xl p-6"><p>Wizard placeholder</p></main>;
}
```

Create `apps/web/src/pages/characters/Sheet.tsx`:

```tsx
export function Sheet() {
  return <main className="mx-auto max-w-2xl p-6"><p>Sheet placeholder</p></main>;
}
```

- [ ] **Step 3: Verify typecheck and that routes resolve**

Run: `pnpm --filter @ironyard/web typecheck`
Expected: PASS.

Run dev: `pnpm --filter @ironyard/web dev` (background it; do not block).
Visit `http://localhost:5173/characters/new` and `http://localhost:5173/characters/abc` — both render the placeholders without 404.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/router.tsx apps/web/src/pages/characters/
git commit -m "$(cat <<'EOF'
feat(web): register /characters/new, /:id/edit, /:id routes

Placeholder Wizard + Sheet components stand in until the real
implementations land.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task C2: Wizard shell with draft state + persistence

**Files:**
- Modify: `apps/web/src/pages/characters/Wizard.tsx`
- Create: `apps/web/src/pages/characters/parts/StepStepper.tsx`

- [ ] **Step 1: Implement the wizard shell**

Replace `apps/web/src/pages/characters/Wizard.tsx` with:

```tsx
import { type Character, CharacterSchema } from '@ironyard/shared';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useCreateCharacter, useUpdateCharacter } from '../../api/mutations';
import { useCharacter } from '../../api/queries';
import { useMe } from '../../api/queries';
import { type WizardStaticData, useWizardStaticData } from '../../api/static-data';
import { AncestryStep } from './steps/AncestryStep';
import { CareerStep } from './steps/CareerStep';
import { ClassStep } from './steps/ClassStep';
import { ComplicationStep } from './steps/ComplicationStep';
import { KitStep } from './steps/KitStep';
import { NameDetailsStep } from './steps/NameDetailsStep';
import { ReviewStep } from './steps/ReviewStep';
import { CultureStep } from './steps/CultureStep';
import { StepStepper } from './parts/StepStepper';

const STEP_IDS = [
  'name',
  'ancestry',
  'culture',
  'career',
  'class',
  'complication',
  'kit',
  'review',
] as const;
type StepId = (typeof STEP_IDS)[number];

const STEP_LABELS: Record<StepId, string> = {
  name: 'Name & Details',
  ancestry: 'Ancestry',
  culture: 'Culture',
  career: 'Career',
  class: 'Class',
  complication: 'Complication',
  kit: 'Kit',
  review: 'Review',
};

function emptyCharacter(): Character {
  return CharacterSchema.parse({});
}

export function Wizard() {
  const me = useMe();
  const navigate = useNavigate();

  // Two URL surfaces: /characters/new (with optional ?code) and /characters/$id/edit
  const params = useParams({ strict: false }) as { id?: string };
  const search = useSearch({ strict: false }) as { code?: string };
  const editingId = params.id ?? null;

  const loaded = useCharacter(editingId ?? undefined);
  const createMut = useCreateCharacter();
  const staticData = useWizardStaticData();

  // Local draft state — primary source of truth for the wizard.
  const [draft, setDraft] = useState<Character>(() => emptyCharacter());
  const [characterId, setCharacterId] = useState<string | null>(editingId);
  const [name, setName] = useState<string>('');
  const [step, setStep] = useState<StepId>('name');
  // Persisted-once-on-first-save flag — used to gate between POST and PUT.
  const [persisted, setPersisted] = useState<boolean>(!!editingId);

  // Hydrate from server when editing.
  useEffect(() => {
    if (loaded.data && characterId === editingId) {
      setDraft(loaded.data.data);
      setName(loaded.data.name);
      setPersisted(true);
    }
  }, [loaded.data, characterId, editingId]);

  const updateMut = useUpdateCharacter(characterId ?? '');

  // Hide the kit step when the chosen class doesn't use a kit.
  const visibleSteps: StepId[] = (() => {
    if (!staticData || !draft.classId) return STEP_IDS as unknown as StepId[];
    const klass = staticData.classes.get(draft.classId);
    if (klass && (klass as { usesKit?: boolean }).usesKit === false) {
      return STEP_IDS.filter((s) => s !== 'kit');
    }
    return STEP_IDS as unknown as StepId[];
  })();

  if (me.isLoading || (editingId && loaded.isLoading) || !staticData) {
    return <main className="mx-auto max-w-3xl p-6 text-neutral-400">Loading…</main>;
  }
  if (!me.data) {
    return <main className="mx-auto max-w-3xl p-6 text-neutral-400">Sign in to create a character.</main>;
  }

  const patch = (p: Partial<Character>) => setDraft((d) => ({ ...d, ...p }));

  const persist = async (): Promise<string | null> => {
    if (!persisted) {
      const created = await createMut.mutateAsync({
        name: name.trim() || 'Unnamed hero',
        campaignCode: search.code,
        data: draft,
      });
      setCharacterId(created.id);
      setPersisted(true);
      // Reflect the server-resolved campaignId back into the draft (in case
      // the campaign code joined a campaign and set data.campaignId).
      setDraft(created.data);
      return created.id;
    } else if (characterId) {
      const updated = await updateMut.mutateAsync({
        name: name.trim() || 'Unnamed hero',
        data: draft,
      });
      setDraft(updated.data);
      return characterId;
    }
    return null;
  };

  const goToStep = async (next: StepId) => {
    await persist();
    setStep(next);
  };

  const stepIndex = visibleSteps.indexOf(step);
  const hasPrev = stepIndex > 0;
  const hasNext = stepIndex < visibleSteps.length - 1;
  const prev = () => hasPrev && setStep(visibleSteps[stepIndex - 1]);
  const next = async () => hasNext && goToStep(visibleSteps[stepIndex + 1]);

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{editingId ? 'Edit character' : 'New character'}</h1>
      </header>
      <StepStepper
        steps={visibleSteps.map((id) => ({ id, label: STEP_LABELS[id] }))}
        current={step}
        onJump={async (id) => goToStep(id as StepId)}
      />
      <section className="rounded-lg border border-neutral-800 p-5">
        {step === 'name' && (
          <NameDetailsStep
            draft={draft}
            name={name}
            campaignCode={search.code}
            onNameChange={setName}
            onPatch={patch}
          />
        )}
        {step === 'ancestry' && <AncestryStep draft={draft} staticData={staticData} onPatch={patch} />}
        {step === 'culture' && <CultureStep draft={draft} onPatch={patch} />}
        {step === 'career' && <CareerStep draft={draft} staticData={staticData} onPatch={patch} />}
        {step === 'class' && <ClassStep draft={draft} staticData={staticData} onPatch={patch} />}
        {step === 'complication' && <ComplicationStep draft={draft} staticData={staticData} onPatch={patch} />}
        {step === 'kit' && <KitStep draft={draft} staticData={staticData} onPatch={patch} />}
        {step === 'review' && (
          <ReviewStep
            draft={draft}
            staticData={staticData}
            characterId={characterId}
            onSubmitted={(id) => navigate({ to: '/characters/$id', params: { id } })}
          />
        )}
      </section>
      <nav className="flex justify-between">
        <button
          type="button"
          onClick={prev}
          disabled={!hasPrev}
          className="rounded-md bg-neutral-800 text-neutral-100 px-4 py-2 disabled:opacity-50"
        >
          ← Back
        </button>
        {hasNext && (
          <button
            type="button"
            onClick={next}
            className="rounded-md bg-neutral-100 text-neutral-900 px-4 py-2 font-medium"
          >
            Save &amp; Continue →
          </button>
        )}
      </nav>
    </main>
  );
}
```

This file is ~150 lines — refactor opportunity later, acceptable for prototype.

- [ ] **Step 2: Implement `StepStepper`**

Create `apps/web/src/pages/characters/parts/StepStepper.tsx`:

```tsx
type Step = { id: string; label: string };

export function StepStepper({
  steps,
  current,
  onJump,
}: {
  steps: readonly Step[];
  current: string;
  onJump: (id: string) => void;
}) {
  return (
    <ol className="flex flex-wrap gap-2">
      {steps.map((s, i) => {
        const isActive = s.id === current;
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onJump(s.id)}
              className={
                'min-h-11 px-3 py-2 rounded-md text-sm border ' +
                (isActive
                  ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                  : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:border-neutral-700')
              }
            >
              {i + 1}. {s.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 3: Stub the step components**

For each step file under `apps/web/src/pages/characters/steps/`, create a minimal placeholder so the wizard imports resolve. These get filled in during Phase D.

Create `NameDetailsStep.tsx`:

```tsx
import type { Character } from '@ironyard/shared';

export function NameDetailsStep(_props: {
  draft: Character;
  name: string;
  campaignCode: string | undefined;
  onNameChange: (n: string) => void;
  onPatch: (p: Partial<Character>) => void;
}) {
  return <p className="text-neutral-400">NameDetailsStep (Phase D1)</p>;
}
```

Repeat for `AncestryStep.tsx`, `CultureStep.tsx`, `CareerStep.tsx`, `ClassStep.tsx`, `ComplicationStep.tsx`, `KitStep.tsx`, `ReviewStep.tsx` — each takes `{ draft, staticData?, onPatch, ... }` matching the import shapes in `Wizard.tsx`. Look at the imports in Wizard.tsx and create matching placeholder signatures.

For `ReviewStep.tsx` specifically, include the `characterId` and `onSubmitted` props:

```tsx
import type { Character } from '@ironyard/shared';
import type { WizardStaticData } from '../../../api/static-data';

export function ReviewStep(_props: {
  draft: Character;
  staticData: WizardStaticData;
  characterId: string | null;
  onSubmitted: (id: string) => void;
}) {
  return <p className="text-neutral-400">ReviewStep (Phase D8)</p>;
}
```

- [ ] **Step 4: Verify typecheck + dev**

Run: `pnpm --filter @ironyard/web typecheck`
Expected: PASS.

Manually: open `/characters/new`, click each step chip, confirm steps swap and Save & Continue advances. Server PUTs should fire (check the network tab).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/characters/
git commit -m "$(cat <<'EOF'
feat(web): wizard shell + stepper + step placeholders

Controlled draft state, POST-then-PUT persistence on Save & Continue,
tappable step jumper, kit step class-conditional via static data.
Step components are placeholders pending Phase D.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — Step implementations

Each step is its own task. Steps are filled in order so visual progress is steady. None of these are TDD-style — they're UI work where the verification is "render in dev, click around, confirm state updates."

For all step tasks, the high-level pattern is:
1. Read what `draft` field(s) the step writes to.
2. Look up the relevant entries from `staticData` (or hardcoded enums for culture).
3. Render Tailwind-styled controls — use 44pt min hit targets per CLAUDE.md.
4. Call `onPatch({ field: value })` on change.
5. Confirm typecheck + manual smoke test.

### Task D1: NameDetailsStep

**Files:**
- Modify: `apps/web/src/pages/characters/steps/NameDetailsStep.tsx`

- [ ] **Step 1: Implement**

```tsx
import { type Character, CharacterDetailsSchema } from '@ironyard/shared';

export function NameDetailsStep({
  draft,
  name,
  campaignCode,
  onNameChange,
  onPatch,
}: {
  draft: Character;
  name: string;
  campaignCode: string | undefined;
  onNameChange: (n: string) => void;
  onPatch: (p: Partial<Character>) => void;
}) {
  const details = draft.details ?? CharacterDetailsSchema.parse({});
  return (
    <div className="space-y-4">
      <Field label="Character name">
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 min-h-11"
          placeholder="Your hero's name"
        />
      </Field>
      <Field label="Campaign code (optional)">
        <input
          value={campaignCode ?? ''}
          readOnly={!!campaignCode}
          className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 uppercase tracking-widest min-h-11"
          placeholder="ABCDEF"
        />
        {campaignCode && (
          <p className="text-xs text-neutral-500 mt-1">
            Pre-filled from the join link. Submit at the Review step to send to the director.
          </p>
        )}
      </Field>
      <Field label="Level">
        <input
          type="number"
          min={1}
          max={10}
          value={draft.level}
          onChange={(e) => onPatch({ level: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
          className="w-24 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 min-h-11"
        />
      </Field>
      <Field label="Pronouns">
        <input
          value={details.pronouns}
          onChange={(e) => onPatch({ details: { ...details, pronouns: e.target.value } })}
          className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 min-h-11"
        />
      </Field>
      <Field label="Backstory">
        <textarea
          value={details.backstory}
          onChange={(e) => onPatch({ details: { ...details, backstory: e.target.value } })}
          rows={4}
          className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2"
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-neutral-300 mb-1">{label}</span>
      {children}
    </label>
  );
}
```

- [ ] **Step 2: Verify**

Typecheck, then in dev visit `/characters/new?code=ABCDEF` — code field pre-filled and read-only. Edit name, level, pronouns, backstory. Click Save & Continue, then Back; values persist.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/characters/steps/NameDetailsStep.tsx
git commit -m "feat(web): NameDetailsStep — name, code, level, pronouns, backstory

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D2: AncestryStep

**Files:**
- Modify: `apps/web/src/pages/characters/steps/AncestryStep.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { Character } from '@ironyard/shared';
import type { WizardStaticData } from '../../../api/static-data';

export function AncestryStep({
  draft,
  staticData,
  onPatch,
}: {
  draft: Character;
  staticData: WizardStaticData;
  onPatch: (p: Partial<Character>) => void;
}) {
  const ancestries = Array.from(staticData.ancestries.values());
  const selected = draft.ancestryId ? staticData.ancestries.get(draft.ancestryId) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ancestries.map((a) => {
          const isSelected = a.id === draft.ancestryId;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() =>
                onPatch({ ancestryId: a.id, ancestryChoices: { traitIds: [] } })
              }
              className={
                'text-left rounded-md border px-4 py-3 min-h-11 ' +
                (isSelected
                  ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                  : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
              }
            >
              <div className="font-medium">{a.name}</div>
              {a.summary && <div className="text-xs opacity-80 mt-1">{a.summary}</div>}
            </button>
          );
        })}
      </div>

      {selected && Array.isArray((selected as { purchasableTraits?: unknown[] }).purchasableTraits) && (
        <TraitsPicker
          ancestry={selected}
          selected={draft.ancestryChoices?.traitIds ?? []}
          onChange={(traitIds) => onPatch({ ancestryChoices: { traitIds } })}
        />
      )}
    </div>
  );
}

function TraitsPicker({
  ancestry,
  selected,
  onChange,
}: {
  ancestry: { purchasableTraits?: Array<{ id: string; name: string; cost: number }> };
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const traits = ancestry.purchasableTraits ?? [];
  if (traits.length === 0) return null;
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };
  return (
    <div className="rounded-md border border-neutral-800 p-4 space-y-2">
      <h3 className="font-medium">Purchasable traits</h3>
      <ul className="space-y-2">
        {traits.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => toggle(t.id)}
              className={
                'w-full text-left rounded-md border px-3 py-2 min-h-11 ' +
                (selected.includes(t.id)
                  ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                  : 'bg-neutral-900 border-neutral-800 hover:border-neutral-600')
              }
            >
              <span className="font-medium">{t.name}</span>
              <span className="text-xs ml-2 opacity-70">cost {t.cost}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

The `purchasableTraits` field name and the trait sub-shape are guesses based on Draw Steel terminology. Open `packages/shared/src/data/ancestry.ts` and confirm the actual schema; adapt the field accesses to match. If a trait sub-picker isn't part of `AncestrySchema` at all, drop `TraitsPicker` entirely — leave only the ancestry-pick grid.

- [ ] **Step 2: Verify**

Typecheck. In dev, pick each ancestry; confirm `onPatch` fires and the draft updates. If your ancestry data has purchasable traits, confirm toggling them works.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/characters/steps/AncestryStep.tsx
git commit -m "feat(web): AncestryStep — picker + traits sub-picker

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D3: CultureStep

**Files:**
- Modify: `apps/web/src/pages/characters/steps/CultureStep.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { Character } from '@ironyard/shared';

const ENVIRONMENTS = ['nomadic', 'rural', 'secluded', 'urban', 'wilderness'] as const;
const ORGANIZATIONS = ['bureaucratic', 'communal'] as const;
const UPBRINGINGS = ['academic', 'creative', 'labor', 'lawless', 'martial', 'noble'] as const;

// Placeholder skill / language lists. The Draw Steel canon has these as
// inline lists per culture aspect. Hardcoded here for Phase 2 Epic 1; a
// real skills/languages registry comes later. Confirm against rulebook
// before relying on this list for correctness.
const SKILL_POOL_BY_ASPECT: Record<string, string[]> = {
  environment: ['Wilderness', 'Society', 'Riding'],
  organization: ['Diplomacy', 'Intuition'],
  upbringing: ['Crafting', 'History', 'Lore'],
};
const LANGUAGE_POOL = ['Caelian', 'Khoursirian', 'Vasloria', 'Phaedros'];

export function CultureStep({
  draft,
  onPatch,
}: {
  draft: Character;
  onPatch: (p: Partial<Character>) => void;
}) {
  const culture = draft.culture;
  const set = (patch: Partial<typeof culture>) =>
    onPatch({ culture: { ...culture, ...patch } });

  return (
    <div className="space-y-5">
      <Picker
        label="Environment"
        options={ENVIRONMENTS}
        value={culture.environment}
        onChange={(v) => set({ environment: v as typeof culture.environment })}
      />
      <SkillPicker
        label="Environment skill"
        options={SKILL_POOL_BY_ASPECT.environment}
        value={culture.environmentSkill}
        onChange={(v) => set({ environmentSkill: v })}
      />
      <Picker
        label="Organization"
        options={ORGANIZATIONS}
        value={culture.organization}
        onChange={(v) => set({ organization: v as typeof culture.organization })}
      />
      <SkillPicker
        label="Organization skill"
        options={SKILL_POOL_BY_ASPECT.organization}
        value={culture.organizationSkill}
        onChange={(v) => set({ organizationSkill: v })}
      />
      <Picker
        label="Upbringing"
        options={UPBRINGINGS}
        value={culture.upbringing}
        onChange={(v) => set({ upbringing: v as typeof culture.upbringing })}
      />
      <SkillPicker
        label="Upbringing skill"
        options={SKILL_POOL_BY_ASPECT.upbringing}
        value={culture.upbringingSkill}
        onChange={(v) => set({ upbringingSkill: v })}
      />
      <SkillPicker
        label="Language"
        options={LANGUAGE_POOL}
        value={culture.language}
        onChange={(v) => set({ language: v })}
      />
    </div>
  );
}

function Picker<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <h3 className="text-sm text-neutral-300 mb-1">{label}</h3>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={
              'min-h-11 px-3 py-2 rounded-md border text-sm ' +
              (value === o
                ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
            }
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function SkillPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <Picker label={label} options={options} value={value} onChange={onChange} />
  );
}
```

The skill / language pools are placeholder hardcoded lists. The Draw Steel canon defines per-culture-aspect skill choices and per-culture languages with much more nuance. Phase 5 (or a follow-up data ingest) will replace this with real data — Epic 1 just needs the schema fields filled with a non-empty string.

- [ ] **Step 2: Verify**

Typecheck. Pick a value for each of the 7 picks; confirm `draft.culture` reflects.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/characters/steps/CultureStep.tsx
git commit -m "feat(web): CultureStep — environment/organization/upbringing + skills + language

Skill / language pools are placeholder hardcoded lists; Phase 5 replaces.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D4: CareerStep

**Files:**
- Modify: `apps/web/src/pages/characters/steps/CareerStep.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { Character } from '@ironyard/shared';
import type { WizardStaticData } from '../../../api/static-data';

export function CareerStep({
  draft,
  staticData,
  onPatch,
}: {
  draft: Character;
  staticData: WizardStaticData;
  onPatch: (p: Partial<Character>) => void;
}) {
  const careers = Array.from(staticData.careers.values());
  const selected = draft.careerId ? staticData.careers.get(draft.careerId) : null;
  const choices = draft.careerChoices;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {careers.map((c) => {
          const isSelected = c.id === draft.careerId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() =>
                onPatch({
                  careerId: c.id,
                  careerChoices: { skills: [], languages: [], incitingIncidentId: null, perkId: null },
                })
              }
              className={
                'text-left rounded-md border px-4 py-3 min-h-11 ' +
                (isSelected
                  ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                  : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
              }
            >
              <div className="font-medium">{c.name}</div>
              {c.summary && <div className="text-xs opacity-80 mt-1">{c.summary}</div>}
            </button>
          );
        })}
      </div>

      {selected && (
        <CareerChoices
          career={selected}
          choices={choices}
          onChange={(next) => onPatch({ careerChoices: { ...choices, ...next } })}
        />
      )}
    </div>
  );
}

function CareerChoices({
  career,
  choices,
  onChange,
}: {
  career: { incitingIncidents?: Array<{ id: string; name: string }>; perks?: Array<{ id: string; name: string }> };
  choices: Character['careerChoices'];
  onChange: (next: Partial<Character['careerChoices']>) => void;
}) {
  return (
    <div className="rounded-md border border-neutral-800 p-4 space-y-4">
      {Array.isArray(career.incitingIncidents) && career.incitingIncidents.length > 0 && (
        <div>
          <h3 className="text-sm text-neutral-300 mb-1">Inciting incident</h3>
          <div className="flex flex-wrap gap-2">
            {career.incitingIncidents.map((ii) => (
              <button
                key={ii.id}
                type="button"
                onClick={() => onChange({ incitingIncidentId: ii.id })}
                className={
                  'min-h-11 px-3 py-2 rounded-md border text-sm ' +
                  (choices.incitingIncidentId === ii.id
                    ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                    : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
                }
              >
                {ii.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {Array.isArray(career.perks) && career.perks.length > 0 && (
        <div>
          <h3 className="text-sm text-neutral-300 mb-1">Perk</h3>
          <div className="flex flex-wrap gap-2">
            {career.perks.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange({ perkId: p.id })}
                className={
                  'min-h-11 px-3 py-2 rounded-md border text-sm ' +
                  (choices.perkId === p.id
                    ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                    : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
                }
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

Inspect `packages/shared/src/data/career.ts` to confirm field names (`incitingIncidents`, `perks`, `summary`). Adjust the accesses if they differ. Skill / language sub-picks are deferred (the spec says they're part of submission validity but the Career schema's exact representation of "pick N from this pool" is up to the data shape — implement them only if the schema makes it trivial; otherwise leave them as default `[]` for now and note that Phase 5 will fill the gap).

- [ ] **Step 2: Verify + commit**

Typecheck; manually pick a career, inciting incident, perk. Commit:

```bash
git add apps/web/src/pages/characters/steps/CareerStep.tsx
git commit -m "feat(web): CareerStep — picker + inciting incident + perk

Skill / language sub-picks deferred until the data shape supports them
cleanly; default-empty arrays for now.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D5: ClassStep

**Files:**
- Modify: `apps/web/src/pages/characters/steps/ClassStep.tsx`

This is the largest step. It includes class pick, characteristic-array pick, subclass pick (if the class has subclasses), and per-level ability picks. For Epic 1 (prototype-grade), aim for a working surface, not a polished one.

- [ ] **Step 1: Implement**

```tsx
import { type Character, LevelChoicesSchema } from '@ironyard/shared';
import type { WizardStaticData } from '../../../api/static-data';

export function ClassStep({
  draft,
  staticData,
  onPatch,
}: {
  draft: Character;
  staticData: WizardStaticData;
  onPatch: (p: Partial<Character>) => void;
}) {
  const classes = Array.from(staticData.classes.values());
  const selected = draft.classId ? staticData.classes.get(draft.classId) : null;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm text-neutral-300 mb-1">Class</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {classes.map((cl) => (
            <button
              key={cl.id}
              type="button"
              onClick={() =>
                onPatch({
                  classId: cl.id,
                  subclassId: null,
                  characteristicArray: null,
                  levelChoices: {},
                })
              }
              className={
                'text-left rounded-md border px-4 py-3 min-h-11 ' +
                (cl.id === draft.classId
                  ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                  : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
              }
            >
              <div className="font-medium">{cl.name}</div>
              {cl.summary && <div className="text-xs opacity-80 mt-1">{cl.summary}</div>}
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <>
          <CharacteristicArrayPicker
            klass={selected}
            value={draft.characteristicArray}
            onChange={(arr) => onPatch({ characteristicArray: arr })}
          />
          <SubclassPicker
            klass={selected}
            value={draft.subclassId}
            onChange={(id) => onPatch({ subclassId: id })}
          />
          <LevelPicks
            klass={selected}
            draft={draft}
            onChange={(levelChoices) => onPatch({ levelChoices })}
          />
        </>
      )}
    </div>
  );
}

function CharacteristicArrayPicker({
  klass,
  value,
  onChange,
}: {
  klass: { characteristicArrays?: number[][] };
  value: number[] | null;
  onChange: (arr: number[]) => void;
}) {
  const arrays = klass.characteristicArrays ?? [];
  if (arrays.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm text-neutral-300 mb-1">Characteristic array</h3>
      <div className="flex flex-wrap gap-2">
        {arrays.map((arr, i) => {
          const isSelected = value && arr.join(',') === value.join(',');
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(arr)}
              className={
                'min-h-11 px-3 py-2 rounded-md border text-sm font-mono ' +
                (isSelected
                  ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                  : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
              }
            >
              [{arr.join(', ')}]
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SubclassPicker({
  klass,
  value,
  onChange,
}: {
  klass: { subclasses?: Array<{ id: string; name: string }> };
  value: string | null;
  onChange: (id: string) => void;
}) {
  const subs = klass.subclasses ?? [];
  if (subs.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm text-neutral-300 mb-1">Subclass</h3>
      <div className="flex flex-wrap gap-2">
        {subs.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={
              'min-h-11 px-3 py-2 rounded-md border text-sm ' +
              (value === s.id
                ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
            }
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function LevelPicks({
  klass,
  draft,
  onChange,
}: {
  klass: { levels?: Array<{ level: number; abilityPicks?: number }> };
  draft: Character;
  onChange: (lc: Character['levelChoices']) => void;
}) {
  const levels = klass.levels ?? [];
  // For prototype, just ensure an empty LevelChoices entry exists per level
  // up to draft.level. Real per-level ability picker is Phase 5 work; the
  // Submit gate only checks that the entries exist (per CompleteCharacterSchema).
  const ensureEntries = () => {
    const next: Character['levelChoices'] = { ...draft.levelChoices };
    for (let lvl = 1; lvl <= draft.level; lvl++) {
      if (!next[String(lvl)]) next[String(lvl)] = LevelChoicesSchema.parse({});
    }
    onChange(next);
  };
  return (
    <div>
      <h3 className="text-sm text-neutral-300 mb-1">Level picks</h3>
      <p className="text-xs text-neutral-500 mb-2">
        Per-level ability / perk / skill picks. Epic 1 ships a stub —
        click below to seed default entries for levels 1–{draft.level}.
        The real interactive picker comes in Phase 5.
      </p>
      <button
        type="button"
        onClick={ensureEntries}
        className="min-h-11 px-3 py-2 rounded-md bg-neutral-100 text-neutral-900 text-sm font-medium"
      >
        Seed levels 1–{draft.level}
      </button>
      <pre className="mt-3 text-xs text-neutral-400 bg-neutral-950 border border-neutral-800 rounded p-3 overflow-x-auto">
        {JSON.stringify(draft.levelChoices, null, 2)}
      </pre>
    </div>
  );
}
```

The per-level picker stub is intentional. `CompleteCharacterSchema` requires `levelChoices` entries to exist for every level up to `draft.level`; the abilityIds / subclassAbilityIds / perkId / skillId fields default to empty. That clears the schema gate without forcing us to build a full picker for prototype.

Confirm field names against `packages/shared/src/data/class.ts` (e.g. `characteristicArrays`, `subclasses`, `levels`). Adjust accesses if they differ.

- [ ] **Step 2: Verify + commit**

Typecheck. Pick a class; pick an array; pick a subclass; click "Seed levels 1–N"; confirm `draft.levelChoices` populates.

```bash
git add apps/web/src/pages/characters/steps/ClassStep.tsx
git commit -m "feat(web): ClassStep — class + characteristic array + subclass + level-pick stub

Per-level interactive picker deferred to Phase 5. Submit-gate cleared
by seeding default LevelChoices entries.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D6: ComplicationStep

**Files:**
- Modify: `apps/web/src/pages/characters/steps/ComplicationStep.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { Character } from '@ironyard/shared';
import type { WizardStaticData } from '../../../api/static-data';

export function ComplicationStep({
  draft,
  staticData,
  onPatch,
}: {
  draft: Character;
  staticData: WizardStaticData;
  onPatch: (p: Partial<Character>) => void;
}) {
  const complications = Array.from(staticData.complications.values());
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-400">Complications are optional. Skip if you don't want one.</p>
      <button
        type="button"
        onClick={() => onPatch({ complicationId: null })}
        className={
          'block w-full text-left rounded-md border px-4 py-3 min-h-11 ' +
          (draft.complicationId === null
            ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
            : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
        }
      >
        <span className="font-medium">No complication</span>
      </button>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {complications.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPatch({ complicationId: c.id })}
            className={
              'text-left rounded-md border px-4 py-3 min-h-11 ' +
              (draft.complicationId === c.id
                ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
            }
          >
            <div className="font-medium">{c.name}</div>
            {c.summary && <div className="text-xs opacity-80 mt-1">{c.summary}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
git add apps/web/src/pages/characters/steps/ComplicationStep.tsx
git commit -m "feat(web): ComplicationStep — picker with skip

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D7: KitStep

**Files:**
- Modify: `apps/web/src/pages/characters/steps/KitStep.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { Character } from '@ironyard/shared';
import type { WizardStaticData } from '../../../api/static-data';

export function KitStep({
  draft,
  staticData,
  onPatch,
}: {
  draft: Character;
  staticData: WizardStaticData;
  onPatch: (p: Partial<Character>) => void;
}) {
  const kits = Array.from(staticData.kits.values());
  // Filter to the class's compatible kits if the schema records that info.
  // For Epic 1 the kit list is empty regardless, so the filter is a no-op.
  const compatible = kits;

  if (compatible.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-neutral-300">
          Kit picker comes in Epic 2 — once kit data ingestion lands.
        </p>
        <p className="text-xs text-neutral-500">
          For now this step is informational. Your character will submit without a kit;
          kit-required classes will derive at no-kit defaults until Epic 2.
        </p>
        {draft.kitId !== null && (
          <button
            type="button"
            onClick={() => onPatch({ kitId: null })}
            className="min-h-11 px-3 py-2 rounded-md bg-neutral-100 text-neutral-900 text-sm font-medium"
          >
            Clear current kit
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {compatible.map((k) => (
        <button
          key={k.id}
          type="button"
          onClick={() => onPatch({ kitId: k.id })}
          className={
            'text-left rounded-md border px-4 py-3 min-h-11 ' +
            (k.id === draft.kitId
              ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
              : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
          }
        >
          <div className="font-medium">{k.name}</div>
          <div className="text-xs opacity-80 mt-1 font-mono">
            ST +{k.staminaBonus} · SPD +{k.speedBonus} · STAB +{k.stabilityBonus}
          </div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
git add apps/web/src/pages/characters/steps/KitStep.tsx
git commit -m "feat(web): KitStep — class-conditional, Epic 1 empty-state placeholder

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task D8: ReviewStep + RuntimeReadout + Submit

**Files:**
- Modify: `apps/web/src/pages/characters/steps/ReviewStep.tsx`
- Create: `apps/web/src/pages/characters/parts/RuntimeReadout.tsx`

- [ ] **Step 1: Implement RuntimeReadout**

```tsx
import { type Character, CompleteCharacterSchema } from '@ironyard/shared';
import { deriveCharacterRuntime, type StaticDataBundle } from '@ironyard/rules';
import { useMemo } from 'react';
import type { WizardStaticData } from '../../../api/static-data';

export function RuntimeReadout({
  character,
  staticData,
}: {
  character: Character;
  staticData: WizardStaticData;
}) {
  // deriveCharacterRuntime only reads ancestries/careers/classes/kits.
  const bundle: StaticDataBundle = useMemo(
    () => ({
      ancestries: staticData.ancestries as StaticDataBundle['ancestries'],
      careers: staticData.careers as StaticDataBundle['careers'],
      classes: staticData.classes as StaticDataBundle['classes'],
      kits: staticData.kits as StaticDataBundle['kits'],
    }),
    [staticData],
  );
  const runtime = useMemo(
    () => deriveCharacterRuntime(character, bundle),
    [character, bundle],
  );
  return (
    <div className="rounded-md border border-neutral-800 p-4 space-y-3 text-sm">
      <h3 className="font-medium">Derived runtime</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-neutral-300">
        <dt>Max stamina</dt><dd className="font-mono">{runtime.maxStamina}</dd>
        <dt>Recoveries (max)</dt><dd className="font-mono">{runtime.recoveriesMax}</dd>
        <dt>Recovery value</dt><dd className="font-mono">{runtime.recoveryValue}</dd>
        <dt>Speed</dt><dd className="font-mono">{runtime.speed}</dd>
        <dt>Stability</dt><dd className="font-mono">{runtime.stability}</dd>
        <dt>Free strike damage</dt><dd className="font-mono">{runtime.freeStrikeDamage}</dd>
      </dl>
      <div>
        <h4 className="text-neutral-400 text-xs uppercase tracking-wide">Characteristics</h4>
        <pre className="font-mono text-xs mt-1">{JSON.stringify(runtime.characteristics, null, 2)}</pre>
      </div>
      <div>
        <h4 className="text-neutral-400 text-xs uppercase tracking-wide">Abilities</h4>
        <ul className="mt-1 text-xs space-y-1">
          {runtime.abilities.map((a, i) => (
            <li key={i} className="font-mono">{(a as { id?: string; name?: string }).name ?? (a as { id?: string }).id ?? '?'}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function checkSubmitGate(character: Character) {
  const r = CompleteCharacterSchema.safeParse(character);
  if (r.success) return { ok: true as const, blockingMessage: null };
  const issues = r.error.issues;
  return { ok: false as const, blockingMessage: issues[0]?.message ?? 'incomplete' };
}
```

- [ ] **Step 2: Implement ReviewStep**

Replace `apps/web/src/pages/characters/steps/ReviewStep.tsx`:

```tsx
import { type Character, IntentTypes, ulid } from '@ironyard/shared';
import { useSessionSocket } from '../../../ws/useSessionSocket';
import { useMe } from '../../../api/queries';
import { buildIntent } from '../../../api/dispatch';
import { type WizardStaticData } from '../../../api/static-data';
import { RuntimeReadout, checkSubmitGate } from '../parts/RuntimeReadout';

export function ReviewStep({
  draft,
  staticData,
  characterId,
  onSubmitted,
}: {
  draft: Character;
  staticData: WizardStaticData;
  characterId: string | null;
  onSubmitted: (id: string) => void;
}) {
  const me = useMe();
  const campaignId = draft.campaignId;
  const { dispatch, status } = useSessionSocket(campaignId ?? undefined);
  const gate = checkSubmitGate(draft);

  const onSubmit = () => {
    if (!gate.ok || !characterId || !campaignId || !me.data) return;
    dispatch(
      buildIntent({
        campaignId,
        type: IntentTypes.SubmitCharacter,
        payload: { characterId, submissionId: ulid() },
        actor: { userId: me.data.user.id, role: 'player' },
      }),
    );
    onSubmitted(characterId);
  };

  const onDone = () => characterId && onSubmitted(characterId);

  return (
    <div className="space-y-5">
      <RuntimeReadout character={draft} staticData={staticData} />
      <div className="rounded-md border border-neutral-800 p-4">
        {campaignId ? (
          <>
            <p className="text-sm text-neutral-300 mb-3">
              {gate.ok
                ? 'Ready to submit to the director for approval.'
                : `Cannot submit yet: ${gate.blockingMessage}`}
            </p>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!gate.ok || status !== 'open'}
              className="min-h-11 px-4 py-2 rounded-md bg-emerald-400 text-neutral-900 font-medium disabled:opacity-50"
            >
              Submit to director
            </button>
            {status !== 'open' && (
              <p className="text-xs text-neutral-500 mt-2">Waiting for campaign connection…</p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-300 mb-3">
              Standalone character — not yet attached to a campaign. You can attach later from the sheet.
            </p>
            <button
              type="button"
              onClick={onDone}
              className="min-h-11 px-4 py-2 rounded-md bg-neutral-100 text-neutral-900 font-medium"
            >
              View character
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

Confirm the SubmitCharacter payload shape against `packages/shared/src/intents/submit-character.ts` — the field names (`characterId`, `submissionId`) may differ; use whatever the schema defines.

- [ ] **Step 3: Verify + commit**

Typecheck. In dev, walk a complete character through to Review. The `RuntimeReadout` should populate; if there are gaps in derivation (likely, since `deriveCharacterRuntime` is canon-gated to a few slugs), they render as defaults. With a campaign code, the Submit button enables when `CompleteCharacterSchema` passes.

```bash
git add apps/web/src/pages/characters/steps/ReviewStep.tsx apps/web/src/pages/characters/parts/RuntimeReadout.tsx
git commit -m "$(cat <<'EOF'
feat(web): ReviewStep + RuntimeReadout + submit gate

Runs deriveCharacterRuntime against the draft; Submit dispatches
SubmitCharacter over the campaign WS when CompleteCharacterSchema
passes. Standalone characters skip submit and route to the sheet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase E — Sheet route

### Task E1: Sheet shell with mode resolution

**Files:**
- Modify: `apps/web/src/pages/characters/Sheet.tsx`
- Create: `apps/web/src/pages/characters/parts/AttachToCampaign.tsx`

- [ ] **Step 1: Implement Sheet**

```tsx
import { type CharacterResponse, IntentTypes } from '@ironyard/shared';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useMe } from '../../api/queries';
import { useCharacter } from '../../api/queries';
import { useWizardStaticData } from '../../api/static-data';
import { useSessionSocket } from '../../ws/useSessionSocket';
import { buildIntent } from '../../api/dispatch';
import { RuntimeReadout } from './parts/RuntimeReadout';
import { AttachToCampaign } from './parts/AttachToCampaign';

export function Sheet() {
  const { id } = useParams({ from: '/characters/$id' });
  const navigate = useNavigate();
  const me = useMe();
  const ch = useCharacter(id);
  const staticData = useWizardStaticData();

  // Open a WS only when the character has a campaign.
  const campaignId = ch.data?.data.campaignId ?? undefined;
  const sock = useSessionSocket(campaignId);

  if (me.isLoading || ch.isLoading || !staticData) {
    return <main className="mx-auto max-w-3xl p-6 text-neutral-400">Loading…</main>;
  }
  if (!me.data) {
    return <main className="mx-auto max-w-3xl p-6 text-neutral-400">Sign in to view characters.</main>;
  }
  if (!ch.data) {
    return <main className="mx-auto max-w-3xl p-6 text-rose-400">Character not found.</main>;
  }

  const inCampaign = !!campaignId;
  const inEncounter = inCampaign && sock.activeEncounter !== null;

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{ch.data.name}</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Level {ch.data.data.level} · {ch.data.data.classId ?? 'classless'}
            {inEncounter && ' · in encounter'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/characters/$id/edit"
            params={{ id }}
            className="text-sm text-neutral-300 hover:text-neutral-100 underline"
          >
            Edit
          </Link>
          {inEncounter && campaignId && (
            <Link
              to="/campaigns/$id/play"
              params={{ id: campaignId }}
              className="text-sm text-emerald-300 hover:text-emerald-200 underline"
            >
              Go to play screen →
            </Link>
          )}
        </div>
      </header>

      <RuntimeReadout character={ch.data.data} staticData={staticData} />

      {inEncounter && (
        <div className="rounded-md border border-emerald-900 bg-emerald-950/40 p-4 text-sm">
          Your character is live in combat. Open the play screen to control it.
        </div>
      )}

      {inCampaign && !inEncounter && (
        <InLobbyControls
          characterId={id}
          campaignId={campaignId!}
          userId={me.data.user.id}
          dispatch={sock.dispatch}
        />
      )}

      {!inCampaign && <AttachToCampaign characterId={id} />}
    </main>
  );
}

function InLobbyControls({
  characterId,
  campaignId,
  userId,
  dispatch,
}: {
  characterId: string;
  campaignId: string;
  userId: string;
  dispatch: ReturnType<typeof useSessionSocket>['dispatch'];
}) {
  const swapKit = () => {
    // Real picker is Phase 2 Epic 2; for now this is a no-op placeholder.
    dispatch(
      buildIntent({
        campaignId,
        type: IntentTypes.SwapKit,
        payload: { characterId, newKitId: '' },
        actor: { userId, role: 'player' },
      }),
    );
  };
  return (
    <div className="rounded-md border border-neutral-800 p-4 space-y-3">
      <h3 className="font-medium">Lobby controls</h3>
      <button
        type="button"
        onClick={swapKit}
        className="min-h-11 px-3 py-2 rounded-md bg-neutral-100 text-neutral-900 text-sm font-medium"
      >
        Swap kit (Epic 2 will populate the picker)
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Implement AttachToCampaign**

```tsx
import { useState } from 'react';
import { useAttachCharacterToCampaign } from '../../../api/mutations';

export function AttachToCampaign({ characterId }: { characterId: string }) {
  const [code, setCode] = useState('');
  const attach = useAttachCharacterToCampaign(characterId);
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length !== 6) return;
    attach.mutate({ campaignCode: c });
  };
  return (
    <form onSubmit={onSubmit} className="rounded-md border border-neutral-800 p-4 space-y-3">
      <h3 className="font-medium">Attach to a campaign</h3>
      <p className="text-xs text-neutral-500">
        Paste an invite code to join the campaign and submit this character to the director.
      </p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          placeholder="ABCDEF"
          className="flex-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 uppercase tracking-widest min-h-11"
        />
        <button
          type="submit"
          disabled={attach.isPending || code.trim().length !== 6}
          className="min-h-11 px-4 py-2 rounded-md bg-neutral-100 text-neutral-900 font-medium disabled:opacity-50"
        >
          Attach
        </button>
      </div>
      {attach.error && (
        <p className="text-sm text-rose-400">{(attach.error as Error).message}</p>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Verify + commit**

Typecheck. Manual: open `/characters/$id` for a standalone character — see AttachToCampaign. For a campaign-attached character not in an encounter — see InLobbyControls. For a campaign character mid-encounter — see the "Go to play screen →" banner.

```bash
git add apps/web/src/pages/characters/Sheet.tsx apps/web/src/pages/characters/parts/AttachToCampaign.tsx
git commit -m "$(cat <<'EOF'
feat(web): Sheet with standalone / in-lobby / encounter-banner modes

Mode resolution off character.campaignId + activeEncounter. Standalone
gets AttachToCampaign; in-lobby gets a SwapKit affordance; in-encounter
shows a link to the play screen where PlayerSheetPanel takes over.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase F — PlayerSheetPanel in CombatRun

### Task F1: Build PlayerSheetPanel

**Files:**
- Create: `apps/web/src/pages/combat/PlayerSheetPanel.tsx`
- Modify: `apps/web/src/pages/CombatRun.tsx` (conditional mount)

- [ ] **Step 1: Read existing combat components**

Open `apps/web/src/pages/combat/AbilityCard.tsx`, `HpBar.tsx`, `ConditionChip.tsx`. Note their prop shapes — the panel will reuse `AbilityCard` for ability rolls and possibly `HpBar` for stamina.

- [ ] **Step 2: Implement PlayerSheetPanel**

```tsx
import { type Participant, IntentTypes, ulid } from '@ironyard/shared';
import { buildIntent } from '../../api/dispatch';
import { useMe } from '../../api/queries';
import { useSessionSocket } from '../../ws/useSessionSocket';
import { AbilityCard } from './AbilityCard';
import { HpBar } from './HpBar';
import { ConditionChip } from './ConditionChip';

export function PlayerSheetPanel({ campaignId }: { campaignId: string }) {
  const me = useMe();
  const sock = useSessionSocket(campaignId);
  if (!me.data || !sock.activeEncounter) return null;
  const userId = me.data.user.id;
  const myParticipant = sock.activeEncounter.participants.find(
    (p) => p.kind === 'pc' && p.ownerId === userId,
  ) as Participant | undefined;

  if (!myParticipant) {
    return (
      <aside className="rounded-md border border-neutral-800 p-4 text-sm text-neutral-400">
        Your character isn't in this encounter yet.
      </aside>
    );
  }

  return (
    <aside className="rounded-md border border-neutral-800 p-4 space-y-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold">{myParticipant.name}</h2>
          <p className="text-xs text-neutral-500">Level {myParticipant.level}</p>
        </div>
        <div className="text-right text-sm">
          <div className="font-mono">
            {myParticipant.currentStamina} / {myParticipant.maxStamina} stamina
          </div>
          <div className="font-mono text-neutral-400">
            {myParticipant.recoveries.current} / {myParticipant.recoveries.max} recoveries
          </div>
        </div>
      </header>
      <HpBar
        current={myParticipant.currentStamina}
        max={myParticipant.maxStamina}
      />
      <ConditionsStrip participant={myParticipant} campaignId={campaignId} userId={userId} />
      <ResourcePanel participant={myParticipant} campaignId={campaignId} userId={userId} />
      <RecoveryButton participant={myParticipant} campaignId={campaignId} userId={userId} />
      <Abilities participant={myParticipant} campaignId={campaignId} userId={userId} />
    </aside>
  );
}

function ConditionsStrip({
  participant,
  campaignId,
  userId,
}: {
  participant: Participant;
  campaignId: string;
  userId: string;
}) {
  const sock = useSessionSocket(campaignId);
  const remove = (type: string) =>
    sock.dispatch(
      buildIntent({
        campaignId,
        type: IntentTypes.RemoveCondition,
        payload: { targetId: participant.id, condition: type },
        actor: { userId, role: 'player' },
      }),
    );
  return (
    <div className="flex flex-wrap gap-1">
      {participant.conditions.length === 0 && (
        <span className="text-xs text-neutral-500">No conditions.</span>
      )}
      {participant.conditions.map((c, i) => (
        <ConditionChip key={i} condition={c} onClick={() => remove(c.type)} />
      ))}
    </div>
  );
}

function ResourcePanel({
  participant,
  campaignId,
  userId,
}: {
  participant: Participant;
  campaignId: string;
  userId: string;
}) {
  const sock = useSessionSocket(campaignId);
  if (participant.heroicResources.length === 0) return null;
  const r = participant.heroicResources[0];
  const change = (delta: number) => {
    const type = delta > 0 ? IntentTypes.GainResource : IntentTypes.SpendResource;
    sock.dispatch(
      buildIntent({
        campaignId,
        type,
        payload: { participantId: participant.id, name: r.name, amount: Math.abs(delta) },
        actor: { userId, role: 'player' },
      }),
    );
  };
  return (
    <div className="rounded-md border border-neutral-800 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{r.name}</span>
        <span className="font-mono text-sm">{r.value}{r.max ? ` / ${r.max}` : ''}</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => change(-1)}
          className="flex-1 min-h-11 rounded-md bg-neutral-800 text-neutral-100 px-3 py-2"
        >
          − 1
        </button>
        <button
          type="button"
          onClick={() => change(+1)}
          className="flex-1 min-h-11 rounded-md bg-neutral-800 text-neutral-100 px-3 py-2"
        >
          + 1
        </button>
      </div>
    </div>
  );
}

function RecoveryButton({
  participant,
  campaignId,
  userId,
}: {
  participant: Participant;
  campaignId: string;
  userId: string;
}) {
  const sock = useSessionSocket(campaignId);
  const disabled = participant.recoveries.current <= 0;
  const onClick = () =>
    sock.dispatch(
      buildIntent({
        campaignId,
        type: IntentTypes.SpendRecovery,
        payload: { participantId: participant.id },
        actor: { userId, role: 'player' },
      }),
    );
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full min-h-11 rounded-md bg-emerald-400 text-neutral-900 px-4 py-2 font-medium disabled:opacity-50"
    >
      Spend recovery (+{participant.recoveryValue})
    </button>
  );
}

function Abilities({
  participant,
  campaignId,
  userId,
}: {
  participant: Participant;
  campaignId: string;
  userId: string;
}) {
  // The materialized participant carries no abilities field on
  // ParticipantSchema today — abilities live on the derived runtime, which is
  // not in CampaignState. For Epic 1, look up the character via the same
  // useCharacter hook the sheet uses, then derive runtime and render its
  // abilities. Implementation note: keep this read-only-but-clickable, the
  // AbilityCard already handles RollPower dispatch.
  return (
    <div className="text-xs text-neutral-500">
      (Ability roll affordances surface from derived runtime — wire via
      useCharacter + deriveCharacterRuntime, matching the sheet route.)
    </div>
  );
}
```

The abilities sub-component is left as a stub with a comment because the exact wiring depends on:
1. Whether `ParticipantSchema` already includes a denormalized `abilities` field (check `packages/shared/src/participant.ts` — at the time of this plan, it does NOT).
2. Whether we should denormalize abilities onto the materialized Participant at `StartEncounter` (a small backend change) versus re-deriving on the client at render time.

For Epic 1 the cleanest path is **re-derive on the client**: the panel calls `useCharacter` for the matching `characterId`, derives runtime, and renders ability cards from `runtime.abilities`. Match what the `PcPlaceholder` carries — `characterId` is on the placeholder, but the materialized Participant doesn't carry it (verify against the materialization code). If `characterId` isn't on the materialized Participant either, that's a third gap; surface it during implementation and either add the field to ParticipantSchema (one-line addition, matches the pattern of `ownerId`) or look up via `useMyCharacters` + match by `ownerId` (assumes one PC per owner per encounter — acceptable for Epic 1).

The most defensible path: add `characterId: z.string().nullable().default(null)` to `ParticipantSchema` (sibling of `ownerId`); populate at materialization. Then the panel's lookup is trivial.

If you take that path, add it to Task A1 — re-running Task A1 with the additional field is cheaper than splitting it into a new task. Update the test there to assert both fields, and update the materialization to populate both.

- [ ] **Step 3: Conditionally mount in CombatRun**

Open `apps/web/src/pages/CombatRun.tsx`. Find where the main combat layout is rendered. Add an import + a conditional render:

```tsx
import { PlayerSheetPanel } from './combat/PlayerSheetPanel';

// inside the component, in the JSX:
<PlayerSheetPanel campaignId={campaignId} />
```

Place it after the existing combat tracker / DetailPane block. The panel returns `null` for viewers without a PC participant, so it's harmless to always-render. Use a grid or flex layout so the panel sits beside the tracker on wide viewports and stacks below on narrow ones.

- [ ] **Step 4: Verify + commit**

Typecheck. Manual: with a director session, run StartEncounter that includes a PC. Switch to the player session at `/campaigns/$id/play`. Confirm PlayerSheetPanel appears with the player's stamina, recoveries, condition strip, resource controls. Click Recovery — server-broadcast `SpendRecovery` should reflect on both sessions.

```bash
git add apps/web/src/pages/combat/PlayerSheetPanel.tsx apps/web/src/pages/CombatRun.tsx
git commit -m "$(cat <<'EOF'
feat(web): PlayerSheetPanel — in-encounter sheet inside CombatRun

Mounts conditionally when viewer owns a materialized PC participant.
Renders stamina, recoveries, conditions, heroic resource, recovery
button. Abilities surface deferred pending a final call on
characterId-on-Participant (see plan).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task F2: Wire abilities into PlayerSheetPanel

**Files:**
- Modify: `packages/shared/src/participant.ts` (add `characterId` field — same pattern as Task A1's `ownerId`)
- Modify: `packages/rules/src/intents/start-encounter.ts` (populate `characterId` at materialization)
- Modify: `apps/web/src/pages/combat/PlayerSheetPanel.tsx` (use the field to look up the character)

- [ ] **Step 1: Add `characterId` to ParticipantSchema**

Same pattern as Task A1. In `packages/shared/src/participant.ts`, after the `ownerId` field:

```ts
  characterId: z.string().nullable().default(null),
```

In `packages/rules/src/intents/start-encounter.ts` materialization, add `characterId: stamped.character.id ?? null` (or however the character id is available — check the stamping helper's payload shape; `characterId` is on the placeholder per `packages/rules/src/types.ts:4-9`).

- [ ] **Step 2: Add a test in start-encounter.spec.ts**

```ts
  it('materialized PC carries characterId from the placeholder', () => {
    const state = makeStateWithPlaceholder({ characterId: 'c1', ownerId: 'user-1' });
    const intent = makeStartEncounterIntent({
      stampedPcs: [{ characterId: 'c1', name: 'Hero', ownerId: 'user-1', character: minimalCharacter() }],
    });
    const result = applyIntent(state, intent, { staticData: testBundle });
    const pc = result.state.participants.find(
      (p) => 'kind' in p && p.kind === 'pc',
    ) as Participant;
    expect(pc.characterId).toBe('c1');
  });
```

- [ ] **Step 3: Run tests**

```
pnpm --filter @ironyard/rules test
pnpm --filter @ironyard/api test
```

Expected: all green, including the new characterId assertion.

- [ ] **Step 4: Wire abilities in PlayerSheetPanel**

Replace the `Abilities` stub in `PlayerSheetPanel.tsx`:

```tsx
import { deriveCharacterRuntime, type StaticDataBundle } from '@ironyard/rules';
import { useCharacter } from '../../api/queries';
import { useWizardStaticData } from '../../api/static-data';

function Abilities({
  participant,
  campaignId,
  userId,
}: {
  participant: Participant;
  campaignId: string;
  userId: string;
}) {
  const ch = useCharacter(participant.characterId ?? undefined);
  const staticData = useWizardStaticData();
  const sock = useSessionSocket(campaignId);
  if (!ch.data || !staticData) return null;
  const bundle: StaticDataBundle = {
    ancestries: staticData.ancestries as StaticDataBundle['ancestries'],
    careers: staticData.careers as StaticDataBundle['careers'],
    classes: staticData.classes as StaticDataBundle['classes'],
    kits: staticData.kits as StaticDataBundle['kits'],
  };
  const runtime = deriveCharacterRuntime(ch.data.data, bundle);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Abilities</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {runtime.abilities.map((a, i) => (
          <AbilityCard
            key={i}
            ability={a}
            participant={participant}
            campaignId={campaignId}
            userId={userId}
            dispatch={sock.dispatch}
          />
        ))}
      </div>
    </div>
  );
}
```

The `AbilityCard` props above match what Phase 1 already passes — open `AbilityCard.tsx` and adjust the call to match the actual signature. If AbilityCard expects different props (e.g. a single `onRoll` callback rather than direct dispatch), wire the callback to build and dispatch the RollPower intent.

- [ ] **Step 5: Verify + commit**

Typecheck. Manual walk: PC in encounter → PlayerSheetPanel shows ability cards → click an ability → RollPower intent broadcasts → CombatRun's main tracker shows damage applied.

```bash
git add packages/shared/src/participant.ts packages/rules/src/intents/start-encounter.ts packages/rules/tests/start-encounter.spec.ts apps/web/src/pages/combat/PlayerSheetPanel.tsx
git commit -m "$(cat <<'EOF'
feat(shared, rules, web): Participant.characterId + wire ability cards

Mirror the ownerId pattern: nullable characterId on ParticipantSchema,
populated at StartEncounter materialization. PlayerSheetPanel looks up
the character, derives runtime, and renders ability cards that
dispatch RollPower.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase G — Entry points + Respite

### Task G1: Home page surfaces "Your characters"

**Files:**
- Modify: `apps/web/src/pages/Home.tsx`

- [ ] **Step 1: Add a section to the signed-in view**

In `apps/web/src/pages/Home.tsx`, inside `CampaignsPanel`, add a section above (or below) "Your campaigns" that lists owned characters with a "+ New character" button.

```tsx
import { useMyCharacters } from '../api/queries';

// inside CampaignsPanel, add to JSX:
<section className="rounded-lg border border-neutral-800 p-5">
  <header className="flex items-center justify-between">
    <h2 className="font-semibold">Your characters</h2>
    <Link
      to="/characters/new"
      className="text-sm text-neutral-300 hover:text-neutral-100 underline"
    >
      + New character
    </Link>
  </header>
  <YourCharactersList />
</section>

// new component in the same file:
function YourCharactersList() {
  const chars = useMyCharacters();
  if (chars.isLoading) return <p className="mt-3 text-sm text-neutral-500">Loading…</p>;
  if (!chars.data || chars.data.length === 0) {
    return <p className="mt-3 text-sm text-neutral-500">No characters yet.</p>;
  }
  return (
    <ul className="mt-3 space-y-2">
      {chars.data.map((c) => (
        <li key={c.id}>
          <Link
            to="/characters/$id"
            params={{ id: c.id }}
            className="flex items-center gap-3 rounded-md bg-neutral-900/60 hover:bg-neutral-900 border border-neutral-800 px-4 py-3 min-h-11"
          >
            <span className="flex-1 font-medium">{c.name}</span>
            <span className="text-xs text-neutral-500">L{c.data.level}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Verify + commit**

Typecheck. Manual: home page shows "Your characters" with a list and a "+ New character" link.

```bash
git add apps/web/src/pages/Home.tsx
git commit -m "feat(web): Home — Your characters section + New character entry

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task G2: CampaignView surfaces "Submit a character" + Respite

**Files:**
- Modify: `apps/web/src/pages/CampaignView.tsx`

- [ ] **Step 1: Add the "Submit a character" button**

Find the player-side (non-director) view in `CampaignView.tsx`. Add a button that links to `/characters/new?code={inviteCode}`:

```tsx
<Link
  to="/characters/new"
  search={{ code: campaign.data.inviteCode }}
  className="inline-block min-h-11 px-4 py-2 rounded-md bg-neutral-100 text-neutral-900 font-medium"
>
  Build a character for this campaign
</Link>
```

Place it where the player would naturally see it — likely near a "Your character" section if one exists; otherwise in the page's main column near the top. Adjust styling to match neighboring elements.

- [ ] **Step 2: Add the Respite button**

Above (or in) the page header, add a Respite affordance visible when there's no active encounter and at least one PC roster entry exists. The check on roster needs the campaign state — `useSessionSocket(id).activeEncounter === null` works as the no-encounter check. For "at least one PC" — we can keep the button always-visible-when-no-encounter for prototype; the reducer rejects when there's no PC.

```tsx
import { IntentTypes } from '@ironyard/shared';
import { buildIntent } from '../api/dispatch';

// inside CampaignView, find the relevant sub-section. Add:
{!activeEncounter && (
  <button
    type="button"
    onClick={() =>
      dispatch(
        buildIntent({
          campaignId: id,
          type: IntentTypes.Respite,
          payload: {},
          actor,
        }),
      )
    }
    className="min-h-11 px-4 py-2 rounded-md bg-neutral-100 text-neutral-900 font-medium"
  >
    Respite (refill recoveries, convert victories → XP)
  </button>
)}
```

`actor` is the same `{ userId: meId, role: ... }` already computed earlier in the component. Reuse it.

- [ ] **Step 3: Verify + commit**

Typecheck. Manual: as a non-director member of a campaign, see "Build a character for this campaign" linking to the wizard with the code pre-filled. As any member when no encounter is running, see the Respite button. Click it — recoveries refill on participants.

```bash
git add apps/web/src/pages/CampaignView.tsx
git commit -m "feat(web): CampaignView — Build-a-character link + Respite button

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase H — Verification + doc sweep

### Task H1: Typecheck / lint / test green across the repo

- [ ] **Step 1: Run the full battery**

```
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all green. If any test fails, debug and fix before continuing. Treat any new lint complaint about the new files as a real issue — fix at source, don't disable.

If something fails: look at the failure honestly. Don't change tests to pass; understand the regression and fix the underlying cause. Per `superpowers:verification-before-completion`, evidence before assertions always.

---

### Task H2: Manual acceptance walk

Walk the spec's 10-step acceptance journey end-to-end. Use two browser sessions (e.g. Chrome incognito + regular profile) so director and player run simultaneously.

- [ ] **Step 1: Set up**

In one terminal: `pnpm --filter @ironyard/api dev`
In another terminal: `pnpm --filter @ironyard/web dev`

Open two browser windows pointing at `http://localhost:5173`.

- [ ] **Step 2: Player signs up + opens wizard**

Player browser: sign in with a fresh email. Hit `/characters/new?code=ABCDEF` (or the actual code from the director's campaign created below).

- [ ] **Step 3: Director creates campaign**

Director browser: sign in with a different email. Create a campaign. Copy the invite code.

- [ ] **Step 4: Player walks the wizard**

In the player browser, with the campaign code in the URL, walk the wizard:
- Name & Details — set name, level 1
- Ancestry — pick one
- Culture — pick one of each
- Career — pick one + inciting incident + perk
- Class — pick one + characteristic array + subclass (if any) + click "Seed levels"
- Complication — pick one or skip
- Kit — confirm empty-state for kit classes
- Review — confirm RuntimeReadout populates; click Submit

- [ ] **Step 5: Director approves**

Director browser refreshes their campaign page. See the pending character. Approve.

- [ ] **Step 6: Director brings into encounter + starts**

Build an encounter, BringCharacterIntoEncounter for the player, then StartEncounter.

- [ ] **Step 7: Player operates from PlayerSheetPanel**

Player browser navigates to `/campaigns/$id/play`. See PlayerSheetPanel beside the combat tracker. Roll an ability → confirm broadcast. Spend a recovery → confirm stamina increases. Manage conditions and resources.

- [ ] **Step 8: End encounter, persistence**

Director runs EndEncounter. Player's recoveries.current persists (verify by starting another encounter — the recoveries pool reflects the previous spend).

- [ ] **Step 9: Respite**

Either party clicks Respite from CampaignView. Recoveries refill to max. partyVictories drains; the player's character.xp increases by the prior victories count.

- [ ] **Step 10: Standalone + Attach**

Player creates a second character at `/characters/new` (no code). Walk through. Reach the standalone sheet. Use AttachToCampaign with the campaign code → character flips to in-lobby mode, lands in director's pending queue (auto-submit if data is complete).

- [ ] **Step 11: Record findings**

Note any console errors, broken UI, or unintended behavior. File follow-up tasks for anything that isn't a deal-breaker.

---

### Task H3: Doc sweep

- [ ] **Step 1: Update `docs/phases.md`**

Open `docs/phases.md`, find the Phase 2 Epic 1 section, add a note that Epic 1 frontend is now shipping and link to the design spec + this plan.

- [ ] **Step 2: Update `docs/intent-protocol.md` if needed**

If anything about the actual flows differed from what `docs/intent-protocol.md` describes — particularly around `SubmitCharacter` payload, `SwapKit` payload, `Respite` mechanics, or the `pc-placeholder` discriminator — reconcile the doc to match the shipped code. Most of this was settled during the backend phases, so likely no change needed.

- [ ] **Step 3: Commit doc updates**

```bash
git add docs/
git commit -m "docs: Phase 2 Epic 1 frontend sweep

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task H4: Final state check + handoff note

- [ ] **Step 1: Verify clean tree**

```
git status
```

Expected: clean.

- [ ] **Step 2: Count commits and tests**

```
git log --oneline 64df13d..HEAD | wc -l
pnpm test 2>&1 | grep -E "Tests:|passed"
```

Record the count delta — the Epic 1 backend started at 622 tests; this plan adds roughly 7-10 more tests (Participant ownerId, Participant characterId, 6 attach endpoint tests).

- [ ] **Step 3: Summarize the work for the user**

Report back: total commits added, total tests, key files touched, any deviations from the spec that surfaced during implementation. Surface anything you'd recommend the user verify before pushing or shipping.

---

## Self-Review

**Spec coverage check (every spec section maps to a task):**

| Spec section | Covered by |
|---|---|
| Scope (in/out) | Phases A–G; out items punted per plan notes |
| Decisions summary | Implementation choices in C–G mirror each decision |
| File layout | Phase C (file scaffolding), each phase touches its slice |
| Data flow & state ownership | Phase C2 (wizard), E1 (sheet), F1/F2 (panel) |
| Wizard mechanics | Phase D1–D8 (one task per step) |
| Sheet | Phase E1 (Sheet) and the encounter-banner case |
| PlayerSheetPanel | Phase F1 + F2 |
| Routes & entry points | Phase C1 (routes), G1/G2 (entry points) |
| Backend addition: POST /:id/attach | Phase A2 |
| Backend addition: Participant.ownerId | Phase A1 |
| Backend addition: Participant.characterId | Phase F2 (added during plan-writing — see note in F1 step 2) |
| Testing strategy | Phase A1/A2 backend tests; Phase H2 manual walk |
| Acceptance walk (10 steps) | Phase H2 |
| Forward-looking notes | Already in the spec; no plan tasks needed |

**Placeholder scan:** No TBD / TODO references in the plan. Each step has either complete code, a precise command, or an explicit "look at the existing file and follow its pattern" with the file path. The few places where I leave room for the implementer to adapt (field names against actual schemas, AbilityCard's exact prop shape) include the explicit instruction to inspect the existing file and adjust — not "figure it out yourself."

**Type / name consistency:** `WizardStaticData` is defined once in `static-data.ts` and used by every step. `RuntimeReadout` is imported by Wizard (via ReviewStep) and Sheet — both reference the same `parts/RuntimeReadout.tsx`. `AttachToCampaign` is defined in `parts/AttachToCampaign.tsx` and used only by `Sheet.tsx`. `PlayerSheetPanel` is defined in `pages/combat/` and mounted only by `CombatRun.tsx`. Intent type imports come from `IntentTypes` everywhere. `useMe`, `useCharacter`, `useMyCharacters`, `useWizardStaticData`, `useSessionSocket`, `buildIntent` — all consistent across tasks.

**One known correction the implementer should anticipate:** the plan was drafted before verifying the exact shape of every static-data schema (`AncestrySchema`, `CareerSchema`, `ClassSchema`, `ComplicationSchema`, `ResolvedKitSchema`). The implementer should inspect each schema file before writing each step, and use whichever field names actually exist. The plan tells them to do this where relevant.
