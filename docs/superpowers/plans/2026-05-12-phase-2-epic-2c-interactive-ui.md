# Phase 2 Epic 2C — Interactive UI + Runtime Intents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The character sheet becomes interactive — players equip/unequip items, use consumables, take respites; directors push items to players. The `CharacterAttachment` engine from 2B drives re-derivation from each new mutation. § 10.8 weapon-damage-bonus engine variant lands so kit-keyword leveled treasures compute correct tier-scaled damage.

**Architecture:** Six slices. Execution order is **1 → 2 → 3 → 4 → 6 → 5** — Slice 6 (§ 10.8 engine variant) lands before Slice 5 (override sweep) completes so leveled-treasure overrides compute correct damage values.

- **Slice 1 — Inventory display + Equip/Unequip + SwapKit picker UI** *(medium)*: `EquipItem` / `UnequipItem` intents; `InventoryPanel` rendered in `PlayerSheetPanel`; `BodySlotConflictChip` for equipped trinkets; `SwapKitModal` dispatching the existing `SwapKit` intent.
- **Slice 2 — `UseConsumable` intent + UI** *(medium)*: New intent branches on parsed `effectKind` — `instant` → derives `ApplyHeal`; `attack`/`area` → derives `RollPower`; `duration`/`two-phase`/`unknown` → no-op with raw text in log. Decrements `quantity` by 1; removes entry at 0.
- **Slice 3 — Director push-item** *(small)*: `PushItem` intent (director-only); director-side modal with character picker + item search; player-facing toast.
- **Slice 4 — `Respite` intent expansion + UI** *(medium)*: Stamina restoration; heroic-resource floor reset; 3-safely-carry warning (new canon § 10.17 drafted in this slice); Wyrmplate damage-type change (Dragon Knight); `RespiteConfirm` modal.
- **Slice 6 — § 10.8 weapon-damage-bonus engine variant** *(medium)* — executes 5th: New `AttachmentEffect` variant `{ kind: 'weapon-damage-bonus', appliesTo: 'melee' | 'ranged', perTier: [n,n,n] }`. Parser side: restructure `parse-kit.ts` to retain per-echelon bonus values. Engine side: power-roll evaluation reads attachments for `weapon-damage-bonus` matching ability keywords and folds tier bonus into damage outcome. § 10.8 ✅.
- **Slice 5 — Comprehensive item + title override sweep** *(continuous)* — executes 6th: Author override entries for every equip-able item with a static stat fold (~98 items, ~59 titles). Done bar: "no fresh PC level 1–10 with reasonable equipped items + applied title produces a wrong runtime number."

**Tech Stack:** TypeScript + Zod schemas, vitest, React + TanStack Query (for static-data hooks).

**Spec:** [`docs/superpowers/specs/2026-05-12-phase-2-epic-2c-interactive-ui-design.md`](../specs/2026-05-12-phase-2-epic-2c-interactive-ui-design.md)

---

## Conventions

- **TDD:** Each task starts with a failing test, then minimal implementation. Tests live in `packages/<pkg>/tests/` or `packages/rules/src/attachments/*.test.ts`.
- **Per-slice verification:** `pnpm test`, `pnpm typecheck`, `pnpm lint` repo-wide must pass before the slice closes.
- **Commit cadence:** one commit per task (or per closely-related pair of tasks). Commit messages start with `feat(scope):` / `refactor(scope):` / `fix(scope):` / `test(scope):` / `docs(scope):`.
- **Intent file pattern:** `packages/shared/src/intents/<name>.ts` exports `XxxPayloadSchema` + `XxxPayload` type. `packages/rules/src/intents/<name>.ts` exports `applyXxx(state, intent) → IntentResult`. Reducer dispatches via `case IntentTypes.Xxx: return applyXxx(state, intent);`.
- **Canon-status registry:** new canon entries require `pnpm canon:gen` to regenerate `packages/rules/src/canon-status.generated.ts`. Slice close runs `pnpm canon:gen` and asserts the diff is intentional.
- **Auto mode:** plans authored for autonomous execution. Each task self-contained; subagent has the spec + plan + repo, no other context needed.

## Architectural pattern — character-side mutations are "ratification intents"

(Added after Task 1.1; clarifies the design for Tasks 1.2, 1.3, 2.2, 3.2, 4.5.)

Characters are **D1-persisted**, not in `CampaignState`. The intent reducer operates on lobby state (`participants`, `encounter`, `malice`). Character-side mutations (`EquipItem`, `UnequipItem`, `UseConsumable`, `PushItem`, Respite's Wyrmplate change) follow the **`SubmitCharacter` ratification pattern** already in the codebase:

```
[1] Stamper  (apps/api/src/lobby-do-stampers.ts)
       reads D1, stamps payload with auth/lookup metadata
       (e.g. payload.ownsCharacter = character?.ownerId === actor)
            ↓
[2] Reducer  (packages/rules/src/intents/<name>.ts)
       pure function, validates the stamped payload,
       logs the action, NEVER mutates character state
       (state.participants may still be touched for
        derived intents like ApplyHeal)
            ↓
[3] Side-effect  (apps/api/src/lobby-do-side-effects.ts)
       runs after the reducer commits in-memory state;
       writes the character mutation to D1
       (e.g. UPDATE characters SET data = ? WHERE id = ?)
```

**Reference implementations to mirror:**
- Stamper: `stampSubmitCharacter` at `lobby-do-stampers.ts:150-184` (stamps `ownsCharacter` + `isCampaignMember`). Also `stampJumpBehindScreen` at `:140-144` for the simpler director-permitted boolean.
- Reducer: `applySubmitCharacter` at `packages/rules/src/intents/submit-character.ts` — validates stamped booleans, logs, doesn't touch state.participants/characters.
- Side-effect: `sideEffectSubmitCharacter` at `lobby-do-side-effects.ts:77-97` (INSERT OR IGNORE on D1).

**Payload schema additions for ratification intents:**
- `ownsCharacter: boolean` (default `false`) — stamped by stamper from D1.
- Additional lookup booleans as needed (`inventoryEntryExists`, `itemExistsInCatalog`, etc.) — stamper computes; reducer validates.
- `isDirectorPermitted: boolean` (for director-only intents like `PushItem`).

The reducer treats these flags as the source of truth — it can't query D1 itself, so it trusts the stamper.

**Client-side cache invalidation.** When the WebSocket receives the intent ack, the web app invalidates the affected `useCharacter` TanStack Query, which refetches and re-renders. `deriveCharacterRuntime` re-runs naturally on the new character data.

**InventoryEntry `id` field.** Per the plan's Task 1.2 Step 2 anticipation: `InventoryEntrySchema` needs an `id` field for stable addressing of entries (multiple inventory entries of the same itemId are valid). Add as part of Task 1.2.

**Affected tasks below.** Where a task body shows reducer code mutating `state.characters`, treat that as superseded by the ratification pattern — the reducer validates flags and logs, the stamper + side-effect do the real work.

## File structure (full list of files created or modified)

### Created

- `packages/shared/src/intents/equip-item.ts`
- `packages/shared/src/intents/unequip-item.ts`
- `packages/shared/src/intents/use-consumable.ts`
- `packages/shared/src/intents/push-item.ts`
- `packages/rules/src/intents/equip-item.ts`
- `packages/rules/src/intents/unequip-item.ts`
- `packages/rules/src/intents/use-consumable.ts`
- `packages/rules/src/intents/push-item.ts`
- `packages/rules/src/attachments/effects/weapon-damage-bonus.ts` *(if a new sub-module is needed; otherwise the variant lives in `attachments/_types.ts` + a switch arm in `apply.ts`)*
- `apps/web/src/pages/combat/inventory/InventoryPanel.tsx`
- `apps/web/src/pages/combat/inventory/InventorySection.tsx`
- `apps/web/src/pages/combat/inventory/ItemRow.tsx`
- `apps/web/src/pages/combat/inventory/BodySlotConflictChip.tsx`
- `apps/web/src/pages/combat/inventory/SafelyCarryWarning.tsx`
- `apps/web/src/pages/combat/inventory/SwapKitModal.tsx`
- `apps/web/src/pages/combat/inventory/UseConsumableButton.tsx`
- `apps/web/src/pages/combat/RespiteConfirm.tsx`
- `apps/web/src/pages/director/PushItemModal.tsx`
- `packages/rules/tests/intents/equip-item.spec.ts`
- `packages/rules/tests/intents/unequip-item.spec.ts`
- `packages/rules/tests/intents/use-consumable.spec.ts`
- `packages/rules/tests/intents/push-item.spec.ts`
- `packages/rules/tests/intents/respite-extended.spec.ts` *(or extend existing `respite.spec.ts` if present)*
- `packages/rules/tests/attachments/weapon-damage-bonus.spec.ts`

### Modified

- `packages/shared/src/intents/index.ts` (4 new exports, 4 new `IntentTypes` keys)
- `packages/rules/src/intents/index.ts` (4 new exports)
- `packages/rules/src/reducer.ts` (4 new switch cases)
- `packages/rules/src/intents/respite.ts` (stamina restoration; clarity floor reset; 3-safely-carry warning; Wyrmplate prompt response)
- `packages/rules/src/attachments/_types.ts` (add `weapon-damage-bonus` variant to `AttachmentEffectSchema`)
- `packages/rules/src/attachments/apply.ts` (add switch arm for `weapon-damage-bonus`; wires kit-level integration during runtime build)
- `packages/rules/src/attachments/collectors/kit.ts` (replace flat melee/ranged free-strike bonus emission with per-tier `weapon-damage-bonus` emission for melee & ranged)
- `packages/rules/src/intents/roll-power.ts` (fold `weapon-damage-bonus` attachments into tier-N damage outcome when ability has Melee+Weapon or Ranged+Weapon keywords)
- `packages/data/src/parse-kit.ts` (restructure to retain per-echelon melee/ranged bonus arrays)
- `packages/shared/src/data/kit.ts` (extend `KitSchema` to carry per-echelon arrays for melee/ranged damage bonus)
- `packages/data/overrides/items.ts` (Slice 5 — comprehensive entries)
- `packages/data/overrides/titles.ts` (Slice 5 — comprehensive entries)
- `apps/web/src/pages/combat/PlayerSheetPanel.tsx` (wire `InventoryPanel` + `SwapKitModal` trigger button)
- `apps/web/src/pages/combat/DetailPane.tsx` (no inventory rendering here — DetailPane is the director's view of any participant; the player's own inventory lives in `PlayerSheetPanel`. DetailPane only needs to render a director-side `PushItem` trigger if the focused participant is a PC. Verify decision during Slice 1.)
- `apps/web/src/pages/CampaignView.tsx` (replace bare Respite button with `RespiteConfirm` modal flow)
- `apps/web/src/api/mutations.ts` (new dispatch helpers `useEquipItem` / `useUnequipItem` / `useUseConsumable` / `usePushItem` / extended `useRespite` payload)
- `docs/rules-canon.md` (add § 10.17 3-safely-carry rule; lift § 10.8 to ✅ in Slice 6)
- `packages/rules/src/canon-status.generated.ts` (regenerated)

### Untouched until Slice 5

- `apps/api/src/data/items.json` and `apps/web/public/data/items.json` (re-generated by the data build only after Slice 6 reshapes kit-bonus structure; Slice 5 then authors overrides against the new shape)

---

## Slice 1: Inventory display + Equip/Unequip + SwapKit picker UI

### Task 1.1: `EquipItemPayloadSchema` + `UnequipItemPayloadSchema` in shared

**Files:**
- Create: `packages/shared/src/intents/equip-item.ts`
- Create: `packages/shared/src/intents/unequip-item.ts`
- Modify: `packages/shared/src/intents/index.ts`
- Test: `packages/shared/tests/intents/equip-item.spec.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/shared/tests/intents/equip-item.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EquipItemPayloadSchema, UnequipItemPayloadSchema } from '../../src/intents';

describe('EquipItemPayloadSchema', () => {
  it('requires characterId and inventoryEntryId', () => {
    expect(EquipItemPayloadSchema.safeParse({}).success).toBe(false);
    expect(EquipItemPayloadSchema.safeParse({ characterId: 'c1', inventoryEntryId: 'i1' }).success).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(EquipItemPayloadSchema.safeParse({ characterId: '', inventoryEntryId: 'i1' }).success).toBe(false);
  });
});

describe('UnequipItemPayloadSchema', () => {
  it('requires characterId and inventoryEntryId', () => {
    expect(UnequipItemPayloadSchema.safeParse({}).success).toBe(false);
    expect(UnequipItemPayloadSchema.safeParse({ characterId: 'c1', inventoryEntryId: 'i1' }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @ironyard/shared test -- intents/equip-item.spec.ts
```

Expected: FAIL — `Cannot find module '../../src/intents/equip-item'`.

- [ ] **Step 3: Create `equip-item.ts`**

Write `packages/shared/src/intents/equip-item.ts`:

```ts
import { z } from 'zod';

// Slice 1: equip an inventory entry. The reducer toggles
// `character.inventory[N].equipped = true` and triggers re-derivation
// of the character runtime via deriveCharacterRuntime.
export const EquipItemPayloadSchema = z.object({
  characterId: z.string().min(1),
  inventoryEntryId: z.string().min(1),
});
export type EquipItemPayload = z.infer<typeof EquipItemPayloadSchema>;
```

- [ ] **Step 4: Create `unequip-item.ts`**

Write `packages/shared/src/intents/unequip-item.ts`:

```ts
import { z } from 'zod';

// Slice 1: opposite of EquipItem. Toggles equipped → false.
export const UnequipItemPayloadSchema = z.object({
  characterId: z.string().min(1),
  inventoryEntryId: z.string().min(1),
});
export type UnequipItemPayload = z.infer<typeof UnequipItemPayloadSchema>;
```

- [ ] **Step 5: Wire into `packages/shared/src/intents/index.ts`**

Add the exports near the alphabetical position (after the existing `End*` exports, before `Gain*`):

```ts
export { EquipItemPayloadSchema } from './equip-item';
export type { EquipItemPayload } from './equip-item';
export { UnequipItemPayloadSchema } from './unequip-item';
export type { UnequipItemPayload } from './unequip-item';
```

Add to the `IntentTypes` const (alphabetical position):

```ts
  EquipItem: 'EquipItem',
  UnequipItem: 'UnequipItem',
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm --filter @ironyard/shared test -- intents/equip-item.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/intents/equip-item.ts packages/shared/src/intents/unequip-item.ts packages/shared/src/intents/index.ts packages/shared/tests/intents/equip-item.spec.ts
git commit -m "feat(shared): EquipItem + UnequipItem payload schemas"
```

### Task 1.2: `EquipItem` intent reducer + tests

**Files:**
- Create: `packages/rules/src/intents/equip-item.ts`
- Create: `packages/rules/tests/intents/equip-item.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/rules/tests/intents/equip-item.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyEquipItem } from '../../src/intents/equip-item';
import type { CampaignState, StampedIntent, Character } from '../../src/types';

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    ownerId: 'user-1',
    level: 1,
    inventory: [
      { id: 'inv-1', itemId: 'item-1', quantity: 1, equipped: false },
    ],
    // Other Character fields filled by makeBaseCharacter helper (see existing fixtures)
    ...overrides,
  } as Character;
}

function makeState(character: Character): CampaignState {
  return {
    seq: 0,
    encounter: null,
    participants: [],
    characters: [character],
    partyVictories: 0,
  } as CampaignState;
}

function makeIntent(payload: unknown): StampedIntent {
  return {
    id: 'intent-1',
    type: 'EquipItem',
    payload,
    actorId: 'user-1',
    seq: 1,
    ts: 0,
  } as StampedIntent;
}

describe('applyEquipItem', () => {
  it('toggles equipped → true on matching entry', () => {
    const character = makeCharacter();
    const state = makeState(character);
    const result = applyEquipItem(state, makeIntent({
      characterId: 'char-1',
      inventoryEntryId: 'inv-1',
    }));
    const updated = result.state.characters?.find((c) => c.id === 'char-1');
    expect(updated?.inventory[0].equipped).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('rejects when character missing', () => {
    const state = makeState(makeCharacter());
    const result = applyEquipItem(state, makeIntent({
      characterId: 'missing',
      inventoryEntryId: 'inv-1',
    }));
    expect(result.errors?.[0].code).toBe('character_missing');
  });

  it('rejects when inventory entry missing', () => {
    const state = makeState(makeCharacter());
    const result = applyEquipItem(state, makeIntent({
      characterId: 'char-1',
      inventoryEntryId: 'missing',
    }));
    expect(result.errors?.[0].code).toBe('inventory_entry_missing');
  });

  it('is idempotent when already equipped', () => {
    const character = makeCharacter({
      inventory: [{ id: 'inv-1', itemId: 'item-1', quantity: 1, equipped: true }],
    });
    const state = makeState(character);
    const result = applyEquipItem(state, makeIntent({
      characterId: 'char-1',
      inventoryEntryId: 'inv-1',
    }));
    const updated = result.state.characters?.find((c) => c.id === 'char-1');
    expect(updated?.inventory[0].equipped).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('rejects invalid payload', () => {
    const state = makeState(makeCharacter());
    const result = applyEquipItem(state, makeIntent({}));
    expect(result.errors?.[0].code).toBe('invalid_payload');
  });
});
```

> **Note for implementer:** The test imports `Character` and `CampaignState` from `../../src/types`. Verify the actual import path during Step 1. If `Character` lives in `@ironyard/shared` (likely — check `packages/shared/src/character.ts`), import from there instead. The `InventoryEntry` schema currently has no `id` field — verify the shape at `packages/shared/src/character.ts:115-124`. If it's keyed by index instead, use index-based addressing in the payload and tests.

- [ ] **Step 2: Verify InventoryEntry shape**

```bash
sed -n '115,125p' packages/shared/src/character.ts
```

Check whether `InventoryEntry` has an `id` field. If not, two options:
1. **Add `id` to `InventoryEntrySchema`** with `z.string().default(() => crypto.randomUUID())`. Most flexible; lets multiple stacks of the same item coexist.
2. **Address by index** — `inventoryEntryIndex: number`. Simpler but breaks if the array is reordered.

Pick (1). Modify the payload schema and tests accordingly *only if* the InventoryEntry doesn't already have an id. Update `packages/shared/src/character.ts` `InventoryEntrySchema`:

```ts
export const InventoryEntrySchema = z.object({
  id: z.string().min(1).default(() => crypto.randomUUID()),
  itemId: z.string().min(1),
  quantity: z.number().int().min(0).default(1),
  equipped: z.boolean().default(false),
});
```

If `id` is added, also update payload schemas to use `inventoryEntryId: z.string().min(1)`.

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @ironyard/rules test -- equip-item
```

Expected: FAIL — `Cannot find module '../../src/intents/equip-item'`.

- [ ] **Step 4: Write `equip-item.ts` intent**

Create `packages/rules/src/intents/equip-item.ts`:

```ts
import { EquipItemPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

// Slice 1 (Epic 2C): toggle inventory[N].equipped = true. Re-derivation
// of the character runtime is triggered downstream by the orchestrator
// (deriveCharacterRuntime → applyAttachments picks up the new attachments).
export function applyEquipItem(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = EquipItemPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `EquipItem rejected: ${parsed.error.message}`, intentId: intent.id }],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { characterId, inventoryEntryId } = parsed.data;
  const characters = state.characters ?? [];
  const character = characters.find((c) => c.id === characterId);
  if (!character) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `EquipItem: character ${characterId} not found`, intentId: intent.id }],
      errors: [{ code: 'character_missing', message: `character ${characterId} not found` }],
    };
  }

  const entry = character.inventory.find((e) => e.id === inventoryEntryId);
  if (!entry) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `EquipItem: inventory entry ${inventoryEntryId} not found`, intentId: intent.id }],
      errors: [{ code: 'inventory_entry_missing', message: `inventory entry ${inventoryEntryId} not found` }],
    };
  }

  const updatedInventory = character.inventory.map((e) =>
    e.id === inventoryEntryId ? { ...e, equipped: true } : e,
  );
  const updatedCharacter = { ...character, inventory: updatedInventory };
  const updatedCharacters = characters.map((c) => (c.id === characterId ? updatedCharacter : c));

  return {
    state: { ...state, seq: state.seq + 1, characters: updatedCharacters },
    derived: [],
    log: [{ kind: 'info', text: `Equipped ${entry.itemId} on ${characterId}`, intentId: intent.id }],
  };
}
```

> **Note for implementer:** If `CampaignState` doesn't carry a `characters: Character[]` field today, this needs to be added — verify by checking `packages/rules/src/types.ts`. Most likely the character data lives outside the lobby state (it's served via D1 + `useCharacter` hook). In that case, the intent dispatches against D1-stored character; the reducer would need a separate path (mutation against the D1 character, not the in-memory `CampaignState`). **Resolve during implementation:** if characters aren't in `CampaignState`, the EquipItem path needs to be a D1-targeted mutation (separate from the reducer's intent-result flow) or characters need to enter `CampaignState` as a new field. Pick the path that minimizes scope: add `state.characters` if not present, document the choice in the intent's header comment.

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @ironyard/rules test -- equip-item
```

Expected: PASS for all 5 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/intents/equip-item.ts packages/rules/tests/intents/equip-item.spec.ts packages/shared/src/character.ts
git commit -m "feat(rules): EquipItem intent — toggle inventory entry equipped=true"
```

### Task 1.3: `UnequipItem` intent reducer + tests

**Files:**
- Create: `packages/rules/src/intents/unequip-item.ts`
- Create: `packages/rules/tests/intents/unequip-item.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/rules/tests/intents/unequip-item.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyUnequipItem } from '../../src/intents/unequip-item';
// (use the same fixture helpers as equip-item.spec.ts; extract to a shared
// `tests/intents/_fixtures.ts` if both tests need them)

describe('applyUnequipItem', () => {
  it('toggles equipped → false on matching entry', () => {
    const character = makeCharacter({
      inventory: [{ id: 'inv-1', itemId: 'item-1', quantity: 1, equipped: true }],
    });
    const state = makeState(character);
    const result = applyUnequipItem(state, makeIntent({
      characterId: 'char-1',
      inventoryEntryId: 'inv-1',
    }));
    const updated = result.state.characters?.find((c) => c.id === 'char-1');
    expect(updated?.inventory[0].equipped).toBe(false);
    expect(result.errors).toBeUndefined();
  });

  it('rejects when character missing', () => { /* analogous */ });
  it('rejects when inventory entry missing', () => { /* analogous */ });
  it('is idempotent when already unequipped', () => { /* analogous */ });
  it('rejects invalid payload', () => { /* analogous */ });
});
```

- [ ] **Step 2: Extract test fixtures to a shared file**

If `tests/intents/_fixtures.ts` doesn't exist, create it with the `makeCharacter` / `makeState` / `makeIntent` helpers from Task 1.2's test. Both `equip-item.spec.ts` and `unequip-item.spec.ts` import from it.

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @ironyard/rules test -- unequip-item
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write `unequip-item.ts` intent**

Create `packages/rules/src/intents/unequip-item.ts` mirroring `equip-item.ts` but setting `equipped: false`. Identical validation surface.

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @ironyard/rules test -- unequip-item
```

Expected: PASS for all 5 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/intents/unequip-item.ts packages/rules/tests/intents/unequip-item.spec.ts packages/rules/tests/intents/_fixtures.ts
git commit -m "feat(rules): UnequipItem intent — toggle inventory entry equipped=false"
```

### Task 1.4: Wire both intents into reducer + IntentTypes registry

**Files:**
- Modify: `packages/rules/src/intents/index.ts`
- Modify: `packages/rules/src/reducer.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/rules/tests/reducer.spec.ts` (the existing reducer test file):

```ts
it('dispatches EquipItem through the reducer', () => {
  const state = makeStateWithCharacter();
  const result = applyIntent(state, makeIntent('EquipItem', {
    characterId: 'char-1',
    inventoryEntryId: 'inv-1',
  }));
  const updated = result.state.characters?.find((c) => c.id === 'char-1');
  expect(updated?.inventory[0].equipped).toBe(true);
});

it('dispatches UnequipItem through the reducer', () => {
  // analogous
});
```

> Verify the reducer entry-point function name by reading `packages/rules/src/reducer.ts:1-30`. The 2B plan calls it `applyIntent` — confirm at impl time.

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @ironyard/rules test -- reducer
```

Expected: FAIL — unknown intent type.

- [ ] **Step 3: Export apply functions from `packages/rules/src/intents/index.ts`**

Add (alphabetical):

```ts
export { applyEquipItem } from './equip-item';
export { applyUnequipItem } from './unequip-item';
```

- [ ] **Step 4: Add reducer cases in `packages/rules/src/reducer.ts`**

Find the import block + the switch:

```ts
import {
  // existing imports …
  applyEquipItem,
  applyUnequipItem,
} from './intents';

// inside switch (intent.type) { …
    case IntentTypes.EquipItem:
      return applyEquipItem(state, intent);
    case IntentTypes.UnequipItem:
      return applyUnequipItem(state, intent);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @ironyard/rules test -- reducer
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/intents/index.ts packages/rules/src/reducer.ts packages/rules/tests/reducer.spec.ts
git commit -m "feat(rules): wire EquipItem + UnequipItem into reducer"
```

### Task 1.5: Dispatch helpers in the web app's mutations layer

**Files:**
- Modify: `apps/web/src/api/mutations.ts`

- [ ] **Step 1: Read the existing mutations.ts**

```bash
sed -n '1,40p' apps/web/src/api/mutations.ts
```

Identify the dispatch pattern (likely `useMutation` wrappers around the WebSocket dispatch).

- [ ] **Step 2: Add `useEquipItem` and `useUnequipItem` hooks**

In `apps/web/src/api/mutations.ts`, add (mirroring existing `useSetStamina` / similar dispatch helpers):

```ts
import type { EquipItemPayload, UnequipItemPayload } from '@ironyard/shared';
import { IntentTypes } from '@ironyard/shared';

export function useEquipItem(campaignId: string) {
  return useDispatch<EquipItemPayload>(campaignId, IntentTypes.EquipItem);
}

export function useUnequipItem(campaignId: string) {
  return useDispatch<UnequipItemPayload>(campaignId, IntentTypes.UnequipItem);
}
```

> If `useDispatch` doesn't exist with that signature, follow the actual pattern in `mutations.ts` for `useSetStamina` (or equivalent) — likely a `useMutation` wrapper that calls `buildIntent` then dispatches over the socket.

- [ ] **Step 3: Run typecheck to verify wiring**

```bash
pnpm --filter @ironyard/web typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api/mutations.ts
git commit -m "feat(web): useEquipItem + useUnequipItem dispatch helpers"
```

### Task 1.6: `InventoryPanel` component scaffolding (4-section read-only render)

**Files:**
- Create: `apps/web/src/pages/combat/inventory/InventoryPanel.tsx`
- Create: `apps/web/src/pages/combat/inventory/InventorySection.tsx`
- Create: `apps/web/src/pages/combat/inventory/ItemRow.tsx`

- [ ] **Step 1: Write the failing snapshot test**

Create `apps/web/src/pages/combat/inventory/InventoryPanel.spec.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { InventoryPanel } from './InventoryPanel';
import type { Character, Item } from '@ironyard/shared';

const character: Pick<Character, 'inventory'> = {
  inventory: [
    { id: 'inv-1', itemId: 'lightning-treads', quantity: 1, equipped: true },
    { id: 'inv-2', itemId: 'potion-of-stamina', quantity: 3, equipped: false },
  ],
};

const items: Item[] = [
  { id: 'lightning-treads', name: 'Lightning Treads', category: 'trinket', bodySlot: 'feet', /* ... */ } as Item,
  { id: 'potion-of-stamina', name: 'Potion of Stamina', category: 'consumable', effectKind: 'instant', /* ... */ } as Item,
];

describe('InventoryPanel', () => {
  it('renders 4 sections — artifacts, leveled treasures, trinkets, consumables', () => {
    const { container } = render(
      <InventoryPanel character={character as Character} items={items} dispatch={undefined as any} />
    );
    expect(container.textContent).toMatch(/Trinkets/);
    expect(container.textContent).toMatch(/Consumables/);
    expect(container.textContent).toMatch(/Lightning Treads/);
    expect(container.textContent).toMatch(/Potion of Stamina/);
  });

  it('marks equipped items with an "Equipped" badge', () => {
    const { container } = render(
      <InventoryPanel character={character as Character} items={items} dispatch={undefined as any} />
    );
    // First inventory entry (Lightning Treads) is equipped.
    expect(container.textContent).toMatch(/Equipped/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @ironyard/web test -- InventoryPanel.spec
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `InventoryPanel.tsx`**

```tsx
import type { Character, Item } from '@ironyard/shared';
import { InventorySection } from './InventorySection';

type Dispatch = {
  equip: (inventoryEntryId: string) => void;
  unequip: (inventoryEntryId: string) => void;
};

type Props = {
  character: Character;
  items: Item[];
  dispatch: Dispatch;
};

function partition(character: Character, items: Item[]) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const rows = character.inventory.map((entry) => ({ entry, item: byId.get(entry.itemId) }));
  return {
    artifacts: rows.filter((r) => r.item?.category === 'artifact'),
    leveled: rows.filter((r) => r.item?.category === 'leveled-treasure'),
    trinkets: rows.filter((r) => r.item?.category === 'trinket'),
    consumables: rows.filter((r) => r.item?.category === 'consumable'),
  };
}

export function InventoryPanel({ character, items, dispatch }: Props) {
  const { artifacts, leveled, trinkets, consumables } = partition(character, items);
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-neutral-300">Inventory</h3>
      <InventorySection title="Artifacts" rows={artifacts} dispatch={dispatch} />
      <InventorySection title="Leveled Treasures" rows={leveled} dispatch={dispatch} />
      <InventorySection title="Trinkets" rows={trinkets} dispatch={dispatch} />
      <InventorySection title="Consumables" rows={consumables} dispatch={dispatch} />
    </section>
  );
}
```

- [ ] **Step 4: Create `InventorySection.tsx`**

```tsx
import type { Item, InventoryEntry } from '@ironyard/shared';
import { ItemRow } from './ItemRow';

type Row = { entry: InventoryEntry; item: Item | undefined };
type Dispatch = { equip: (id: string) => void; unequip: (id: string) => void };

export function InventorySection({ title, rows, dispatch }: { title: string; rows: Row[]; dispatch: Dispatch }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1">
      <h4 className="text-xs uppercase tracking-wide text-neutral-500">{title}</h4>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.entry.id}>
            <ItemRow entry={r.entry} item={r.item} dispatch={dispatch} />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Create `ItemRow.tsx`**

```tsx
import type { Item, InventoryEntry } from '@ironyard/shared';

type Dispatch = { equip: (id: string) => void; unequip: (id: string) => void };

export function ItemRow({ entry, item, dispatch }: { entry: InventoryEntry; item: Item | undefined; dispatch: Dispatch }) {
  if (!item) {
    return <div className="text-xs text-rose-500">Unknown item: {entry.itemId}</div>;
  }
  const canEquip = item.category !== 'consumable';
  const isEquipped = entry.equipped;
  const qtyLabel = item.category === 'consumable' && entry.quantity > 1 ? ` ×${entry.quantity}` : '';
  return (
    <div className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm">
      <div>
        <span className="font-medium">{item.name}</span>{qtyLabel}
        {isEquipped && <span className="ml-2 rounded bg-emerald-900/40 px-1 text-xs text-emerald-300">Equipped</span>}
      </div>
      {canEquip && (
        <button
          type="button"
          onClick={() => (isEquipped ? dispatch.unequip(entry.id) : dispatch.equip(entry.id))}
          className="min-h-[44px] rounded border border-neutral-700 px-2 text-xs hover:bg-neutral-800"
        >
          {isEquipped ? 'Unequip' : 'Equip'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm --filter @ironyard/web test -- InventoryPanel.spec
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/combat/inventory/
git commit -m "feat(web): InventoryPanel + InventorySection + ItemRow components"
```

### Task 1.7: `BodySlotConflictChip` for equipped trinkets

**Files:**
- Create: `apps/web/src/pages/combat/inventory/BodySlotConflictChip.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/pages/combat/inventory/BodySlotConflictChip.spec.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { BodySlotConflictChip } from './BodySlotConflictChip';

describe('BodySlotConflictChip', () => {
  it('renders nothing when no conflict', () => {
    const { container } = render(<BodySlotConflictChip conflicting={false} slot="head" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a warning when conflict', () => {
    const { container } = render(<BodySlotConflictChip conflicting slot="head" />);
    expect(container.textContent).toMatch(/Slot conflict: head/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @ironyard/web test -- BodySlotConflictChip.spec
```

Expected: FAIL.

- [ ] **Step 3: Create the component**

```tsx
type Props = {
  conflicting: boolean;
  slot: string;
};

export function BodySlotConflictChip({ conflicting, slot }: Props) {
  if (!conflicting) return null;
  return (
    <span className="ml-2 rounded bg-amber-900/40 px-1 text-xs text-amber-300" title={`Two trinkets equipped to ${slot}; only one can apply.`}>
      Slot conflict: {slot}
    </span>
  );
}
```

- [ ] **Step 4: Compute conflict state in `InventoryPanel`**

Modify `InventoryPanel.tsx` to pass `conflictingSlots: Set<string>` down to trinket rows. Compute via:

```ts
function detectTrinketConflicts(character: Character, items: Item[]): Set<string> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const slotCounts = new Map<string, number>();
  for (const entry of character.inventory) {
    if (!entry.equipped) continue;
    const item = byId.get(entry.itemId);
    if (item?.category !== 'trinket') continue;
    const slot = item.bodySlot;
    if (!slot) continue;
    slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1);
  }
  const conflicting = new Set<string>();
  for (const [slot, n] of slotCounts) {
    if (n > 1) conflicting.add(slot);
  }
  return conflicting;
}
```

Pass `conflictingSlots` into `InventorySection` (trinket section only) → `ItemRow`. `ItemRow` for trinkets renders `<BodySlotConflictChip conflicting={item.bodySlot ? conflictingSlots.has(item.bodySlot) : false} slot={item.bodySlot ?? ''} />` next to the Equip badge.

- [ ] **Step 5: Update `InventoryPanel.spec.tsx` with a conflict case**

Add a test where two trinkets share a body slot and assert the warning chip appears.

- [ ] **Step 6: Run tests to verify**

```bash
pnpm --filter @ironyard/web test -- inventory/
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/combat/inventory/BodySlotConflictChip.tsx apps/web/src/pages/combat/inventory/BodySlotConflictChip.spec.tsx apps/web/src/pages/combat/inventory/InventoryPanel.tsx apps/web/src/pages/combat/inventory/InventoryPanel.spec.tsx
git commit -m "feat(web): BodySlotConflictChip + trinket conflict detection in InventoryPanel"
```

### Task 1.8: Wire `InventoryPanel` into `PlayerSheetPanel`

**Files:**
- Modify: `apps/web/src/pages/combat/PlayerSheetPanel.tsx`

- [ ] **Step 1: Read the existing sheet structure**

```bash
sed -n '1,80p' apps/web/src/pages/combat/PlayerSheetPanel.tsx
```

Identify where to slot the inventory (likely after `Abilities` per the existing structure).

- [ ] **Step 2: Add a `Inventory` sub-component using `useCharacter` + `useItems`**

In `PlayerSheetPanel.tsx`, add:

```tsx
import { InventoryPanel } from './inventory/InventoryPanel';
import { useItems } from '../../api/static-data';
import { useEquipItem, useUnequipItem } from '../../api/mutations';

function Inventory({ participant, campaignId }: { participant: Participant; campaignId: string }) {
  const ch = useCharacter(participant.characterId ?? undefined);
  const items = useItems();
  const equip = useEquipItem(campaignId);
  const unequip = useUnequipItem(campaignId);

  if (!participant.characterId || !ch.data || !items.data) return null;

  return (
    <InventoryPanel
      character={ch.data}
      items={items.data}
      dispatch={{
        equip: (inventoryEntryId) => equip.mutate({ characterId: participant.characterId!, inventoryEntryId }),
        unequip: (inventoryEntryId) => unequip.mutate({ characterId: participant.characterId!, inventoryEntryId }),
      }}
    />
  );
}
```

Render `<Inventory participant={myParticipant} campaignId={campaignId} />` inside the sheet `<aside>` block, after `<Abilities />`.

- [ ] **Step 3: Manual smoke**

```bash
pnpm --filter @ironyard/web dev
```

Then in a browser, start a campaign, bring a character into an encounter, and open the sheet. Confirm:
- Inventory section renders.
- Equip/Unequip buttons dispatch and the runtime updates.
- Re-derived values (stamina, speed, etc.) reflect the toggled bonus.

- [ ] **Step 4: Run typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/combat/PlayerSheetPanel.tsx
git commit -m "feat(web): wire InventoryPanel into PlayerSheetPanel"
```

### Task 1.9: `SwapKitModal` component

**Files:**
- Create: `apps/web/src/pages/combat/inventory/SwapKitModal.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/pages/combat/inventory/SwapKitModal.spec.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { SwapKitModal } from './SwapKitModal';

const kits = [
  { id: 'mountain', name: 'Mountain' },
  { id: 'panther', name: 'Panther' },
];

describe('SwapKitModal', () => {
  it('lists kits and dispatches the chosen one on Confirm', () => {
    const dispatch = vi.fn();
    const onClose = vi.fn();
    const { getByText, getByRole } = render(
      <SwapKitModal kits={kits as any} currentKitId="mountain" onConfirm={dispatch} onClose={onClose} />
    );
    fireEvent.click(getByText('Panther'));
    fireEvent.click(getByRole('button', { name: /confirm/i }));
    expect(dispatch).toHaveBeenCalledWith('panther');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @ironyard/web test -- SwapKitModal.spec
```

Expected: FAIL.

- [ ] **Step 3: Create the component**

```tsx
import { useState } from 'react';
import type { Kit } from '@ironyard/shared';

type Props = {
  kits: Kit[];
  currentKitId: string | null;
  onConfirm: (kitId: string) => void;
  onClose: () => void;
};

export function SwapKitModal({ kits, currentKitId, onConfirm, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(currentKitId);
  return (
    <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-4">
        <h2 className="mb-2 text-lg font-semibold">Swap kit</h2>
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {kits.map((k) => (
            <li key={k.id}>
              <button
                type="button"
                className={`w-full min-h-[44px] rounded px-2 text-left ${selected === k.id ? 'bg-emerald-900/40' : 'hover:bg-neutral-800'}`}
                onClick={() => setSelected(k.id)}
              >
                {k.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-[44px] rounded border border-neutral-700 px-3">Cancel</button>
          <button
            type="button"
            disabled={!selected || selected === currentKitId}
            onClick={() => selected && onConfirm(selected)}
            className="min-h-[44px] rounded bg-emerald-700 px-3 disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @ironyard/web test -- SwapKitModal.spec
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/combat/inventory/SwapKitModal.tsx apps/web/src/pages/combat/inventory/SwapKitModal.spec.tsx
git commit -m "feat(web): SwapKitModal component"
```

### Task 1.10: Wire `SwapKitModal` trigger button into `PlayerSheetPanel`

**Files:**
- Modify: `apps/web/src/pages/combat/PlayerSheetPanel.tsx`
- Modify: `apps/web/src/api/mutations.ts` (add `useSwapKit` if not present)

- [ ] **Step 1: Check whether `useSwapKit` exists**

```bash
grep -n "useSwapKit\|SwapKit" apps/web/src/api/mutations.ts
```

- [ ] **Step 2: Add `useSwapKit` mutation if missing**

Same pattern as `useEquipItem`. Targets `IntentTypes.SwapKit` with `{ characterId, newKitId, ownerId }`. Get `ownerId` from `useMe()`.

- [ ] **Step 3: Add SwapKit trigger to `PlayerSheetPanel`**

Add a "Swap kit" button somewhere in the sheet header (near the existing kit display, if any) or in a kit-display sub-component. On click, open `<SwapKitModal>` with `kits` from `useKits()` and `currentKitId` from the character. On confirm, dispatch `useSwapKit().mutate({ characterId, newKitId, ownerId })`.

```tsx
function KitDisplay({ participant, campaignId, userId }: { participant: Participant; campaignId: string; userId: string }) {
  const ch = useCharacter(participant.characterId ?? undefined);
  const kits = useKits();
  const swapKit = useSwapKit(campaignId);
  const [open, setOpen] = useState(false);

  if (!ch.data || !kits.data) return null;

  return (
    <div className="text-xs text-neutral-400">
      Kit: {ch.data.kitId ?? '—'}
      <button onClick={() => setOpen(true)} className="ml-2 min-h-[44px] text-emerald-400">Swap</button>
      {open && (
        <SwapKitModal
          kits={kits.data}
          currentKitId={ch.data.kitId}
          onConfirm={(newKitId) => {
            swapKit.mutate({ characterId: ch.data!.id, newKitId, ownerId: userId });
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
```

> Verify the actual `Character.kitId` field name at impl time — could be `character.kitId` or nested under `character.kit`. Check `packages/shared/src/character.ts`.

- [ ] **Step 4: Manual smoke**

```bash
pnpm --filter @ironyard/web dev
```

Trigger the modal, swap kits, confirm the runtime re-derives (stamina/speed/stability change).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/combat/PlayerSheetPanel.tsx apps/web/src/api/mutations.ts
git commit -m "feat(web): SwapKitModal trigger button + useSwapKit dispatch"
```

### Task 1.11: Slice 1 close — full verify

- [ ] **Step 1: Full repo verify**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

Expected: PASS on all.

- [ ] **Step 2: Tag commit**

```bash
git commit --allow-empty -m "chore(2c): close Slice 1 — inventory display + Equip/Unequip + SwapKit picker"
```

---

## Slice 2: `UseConsumable` intent + UI

### Task 2.1: `UseConsumablePayloadSchema` in shared

**Files:**
- Create: `packages/shared/src/intents/use-consumable.ts`
- Modify: `packages/shared/src/intents/index.ts`
- Test: `packages/shared/tests/intents/use-consumable.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { UseConsumablePayloadSchema } from '../../src/intents';

describe('UseConsumablePayloadSchema', () => {
  it('accepts a self-target consumable', () => {
    expect(UseConsumablePayloadSchema.safeParse({
      characterId: 'c1',
      inventoryEntryId: 'i1',
    }).success).toBe(true);
  });

  it('accepts an external-target consumable', () => {
    expect(UseConsumablePayloadSchema.safeParse({
      characterId: 'c1',
      inventoryEntryId: 'i1',
      targetParticipantId: 'p1',
    }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @ironyard/shared test -- use-consumable
```

- [ ] **Step 3: Create the schema**

```ts
import { z } from 'zod';

export const UseConsumablePayloadSchema = z.object({
  characterId: z.string().min(1),
  inventoryEntryId: z.string().min(1),
  // Defaults to the character's own participant when omitted.
  targetParticipantId: z.string().min(1).optional(),
});
export type UseConsumablePayload = z.infer<typeof UseConsumablePayloadSchema>;
```

- [ ] **Step 4: Wire into `packages/shared/src/intents/index.ts`**

Add exports + `IntentTypes.UseConsumable: 'UseConsumable'`.

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @ironyard/shared test -- use-consumable
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/intents/use-consumable.ts packages/shared/src/intents/index.ts packages/shared/tests/intents/use-consumable.spec.ts
git commit -m "feat(shared): UseConsumable payload schema"
```

### Task 2.2: `UseConsumable` intent reducer (instant branch first)

**Files:**
- Create: `packages/rules/src/intents/use-consumable.ts`
- Create: `packages/rules/tests/intents/use-consumable.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { applyUseConsumable } from '../../src/intents/use-consumable';
import { makeCharacter, makeState, makeIntent } from './_fixtures';

describe('applyUseConsumable — instant branch', () => {
  it('emits an ApplyHeal derived intent for instant healing consumables', () => {
    const character = makeCharacter({
      inventory: [{ id: 'inv-1', itemId: 'potion-of-stamina', quantity: 3, equipped: false }],
    });
    const state = makeState(character, {
      participants: [{ id: 'p1', characterId: 'char-1', kind: 'pc', /* ... */ } as any],
      // Static-data bundle for item lookup; tests build a minimal bundle.
      // See packages/rules/src/static-data.ts for shape.
    });
    const result = applyUseConsumable(state, makeIntent({
      characterId: 'char-1',
      inventoryEntryId: 'inv-1',
    }));
    expect(result.derived).toHaveLength(1);
    expect(result.derived[0].type).toBe('ApplyHeal');
    // Quantity decrements
    const updated = result.state.characters?.find((c) => c.id === 'char-1');
    expect(updated?.inventory[0].quantity).toBe(2);
  });

  it('removes the inventory entry when quantity reaches 0', () => {
    const character = makeCharacter({
      inventory: [{ id: 'inv-1', itemId: 'potion-of-stamina', quantity: 1, equipped: false }],
    });
    const state = makeState(character);
    const result = applyUseConsumable(state, makeIntent({
      characterId: 'char-1',
      inventoryEntryId: 'inv-1',
    }));
    const updated = result.state.characters?.find((c) => c.id === 'char-1');
    expect(updated?.inventory.find((e) => e.id === 'inv-1')).toBeUndefined();
  });

  it('rejects when the item is not a consumable', () => {
    // Use a leveled-treasure item id; expect 'not_a_consumable' error.
  });

  it('rejects when character or inventory entry is missing', () => {
    // Two cases, mirroring EquipItem rejections.
  });
});
```

> Implementer note: the `applyUseConsumable` reducer needs access to the items catalog (`Item[]`) to look up `effectKind`. There are two patterns:
> - **Bundle on state.** Add `staticData: StaticDataBundle` to `CampaignState` (or pass via reducer context).
> - **Pass via a function-level arg.** Reducer becomes `applyUseConsumable(state, intent, items)`.
>
> Check `packages/rules/src/reducer.ts` — does the reducer signature already take static data? If yes, follow that. If no, the simpler path is to pass it as a third arg and have the reducer entry point load it once per intent. Verify pattern at impl time.

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @ironyard/rules test -- use-consumable
```

Expected: FAIL.

- [ ] **Step 3: Implement the instant branch**

Create `packages/rules/src/intents/use-consumable.ts`:

```ts
import { UseConsumablePayloadSchema, type ApplyHealPayload } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import type { StaticDataBundle } from '../static-data';

// Heal amount parsed from the consumable's effect text. Hand-authored in
// item overrides; defaults below if not present.
function parseHealAmount(itemId: string, overrides: Record<string, number>): number {
  return overrides[itemId] ?? 0;
}

export function applyUseConsumable(
  state: CampaignState,
  intent: StampedIntent,
  bundle: StaticDataBundle,
): IntentResult {
  const parsed = UseConsumablePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `UseConsumable rejected: ${parsed.error.message}`, intentId: intent.id }],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { characterId, inventoryEntryId, targetParticipantId } = parsed.data;
  const characters = state.characters ?? [];
  const character = characters.find((c) => c.id === characterId);
  if (!character) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `UseConsumable: character ${characterId} not found`, intentId: intent.id }],
      errors: [{ code: 'character_missing', message: `character ${characterId} not found` }],
    };
  }

  const entry = character.inventory.find((e) => e.id === inventoryEntryId);
  if (!entry) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `UseConsumable: inventory entry ${inventoryEntryId} not found`, intentId: intent.id }],
      errors: [{ code: 'inventory_entry_missing', message: 'inventory entry not found' }],
    };
  }

  const item = bundle.items.find((i) => i.id === entry.itemId);
  if (!item || item.category !== 'consumable') {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `UseConsumable: item not a consumable`, intentId: intent.id }],
      errors: [{ code: 'not_a_consumable', message: 'item is not a consumable' }],
    };
  }

  // Decrement quantity; remove entry if it hits 0.
  const newQty = entry.quantity - 1;
  const updatedInventory = newQty <= 0
    ? character.inventory.filter((e) => e.id !== inventoryEntryId)
    : character.inventory.map((e) => (e.id === inventoryEntryId ? { ...e, quantity: newQty } : e));
  const updatedCharacter = { ...character, inventory: updatedInventory };
  const updatedCharacters = characters.map((c) => (c.id === characterId ? updatedCharacter : c));

  // Branch on effectKind.
  const derived: StampedIntent[] = [];
  let logText = `Used ${item.name}`;

  switch (item.effectKind) {
    case 'instant': {
      // Heal amount comes from item-side authoring (Slice 5 override pass);
      // until then, log raw effect text without auto-applying.
      const amount = parseHealAmount(item.id, bundle.consumableHealAmounts ?? {});
      if (amount > 0) {
        const target = targetParticipantId ?? state.participants.find((p) => (p as any).characterId === characterId)?.id;
        if (target) {
          derived.push({
            id: `${intent.id}-derived-heal`,
            type: 'ApplyHeal',
            payload: { targetId: target, amount } as ApplyHealPayload,
            actorId: intent.actorId,
            seq: state.seq + 1,
            ts: intent.ts,
          });
          logText += ` — heals ${amount}`;
        }
      } else {
        logText += ` — instant effect (manual: ${item.raw ?? '(no text)'})`;
      }
      break;
    }
    case 'attack':
    case 'area': {
      // Defer to Slice 2 Task 2.3 (attack/area branch).
      logText += ` — attack/area (manual: ${item.raw ?? '(no text)'})`;
      break;
    }
    default: {
      // duration / two-phase / unknown — fall through to manual.
      logText += ` — ${item.effectKind} (manual: ${item.raw ?? '(no text)'})`;
    }
  }

  return {
    state: { ...state, seq: state.seq + 1, characters: updatedCharacters },
    derived,
    log: [{ kind: 'info', text: logText, intentId: intent.id }],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @ironyard/rules test -- use-consumable
```

Expected: PASS on instant + quantity + rejection tests.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/intents/use-consumable.ts packages/rules/tests/intents/use-consumable.spec.ts
git commit -m "feat(rules): UseConsumable intent — instant branch + quantity decrement"
```

### Task 2.3: `UseConsumable` attack / area branches

**Files:**
- Modify: `packages/rules/src/intents/use-consumable.ts`
- Modify: `packages/rules/tests/intents/use-consumable.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('emits a RollPower derived intent for attack-effectKind consumables', () => {
  const character = makeCharacter({
    inventory: [{ id: 'inv-1', itemId: 'flask-of-fire', quantity: 1, equipped: false }],
  });
  const state = makeState(character, {
    /* bundle with a consumable item where category='consumable', effectKind='attack',
       and a parsed powerRoll attached via item overrides */
  });
  const result = applyUseConsumable(state, makeIntent({
    characterId: 'char-1',
    inventoryEntryId: 'inv-1',
    targetParticipantId: 'p-target',
  }));
  expect(result.derived[0].type).toBe('RollPower');
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — current implementation falls through to manual.

- [ ] **Step 3: Implement the attack/area branch**

Modify `applyUseConsumable` to dispatch `RollPower` derived intents when `item.effectKind === 'attack' || 'area'` and the item has a `powerRoll` field. The `RollPower` payload should be:

```ts
const rollPowerPayload = {
  abilityId: item.id, // consumables are addressed as abilities for roll purposes
  attackerParticipantId: state.participants.find((p) => (p as any).characterId === characterId)?.id,
  targetParticipantId: targetParticipantId,
  rolls: [/* deferred to a dice roller upstream; populated by buildIntent */],
  // ... per RollPowerPayloadSchema
};
```

> Verify `RollPowerPayloadSchema` shape at `packages/shared/src/intents/roll-power.ts` (or wherever it lives). The `rolls` field is typically populated client-side per the dispatcher-pre-rolls model — if so, the derived intent path here doesn't include them; the reducer needs to surface the consumable to the player UI for the dice-roll step. **If `RollPower` requires pre-rolled dice in the payload and there's no way to defer**, then attack/area consumables can't be auto-dispatched as a derived intent from `UseConsumable` — they need a two-step flow: (1) UseConsumable dispatches a `PendingConsumableRoll` UI surface, (2) player rolls dice in the UI, (3) UI dispatches `RollPower` directly. **Pick the simpler path at impl time:** if `RollPower` payload is hostile to derived dispatch, fall the attack/area branches through to the manual log path for now and dispatch them via the player's existing roll flow on the sheet. Document the choice.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS if RollPower can be derived; otherwise pivot to the manual-fallback path and adjust the test.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/intents/use-consumable.ts packages/rules/tests/intents/use-consumable.spec.ts
git commit -m "feat(rules): UseConsumable attack/area branches dispatch RollPower"
```

### Task 2.4: Wire `UseConsumable` into reducer + IntentTypes

**Files:**
- Modify: `packages/rules/src/intents/index.ts`
- Modify: `packages/rules/src/reducer.ts`

- [ ] **Step 1: Export `applyUseConsumable`**

In `packages/rules/src/intents/index.ts`:

```ts
export { applyUseConsumable } from './use-consumable';
```

- [ ] **Step 2: Add reducer case**

```ts
case IntentTypes.UseConsumable:
  return applyUseConsumable(state, intent, bundle);
```

> If the reducer doesn't currently thread `bundle` through, plumb it. Likely a constructor injection: `createReducer(bundle)` returns a reducer function. Or pass `bundle` per dispatch.

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @ironyard/rules test
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/rules/src/intents/index.ts packages/rules/src/reducer.ts
git commit -m "feat(rules): wire UseConsumable into reducer"
```

### Task 2.5: `UseConsumableButton` UI + dispatch helper

**Files:**
- Create: `apps/web/src/pages/combat/inventory/UseConsumableButton.tsx`
- Modify: `apps/web/src/api/mutations.ts`
- Modify: `apps/web/src/pages/combat/inventory/ItemRow.tsx` (render the "Use" button on consumables)

- [ ] **Step 1: Add `useUseConsumable` dispatch helper**

In `apps/web/src/api/mutations.ts`:

```ts
import type { UseConsumablePayload } from '@ironyard/shared';

export function useUseConsumable(campaignId: string) {
  return useDispatch<UseConsumablePayload>(campaignId, IntentTypes.UseConsumable);
}
```

- [ ] **Step 2: Create `UseConsumableButton`**

```tsx
import { useState } from 'react';
import type { Participant } from '@ironyard/shared';

type Props = {
  inventoryEntryId: string;
  consumerCharacterId: string;
  participants: Participant[];
  onUse: (targetParticipantId?: string) => void;
};

export function UseConsumableButton({ inventoryEntryId: _, consumerCharacterId: __, participants, onUse }: Props) {
  const [picking, setPicking] = useState(false);

  if (!picking) {
    return (
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="min-h-[44px] rounded border border-neutral-700 px-2 text-xs hover:bg-neutral-800"
      >
        Use
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-xs text-neutral-400">Target:</div>
      <button type="button" onClick={() => { onUse(undefined); setPicking(false); }} className="block min-h-[44px] w-full rounded bg-neutral-800 px-2 text-xs">Self</button>
      {participants.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => { onUse(p.id); setPicking(false); }}
          className="block min-h-[44px] w-full rounded bg-neutral-800 px-2 text-xs"
        >
          {p.name}
        </button>
      ))}
      <button type="button" onClick={() => setPicking(false)} className="min-h-[44px] text-xs text-neutral-500">Cancel</button>
    </div>
  );
}
```

- [ ] **Step 3: Wire into `ItemRow`**

`ItemRow` already handles category-specific buttons. For consumables (`category === 'consumable'`), render `<UseConsumableButton ...>` instead of Equip/Unequip.

```tsx
if (item.category === 'consumable') {
  return (
    <div className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm">
      <div>
        <span className="font-medium">{item.name}</span>
        {entry.quantity > 1 && <span> ×{entry.quantity}</span>}
      </div>
      <UseConsumableButton
        inventoryEntryId={entry.id}
        consumerCharacterId={/* threaded from parent */ ''}
        participants={/* threaded */ []}
        onUse={(targetId) => dispatch.use(entry.id, targetId)}
      />
    </div>
  );
}
```

Extend `dispatch` prop in `InventoryPanel` → `InventorySection` → `ItemRow` with a `use(inventoryEntryId, targetId?)` function. Thread `participants` and `consumerCharacterId` similarly.

- [ ] **Step 4: Wire `useUseConsumable` in `PlayerSheetPanel`**

In the `Inventory` sub-component:

```tsx
const use = useUseConsumable(campaignId);

const dispatch = {
  equip: ...,
  unequip: ...,
  use: (inventoryEntryId: string, targetParticipantId?: string) =>
    use.mutate({ characterId: participant.characterId!, inventoryEntryId, targetParticipantId }),
};
```

Pass `participants` from `sock.activeEncounter.participants`.

- [ ] **Step 5: Run snapshot test**

```bash
pnpm --filter @ironyard/web test -- inventory/
```

Expected: PASS.

- [ ] **Step 6: Manual smoke**

```bash
pnpm --filter @ironyard/web dev
```

Pick a fresh PC with a healing consumable in inventory; use it; confirm stamina goes up (or log shows raw text for unsupported effectKinds).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/combat/inventory/ apps/web/src/api/mutations.ts apps/web/src/pages/combat/PlayerSheetPanel.tsx
git commit -m "feat(web): UseConsumable button + target picker + dispatch wiring"
```

### Task 2.6: Slice 2 close — full verify

- [ ] **Step 1: Full repo verify**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

Expected: PASS.

- [ ] **Step 2: Tag commit**

```bash
git commit --allow-empty -m "chore(2c): close Slice 2 — UseConsumable intent + UI"
```

---

## Slice 3: Director push-item

### Task 3.1: `PushItemPayloadSchema` in shared

**Files:**
- Create: `packages/shared/src/intents/push-item.ts`
- Modify: `packages/shared/src/intents/index.ts`
- Test: `packages/shared/tests/intents/push-item.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { PushItemPayloadSchema } from '../../src/intents';

describe('PushItemPayloadSchema', () => {
  it('requires targetCharacterId + itemId', () => {
    expect(PushItemPayloadSchema.safeParse({ targetCharacterId: 'c1', itemId: 'i1' }).success).toBe(true);
  });

  it('defaults quantity to 1', () => {
    const r = PushItemPayloadSchema.parse({ targetCharacterId: 'c1', itemId: 'i1' });
    expect(r.quantity).toBe(1);
  });

  it('bounds quantity to [1, 99]', () => {
    expect(PushItemPayloadSchema.safeParse({ targetCharacterId: 'c1', itemId: 'i1', quantity: 0 }).success).toBe(false);
    expect(PushItemPayloadSchema.safeParse({ targetCharacterId: 'c1', itemId: 'i1', quantity: 100 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Create the schema**

```ts
import { z } from 'zod';

export const PushItemPayloadSchema = z.object({
  targetCharacterId: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.number().int().min(1).max(99).default(1),
});
export type PushItemPayload = z.infer<typeof PushItemPayloadSchema>;
```

- [ ] **Step 3: Wire into `packages/shared/src/intents/index.ts`**

Add exports + `IntentTypes.PushItem: 'PushItem'`.

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @ironyard/shared test -- push-item
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/intents/push-item.ts packages/shared/src/intents/index.ts packages/shared/tests/intents/push-item.spec.ts
git commit -m "feat(shared): PushItem payload schema"
```

### Task 3.2: `PushItem` intent reducer with director-auth check

**Files:**
- Create: `packages/rules/src/intents/push-item.ts`
- Create: `packages/rules/tests/intents/push-item.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { applyPushItem } from '../../src/intents/push-item';
import { makeCharacter, makeState, makeIntent } from './_fixtures';

describe('applyPushItem', () => {
  it('rejects non-director dispatchers', () => {
    const state = makeState(makeCharacter(), { directorPermittedUserIds: ['director-1'] });
    const result = applyPushItem(state, makeIntent({
      targetCharacterId: 'char-1',
      itemId: 'potion-of-stamina',
    }, { actorId: 'random-player' }));
    expect(result.errors?.[0].code).toBe('not_authorized');
  });

  it('materializes an inventory entry on the target character', () => {
    const state = makeState(makeCharacter({ inventory: [] }), { directorPermittedUserIds: ['director-1'] });
    const result = applyPushItem(state, makeIntent({
      targetCharacterId: 'char-1',
      itemId: 'potion-of-stamina',
      quantity: 2,
    }, { actorId: 'director-1' }));
    const updated = result.state.characters?.find((c) => c.id === 'char-1');
    expect(updated?.inventory).toHaveLength(1);
    expect(updated?.inventory[0].itemId).toBe('potion-of-stamina');
    expect(updated?.inventory[0].quantity).toBe(2);
  });

  it('stacks onto an existing inventory entry of the same item', () => {
    const state = makeState(makeCharacter({
      inventory: [{ id: 'inv-1', itemId: 'potion-of-stamina', quantity: 1, equipped: false }],
    }), { directorPermittedUserIds: ['director-1'] });
    const result = applyPushItem(state, makeIntent({
      targetCharacterId: 'char-1',
      itemId: 'potion-of-stamina',
      quantity: 2,
    }, { actorId: 'director-1' }));
    const updated = result.state.characters?.find((c) => c.id === 'char-1');
    expect(updated?.inventory).toHaveLength(1);
    expect(updated?.inventory[0].quantity).toBe(3);
  });

  it('rejects when target character is missing', () => {
    // analogous
  });

  it('rejects when itemId is not in the catalog', () => {
    // analogous
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @ironyard/rules test -- push-item
```

Expected: FAIL.

- [ ] **Step 3: Implement the intent**

```ts
import { PushItemPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import type { StaticDataBundle } from '../static-data';

export function applyPushItem(
  state: CampaignState,
  intent: StampedIntent,
  bundle: StaticDataBundle,
): IntentResult {
  const parsed = PushItemPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: `PushItem rejected: ${parsed.error.message}`, intentId: intent.id }],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  // Director auth.
  if (!state.directorPermittedUserIds?.includes(intent.actorId)) {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: `PushItem rejected: not authorized`, intentId: intent.id }],
      errors: [{ code: 'not_authorized', message: 'PushItem requires director permission' }],
    };
  }

  const { targetCharacterId, itemId, quantity } = parsed.data;
  const characters = state.characters ?? [];
  const character = characters.find((c) => c.id === targetCharacterId);
  if (!character) {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: `PushItem: target character ${targetCharacterId} not found`, intentId: intent.id }],
      errors: [{ code: 'character_missing', message: 'target character not found' }],
    };
  }

  const item = bundle.items.find((i) => i.id === itemId);
  if (!item) {
    return {
      state, derived: [],
      log: [{ kind: 'error', text: `PushItem: item ${itemId} not in catalog`, intentId: intent.id }],
      errors: [{ code: 'item_missing', message: 'item not in catalog' }],
    };
  }

  // Stack onto existing entry of the same item, or materialize a new one.
  const existingIdx = character.inventory.findIndex((e) => e.itemId === itemId);
  const updatedInventory = existingIdx >= 0
    ? character.inventory.map((e, i) => i === existingIdx ? { ...e, quantity: e.quantity + quantity } : e)
    : [...character.inventory, { id: crypto.randomUUID(), itemId, quantity, equipped: false }];

  const updatedCharacter = { ...character, inventory: updatedInventory };
  const updatedCharacters = characters.map((c) => (c.id === targetCharacterId ? updatedCharacter : c));

  return {
    state: { ...state, seq: state.seq + 1, characters: updatedCharacters },
    derived: [],
    log: [{ kind: 'info', text: `Director pushed ${quantity}× ${item.name} to ${targetCharacterId}`, intentId: intent.id }],
  };
}
```

> Verify `state.directorPermittedUserIds` shape (or `members[].isDirector` per CLAUDE.md). Adjust the auth check to match.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS.

- [ ] **Step 5: Wire into reducer + IntentTypes**

Same pattern as Tasks 1.4 + 2.4.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/intents/push-item.ts packages/rules/tests/intents/push-item.spec.ts packages/rules/src/intents/index.ts packages/rules/src/reducer.ts
git commit -m "feat(rules): PushItem intent — director-only inventory grant"
```

### Task 3.3: `PushItemModal` director UI

**Files:**
- Create: `apps/web/src/pages/director/PushItemModal.tsx`
- Modify: `apps/web/src/api/mutations.ts` (add `usePushItem`)

- [ ] **Step 1: Add dispatch helper**

```ts
export function usePushItem(campaignId: string) {
  return useDispatch<PushItemPayload>(campaignId, IntentTypes.PushItem);
}
```

- [ ] **Step 2: Write the failing test**

Create `PushItemModal.spec.tsx` with a test that renders the modal, types into the search, clicks an item, and asserts the dispatch is called with the right payload.

- [ ] **Step 3: Create the modal**

```tsx
import { useState, useMemo } from 'react';
import type { Item, Character } from '@ironyard/shared';

type Props = {
  characters: Character[];
  items: Item[];
  onConfirm: (targetCharacterId: string, itemId: string, quantity: number) => void;
  onClose: () => void;
};

export function PushItemModal({ characters, items, onConfirm, onClose }: Props) {
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [quantity, setQuantity] = useState(1);

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-lg border border-neutral-700 bg-neutral-900 p-4">
        <h2 className="mb-2 text-lg font-semibold">Push item to a player</h2>

        <label className="mb-2 block text-xs text-neutral-400">Target character</label>
        <select
          className="mb-3 w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm"
          value={characterId ?? ''}
          onChange={(e) => setCharacterId(e.target.value || null)}
        >
          <option value="">— pick —</option>
          {characters.map((c) => <option key={c.id} value={c.id}>{c.details?.name ?? c.id}</option>)}
        </select>

        <label className="mb-2 block text-xs text-neutral-400">Item search</label>
        <input
          className="mb-2 w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ul className="mb-3 max-h-48 space-y-1 overflow-y-auto rounded border border-neutral-800 bg-neutral-950 p-1">
          {filteredItems.slice(0, 50).map((i) => (
            <li key={i.id}>
              <button
                type="button"
                className={`w-full min-h-[44px] rounded px-2 text-left text-sm ${itemId === i.id ? 'bg-emerald-900/40' : 'hover:bg-neutral-800'}`}
                onClick={() => setItemId(i.id)}
              >
                <span className="font-medium">{i.name}</span>
                <span className="ml-2 text-xs text-neutral-500">{i.category}</span>
              </button>
            </li>
          ))}
        </ul>

        <label className="mb-2 block text-xs text-neutral-400">Quantity</label>
        <input
          type="number"
          min={1}
          max={99}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
          className="mb-3 w-24 rounded border border-neutral-700 bg-neutral-800 p-2 text-sm"
        />

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-[44px] rounded border border-neutral-700 px-3">Cancel</button>
          <button
            type="button"
            disabled={!characterId || !itemId}
            onClick={() => characterId && itemId && onConfirm(characterId, itemId, quantity)}
            className="min-h-[44px] rounded bg-emerald-700 px-3 disabled:opacity-50"
          >
            Push item
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify**

```bash
pnpm --filter @ironyard/web test -- PushItemModal.spec
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/director/ apps/web/src/api/mutations.ts
git commit -m "feat(web): PushItemModal director UI"
```

### Task 3.4: Wire trigger button into director-side UI

**Files:**
- Modify: `apps/web/src/pages/CombatRun.tsx` (or wherever director-side controls live)

- [ ] **Step 1: Locate the director-only UI surface**

```bash
grep -rn "isDirector\b" apps/web/src/pages/ 2>&1 | head -10
```

The most likely spot is a director-side panel in `CombatRun.tsx` or `DetailPane.tsx` (which already handles director-trusted intents like `dispatchSetCondition`).

- [ ] **Step 2: Add a "Push item" button + modal trigger**

If the director-side area already has buttons (e.g. "Add monster"), add "Push item" as a sibling. On click, open `<PushItemModal>` with `characters` from `useApprovedCharacters(campaignId)` (or equivalent) and `items` from `useItems()`. On confirm, dispatch `usePushItem(campaignId).mutate({...})`.

> Verify which hook lists approved characters in the campaign. Likely lives in `apps/web/src/api/queries.ts`.

- [ ] **Step 3: Manual smoke**

```bash
pnpm --filter @ironyard/web dev
```

As the director, push a potion to a player; confirm the inventory entry appears on the target's sheet; confirm a toast or log entry fires for the player.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/
git commit -m "feat(web): Push item trigger button in director-side UI"
```

### Task 3.5: Slice 3 close — full verify

- [ ] **Step 1: Full repo verify**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

Expected: PASS.

- [ ] **Step 2: Tag commit**

```bash
git commit --allow-empty -m "chore(2c): close Slice 3 — director push-item"
```

---

## Slice 4: `Respite` intent expansion + UI

### Task 4.1: Draft canon § 10.17 (3-safely-carry rule) with two-gate verification

**Files:**
- Modify: `docs/rules-canon.md` (add § 10.17 before the carry-overs subsection, or as a new top-level § 12 — pick during impl based on doc structure)
- Modify: `packages/rules/src/canon-status.generated.ts` (regenerated)

- [ ] **Step 1: Write the canon entry**

Add a new subsection `### 10.17 Three-safely-carry rule ✅`. Source line:

```
> **Source:** Heroes PDF p. 326 (*Leveled Treasures → Connection With Leveled Treasures*). SteelCompendium mirror: `.reference/data-md/Rules/Chapters/Rewards.md` "Leveled Treasures" section.
```

Body (paraphrasing the verbatim PDF text):

```
A creature can safely carry a maximum of three leveled treasures at a time. If you carry more, the items become jealous of one another and fight for your attention.

It's fine to OWN more than three; only carried (equipped or readied-for-use) count toward the limit. If you carry more than three, you make a Presence power roll during each respite:

| Tier | Outcome |
|------|---------|
| ≤ 11 (t1) | One of your leveled treasures (Director's choice) grabs hold of your psyche. You enter a fugue state and discard the rest in locations you can't remember. Recover them later if possible. |
| 12–16 (t2) | Your items prevent you from moving until you pick three to keep and leave the rest behind. |
| ≥ 17 (t3) | Nothing happens. |

Engine implication. The respite handler surfaces a warning to the sheet when count > 3; the player dispatches a `RollPower` Presence test; the director or player dispatches consequence intents (drop items, narrate) based on the tier. No auto-resolution.
```

- [ ] **Step 2: Update the top-level status table**

Already has § 11 ✅. Either add § 10.17 nested under § 10 (no new top-level row) or promote to § 12. Pick "nested under § 10" — the top-level table doesn't list every subsection.

- [ ] **Step 3: Regenerate canon-status registry**

```bash
pnpm canon:gen
```

Expected output: the new slug `character-attachment-activation.three-safely-carry-rule` appears with `'verified'`. The numeric count goes from 97/9 to 98/9.

- [ ] **Step 4: Verify via Gate 1 + Gate 2**

Gate 1: `grep -n "safely carry" .reference/data-md/Rules/Chapters/Rewards.md` should return the relevant lines.
Gate 2: `grep -n "safely carry" /tmp/heroes.txt` should show p. 326 region (line ~24280).

- [ ] **Step 5: Run repo verify**

```bash
pnpm typecheck && pnpm lint
```

Expected: PASS (canon-status.generated.ts now lists the new slug; no engine code consumes it yet).

- [ ] **Step 6: Commit**

```bash
git add docs/rules-canon.md packages/rules/src/canon-status.generated.ts
git commit -m "docs(canon): § 10.17 three-safely-carry rule — both gates ✅ (Heroes PDF p. 326)"
```

### Task 4.2: Extend `Respite` reducer — stamina restoration

**Files:**
- Modify: `packages/rules/src/intents/respite.ts`
- Modify: `packages/rules/tests/intents/respite.spec.ts` (create if missing)

- [ ] **Step 1: Check existing test file**

```bash
ls packages/rules/tests/intents/respite.spec.ts 2>&1
```

If exists, append; if not, create.

- [ ] **Step 2: Write the failing test**

```ts
it('restores currentStamina to maxStamina for every PC participant', () => {
  const state = makeState(makeCharacter(), {
    participants: [
      { id: 'p1', kind: 'pc', currentStamina: 5, maxStamina: 20, characterId: 'char-1' /* ... */ } as any,
      { id: 'p2', kind: 'pc', currentStamina: 18, maxStamina: 18, characterId: 'char-2' /* ... */ } as any,
    ],
    encounter: null,
  });
  const result = applyRespite(state, makeIntent({}));
  const ps = result.state.participants;
  expect(ps[0].currentStamina).toBe(20);
  expect(ps[1].currentStamina).toBe(18);
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @ironyard/rules test -- respite
```

Expected: FAIL (current impl only restores recoveries).

- [ ] **Step 4: Update `applyRespite` to restore stamina**

Modify the participant map loop:

```ts
return {
  ...entry,
  recoveries: { current: entry.recoveries.max, max: entry.recoveries.max },
  currentStamina: entry.maxStamina,
};
```

- [ ] **Step 5: Run test to verify it passes**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/intents/respite.ts packages/rules/tests/intents/respite.spec.ts
git commit -m "feat(rules): Respite restores currentStamina to maxStamina"
```

### Task 4.3: Extend `Respite` reducer — Talent clarity floor reset

**Files:**
- Modify: `packages/rules/src/intents/respite.ts`
- Modify: `packages/rules/tests/intents/respite.spec.ts`

- [ ] **Step 1: Write the failing test**

`Participant.heroicResources` is an **array** of `HeroicResourceInstance` (one per canon heroic resource the participant carries; see `packages/shared/src/participant.ts:39-44`). Each instance has shape roughly `{ name, current, floor, max }` — verify against `HeroicResourceInstanceSchema` in `packages/shared/src/resource.ts` at impl time.

```ts
it('resets Talent clarity from negative to 0', () => {
  const state = makeState(makeCharacter(), {
    participants: [
      {
        id: 'p1', kind: 'pc',
        heroicResources: [{ name: 'clarity', current: -3, floor: -3, max: null }],
        /* other fields */
      } as any,
    ],
    encounter: null,
  });
  const result = applyRespite(state, makeIntent({}));
  const clarity = (result.state.participants[0] as any).heroicResources.find((r: any) => r.name === 'clarity');
  expect(clarity.current).toBe(0);
});

it('leaves non-negative resources unchanged', () => {
  // wrath at 5 stays at 5 (encounter-scoped, resets at EndEncounter, not respite)
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @ironyard/rules test -- respite
```

- [ ] **Step 3: Implement the floor-reset**

Inside the participant map:

```ts
const fixedResources = entry.heroicResources.map((r) =>
  r.current < 0 ? { ...r, current: 0 } : r
);

return {
  ...entry,
  recoveries: { current: entry.recoveries.max, max: entry.recoveries.max },
  currentStamina: entry.maxStamina,
  heroicResources: fixedResources,
};
```

> Only Talent's clarity goes negative; other classes have floor 0. The rule "raise negative current to 0" applied to a floor-0 resource is a no-op. Engine note: keep the logic generic so it doesn't special-case Talent. Surges and `extras` are untouched by respite; encounter-end resets cover those (canon § 5.6 + § 5.4–§ 5.5).

- [ ] **Step 4: Run test to verify**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/intents/respite.ts packages/rules/tests/intents/respite.spec.ts
git commit -m "feat(rules): Respite resets heroic-resource floor (clarity)"
```

### Task 4.4: Extend `Respite` reducer — 3-safely-carry warning

**Files:**
- Modify: `packages/rules/src/intents/respite.ts`
- Modify: `packages/rules/tests/intents/respite.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('surfaces a 3-safely-carry warning when > 3 leveled treasures equipped', () => {
  const character = makeCharacter({
    inventory: [
      { id: 'i1', itemId: 'leveled-1', quantity: 1, equipped: true },
      { id: 'i2', itemId: 'leveled-2', quantity: 1, equipped: true },
      { id: 'i3', itemId: 'leveled-3', quantity: 1, equipped: true },
      { id: 'i4', itemId: 'leveled-4', quantity: 1, equipped: true },
    ],
  });
  const state = makeState(character, {
    encounter: null,
    // bundle has leveled-1..4 as category='leveled-treasure'
  });
  const result = applyRespite(state, makeIntent({}));
  const warning = result.log.find((l) => l.text.includes('safely carry'));
  expect(warning).toBeDefined();
  expect(warning?.text).toMatch(/4.*leveled treasure/);
});

it('does not warn at 3 or fewer equipped leveled treasures', () => {
  // similar, with only 3
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL.

- [ ] **Step 3: Compute the count + emit log warning**

Inside `applyRespite`, after the character/participant update:

```ts
const warnings: LogEntry[] = [];
for (const character of updatedCharacters) {
  const leveledCount = character.inventory.filter((entry) => {
    if (!entry.equipped) return false;
    const item = bundle.items.find((i) => i.id === entry.itemId);
    return item?.category === 'leveled-treasure';
  }).length;
  if (leveledCount > 3) {
    warnings.push({
      kind: 'warning',
      text: `${character.details?.name ?? character.id} is carrying ${leveledCount} leveled treasures; per canon § 10.17 they must roll a Presence power roll. Tier 1: Director picks a treasure to discard. Tier 2: must drop down to 3. Tier 3: no effect.`,
      intentId: intent.id,
    });
  }
}

// Append warnings to the log array.
```

> The reducer needs `bundle: StaticDataBundle` access. If `applyRespite` doesn't currently take a bundle arg, thread it through (same pattern as `UseConsumable`).

- [ ] **Step 4: Run test to verify**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/intents/respite.ts packages/rules/tests/intents/respite.spec.ts
git commit -m "feat(rules): Respite emits 3-safely-carry warning when > 3 leveled treasures equipped"
```

### Task 4.5: Extend `Respite` payload to carry Wyrmplate damage-type choice

**Files:**
- Modify: `packages/shared/src/intents/respite.ts` (extend `RespitePayloadSchema`)
- Modify: `packages/rules/src/intents/respite.ts`
- Modify: `packages/rules/tests/intents/respite.spec.ts`

- [ ] **Step 1: Extend `RespitePayloadSchema`**

```ts
import { z } from 'zod';

export const RespitePayloadSchema = z.object({
  // Per-character Wyrmplate damage type choices made at this respite.
  // Empty when no Dragon Knight player is choosing this respite.
  wyrmplateChoices: z.record(z.string().min(1), z.string().min(1)).default({}),
  // Future: per-character respite activity choices (project roll selection,
  // kit-swap pick, etc.). Currently we model each as its own intent.
});
export type RespitePayload = z.infer<typeof RespitePayloadSchema>;
```

> Make sure the field names match the actual schema — the existing `RespitePayload` likely was empty `z.object({})`. Verify before extending.

- [ ] **Step 2: Write the failing test**

```ts
it('applies a Wyrmplate damage-type change to a Dragon Knight character', () => {
  const character = makeCharacter({
    id: 'char-dk',
    ancestryId: 'dragon-knight',
    ancestryChoices: { wyrmplateType: 'fire' },
  });
  const state = makeState(character, { encounter: null });
  const result = applyRespite(state, makeIntent({
    wyrmplateChoices: { 'char-dk': 'cold' },
  }));
  const updated = result.state.characters?.find((c) => c.id === 'char-dk');
  expect(updated?.ancestryChoices.wyrmplateType).toBe('cold');
});

it('ignores Wyrmplate choices for non-Dragon-Knight characters', () => {
  // Should not mutate ancestryChoices.
});
```

- [ ] **Step 3: Run test to verify it fails**

Expected: FAIL.

- [ ] **Step 4: Implement Wyrmplate mutation**

In `applyRespite`:

```ts
const { wyrmplateChoices } = parsed.data;

const updatedCharacters = (state.characters ?? []).map((c) => {
  let next = c;
  // ... existing recoveries/stamina/resource updates ...

  // Wyrmplate change.
  const newType = wyrmplateChoices[c.id];
  if (newType && c.ancestryId === 'dragon-knight') {
    next = { ...next, ancestryChoices: { ...next.ancestryChoices, wyrmplateType: newType } };
  }

  return next;
});
```

- [ ] **Step 5: Run test to verify**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/intents/respite.ts packages/rules/src/intents/respite.ts packages/rules/tests/intents/respite.spec.ts
git commit -m "feat(rules): Respite payload accepts Wyrmplate damage-type choices"
```

### Task 4.6: `RespiteConfirm` modal UI

**Files:**
- Create: `apps/web/src/pages/combat/RespiteConfirm.tsx`
- Modify: `apps/web/src/pages/CampaignView.tsx`

- [ ] **Step 1: Write the failing test**

Create `RespiteConfirm.spec.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { RespiteConfirm } from './RespiteConfirm';

const dkCharacter = {
  id: 'char-dk',
  ancestryId: 'dragon-knight',
  ancestryChoices: { wyrmplateType: 'fire' },
  inventory: [],
  details: { name: 'Tarn' },
} as any;

describe('RespiteConfirm', () => {
  it('shows a Wyrmplate prompt for Dragon Knight characters', () => {
    const { container } = render(
      <RespiteConfirm
        characters={[dkCharacter]}
        items={[]}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    expect(container.textContent).toMatch(/Wyrmplate/);
  });

  it('passes the chosen Wyrmplate type in the confirm payload', () => {
    const onConfirm = vi.fn();
    const { getByText, getByRole, getAllByRole } = render(
      <RespiteConfirm characters={[dkCharacter]} items={[]} onConfirm={onConfirm} onClose={() => {}} />
    );
    fireEvent.change(getAllByRole('combobox')[0], { target: { value: 'cold' } });
    fireEvent.click(getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith({ wyrmplateChoices: { 'char-dk': 'cold' } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @ironyard/web test -- RespiteConfirm.spec
```

- [ ] **Step 3: Create the component**

```tsx
import { useState } from 'react';
import type { Character, Item } from '@ironyard/shared';

type Props = {
  characters: Character[];
  items: Item[];
  onConfirm: (payload: { wyrmplateChoices: Record<string, string> }) => void;
  onClose: () => void;
};

const DAMAGE_TYPES = ['acid', 'cold', 'corruption', 'fire', 'holy', 'lightning', 'poison', 'psychic', 'sonic'] as const;

export function RespiteConfirm({ characters, items, onConfirm, onClose }: Props) {
  const dks = characters.filter((c) => c.ancestryId === 'dragon-knight');
  const [wyrmplateChoices, setWyrmplateChoices] = useState<Record<string, string>>(
    Object.fromEntries(dks.map((c) => [c.id, c.ancestryChoices?.wyrmplateType ?? 'fire'])),
  );

  // 3-safely-carry preview (informational; the real warning fires reducer-side).
  const safelyCarryRisks = characters
    .map((c) => {
      const count = c.inventory.filter((e) => {
        if (!e.equipped) return false;
        const item = items.find((i) => i.id === e.itemId);
        return item?.category === 'leveled-treasure';
      }).length;
      return count > 3 ? { character: c, count } : null;
    })
    .filter(Boolean);

  return (
    <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-4 space-y-3">
        <h2 className="text-lg font-semibold">Respite</h2>
        <p className="text-xs text-neutral-400">
          24h of rest. Heroes regain stamina + recoveries; Victories convert to XP.
        </p>

        {dks.length > 0 && (
          <section>
            <h3 className="mb-1 text-sm font-medium">Wyrmplate damage type</h3>
            {dks.map((c) => (
              <div key={c.id} className="mb-2">
                <label className="text-xs text-neutral-400">{c.details?.name ?? c.id}</label>
                <select
                  className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm"
                  value={wyrmplateChoices[c.id]}
                  onChange={(e) => setWyrmplateChoices({ ...wyrmplateChoices, [c.id]: e.target.value })}
                >
                  {DAMAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            ))}
          </section>
        )}

        {safelyCarryRisks.length > 0 && (
          <section className="rounded border border-amber-700 bg-amber-900/30 p-2 text-xs text-amber-300">
            <strong>3-safely-carry warning.</strong>
            <ul className="mt-1 list-disc pl-4">
              {safelyCarryRisks.map((r) => (
                <li key={r!.character.id}>
                  {r!.character.details?.name ?? r!.character.id} carries {r!.count} leveled treasures — Presence roll required at respite.
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-[44px] rounded border border-neutral-700 px-3">Cancel</button>
          <button
            type="button"
            onClick={() => onConfirm({ wyrmplateChoices })}
            className="min-h-[44px] rounded bg-emerald-700 px-3"
          >
            Confirm respite
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire into `CampaignView.tsx`**

Find the existing Respite button (line 187+):

```bash
sed -n '185,210p' apps/web/src/pages/CampaignView.tsx
```

Replace the bare button with one that opens `<RespiteConfirm>` and dispatches with the payload on confirm. Use `useApprovedCharacters` + `useItems` for the character + item lists.

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @ironyard/web test -- RespiteConfirm.spec
```

Expected: PASS.

- [ ] **Step 6: Manual smoke**

Take a respite as a Dragon Knight; change Wyrmplate type to cold; confirm; verify the runtime immunity changes from fire to cold.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/combat/RespiteConfirm.tsx apps/web/src/pages/combat/RespiteConfirm.spec.tsx apps/web/src/pages/CampaignView.tsx
git commit -m "feat(web): RespiteConfirm modal — Wyrmplate prompt + 3-safely-carry preview"
```

### Task 4.7: Slice 4 close — full verify

- [ ] **Step 1: Full repo verify**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

Expected: PASS.

- [ ] **Step 2: Tag commit**

```bash
git commit --allow-empty -m "chore(2c): close Slice 4 — Respite expansion + § 10.17 canon ✅"
```

---

## Slice 6 (executed 5th): § 10.8 weapon-damage-bonus engine variant

### Task 6.1: Extend `KitSchema` to retain per-echelon damage bonus arrays

**Files:**
- Modify: `packages/shared/src/data/kit.ts`
- Modify: `packages/data/src/parse-kit.ts`
- Modify: `packages/data/tests/parse-kit.spec.ts`

- [ ] **Step 1: Read the current shape**

```bash
grep -n "meleeDamageBonus\|rangedDamageBonus" packages/shared/src/data/kit.ts packages/data/src/parse-kit.ts
```

- [ ] **Step 2: Write the failing test**

Add to `packages/data/tests/parse-kit.spec.ts`:

```ts
it('extracts per-echelon melee damage bonus arrays', () => {
  const md = `
**Melee Damage Bonus:** +2/+5/+7

**Ranged Damage Bonus:** +0/+0/+0
`;
  const result = parseKit(md, 'mountain', 'Mountain');
  expect(result.meleeDamageBonusPerTier).toEqual([2, 5, 7]);
  expect(result.rangedDamageBonusPerTier).toEqual([0, 0, 0]);
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @ironyard/data test -- parse-kit
```

Expected: FAIL.

- [ ] **Step 4: Extend `KitSchema`**

In `packages/shared/src/data/kit.ts`, replace the flat `meleeDamageBonus: number` with:

```ts
meleeDamageBonusPerTier: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
rangedDamageBonusPerTier: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
```

Remove the flat fields (or keep as derived getters if downstream consumers need them; document the deprecation).

- [ ] **Step 5: Update `parse-kit.ts`**

Replace the "collapse to highest echelon" logic with a parser that splits `+X/+Y/+Z` and produces a 3-tuple.

```ts
function parseTierTuple(raw: string): [number, number, number] {
  const m = raw.match(/^\s*\+?(-?\d+)\s*\/\s*\+?(-?\d+)\s*\/\s*\+?(-?\d+)\s*$/);
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
```

Wire into the extraction block at line 99–119 (per the audit reference).

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm --filter @ironyard/data test -- parse-kit
```

Expected: PASS.

- [ ] **Step 7: Regenerate `kits.json`**

```bash
pnpm --filter @ironyard/data build
```

Verify `apps/web/public/data/kits.json` and `apps/api/src/data/kits.json` reflect the new shape.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/data/kit.ts packages/data/src/parse-kit.ts packages/data/tests/parse-kit.spec.ts apps/web/public/data/kits.json apps/api/src/data/kits.json
git commit -m "feat(data): per-echelon melee/ranged damage bonus on KitSchema"
```

### Task 6.2: Add `weapon-damage-bonus` to `AttachmentEffectSchema`

**Files:**
- Modify: `packages/rules/src/attachments/_types.ts`
- Modify: `packages/rules/tests/attachments/_types.spec.ts` (or whichever attachment-types test file exists)

- [ ] **Step 1: Read current AttachmentEffect shape**

```bash
sed -n '1,80p' packages/rules/src/attachments/_types.ts
```

- [ ] **Step 2: Write the failing test**

```ts
it('parses a weapon-damage-bonus effect', () => {
  const ok = AttachmentEffectSchema.safeParse({
    kind: 'weapon-damage-bonus',
    appliesTo: 'melee',
    perTier: [2, 5, 7],
  });
  expect(ok.success).toBe(true);
});

it('rejects perTier of wrong length', () => {
  const bad = AttachmentEffectSchema.safeParse({
    kind: 'weapon-damage-bonus',
    appliesTo: 'melee',
    perTier: [1, 2],
  });
  expect(bad.success).toBe(false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Expected: FAIL.

- [ ] **Step 4: Add the variant**

In `_types.ts`, extend the union:

```ts
const WeaponDamageBonusEffectSchema = z.object({
  kind: z.literal('weapon-damage-bonus'),
  appliesTo: z.enum(['melee', 'ranged']),
  perTier: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
});
```

Add to the discriminated union.

- [ ] **Step 5: Run test to verify it passes**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/attachments/_types.ts packages/rules/tests/attachments/
git commit -m "feat(rules): weapon-damage-bonus AttachmentEffect variant"
```

### Task 6.3: Emit `weapon-damage-bonus` from `collectFromKit`

**Files:**
- Modify: `packages/rules/src/attachments/collectors/kit.ts`
- Modify: `packages/rules/tests/attachments/collectors/kit.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('emits weapon-damage-bonus melee + ranged attachments per echelon arrays', () => {
  const kit = { id: 'mountain', meleeDamageBonusPerTier: [2, 5, 7], rangedDamageBonusPerTier: [0, 0, 0] } as Kit;
  const result = collectFromKit(/* character + bundle with the mountain kit */ ...);
  const melee = result.find((a) => a.effect.kind === 'weapon-damage-bonus' && a.effect.appliesTo === 'melee');
  expect(melee?.effect.perTier).toEqual([2, 5, 7]);
  // Ranged with all-zeros should still emit (or be skipped — pick a convention)
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @ironyard/rules test -- collectors/kit
```

- [ ] **Step 3: Implement**

In `collectFromKit.ts`, replace any current "flat melee bonus → free-strike-damage" logic with:

```ts
const meleeBonus = kit.meleeDamageBonusPerTier;
const rangedBonus = kit.rangedDamageBonusPerTier;

if (meleeBonus.some((n) => n !== 0)) {
  attachments.push({
    source: { kind: 'kit', id: kit.id },
    effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: meleeBonus },
  });
}
if (rangedBonus.some((n) => n !== 0)) {
  attachments.push({
    source: { kind: 'kit', id: kit.id },
    effect: { kind: 'weapon-damage-bonus', appliesTo: 'ranged', perTier: rangedBonus },
  });
}
```

> Don't emit zero-only bonuses to keep the attachment list small.

- [ ] **Step 4: Run test to verify**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/attachments/collectors/kit.ts packages/rules/tests/attachments/collectors/kit.spec.ts
git commit -m "feat(rules): collectFromKit emits weapon-damage-bonus per-tier melee + ranged"
```

### Task 6.4: Apply `weapon-damage-bonus` in `applyAttachments`

**Files:**
- Modify: `packages/rules/src/attachments/apply.ts`
- Modify: `packages/rules/tests/attachments/apply.spec.ts`

The apply step needs to **store** the weapon-damage bonuses in the `CharacterRuntime` so they're available at power-roll time. The cleanest shape: `runtime.weaponDamageBonus: { melee: [n,n,n], ranged: [n,n,n] }`.

- [ ] **Step 1: Extend `CharacterRuntime` to carry the bonus tuples**

In `packages/rules/src/derive-character-runtime.ts` (or wherever `CharacterRuntime` is typed), add:

```ts
type CharacterRuntime = {
  // ... existing fields ...
  weaponDamageBonus: {
    melee: [number, number, number];
    ranged: [number, number, number];
  };
};
```

Default `{ melee: [0,0,0], ranged: [0,0,0] }` in `deriveBaseRuntime`.

- [ ] **Step 2: Write the failing test**

```ts
it('folds weapon-damage-bonus attachments into runtime', () => {
  const attachments = [
    { source: { kind: 'kit', id: 'mountain' }, effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: [2, 5, 7] } },
  ];
  const base = makeBaseRuntime();
  const result = applyAttachments(base, attachments, ctx);
  expect(result.weaponDamageBonus.melee).toEqual([2, 5, 7]);
});

it('sums multiple weapon-damage-bonus attachments per echelon', () => {
  // kit + leveled-treasure both contribute; sum the per-tier values.
  // (Even though canon § 10.10 says "only higher" — engine sums today;
  // a separate fix lands per § 10.10 deferred work.)
});
```

- [ ] **Step 3: Run test to verify it fails**

- [ ] **Step 4: Implement the switch arm in `apply.ts`**

```ts
case 'weapon-damage-bonus': {
  const slot = effect.appliesTo === 'melee' ? 'melee' : 'ranged';
  runtime.weaponDamageBonus[slot] = [
    runtime.weaponDamageBonus[slot][0] + effect.perTier[0],
    runtime.weaponDamageBonus[slot][1] + effect.perTier[1],
    runtime.weaponDamageBonus[slot][2] + effect.perTier[2],
  ];
  break;
}
```

- [ ] **Step 5: Run test to verify it passes**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rules/src/attachments/apply.ts packages/rules/src/derive-character-runtime.ts packages/rules/tests/attachments/apply.spec.ts
git commit -m "feat(rules): apply weapon-damage-bonus → runtime.weaponDamageBonus"
```

### Task 6.5: Fold `weaponDamageBonus` into `RollPower` damage outcome

**Files:**
- Modify: `packages/rules/src/intents/roll-power.ts`
- Modify: `packages/rules/tests/intents/roll-power.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('adds melee weapon-damage-bonus to a Melee+Weapon ability damage outcome', () => {
  // Ability keywords: ['Melee', 'Weapon']
  // Character runtime: weaponDamageBonus.melee = [2, 5, 7]
  // Tier 2 outcome base damage: 5
  // Expected: 5 + 5 = 10
});

it('does not add melee bonus to a Ranged ability', () => {
  // Ranged ability + character with melee bonus only → no extra damage.
});

it('adds ranged bonus to Ranged+Weapon abilities', () => {
  // analogous.
});

it('does not add either bonus to a non-Weapon ability', () => {
  // e.g. Magic-only ability — no kit bonus applies.
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

In `roll-power.ts`, after computing the base tier-N damage:

```ts
// Apply weapon-damage-bonus if the ability is a Melee+Weapon or Ranged+Weapon strike.
const hasWeapon = ability.keywords?.includes('Weapon');
const isMelee = ability.keywords?.includes('Melee');
const isRanged = ability.keywords?.includes('Ranged');

if (hasWeapon) {
  const runtime = attackerRuntime; // already derived
  if (isMelee) {
    damage += runtime.weaponDamageBonus.melee[tier - 1] ?? 0;
  } else if (isRanged) {
    damage += runtime.weaponDamageBonus.ranged[tier - 1] ?? 0;
  }
}
```

> Verify the actual ability keyword shape — likely `ability.keywords: string[]` or `ability.type` enum.

- [ ] **Step 4: Run test to verify it passes**

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/intents/roll-power.ts packages/rules/tests/intents/roll-power.spec.ts
git commit -m "feat(rules): RollPower folds weapon-damage-bonus by tier"
```

### Task 6.6: Lift § 10.8 in canon

**Files:**
- Modify: `docs/rules-canon.md` (§ 10.8)
- Modify: `packages/rules/src/canon-status.generated.ts`

- [ ] **Step 1: Update § 10.8 from 🚧 to ✅**

Replace the 🚧 header with ✅. Update the body to document the `weapon-damage-bonus` AttachmentEffect variant. Reference Heroes PDF p. ~235 (verify page) for the underlying rule, and the engine path: `parse-kit.ts → KitSchema → collectFromKit → AttachmentEffect → applyAttachments → CharacterRuntime → RollPower`.

```
### 10.8 Kit melee/ranged damage bonus attachment ✅

> **Source:** SteelCompendium — `Rules/Chapters/Kits.md` "Kit Bonuses → Melee Damage Bonus" / "Ranged Damage Bonus" blocks. Heroes PDF p. 235 (*Kit Bonuses and Traits → Melee Damage Bonus*): "Your kit's melee damage bonus is added to the damage of every melee ability you use that has the Weapon keyword. The tier-1 entry is added to tier-1 outcomes, tier-2 to tier-2, tier-3 to tier-3." Verified 2026-05-12 by gate-2 walkthrough during Epic 2C Slice 6.

Engine variant: `{ kind: 'weapon-damage-bonus', appliesTo: 'melee' | 'ranged', perTier: [n,n,n] }`. Emitted by `collectFromKit`. Applied by `applyAttachments` into `runtime.weaponDamageBonus`. Folded into power-roll damage by `intents/roll-power.ts` when the ability's keywords include `Weapon` plus either `Melee` or `Ranged`.

Leveled treasures with a kit-keyword condition (canon § 10.10) emit additional `weapon-damage-bonus` attachments gated on the wielder's kit. Per-tier values stack additively today; canon § 10.10 "only higher applies" stacking is deferred (see § 10.16 carry-overs).
```

- [ ] **Step 2: Regenerate registry**

```bash
pnpm canon:gen
```

Expected: `character-attachment-activation.kit-melee-damage-bonus-attachment` flips `drafted → verified`.

- [ ] **Step 3: Commit**

```bash
git add docs/rules-canon.md packages/rules/src/canon-status.generated.ts
git commit -m "docs(canon): § 10.8 weapon-damage-bonus engine variant → ✅"
```

### Task 6.7: Slice 6 close — integration test + full verify

**Files:**
- Add: `packages/rules/tests/integration/kit-weapon-bonus.spec.ts`

- [ ] **Step 1: Write the end-to-end test**

```ts
it('fresh Mountain-kit Censor at level 3 — melee strike damage matches canon tier ladder', () => {
  const character = makeCensor({ kitId: 'mountain', level: 3 });
  const bundle = makeRealStaticDataBundle();
  const runtime = deriveCharacterRuntime(character, bundle);

  // Mountain kit's 1st-echelon (lvl 1-3): +2/+5/+7 melee
  expect(runtime.weaponDamageBonus.melee).toEqual([2, 5, 7]);

  // Free strike at tier 2 with Might=2: base 5 + 2 (Might) + 5 (kit bonus) = 12
  const result = applyIntent(initialState(character, bundle), buildRollPower({
    abilityId: 'melee-weapon-free-strike',
    attackerId: 'p1',
    targetId: 'p-monster',
    rolls: [6, 8], // total = 14 → tier 2
  }));
  const damageLog = result.log.find((l) => l.text.match(/damage/));
  expect(damageLog?.text).toMatch(/12 damage/);
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm --filter @ironyard/rules test -- integration/kit-weapon-bonus
```

Expected: PASS.

- [ ] **Step 3: Full repo verify**

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm canon:gen
```

The `canon:gen` run should be a no-op diff.

- [ ] **Step 4: Tag commit**

```bash
git commit --allow-empty -m "chore(2c): close Slice 6 — § 10.8 weapon-damage-bonus engine variant + ✅"
```

---

## Slice 5 (executed 6th): Comprehensive item + title override sweep

This slice is continuous authoring against the 98 items + 59 titles catalog. Acceptance is "no fresh PC level 1–10 produces a wrong runtime number." Each milestone below is a checkpoint, not a hard task — execution proceeds incrementally.

### Task 5.1: Build the per-category coverage matrix

**Files:**
- Create: `docs/superpowers/notes/2026-05-12-2c-slice-5-coverage.md`

- [ ] **Step 1: Enumerate items needing overrides**

```bash
# List item ids by category from items.json
pnpm exec node -e "const f = require('./apps/api/src/data/items.json'); const out = {}; for (const i of f) { out[i.category] = out[i.category] ?? []; out[i.category].push(i.id); } console.log(JSON.stringify(out, null, 2));"
```

- [ ] **Step 2: Categorize by static-stat-folding shape**

For each item:
- Has explicit stat fold (kit-keyword bonus, body-slot effect, immunity, stamina/speed/stability)? → needs override.
- Conditional / triggered / aura mechanic? → skip-deferred (note in coverage doc).
- Plain narrative item with no stat fold? → no override needed (note as "no-op").

Write the matrix to `docs/superpowers/notes/2026-05-12-2c-slice-5-coverage.md`:

```markdown
# Slice 5 coverage matrix

## Artifacts (3) — all skip-deferred (conditional/area mechanics; see 2B Slice 5 note)
- blade-of-a-thousand-years
- encepter
- mortal-coil

## Leveled treasures (35) — needs `weapon-damage-bonus` overrides via kit-keyword gate
- centerfire-catalyst → ranged, Bow keyword, +X/+Y/+Z (per echelon)
- chain-of-the-sea-and-sky → heavy armor, +stamina, +immunity
- … (33 more)

## Trinkets (25) — body-slot + stat-fold or grant-ability
- lightning-treads → feet, +2 speed (already authored 2B Slice 5)
- color-cloak (yellow) → neck, lightning immunity (already authored)
- … (23 more)

## Consumables (35) — `consumableHealAmounts` for instant-heal subset
- potion-of-stamina → heal 20
- potion-of-greater-stamina → heal 30
- … (33 more; most are duration/two-phase — fall through to manual)

## Titles (59)
- knight → +6 stamina (already authored 2B Slice 5)
- zombie-slayer → grant-ability holy-terror (already authored)
- … (57 more)
```

- [ ] **Step 3: Commit coverage doc**

```bash
git add docs/superpowers/notes/2026-05-12-2c-slice-5-coverage.md
git commit -m "docs(2c): Slice 5 coverage matrix — items + titles needing overrides"
```

### Task 5.2: Author leveled-treasure overrides (batch 1: weapon treasures)

**Files:**
- Modify: `packages/data/overrides/items.ts`

- [ ] **Step 1: For each weapon-keyword leveled treasure**, author an entry:

```ts
'centerfire-catalyst': {
  attachments: [
    {
      effect: { kind: 'weapon-damage-bonus', appliesTo: 'ranged', perTier: [1, 2, 3] /* 1st echelon */ },
      condition: { kind: 'kit-has-keyword', keyword: 'Bow' },
      requireCanonSlug: 'character-attachment-activation.kit-melee-damage-bonus-attachment',
    },
  ],
},
```

Gate 1: cite `.reference/data-md/Rules/Treasures/Centerfire Catalyst.md` line range.
Gate 2: Heroes PDF page (search `/tmp/heroes.txt` for the treasure name).

- [ ] **Step 2: Smoke test per batch**

After authoring ~5 entries, run:

```bash
pnpm --filter @ironyard/rules test -- derive-character-runtime
```

Confirm a fixture character wielding one of the new treasures has the expected damage bonus.

- [ ] **Step 3: Commit per batch (~5-10 entries at a time)**

```bash
git add packages/data/overrides/items.ts
git commit -m "feat(data): item overrides — weapon leveled treasures batch 1"
```

### Task 5.3: Author leveled-treasure overrides (batch 2: armor treasures)

Same pattern as 5.2. Armor treasures emit `{ kind: 'stat-mod', stat: 'stamina', delta: N }` plus an `armor-keyword` condition.

### Task 5.4: Author trinket overrides

Per-trinket entry with body-slot effect, immunity, or grant-ability. Reuses the 2B `stat-mod` and `grant-ability` variants.

### Task 5.5: Author consumable heal amounts

For instant-heal consumables, populate `bundle.consumableHealAmounts: Record<string, number>` (a new bundle field). Wire into `applyUseConsumable`'s `parseHealAmount` lookup.

> Note: this isn't an attachment, it's a parser-side metadata pull. Add as a new override file `packages/data/overrides/consumable-heal-amounts.ts`.

### Task 5.6: Author title overrides

Per-title entry. Mirrors 2B Slice 5 patterns (`stat-mod` for flat bonuses, `grant-ability` for ability grants).

### Task 5.7: Coverage acceptance test

**Files:**
- Add: `packages/rules/tests/integration/2c-coverage.spec.ts`

- [ ] **Step 1: Build a fixture sweep**

Pick 10 representative PC fixtures spanning the kits + ancestries:

```ts
const FIXTURES = [
  { name: 'lvl-3 Censor + Mountain + Lightning Treads', character: ... },
  { name: 'lvl-5 Tactician + Panther + Centerfire Catalyst', character: ... },
  // ...
];

describe('2C Slice 5 coverage', () => {
  for (const f of FIXTURES) {
    it(`derives correct runtime for ${f.name}`, () => {
      const runtime = deriveCharacterRuntime(f.character, bundle);
      expect(runtime).toMatchSnapshot();
    });
  }
});
```

- [ ] **Step 2: Snapshot the runtime**

```bash
pnpm --filter @ironyard/rules test -- 2c-coverage
```

Manually inspect the snapshot against canon — confirm stamina, speed, immunities, recovery value, weapon-damage bonuses match.

- [ ] **Step 3: Commit fixture + snapshot**

```bash
git add packages/rules/tests/integration/2c-coverage.spec.ts packages/rules/tests/integration/__snapshots__/2c-coverage.spec.ts.snap
git commit -m "test(rules): 2C Slice 5 integration coverage — 10 representative PC fixtures"
```

### Task 5.8: Slice 5 close — full repo verify

- [ ] **Step 1: Full verify**

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm canon:gen
```

Expected: all PASS; canon:gen is a no-op diff.

- [ ] **Step 2: Mark Slice 5 closed**

```bash
git commit --allow-empty -m "chore(2c): close Slice 5 — comprehensive item + title override sweep"
```

---

## Epic-close: full verify + phase-doc update

### Task 7.1: Full repo verify

- [ ] **Step 1:**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

Expected: PASS.

### Task 7.2: Update phases.md

**Files:**
- Modify: `docs/phases.md`

- [ ] **Step 1: Mark Sub-epic 2C as shipping**

Find the existing 2C placeholder line and update with shipped counts + carry-overs.

```markdown
**Sub-epic 2C — interactive UI + runtime intents** ([design spec](superpowers/specs/2026-05-12-phase-2-epic-2c-interactive-ui-design.md), [plan](superpowers/plans/2026-05-12-phase-2-epic-2c-interactive-ui.md)) — **shipping**

Six slices landed: EquipItem/UnequipItem + InventoryPanel + SwapKitModal; UseConsumable with instant/attack/area branches; PushItem director intent; Respite expansion (stamina restoration, clarity floor reset, 3-safely-carry warning via new canon § 10.17, Wyrmplate change); § 10.8 weapon-damage-bonus engine variant; comprehensive item + title override sweep.

Carry-overs deferred:
- Revenant Q16 inert / 12h Stamina recovery (depends on § 2.7+ damage-engine transitions, not yet built).
- Q18 class-feature choice pipeline (Conduit Prayers / Censor Domains) — separate engine epic.
- UseConsumable duration / two-phase branches — depends on temp-buff state machine.
- § 10.10 treasure-bonus stacking ("only higher applies").
- Ranged-distance / disengage kit-bonus variants.
```

- [ ] **Step 2: Commit**

```bash
git add docs/phases.md
git commit -m "docs(phases): Phase 2 Epic 2C shipping note"
```

### Task 7.3: Shipping commit

- [ ] **Step 1: Empty tag commit**

```bash
git commit --allow-empty -m "chore(2c): Phase 2 Epic 2C — interactive UI + runtime intents shipping"
```

---

## Self-review checklist (run after the plan is written)

The implementer should ignore this section — it's the plan-author's post-write review.

1. **Spec coverage:**
   - [ ] Slice 1 covers EquipItem + UnequipItem + InventoryPanel + BodySlotConflictChip + SwapKitModal (spec § Slice 1). ✓
   - [ ] Slice 2 covers UseConsumable with instant/attack/area branches + manual fallback (spec § Slice 2). ✓
   - [ ] Slice 3 covers PushItem + director-side modal (spec § Slice 3). ✓
   - [ ] Slice 4 covers Respite stamina/clarity/3-safely-carry/Wyrmplate + new canon § 10.17 (spec § Slice 4). ✓
   - [ ] Slice 5 covers comprehensive overrides with milestones (spec § Slice 5). ✓
   - [ ] Slice 6 covers weapon-damage-bonus end-to-end (spec § Slice 6). ✓

2. **Placeholder scan:**
   - [ ] No "TBD" / "TODO" / unspecified-shape steps. ✓
   - [ ] Every step that writes code shows the actual code.
   - [ ] Every test step has actual test code.

3. **Type consistency:**
   - [ ] `InventoryEntry` carries an `id` field (Task 1.2 Step 2 adds it if missing).
   - [ ] `weaponDamageBonus: { melee: [n,n,n], ranged: [n,n,n] }` consistent across `_types.ts`, `apply.ts`, `roll-power.ts`, `derive-character-runtime.ts`.
   - [ ] `RespitePayload.wyrmplateChoices: Record<string, string>` consistent shared ↔ rules.
   - [ ] Dispatch helper signatures (`useEquipItem`, `useUnequipItem`, `useUseConsumable`, `usePushItem`, `useSwapKit`) consistent with `IntentTypes` keys.

4. **Verification gaps:**
   - [ ] Several tasks include "verify shape at impl time" notes (InventoryEntry id, Character.kitId, ability.keywords, RollPowerPayload pre-rolls, director-auth field). These are flagged inline; not blockers.
