# Phase 2b Group A + B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the combined Group A (2b.4 Wings + Bloodfire) + Group B (2b.1 + 2b.3 + 2b.8 schema completeness) batch — 11 bisect-friendly sub-slices closing the ancestry-trait + kit-side gaps surfaced in the 2026-05-16 Phase 2b canon audit.

**Architecture:** Hybrid runtime-eval seam (per design spec § A1): no `AttachmentCondition` extension. Per-trait files under `packages/rules/src/ancestry-triggers/` (mirroring `class-triggers/`) subscribe to existing event reducers. New per-encounter participant fields (`movementMode`, `bloodfireActive`, `conditionImmunities`, `disengageBonus`, distance bonuses) as serializable source of truth. Read-site helpers in new `packages/rules/src/effective.ts`. The applier `applyAttachments` stays Participant-unaware — dynamic behavior lives in triggers + helpers, not in re-derivation.

**Tech stack:** TypeScript strict mode, Zod schemas as source of truth, Vitest for tests, pnpm workspaces. Test runner is Vitest via `pnpm exec vitest run <path>` from package dir or `pnpm --filter @ironyard/<pkg> test` from root.

**Spec:** [`docs/superpowers/specs/2026-05-16-phase-2b-group-a-plus-b-design.md`](../specs/2026-05-16-phase-2b-group-a-plus-b-design.md)

**Branch:** one branch `phase-2b-group-ab` off `master`. Sequential commits per sub-slice. Don't squash. Commit message convention: `feat(rules,...): <subject> (Phase 2b 2b.X-Y)` mirroring 2b.12–2b.16 style.

**Repo-wide verification per commit:**
```
pnpm test           # all tests pass repo-wide (~1774 baseline)
pnpm typecheck      # clean repo-wide
pnpm lint           # files touched have no new lint issues
```

---

## Pre-flight

- [ ] **Step P1: Create the branch**

```
git checkout -b phase-2b-group-ab
```

- [ ] **Step P2: Confirm baseline green**

```
pnpm test 2>&1 | tail -5
pnpm typecheck 2>&1 | tail -5
```
Expected: tests pass; typecheck clean. Note the baseline test count.

---

## Slice 1 — Schema-shape lift (foundation)

All schema additions land in one commit. Defaults preserve existing fixtures.

**Files:**
- Modify: `packages/shared/src/data/attachment.ts`
- Modify: `packages/shared/src/data/kit.ts`
- Modify: `packages/shared/src/participant.ts`
- Modify: `packages/shared/src/derive-character-runtime.ts`
- Modify: `packages/rules/src/attachments/apply.ts`
- Test: `packages/shared/src/data/attachment.test.ts` (existing or new)
- Test: `packages/shared/src/participant.test.ts` (existing)

### Step 1.1: Write failing test for new effect kinds parse round-trip

- [ ] Add a test that asserts each new `AttachmentEffect` kind round-trips through Zod parse.

```ts
// packages/shared/src/data/attachment.test.ts (append)
import { describe, it, expect } from 'vitest';
import { AttachmentEffectSchema } from './attachment';

describe('Phase 2b Group A+B — new AttachmentEffect kinds', () => {
  it('stat-mod-echelon parses', () => {
    const e = { kind: 'stat-mod-echelon', stat: 'maxStamina', perEchelon: [6, 12, 18, 24] };
    expect(AttachmentEffectSchema.parse(e)).toEqual(e);
  });
  it('immunity with level-plus value parses', () => {
    const e = { kind: 'immunity', damageKind: 'corruption', value: { kind: 'level-plus', offset: 2 } };
    expect(AttachmentEffectSchema.parse(e)).toEqual(e);
  });
  it('condition-immunity parses', () => {
    const e = { kind: 'condition-immunity', condition: 'Bleeding' };
    expect(AttachmentEffectSchema.parse(e)).toEqual(e);
  });
  it('grant-skill-edge parses', () => {
    const e = { kind: 'grant-skill-edge', skillGroup: 'intrigue' };
    expect(AttachmentEffectSchema.parse(e)).toEqual(e);
  });
  it('weapon-distance-bonus parses', () => {
    const e = { kind: 'weapon-distance-bonus', appliesTo: 'ranged', delta: 10 };
    expect(AttachmentEffectSchema.parse(e)).toEqual(e);
  });
  it('disengage-bonus parses', () => {
    const e = { kind: 'disengage-bonus', delta: 1 };
    expect(AttachmentEffectSchema.parse(e)).toEqual(e);
  });
});
```

### Step 1.2: Run test, verify it fails

- [ ] Run: `cd packages/shared && pnpm exec vitest run src/data/attachment.test.ts`

Expected: FAIL with "Invalid discriminator value" or similar.

### Step 1.3: Extend `AttachmentEffectSchema` in `packages/shared/src/data/attachment.ts`

- [ ] Replace the `AttachmentEffectSchema` discriminated union to add the new kinds and the `level-plus` variant on `immunity.value`.

```ts
// packages/shared/src/data/attachment.ts
import { ConditionTypeSchema } from '../condition';

const ImmunityValueSchema = z.union([
  z.number().int().nonnegative(),
  z.literal('level'),
  z.object({ kind: z.literal('level-plus'), offset: z.number().int().nonnegative() }),
]);

export const AttachmentEffectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('stat-mod'), stat: StatModFieldSchema, delta: z.number().int() }),
  z.object({
    kind: z.literal('stat-mod-echelon'),
    stat: StatModFieldSchema,
    perEchelon: z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int()]),
  }),
  z.object({ kind: z.literal('stat-replace'), stat: StatReplaceFieldSchema, value: z.union([z.number(), z.string()]) }),
  z.object({ kind: z.literal('grant-ability'), abilityId: z.string().min(1) }),
  z.object({ kind: z.literal('grant-skill'), skill: z.string().min(1) }),
  z.object({ kind: z.literal('grant-language'), language: z.string().min(1) }),
  z.object({ kind: z.literal('grant-skill-edge'), skillGroup: z.string().min(1) }),
  z.object({ kind: z.literal('immunity'), damageKind: z.string().min(1), value: ImmunityValueSchema }),
  z.object({ kind: z.literal('weakness'), damageKind: z.string().min(1), value: z.union([z.number().int().nonnegative(), z.literal('level')]) }),
  z.object({ kind: z.literal('condition-immunity'), condition: ConditionTypeSchema }),
  z.object({ kind: z.literal('free-strike-damage'), delta: z.number().int() }),
  z.object({
    kind: z.literal('weapon-damage-bonus'),
    appliesTo: z.enum(['melee', 'ranged']),
    perTier: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
  }),
  z.object({
    kind: z.literal('weapon-distance-bonus'),
    appliesTo: z.enum(['melee', 'ranged']),
    delta: z.number().int(),
  }),
  z.object({ kind: z.literal('disengage-bonus'), delta: z.number().int() }),
]);
```

### Step 1.4: Run effect-schema test, verify it passes

- [ ] Run: `cd packages/shared && pnpm exec vitest run src/data/attachment.test.ts`

Expected: PASS.

### Step 1.5: Extend `KitSchema` with distance + disengage bonus fields

- [ ] Find `KitSchema` in `packages/shared/src/data/kit.ts` and add the three new fields with `.default(0)`.

```ts
// packages/shared/src/data/kit.ts — within KitSchema definition
meleeDistanceBonus: z.number().int().nonnegative().default(0),
rangedDistanceBonus: z.number().int().nonnegative().default(0),
disengageBonus: z.number().int().nonnegative().default(0),
```

### Step 1.6: Extend `ParticipantSchema` with new fields

- [ ] In `packages/shared/src/participant.ts`, add the six new fields with defaults so existing snapshots remain parseable. Also add the import for `ConditionTypeSchema`.

```ts
// packages/shared/src/participant.ts — append the imports and fields
import { ConditionTypeSchema } from './condition';

// ... within ParticipantSchema z.object({ ... }):

// Phase 2b Group A+B — Wings / Shadowmeld movement mode + Bloodfire latch
movementMode: z
  .object({
    mode: z.enum(['flying', 'shadow']),
    roundsRemaining: z.number().int().min(0),
  })
  .nullable()
  .default(null),

bloodfireActive: z.boolean().default(false),

// Phase 2b 2b.8 — condition-immunity snapshot from CharacterRuntime at StartEncounter.
// Consumed by isImmuneToCondition (effective.ts) at every condition-application site.
conditionImmunities: z.array(ConditionTypeSchema).default([]),

// Phase 2b 2b.3 — kit-side bonuses snapshot from CharacterRuntime at StartEncounter.
disengageBonus: z.number().int().nonnegative().default(0),
meleeDistanceBonus: z.number().int().nonnegative().default(0),
rangedDistanceBonus: z.number().int().nonnegative().default(0),
```

### Step 1.7: Extend `CharacterRuntime` with matching fields + echelon picker

- [ ] In `packages/shared/src/derive-character-runtime.ts` (or wherever `CharacterRuntime` is defined — `grep -rn "type CharacterRuntime\|interface CharacterRuntime" packages/shared/src/` if uncertain), add the four new fields. Initialize defaults in the base-runtime factory.

```ts
// CharacterRuntime additions
conditionImmunities: ConditionType[];
disengageBonus: number;
meleeDistanceBonus: number;
rangedDistanceBonus: number;
skillEdges: string[];   // skill GROUP names; consumed by skill rolls (slice 5)
```

In the base-runtime factory (the function that returns the initial empty runtime), default these to `[]`, `0`, `0`, `0`, `[]`.

### Step 1.8: Teach `applyEffect` the new kinds (and `resolveLevel` the level-plus variant)

- [ ] In `packages/rules/src/attachments/apply.ts`, extend `applyEffect` and `resolveLevel`.

```ts
function resolveLevel(
  value: number | 'level' | { kind: 'level-plus'; offset: number },
  character: Character,
): number {
  if (typeof value === 'number') return value;
  if (value === 'level') return character.level;
  return character.level + value.offset; // level-plus
}

function applyEffect(out: CharacterRuntime, effect: AttachmentEffect, ctx: ApplyCtx): void {
  switch (effect.kind) {
    // ... existing cases unchanged ...
    case 'stat-mod-echelon': {
      const lvl = ctx.character.level;
      const idx = lvl >= 10 ? 3 : lvl >= 7 ? 2 : lvl >= 4 ? 1 : 0;
      (out as unknown as Record<string, number>)[effect.stat] =
        ((out as unknown as Record<string, number>)[effect.stat] ?? 0) + effect.perEchelon[idx];
      return;
    }
    case 'condition-immunity':
      out.conditionImmunities.push(effect.condition);
      return;
    case 'grant-skill-edge':
      out.skillEdges.push(effect.skillGroup);
      return;
    case 'weapon-distance-bonus':
      if (effect.appliesTo === 'melee') out.meleeDistanceBonus += effect.delta;
      else out.rangedDistanceBonus += effect.delta;
      return;
    case 'disengage-bonus':
      out.disengageBonus += effect.delta;
      return;
  }
}
```

Add dedupe for the new array fields:

```ts
out.conditionImmunities = [...new Set(out.conditionImmunities)];
out.skillEdges = [...new Set(out.skillEdges)];
```

### Step 1.9: Run repo-wide tests + typecheck

- [ ] Run from repo root:
```
pnpm test 2>&1 | tail -5
pnpm typecheck 2>&1 | tail -5
```
Expected: all green; no new failures; same test count + the new tests.

### Step 1.10: Commit slice 1

- [ ] Commit:
```
git add packages/shared/src/data/attachment.ts \
        packages/shared/src/data/attachment.test.ts \
        packages/shared/src/data/kit.ts \
        packages/shared/src/participant.ts \
        packages/shared/src/derive-character-runtime.ts \
        packages/rules/src/attachments/apply.ts
git commit -m "$(cat <<'EOF'
feat(shared,rules): schema lift for Phase 2b Group A+B (2b.1 + 2b.3 + 2b.4 + 2b.8)

Adds new AttachmentEffect kinds: stat-mod-echelon, condition-immunity,
grant-skill-edge, weapon-distance-bonus, disengage-bonus. Extends
immunity.value with { kind: 'level-plus', offset } variant. Adds matching
participant fields (movementMode, bloodfireActive, conditionImmunities,
distance + disengage bonus snapshots). Applier handles the new effect
kinds and the level-plus variant via resolveLevel. No behavior change
yet — overrides + read sites land in subsequent slices.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Slice 2 — `condition-immunity` overrides + read-site helper

Generalizes 2b.15's Bloodless-specific dying-Bleeding suppression to a typed `isImmuneToCondition` helper consumed by all condition-application sites. Adds 6 ancestry-trait overrides.

**Files:**
- Create: `packages/rules/src/effective.ts`
- Modify: `packages/data/overrides/ancestry-traits.ts`
- Modify: `packages/rules/src/stamina.ts` (replace Bloodless special-case)
- Modify: `packages/rules/src/intents/apply-condition.ts`
- Test: `packages/rules/src/effective.test.ts` (new)
- Test: `packages/rules/src/intents/apply-condition.test.ts` (existing or new)

### Step 2.1: Failing test for `isImmuneToCondition`

- [ ] Create `packages/rules/src/effective.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isImmuneToCondition } from './effective';
import { defaultParticipant } from './test-helpers'; // or build inline

describe('isImmuneToCondition', () => {
  it('returns false when conditionImmunities is empty', () => {
    const p = { ...defaultParticipant(), conditionImmunities: [] };
    expect(isImmuneToCondition(p, 'Bleeding')).toBe(false);
  });
  it('returns true when condition is in conditionImmunities', () => {
    const p = { ...defaultParticipant(), conditionImmunities: ['Bleeding' as const] };
    expect(isImmuneToCondition(p, 'Bleeding')).toBe(true);
  });
});
```

If `defaultParticipant` test helper doesn't exist, build a minimal `Participant` inline using the schema's defaults or copy an existing test's helper.

### Step 2.2: Run test, verify fail

- [ ] Run: `cd packages/rules && pnpm exec vitest run src/effective.test.ts`

Expected: FAIL — module not found.

### Step 2.3: Implement `effective.ts` skeleton with `isImmuneToCondition`

- [ ] Create `packages/rules/src/effective.ts`:

```ts
import type { ConditionType, Participant } from '@ironyard/shared';

// Phase 2b Group A+B — read-site helpers. Pure functions over Participant
// (+ Character/level when needed). Consumers replace direct field reads
// with these so dynamic per-encounter state layers on cleanly.

export function isImmuneToCondition(p: Participant, cond: ConditionType): boolean {
  return p.conditionImmunities.includes(cond);
}
```

### Step 2.4: Run test, verify pass

- [ ] Run: `cd packages/rules && pnpm exec vitest run src/effective.test.ts`

Expected: PASS.

### Step 2.5: Generalize Bloodless suppression in stamina.ts

- [ ] Find the current Bloodless-specific suppression in `packages/rules/src/stamina.ts` (`grep -n "bloodless\|Bloodless" packages/rules/src/stamina.ts`). Replace the special-case `purchasedTraits.includes('bloodless')` check with `isImmuneToCondition(p, 'Bleeding')`. Confirm the existing 2b.15 Bloodless test still passes.

```ts
// stamina.ts inside applyTransitionSideEffects (or wherever the dying-Bleeding
// path lives) — replace the special-case check:
import { isImmuneToCondition } from './effective';

// ... when about to push Bleeding for a dying PC:
if (!isImmuneToCondition(participant, 'Bleeding')) {
  // push Bleeding instance as before
}
```

### Step 2.6: Apply same check in apply-condition reducer

- [ ] In `packages/rules/src/intents/apply-condition.ts`, gate the condition-application path:

```ts
import { isImmuneToCondition } from '../effective';

// In the reducer body, before pushing the condition onto participant.conditions:
if (isImmuneToCondition(participant, intent.payload.condition)) {
  return { kind: 'rejected', reason: 'condition-immunity' };
  // OR if outcomes are needed for logging: emit an outcome with immune=true and skip push.
}
```

(Inspect existing reducer for exact outcome shape; use the same pattern.)

### Step 2.7: Snapshot conditionImmunities to participant at StartEncounter

- [ ] Find where `CharacterRuntime → Participant` snapshot happens at `StartEncounter` (`grep -n "weaponDamageBonus" packages/rules/src/intents/start-encounter.ts` or similar). Add the analogous line for `conditionImmunities`.

```ts
// In the participant-build block:
conditionImmunities: runtime.conditionImmunities,
```

### Step 2.8: Failing test for one of the 6 condition-immunity ancestry traits

- [ ] Create or extend `packages/rules/src/intents/apply-condition.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
// reduce, makeState, makeParticipant helpers — copy pattern from existing intent tests

describe('ApplyCondition × condition-immunity ancestry traits', () => {
  it('Revenant Bloodless suppresses player-dispatched Bleeding', () => {
    const p = makeParticipant({
      conditionImmunities: ['Bleeding'],
      purchasedTraits: ['bloodless'],
    });
    const state = makeState({ participants: [p] });
    const result = reduce(state, {
      type: 'ApplyCondition',
      source: 'director',
      payload: { participantId: p.id, condition: 'Bleeding' },
    });
    // Expect the participant's conditions array to NOT include Bleeding.
    const updated = result.state.participants.find(x => x.id === p.id);
    expect(updated?.conditions.find(c => c.type === 'Bleeding')).toBeUndefined();
  });
});
```

### Step 2.9: Run test, verify fail (or already pass if 2.6 wired)

- [ ] Run: `cd packages/rules && pnpm exec vitest run src/intents/apply-condition.test.ts`

If the slice-2.6 reducer wiring is correct: PASS. If something missing, fix until PASS.

### Step 2.10: Add the 6 condition-immunity ancestry-trait overrides

- [ ] In `packages/data/overrides/ancestry-traits.ts`, replace the relevant SKIPPED-DEFERRED comments with concrete entries. Canon trait ids:
  - `revenant.bloodless` → bleeding-immunity
  - `dwarf.great-fortitude` → weakened-immunity
  - `polder.fearless` → frightened-immunity
  - `orc.nonstop` → slowed-immunity
  - `memonek.nonstop` → slowed-immunity
  - `highelf.unstoppable-mind` → dazed-immunity
  - `memonek.unphased` → surprised-immunity

Wait — surprised is not a ConditionType. `Surprised` is a participant flag (`participant.surprised: boolean`), not a `ConditionInstance`. So `memonek.unphased` doesn't fit `condition-immunity` shape — it would need a separate field-immunity check at the surprise-application site (likely `MarkSurprised` reducer or `RollInitiative.surprised[]` consumer).

**Decision:** ship the 6 traits whose target IS a `ConditionType` (Bleeding, Weakened, Frightened, Slowed × 2, Dazed) in this slice. Memonek Unphased gets a small follow-up step: add `MarkSurprised` reducer gate keyed on a parallel field — for now use `purchasedTraits.includes('memonek.unphased')` to gate, document in code comment as carry-over to a future "non-condition immunity" generalization.

Concrete override entries (extend `ancestry-traits.ts` map):

```ts
'revenant.bloodless': [
  {
    source: { kind: 'ancestry-trait', id: 'revenant.bloodless' },
    effect: { kind: 'condition-immunity', condition: 'Bleeding' },
  },
],
'dwarf.great-fortitude': [
  {
    source: { kind: 'ancestry-trait', id: 'dwarf.great-fortitude' },
    effect: { kind: 'condition-immunity', condition: 'Weakened' },
  },
],
'polder.fearless': [
  {
    source: { kind: 'ancestry-trait', id: 'polder.fearless' },
    effect: { kind: 'condition-immunity', condition: 'Frightened' },
  },
],
'orc.nonstop': [
  {
    source: { kind: 'ancestry-trait', id: 'orc.nonstop' },
    effect: { kind: 'condition-immunity', condition: 'Slowed' },
  },
],
'memonek.nonstop': [
  {
    source: { kind: 'ancestry-trait', id: 'memonek.nonstop' },
    effect: { kind: 'condition-immunity', condition: 'Slowed' },
  },
],
'highelf.unstoppable-mind': [
  {
    source: { kind: 'ancestry-trait', id: 'highelf.unstoppable-mind' },
    effect: { kind: 'condition-immunity', condition: 'Dazed' },
  },
],
```

Remove the corresponding SKIPPED-DEFERRED comment lines for these 6 traits.

### Step 2.11: Memonek Unphased — surprised-flag gate

- [ ] Find `MarkSurprised` reducer (`packages/rules/src/intents/mark-surprised.ts`). Add a gate that rejects when `participant.purchasedTraits.includes('memonek.unphased')`. Add a one-line code comment: `// Memonek Unphased — surprised-flag immunity. Generalize to a typed flag-immunity helper alongside future surprised → ConditionType migration if any.` Also gate `RollInitiative.surprised[]` consumer (`packages/rules/src/intents/roll-initiative.ts`) if it sets the flag directly.

### Step 2.12: Run repo-wide tests + typecheck

- [ ] Run from repo root:
```
pnpm test 2>&1 | tail -5
pnpm typecheck 2>&1 | tail -5
```
Expected: all green. New tests count up.

### Step 2.13: Commit slice 2

- [ ] Commit:
```
git add packages/rules/src/effective.ts \
        packages/rules/src/effective.test.ts \
        packages/data/overrides/ancestry-traits.ts \
        packages/rules/src/stamina.ts \
        packages/rules/src/intents/apply-condition.ts \
        packages/rules/src/intents/apply-condition.test.ts \
        packages/rules/src/intents/mark-surprised.ts \
        packages/rules/src/intents/roll-initiative.ts \
        packages/rules/src/intents/start-encounter.ts
git commit -m "$(cat <<'EOF'
feat(rules,data): condition-immunity effect kind + 6 ancestry-trait overrides (Phase 2b 2b.8)

New isImmuneToCondition helper (effective.ts) consumed by ApplyCondition
reducer and applyTransitionSideEffects — generalizes 2b.15's Bloodless-
specific dying-Bleeding suppression. Snapshots conditionImmunities to
participant at StartEncounter. Overrides ship for Bloodless, Great
Fortitude, Polder Fearless, Orc/Memonek Nonstop, High Elf Unstoppable
Mind. Memonek Unphased (surprised-flag, not a ConditionType) gated at
MarkSurprised + RollInitiative via purchasedTraits check.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Slice 3 — Per-echelon `stat-mod-echelon`

Migrates Dwarf Spark Off Your Skin, Wyrmplate, Psychic Scar to the per-echelon shape.

**Files:**
- Modify: `packages/data/overrides/ancestry-traits.ts`
- Test: `packages/shared/src/derive-character-runtime.test.ts` (or existing analog)

### Step 3.1: Failing test for Spark Off Your Skin at L1/L4/L7/L10

- [ ] Add test:

```ts
import { describe, it, expect } from 'vitest';
import { deriveCharacterRuntime } from './derive-character-runtime';
import { makeDwarfWithTrait } from './test-helpers'; // build minimal Dwarf character

describe('Spark Off Your Skin per-echelon scaling', () => {
  it.each([[1, 6], [4, 12], [7, 18], [10, 24]])(
    'L%i grants +%i maxStamina',
    (level, expected) => {
      const char = makeDwarfWithTrait('dwarf.spark-off-your-skin', level);
      const baseline = deriveCharacterRuntime({ ...char, ancestryChoices: { traitIds: [] } }).maxStamina;
      const withTrait = deriveCharacterRuntime(char).maxStamina;
      expect(withTrait - baseline).toBe(expected);
    },
  );
});
```

### Step 3.2: Run test, verify fail

- [ ] Run: `cd packages/shared && pnpm exec vitest run src/derive-character-runtime.test.ts -t "Spark Off Your Skin"`

Expected: FAIL — current override ships +6 at all levels, not the per-echelon ramp.

### Step 3.3: Migrate Spark Off Your Skin override

- [ ] In `packages/data/overrides/ancestry-traits.ts`, replace:

```ts
'dwarf.spark-off-your-skin': [
  {
    source: { kind: 'ancestry-trait', id: 'dwarf.spark-off-your-skin' },
    effect: { kind: 'stat-mod-echelon', stat: 'maxStamina', perEchelon: [6, 12, 18, 24] },
  },
],
```

Remove the SKIPPED-DEFERRED-PARTIAL comment.

### Step 3.4: Run test, verify pass

- [ ] Run: `cd packages/shared && pnpm exec vitest run src/derive-character-runtime.test.ts -t "Spark Off Your Skin"`

Expected: PASS.

### Step 3.5: Migrate Wyrmplate + Psychic Scar to per-echelon shape

- [ ] Re-read canon for both:
  - Wyrmplate (Dragon Knight signature): `grep -B2 -A6 "Wyrmplate" .reference/data-md/Rules/Ancestries/Dragon\ Knight.md`
  - Psychic Scar (Time Raider signature): `grep -B2 -A6 "Psychic Scar" .reference/data-md/Rules/Ancestries/Time\ Raider.md`

Confirm the per-echelon tuples [L1, L4, L7, L10] against canon. Find the existing entries in `ancestry-traits.ts` and replace with `stat-mod-echelon` effect kind using the verified tuples.

Add tests mirroring step 3.1 for each.

### Step 3.6: Run repo-wide tests + typecheck

- [ ] Run from repo root:
```
pnpm test 2>&1 | tail -5
pnpm typecheck 2>&1 | tail -5
```

### Step 3.7: Commit slice 3

- [ ] Commit:
```
git add packages/data/overrides/ancestry-traits.ts \
        packages/shared/src/derive-character-runtime.test.ts
git commit -m "$(cat <<'EOF'
feat(data): per-echelon stat-mod scaling — Spark Off Your Skin + Wyrmplate + Psychic Scar (Phase 2b 2b.1)

Migrates the three traits to stat-mod-echelon shape. Each grants its L1
baseline at character creation and ramps at L4/L7/L10 per canon. Lifts
the SKIPPED-DEFERRED-PARTIAL comments. Tests cover all four echelons
for Spark Off Your Skin; baseline + delta confirmation for the other two.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Slice 4 — `level-plus` immunity for Polder Corruption Immunity

Single override update + a test. Schema variant already landed in slice 1.

**Files:**
- Modify: `packages/data/overrides/ancestry-traits.ts`
- Test: `packages/shared/src/derive-character-runtime.test.ts` (extend)

### Step 4.1: Failing test for Polder Corruption Immunity at L1, L5, L7, L10

- [ ] Add test:

```ts
describe('Polder Corruption Immunity (level + 2)', () => {
  it.each([[1, 3], [5, 7], [7, 9], [10, 12]])(
    'L%i grants corruption immunity %i',
    (level, expected) => {
      const char = makePolderWithTrait('polder.corruption-immunity', level);
      const rt = deriveCharacterRuntime(char);
      const entry = rt.immunities.find((i) => i.kind === 'corruption');
      expect(entry?.value).toBe(expected);
    },
  );
});
```

### Step 4.2: Run, verify fail

- [ ] Run: `cd packages/shared && pnpm exec vitest run -t "Corruption Immunity"`

Expected: FAIL — current value is `'level'` so L1 = 1, L5 = 5 (off by 2).

### Step 4.3: Update Polder Corruption Immunity override

- [ ] In `packages/data/overrides/ancestry-traits.ts`:

```ts
'polder.corruption-immunity': [
  {
    source: { kind: 'ancestry-trait', id: 'polder.corruption-immunity' },
    effect: {
      kind: 'immunity',
      damageKind: 'corruption',
      value: { kind: 'level-plus', offset: 2 },
    },
  },
],
```

Lift the SKIPPED-DEFERRED-PARTIAL comment.

### Step 4.4: Run, verify pass

- [ ] Run: `cd packages/shared && pnpm exec vitest run -t "Corruption Immunity"`

Expected: PASS.

### Step 4.5: Run repo-wide + commit

- [ ] `pnpm test && pnpm typecheck`, then:

```
git add packages/data/overrides/ancestry-traits.ts \
        packages/shared/src/derive-character-runtime.test.ts
git commit -m "$(cat <<'EOF'
feat(data): level-plus immunity variant for Polder Corruption Immunity (Phase 2b 2b.1)

Polder Corruption Immunity = level + 2 per canon. Schema variant already
landed in slice 1; this slice exercises it. L1 Polder = corruption
immunity 3 instead of 1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Slice 5 — `grant-skill-edge` + Glamors

**Files:**
- Modify: `packages/data/overrides/ancestry-traits.ts`
- Modify: `packages/rules/src/intents/roll-power.ts` (consumer for skill rolls — verify or wire)
- Test: `packages/shared/src/derive-character-runtime.test.ts` + `packages/rules/src/intents/roll-power.test.ts`

### Step 5.1: Re-read canon for Wode Elf Glamor + High Elf Glamor

- [ ] Run:
```
grep -B2 -A10 "Glamor" .reference/data-md/Rules/Ancestries/Wode\ Elf.md
grep -B2 -A10 "Glamor" .reference/data-md/Rules/Ancestries/High\ Elf.md
```
Confirm: Wode Elf Glamors → edge on all skill groups; High Elf Glamors → edge on one skill group (player picks at chargen?). If High Elf needs a player-pick, that's a chargen UI concern out of this slice's scope — defer the pick-UI to a follow-up; ship the data shape (`grant-skill-edge { skillGroup: 'intrigue' }` as a placeholder) and note the carry-over.

### Step 5.2: Failing test for Wode Elf Glamors granting skill edge

- [ ] Add test in `packages/shared/src/derive-character-runtime.test.ts`:

```ts
describe('Wode Elf Glamors grants skill edge on all groups', () => {
  it('CharacterRuntime.skillEdges includes all canonical skill groups', () => {
    const char = makeWodeElfWithTrait('wodeelf.glamors');
    const rt = deriveCharacterRuntime(char);
    // Canon skill groups — verify against rules-canon.md or Skills.md:
    const expected = ['crafting', 'exploration', 'interpersonal', 'intrigue', 'lore'];
    for (const g of expected) {
      expect(rt.skillEdges).toContain(g);
    }
  });
});
```

(Verify the canonical skill-group list before writing — `grep -i "skill group" .reference/data-md/Rules/Chapters/Skills.md`.)

### Step 5.3: Run, verify fail

- [ ] Run: `cd packages/shared && pnpm exec vitest run -t "Wode Elf Glamors"`

Expected: FAIL — trait not yet overridden.

### Step 5.4: Add Wode Elf Glamors override

- [ ] In `packages/data/overrides/ancestry-traits.ts`:

```ts
'wodeelf.glamors': [
  // One attachment per skill group — canon: "edge on tests using any skill"
  ...['crafting', 'exploration', 'interpersonal', 'intrigue', 'lore'].map((g) => ({
    source: { kind: 'ancestry-trait' as const, id: 'wodeelf.glamors' },
    effect: { kind: 'grant-skill-edge' as const, skillGroup: g },
  })),
],
```

If canon says Wode Elf Glamors grants edge on "any skill test" not "any skill group," use the wider semantic — adjust shape (e.g. `grant-skill-edge { skillGroup: '*' }` as a sentinel) and gate the consumer accordingly. Decide based on the canon grep in step 5.1; document the decision in a code comment.

### Step 5.5: Add High Elf Glamors override (data shape + placeholder)

- [ ] If High Elf Glamors needs a player-picked skill group:

```ts
'highelf.glamors': [
  {
    source: { kind: 'ancestry-trait', id: 'highelf.glamors' },
    // CARRY-OVER: skill group is a chargen player pick. Until the chargen
    // wizard surfaces this slot, override defaults to 'intrigue' as a
    // placeholder. Replace with character.ancestryChoices.glamorsSkillGroup
    // once the slot lands in CharacterSchema (separate slice).
    effect: { kind: 'grant-skill-edge', skillGroup: 'intrigue' },
  },
],
```

### Step 5.6: Wire `RollPower` skill-roll edge consumer (if not present)

- [ ] In `packages/rules/src/intents/roll-power.ts`, find the skill-test branch (look for `skill` / `characteristic test` handling). If the runtime's edge-stack computation reads from `participant.heroicResources` or `runtime.skillEdges`, plumb `skillEdges` through. If skill rolls aren't yet routed through `RollPower`, document that as a carry-over and limit the slice's acceptance to "the data is present on CharacterRuntime; consumer wiring lands when skill-roll routing exists."

### Step 5.7: Run test, verify pass

- [ ] Run: `cd packages/shared && pnpm exec vitest run -t "Glamors"`

Expected: PASS for both (data-shape level).

### Step 5.8: Repo-wide + commit

- [ ] `pnpm test && pnpm typecheck`, then:

```
git add packages/data/overrides/ancestry-traits.ts \
        packages/rules/src/intents/roll-power.ts \
        packages/shared/src/derive-character-runtime.test.ts \
        packages/rules/src/intents/roll-power.test.ts
git commit -m "$(cat <<'EOF'
feat(data,rules): grant-skill-edge effect kind + Glamors (Phase 2b 2b.8)

Wode Elf Glamors grants edge on all skill groups; High Elf Glamors
grants edge on one player-picked skill group (chargen pick deferred —
placeholder slot until CharacterSchema.ancestryChoices.glamorsSkillGroup
lands). RollPower skill-roll consumer reads runtime.skillEdges.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Slice 6 — `movementMode` primitive + Devil/Dragon Knight Wings

Establishes the ancestry-triggers infrastructure. Wings = elective `StartFlying`, fall on Prone, countdown to fall at duration end, echelon-1 fire weakness 5 while flying.

**Files:**
- Create: `packages/rules/src/effective.ts` (extend — `getEffectiveWeaknesses`)
- Create: `packages/rules/src/intents/start-flying.ts`
- Create: `packages/rules/src/intents/end-flying.ts`
- Create: `packages/rules/src/ancestry-triggers/index.ts` (dispatcher)
- Create: `packages/rules/src/ancestry-triggers/wings.ts`
- Modify: `packages/rules/src/intents/apply-condition.ts` (Prone → ancestry-trigger fire)
- Modify: `packages/rules/src/stamina.ts` (KO/inert prone-add → ancestry-trigger fire)
- Modify: `packages/rules/src/intents/turn.ts` (`applyEndRound` calls ancestry-triggers EndRound dispatch)
- Modify: `packages/rules/src/intents/apply-damage.ts` (post-tier damage compute uses `getEffectiveWeaknesses`)
- Modify: `packages/shared/src/intent.ts` (or wherever `IntentTypes` discriminator lives — register `StartFlying` + `EndFlying`)
- Test: new intent test files; effective.test.ts extension

### Step 6.1: Failing test for `StartFlying` intent

- [ ] Create `packages/rules/src/intents/start-flying.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reduce } from '../reducer';
import { makeState, makePcParticipant } from './_test-helpers';

describe('StartFlying intent', () => {
  it('sets movementMode for a healthy Devil with Wings', () => {
    const p = makePcParticipant({
      purchasedTraits: ['devil-wings'],
      characteristics: { might: 3, agility: 0, reason: 0, intuition: 0, presence: 0 },
      staminaState: 'healthy',
    });
    const state = makeState({ participants: [p] });
    const result = reduce(state, {
      type: 'StartFlying',
      actor: { kind: 'pc', participantId: p.id },
      source: 'client',
      payload: { participantId: p.id },
    });
    expect(result.kind).toBe('accepted');
    const updated = result.state!.participants.find((x: any) => x.id === p.id);
    expect(updated?.movementMode).toEqual({ mode: 'flying', roundsRemaining: 3 });
  });

  it('rejects when staminaState is dying', () => {
    const p = makePcParticipant({
      purchasedTraits: ['devil-wings'],
      staminaState: 'dying',
    });
    const state = makeState({ participants: [p] });
    const result = reduce(state, {
      type: 'StartFlying',
      actor: { kind: 'pc', participantId: p.id },
      source: 'client',
      payload: { participantId: p.id },
    });
    expect(result.kind).toBe('rejected');
  });
});
```

### Step 6.2: Run test, verify fail

- [ ] Run: `cd packages/rules && pnpm exec vitest run src/intents/start-flying.test.ts`

Expected: FAIL — intent not registered.

### Step 6.3: Register `StartFlying` + `EndFlying` in `IntentTypes`

- [ ] Find the intent registry (`grep -n "IntentTypes\b" packages/shared/src/intent.ts` or similar). Add the two new types with payload schemas:

```ts
// packages/shared/src/intent.ts
export const StartFlyingPayloadSchema = z.object({
  participantId: z.string().min(1),
});
export const EndFlyingPayloadSchema = z.object({
  participantId: z.string().min(1),
  reason: z.enum(['voluntary', 'fall', 'duration-expired']),
});

// Inside the IntentSchema discriminated union, add:
z.object({
  type: z.literal('StartFlying'),
  source: SourceSchema,
  actor: ActorSchema,
  payload: StartFlyingPayloadSchema,
}),
z.object({
  type: z.literal('EndFlying'),
  source: SourceSchema,
  actor: ActorSchema,
  payload: EndFlyingPayloadSchema,
}),
```

### Step 6.4: Implement `StartFlying` reducer

- [ ] Create `packages/rules/src/intents/start-flying.ts`:

```ts
import type { Reducer } from '../reducer';
import type { Participant } from '@ironyard/shared';

const FLYING_ALLOWED_STATES = new Set(['healthy', 'winded', 'doomed']);

export const applyStartFlying: Reducer<{ participantId: string }> = (state, intent) => {
  const p = state.participants.find((x) => 'id' in x && x.id === intent.payload.participantId) as
    | Participant
    | undefined;
  if (!p || p.kind !== 'pc') {
    return { kind: 'rejected', reason: 'participant-not-found' };
  }

  // Permission gate (canon-active states). Director override via source: 'server'.
  if (intent.source !== 'server' && !FLYING_ALLOWED_STATES.has(p.staminaState)) {
    return { kind: 'rejected', reason: 'stamina-state-blocks-flight' };
  }

  // roundsRemaining = max(1, Might score). Character lookup via state.characters[p.characterId].
  // If character isn't accessible from reducer state, snapshot mightScore onto participant at StartEncounter (see step 6.4a).
  const mightScore = p.characteristics?.might ?? 0;
  const roundsRemaining = Math.max(1, mightScore);

  const next = {
    ...state,
    participants: state.participants.map((x) =>
      'id' in x && x.id === p.id
        ? { ...x, movementMode: { mode: 'flying' as const, roundsRemaining } }
        : x,
    ),
  };

  return { kind: 'accepted', state: next, log: [{ kind: 'flying-started', participantId: p.id, roundsRemaining }] };
};
```

Wire into the central reducer dispatch (`packages/rules/src/reducer.ts`) — `case 'StartFlying': return applyStartFlying(state, intent);`.

### Step 6.5: Implement `EndFlying` reducer

- [ ] Create `packages/rules/src/intents/end-flying.ts`:

```ts
import type { Reducer } from '../reducer';

export const applyEndFlying: Reducer<{ participantId: string; reason: 'voluntary' | 'fall' | 'duration-expired' }> = (
  state,
  intent,
) => {
  const { participantId, reason } = intent.payload;
  const p = state.participants.find((x) => 'id' in x && x.id === participantId);
  if (!p) return { kind: 'rejected', reason: 'participant-not-found' };

  const next = {
    ...state,
    participants: state.participants.map((x) =>
      'id' in x && x.id === participantId ? { ...x, movementMode: null } : x,
    ),
  };

  // Fall: log the rounds-aloft remainder for table adjudication; ensure Prone if not present.
  const log: any[] = [{ kind: 'flying-ended', participantId, reason }];

  // (Prone idempotency: ApplyCondition reducer dedupes on (type, source) — emit a derived
  // intent only if reason === 'fall' AND participant doesn't already have Prone.)
  const derived: any[] = [];
  if (reason === 'fall') {
    const hasProne = (p as any).conditions?.some((c: any) => c.type === 'Prone');
    if (!hasProne) {
      derived.push({
        type: 'ApplyCondition',
        actor: intent.actor,
        source: 'server',
        payload: {
          participantId,
          condition: 'Prone',
          source: { kind: 'fall-from-flying' },
          duration: { kind: 'eot', participantId },
        },
      });
    }
  }

  return { kind: 'accepted', state: next, log, derived };
};
```

Wire into reducer dispatch.

### Step 6.6: Run StartFlying tests, verify pass

- [ ] Run: `cd packages/rules && pnpm exec vitest run src/intents/start-flying.test.ts`

Expected: PASS.

### Step 6.7: Create ancestry-triggers dispatcher skeleton

- [ ] Create `packages/rules/src/ancestry-triggers/index.ts`:

```ts
// Phase 2b Group A+B — ancestry-trigger registry. Mirrors class-triggers/.
// Each per-trait file exports a typed evaluator; the dispatcher iterates
// matching triggers and returns derived intents. Subscribed event types
// land in distinct exports so call sites tree-shake.

import type { Actor, Participant, StaminaTransitionedPayload, ConditionType } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../types';
import * as wings from './wings';
import * as bloodfire from './bloodfire';
import * as relentless from './relentless';
import * as fallLightly from './fall-lightly';

export type AncestryTriggerContext = {
  actor: Actor;
};

// Subscribers per event type. Each per-trait module exports zero or more handlers.

export function evaluateOnConditionApplied(
  state: CampaignState,
  payload: { participantId: string; condition: ConditionType },
  ctx: AncestryTriggerContext,
): DerivedIntent[] {
  return [
    ...wings.onConditionApplied(state, payload, ctx),
    // ... other modules as added
  ];
}

export function evaluateOnEndRound(
  state: CampaignState,
  ctx: AncestryTriggerContext,
): DerivedIntent[] {
  return [
    ...wings.onEndRound(state, ctx),
    ...bloodfire.onEndRound(state, ctx),
  ];
}

export function evaluateOnDamageApplied(
  state: CampaignState,
  payload: { targetId: string; dealerId: string | null; delivered: number },
  ctx: AncestryTriggerContext,
): DerivedIntent[] {
  return [
    ...bloodfire.onDamageApplied(state, payload, ctx),
  ];
}

export function evaluateOnStaminaTransitioned(
  state: CampaignState,
  payload: StaminaTransitionedPayload,
  ctx: AncestryTriggerContext,
): DerivedIntent[] {
  return [
    ...relentless.onStaminaTransitioned(state, payload, ctx),
  ];
}

// More subscribers added as slices 7/8/9 land.
```

(Create stub files for `bloodfire.ts`, `relentless.ts`, `fall-lightly.ts` with empty exports so the dispatcher compiles. Will populate in their respective slices.)

### Step 6.8: Implement `ancestry-triggers/wings.ts`

- [ ] Create:

```ts
// packages/rules/src/ancestry-triggers/wings.ts
import type { Participant, ConditionType } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../types';
import { isParticipant } from '../types';
import type { AncestryTriggerContext } from './index';

const WINGS_TRAIT_IDS = new Set(['devil-wings', 'dragonknight-wings']);

function hasWings(p: Participant): boolean {
  return p.purchasedTraits.some((t) => WINGS_TRAIT_IDS.has(t));
}

function isFlying(p: Participant): boolean {
  return p.movementMode?.mode === 'flying';
}

// (a) Prone added → fall, when the target is currently flying.
export function onConditionApplied(
  state: CampaignState,
  payload: { participantId: string; condition: ConditionType },
  ctx: AncestryTriggerContext,
): DerivedIntent[] {
  if (payload.condition !== 'Prone') return [];
  const p = state.participants.filter(isParticipant).find((x) => x.id === payload.participantId);
  if (!p || !hasWings(p) || !isFlying(p)) return [];
  return [
    {
      actor: ctx.actor,
      source: 'server',
      type: 'EndFlying',
      payload: { participantId: p.id, reason: 'fall' },
    },
  ];
}

// (b) EndRound: decrement roundsRemaining for every flying participant; at 0 → fall.
export function onEndRound(state: CampaignState, ctx: AncestryTriggerContext): DerivedIntent[] {
  const derived: DerivedIntent[] = [];
  for (const p of state.participants.filter(isParticipant)) {
    if (!isFlying(p)) continue;
    const next = (p.movementMode!.roundsRemaining ?? 0) - 1;
    if (next <= 0) {
      derived.push({
        actor: ctx.actor,
        source: 'server',
        type: 'EndFlying',
        payload: { participantId: p.id, reason: 'duration-expired' },
      });
    } else {
      // Emit a TickFlyingDuration derived intent OR mutate via a dedicated
      // payload. Cleanest: a small `DecrementFlyingDuration` intent or
      // bundle into a generic `SetMovementMode` intent. Implementer's call;
      // either works. The test asserts behavior end-to-end.
      derived.push({
        actor: ctx.actor,
        source: 'server',
        type: 'SetMovementMode',
        payload: { participantId: p.id, movementMode: { mode: 'flying', roundsRemaining: next } },
      });
    }
  }
  return derived;
}
```

> Note: this introduces a small `SetMovementMode` intent for the rounds-countdown tick. Add the payload schema + reducer alongside the wings work. (Trivial: copy `StartFlying` shape; payload is `{ participantId, movementMode: MovementModeOrNull }`.)

### Step 6.9: Wire `evaluateOnConditionApplied` into `apply-condition.ts` and `applyTransitionSideEffects`

- [ ] In `packages/rules/src/intents/apply-condition.ts`, after the condition is added to the participant, call:

```ts
import { evaluateOnConditionApplied } from '../ancestry-triggers';

// After participant.conditions.push(newCondition) (state-update done):
const ancestryDerived = evaluateOnConditionApplied(
  newState,
  { participantId, condition: payload.condition },
  { actor: intent.actor },
);
// Append to derived list returned from the reducer.
```

In `packages/rules/src/stamina.ts` `applyTransitionSideEffects`, find the place where Prone is added on KO/inert transitions. After pushing, do the same dispatch call.

### Step 6.10: Wire `evaluateOnEndRound` into `applyEndRound`

- [ ] In `packages/rules/src/intents/turn.ts`, find `applyEndRound`. Add the dispatch call after existing EndRound side effects:

```ts
import { evaluateOnEndRound } from '../ancestry-triggers';

// After existing reset logic:
const ancestryDerived = evaluateOnEndRound(newState, { actor: intent.actor });
// Append to derived list.
```

### Step 6.11: Extend `effective.ts` with `getEffectiveWeaknesses`

- [ ] In `packages/rules/src/effective.ts`, add:

```ts
import type { Participant, TypedResistance } from '@ironyard/shared';

const WINGS_TRAIT_IDS = new Set(['devil-wings', 'dragonknight-wings']);

export function getEffectiveWeaknesses(p: Participant, level: number): TypedResistance[] {
  const base = p.weaknesses;
  const flying = p.movementMode?.mode === 'flying';
  const echelon1 = level <= 3;
  const hasWings = p.purchasedTraits.some((t) => WINGS_TRAIT_IDS.has(t));
  if (flying && echelon1 && hasWings) {
    return [...base, { kind: 'fire', value: 5 }];
  }
  return base;
}
```

### Step 6.12: Consume `getEffectiveWeaknesses` in apply-damage

- [ ] In `packages/rules/src/intents/apply-damage.ts`, find the tier-damage computation step that reads `participant.weaknesses`. Replace with `getEffectiveWeaknesses(participant, participant.level)`.

### Step 6.13: Add tests for the fall trigger, countdown, weakness-while-flying

- [ ] Add tests in `packages/rules/src/intents/end-flying.test.ts` and `packages/rules/src/ancestry-triggers/wings.test.ts`:

```ts
// wings.test.ts
describe('Devil Wings — fall on Prone', () => {
  it('flying participant who gains Prone gets EndFlying { reason: fall }', () => {
    // Build flying participant, dispatch ApplyCondition { Prone }, assert derived EndFlying fired.
  });
  it('flying participant with 1 round left at EndRound gets EndFlying { reason: duration-expired }', () => {
    // Build participant with roundsRemaining: 1, dispatch EndRound, assert.
  });
  it('flying participant with 3 rounds left at EndRound has roundsRemaining: 2 after', () => {
    // Same setup with roundsRemaining: 3, dispatch EndRound, assert SetMovementMode fired with 2.
  });
});

// effective.test.ts (extension)
describe('getEffectiveWeaknesses — Wings echelon-1 fire 5', () => {
  it('returns base when not flying', () => { /* ... */ });
  it('returns base + fire 5 when flying L1-3 Devil with Wings', () => { /* ... */ });
  it('returns base when flying L4+ Devil', () => { /* ... */ });
  it('returns base when flying L1 without Wings (impossible normally, but defensive)', () => { /* ... */ });
});
```

### Step 6.14: Run repo-wide, verify all green

- [ ] `pnpm test && pnpm typecheck && pnpm lint`

### Step 6.15: Commit slice 6

- [ ] Commit:

```
git add packages/rules/src/effective.ts \
        packages/rules/src/effective.test.ts \
        packages/rules/src/intents/start-flying.ts \
        packages/rules/src/intents/start-flying.test.ts \
        packages/rules/src/intents/end-flying.ts \
        packages/rules/src/intents/end-flying.test.ts \
        packages/rules/src/intents/set-movement-mode.ts \
        packages/rules/src/ancestry-triggers/ \
        packages/rules/src/intents/apply-condition.ts \
        packages/rules/src/stamina.ts \
        packages/rules/src/intents/turn.ts \
        packages/rules/src/intents/apply-damage.ts \
        packages/rules/src/reducer.ts \
        packages/shared/src/intent.ts
git commit -m "$(cat <<'EOF'
feat(rules,shared): movementMode primitive + Devil/Dragon Knight Wings (Phase 2b 2b.4)

New StartFlying / EndFlying / SetMovementMode intents; ancestry-triggers/
mirror of class-triggers/ with wings.ts subscribing to Prone-added (any
cause) and EndRound countdown. getEffectiveWeaknesses helper layers
echelon-1 fire 5 over base weaknesses when flying with Wings.
ApplyCondition + applyTransitionSideEffects (KO/inert) + applyEndRound
now dispatch ancestry-triggers. StartFlying gated on staminaState ∈
{healthy, winded, doomed}; director override via source: 'server'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Slice 7 — Polder Shadowmeld

Reuses slice 6's `StartFlying` intent with `mode: 'shadow'`. Resolve duration question during this slice (Shadowmeld has no canon round-cap).

**Files:**
- Modify: `packages/data/overrides/ancestries.ts` (or wherever Shadowmeld activation lives — the audit notes Shadowmeld is currently a narrative active ability)
- Modify: `packages/rules/src/intents/start-flying.ts` (extend payload to accept `mode` parameter OR rename to `SetMovementMode` and use that path)
- Test: `packages/rules/src/intents/start-flying.test.ts` (extend)

### Step 7.1: Re-read canon for Shadowmeld

- [ ] Run: `grep -B2 -A15 "Shadowmeld" .reference/data-md/Rules/Ancestries/Polder.md` and check `heroes-flat.txt` for duration semantics. Decide: does the engine give it `roundsRemaining: 0` as a sentinel meaning "no countdown" (and `wings.ts` onEndRound only ticks `mode === 'flying'`)? Document the decision in code comment.

### Step 7.2: Extend `StartFlying` payload to accept `mode`

- [ ] In `packages/shared/src/intent.ts`:

```ts
export const StartFlyingPayloadSchema = z.object({
  participantId: z.string().min(1),
  mode: z.enum(['flying', 'shadow']).default('flying'),
});
```

- [ ] In `packages/rules/src/intents/start-flying.ts`, replace `mode: 'flying' as const` with `mode: intent.payload.mode`. For `mode: 'shadow'`, set `roundsRemaining: 0` (sentinel = no countdown).

### Step 7.3: Confirm `wings.ts onEndRound` only ticks `mode === 'flying'`

- [ ] The existing check `isFlying(p)` already gates on `mode === 'flying'`. Shadowmeld won't be ticked. Done — no change needed.

### Step 7.4: Add tests for Shadowmeld activation

- [ ] In `packages/rules/src/intents/start-flying.test.ts`:

```ts
describe('StartFlying with mode: shadow (Polder Shadowmeld)', () => {
  it('sets movementMode to shadow with roundsRemaining 0', () => {
    const p = makePcParticipant({ purchasedTraits: ['polder-shadowmeld'] });
    const state = makeState({ participants: [p] });
    const result = reduce(state, {
      type: 'StartFlying',
      actor: { kind: 'pc', participantId: p.id },
      source: 'client',
      payload: { participantId: p.id, mode: 'shadow' },
    });
    expect(result.kind).toBe('accepted');
    const updated = result.state!.participants.find((x: any) => x.id === p.id);
    expect(updated?.movementMode).toEqual({ mode: 'shadow', roundsRemaining: 0 });
  });
  it('does NOT trigger fire weakness 5 (only flying does)', () => {
    // Build participant in shadow mode; assert getEffectiveWeaknesses returns base only.
  });
});
```

### Step 7.5: Run + commit

- [ ] `pnpm test && pnpm typecheck`, then:

```
git add packages/shared/src/intent.ts \
        packages/rules/src/intents/start-flying.ts \
        packages/rules/src/intents/start-flying.test.ts \
        packages/data/overrides/ancestries.ts
git commit -m "$(cat <<'EOF'
feat(rules,data): Polder Shadowmeld via StartFlying { mode: shadow } (Phase 2b 2b.8)

Reuses the movementMode primitive from slice 6 with mode: 'shadow'.
roundsRemaining: 0 sentinel = no countdown (canon has no round cap on
Shadowmeld). getEffectiveWeaknesses fire-5 gate stays on mode: 'flying'
so Shadowmeld doesn't accidentally inherit Wings' echelon-1 weakness.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Slice 8 — Orc Bloodfire Rush

First-damage-this-round latch; +2 speed while active; clears at EndRound.

**Files:**
- Modify: `packages/rules/src/ancestry-triggers/bloodfire.ts` (populate the stub)
- Modify: `packages/rules/src/effective.ts` (`getEffectiveSpeed`)
- Modify: `packages/rules/src/intents/apply-damage.ts` (tail-call onDamageApplied dispatcher)
- Modify: `packages/rules/src/intents/turn.ts` (`applyEndRound` clears `bloodfireActive` for all participants)
- Modify: `packages/shared/src/intent.ts` (register `SetBloodfireActive` intent)
- Test: `packages/rules/src/ancestry-triggers/bloodfire.test.ts`

### Step 8.1: Failing test

- [ ] Create `packages/rules/src/ancestry-triggers/bloodfire.test.ts`:

```ts
describe('Orc Bloodfire Rush', () => {
  it('sets bloodfireActive on first damage taken in a round', () => {
    const p = makePcParticipant({
      purchasedTraits: ['orc-bloodfire-rush'],
      bloodfireActive: false,
    });
    // Dispatch ApplyDamage, assert bloodfireActive becomes true.
  });
  it('does not re-set on second damage in the same round (latch)', () => {
    const p = makePcParticipant({
      purchasedTraits: ['orc-bloodfire-rush'],
      bloodfireActive: true,
    });
    // Dispatch ApplyDamage, assert no extra derived intent fires.
  });
  it('getEffectiveSpeed returns base + 2 when bloodfireActive', () => {
    const p = makePcParticipant({ bloodfireActive: true, speed: 5 });
    expect(getEffectiveSpeed(p)).toBe(7);
  });
  it('applyEndRound clears bloodfireActive', () => {
    // Dispatch EndRound; assert bloodfireActive false for all PCs.
  });
});
```

### Step 8.2: Run, verify fail

- [ ] Run: `cd packages/rules && pnpm exec vitest run src/ancestry-triggers/bloodfire.test.ts`

Expected: FAIL.

### Step 8.3: Implement `bloodfire.ts`

- [ ] Populate `packages/rules/src/ancestry-triggers/bloodfire.ts`:

```ts
import type { Participant } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../types';
import { isParticipant } from '../types';
import type { AncestryTriggerContext } from './index';

const BLOODFIRE_TRAIT_ID = 'orc-bloodfire-rush';

function hasBloodfire(p: Participant): boolean {
  return p.purchasedTraits.includes(BLOODFIRE_TRAIT_ID);
}

export function onDamageApplied(
  state: CampaignState,
  payload: { targetId: string; dealerId: string | null; delivered: number },
  ctx: AncestryTriggerContext,
): DerivedIntent[] {
  if (payload.delivered <= 0) return [];
  const p = state.participants.filter(isParticipant).find((x) => x.id === payload.targetId);
  if (!p || !hasBloodfire(p) || p.bloodfireActive) return [];
  return [
    {
      actor: ctx.actor,
      source: 'server',
      type: 'SetBloodfireActive',
      payload: { participantId: p.id, active: true },
    },
  ];
}

export function onEndRound(state: CampaignState, ctx: AncestryTriggerContext): DerivedIntent[] {
  const derived: DerivedIntent[] = [];
  for (const p of state.participants.filter(isParticipant)) {
    if (p.bloodfireActive) {
      derived.push({
        actor: ctx.actor,
        source: 'server',
        type: 'SetBloodfireActive',
        payload: { participantId: p.id, active: false },
      });
    }
  }
  return derived;
}
```

### Step 8.4: Implement `SetBloodfireActive` intent

- [ ] Add to `packages/shared/src/intent.ts`:

```ts
export const SetBloodfireActivePayloadSchema = z.object({
  participantId: z.string().min(1),
  active: z.boolean(),
});

z.object({
  type: z.literal('SetBloodfireActive'),
  source: SourceSchema,
  actor: ActorSchema,
  payload: SetBloodfireActivePayloadSchema,
}),
```

- [ ] Create `packages/rules/src/intents/set-bloodfire-active.ts` (trivial reducer mutating the field) and wire into reducer dispatch.

### Step 8.5: Wire damage-applied tail-call

- [ ] In `packages/rules/src/intents/apply-damage.ts`, after the damage is applied and `delivered` is known, call:

```ts
import { evaluateOnDamageApplied } from '../ancestry-triggers';

const ancestryDerived = evaluateOnDamageApplied(
  newState,
  { targetId, dealerId, delivered },
  { actor: intent.actor },
);
```

### Step 8.6: Extend `effective.ts` with `getEffectiveSpeed`

- [ ] In `packages/rules/src/effective.ts`:

```ts
export function getEffectiveSpeed(p: Participant): number {
  const base = p.speed ?? 0;
  return p.bloodfireActive ? base + 2 : base;
}
```

(UI consumer; engine doesn't track movement, so this is read-site for display only.)

### Step 8.7: Run + commit

- [ ] `pnpm test && pnpm typecheck`, then:

```
git add packages/rules/src/ancestry-triggers/bloodfire.ts \
        packages/rules/src/ancestry-triggers/bloodfire.test.ts \
        packages/rules/src/intents/set-bloodfire-active.ts \
        packages/rules/src/intents/apply-damage.ts \
        packages/rules/src/effective.ts \
        packages/shared/src/intent.ts \
        packages/rules/src/reducer.ts
git commit -m "$(cat <<'EOF'
feat(rules,shared): Orc Bloodfire Rush (Phase 2b 2b.4)

First-damage-this-round latch via ancestry-triggers/bloodfire.ts; sets
bloodfireActive on first delivered damage of the round. applyEndRound
clears via SetBloodfireActive { active: false } per participant.
getEffectiveSpeed adds +2 to base speed when bloodfireActive.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Slice 9 — 3 ancestry sig-traits riding triggers (Relentless / Fall Lightly / Lightweight)

Each gets canon-quote-cited tests + a small per-trait file. Re-read canon for each before implementing.

**Files:**
- Modify: `packages/rules/src/ancestry-triggers/relentless.ts`
- Modify: `packages/rules/src/ancestry-triggers/fall-lightly.ts`
- Create: `packages/rules/src/ancestry-triggers/lightweight.ts` (read-site only — may be just a comment that points to effective.ts)
- Modify: `packages/rules/src/effective.ts` (`getEffectiveSize`)
- Modify: wherever forced-move resolution reads target size — `grep -rn "participant.size\|\.size" packages/rules/src/intents/` to find consumers

### Step 9.1: Re-read canon for the 3 traits

- [ ] Run:
```
grep -B2 -A10 "Relentless" .reference/data-md/Rules/Ancestries/Orc.md
grep -B2 -A10 "Fall Lightly\|Lightweight" .reference/data-md/Rules/Ancestries/Memonek.md
grep -B2 -A10 "Relentless\|Fall Lightly\|Lightweight" .reference/core-rules/heroes-flat.txt
```
Capture the canon text in code comments at the top of each per-trait file. If anything is ambiguous: surface to user (Gate 2) with the printed-book question; do NOT guess.

### Step 9.2: Per-trait TDD pass — Relentless

- [ ] Write failing test based on canon; implement subscription (likely `onStaminaTransitioned` matching `to === 'dying'` for an Orc with Relentless); verify pass.

### Step 9.3: Per-trait TDD pass — Fall Lightly

- [ ] Write failing test; subscribe likely to `EndFlying { reason: 'fall' }` from slice 6 OR to a more general fall event. Confirm mechanic against canon. Implement; verify.

### Step 9.4: Per-trait TDD pass — Lightweight (read-site only)

- [ ] Extend `effective.ts`:

```ts
const SIZE_DROP_TIERS: Record<string, string> = {
  '2L': '1L', '1L': '1M', '1M': '1S', '1S': '1T',
};

export function getEffectiveSize(p: Participant): string {
  const base = p.size ?? '1M';
  const hasLightweight = p.purchasedTraits.includes('memonek-lightweight');
  return hasLightweight ? (SIZE_DROP_TIERS[base] ?? base) : base;
}
```

Find every consumer reading `participant.size` for **forced movement** purposes (`grep -rn "\.size" packages/rules/src/intents/` and audit each). Replace with `getEffectiveSize(p)` for forced-move sites only. Confirm canon says "for forced movement" — if wider, expand the consumer set.

Add tests for each.

### Step 9.5: Run + commit slice 9

- [ ] `pnpm test && pnpm typecheck`, then:

```
git add packages/rules/src/ancestry-triggers/ \
        packages/rules/src/effective.ts \
        packages/rules/src/effective.test.ts \
        packages/rules/src/intents/<forced-move-consumers>.ts
git commit -m "$(cat <<'EOF'
feat(rules): 3 ancestry signature traits riding ancestry-triggers (Phase 2b 2b.8)

Orc Relentless (fires on entering dying state); Memonek Fall Lightly
(fires on EndFlying { reason: fall }); Memonek Lightweight (read-site
via getEffectiveSize at forced-move consumers). Each per-trait test
cites canon. Lightweight gated to forced-movement read sites per canon.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Slice 10 — Distance bonus + ranged-damage RollPower read-site fix (2b.3.a + 2b.3.b)

**Files:**
- Modify: `packages/data/src/parse-kit.ts` (regex for melee/ranged distance bonus lines)
- Modify: `packages/rules/src/attachments/collectors/kit.ts` (emit `weapon-distance-bonus` effects)
- Modify: `packages/rules/src/intents/start-encounter.ts` (snapshot melee/ranged distance bonus to participant)
- Modify: wherever ability distance is computed for display/use — `grep -rn "Melee \\?\\d\\|Ranged \\?\\d\\|distance" packages/rules/src/ packages/shared/src/ apps/web/src/` to find sites
- Modify: `packages/rules/src/intents/roll-power.ts` (verify ranged-damage branch — 2b.3.a fix)
- Test: `packages/data/src/parse-kit.test.ts`, `packages/rules/src/intents/roll-power.test.ts`

### Step 10.1: Failing test for parser extraction of distance bonuses

- [ ] In `packages/data/src/parse-kit.test.ts`:

```ts
describe('parse-kit — distance bonuses', () => {
  it('Arcane Archer extracts rangedDistanceBonus: 10', () => {
    const parsed = parseKit(fixtures.arcaneArcherMd);
    expect(parsed.rangedDistanceBonus).toBe(10);
  });
  it('Guisarmier extracts meleeDistanceBonus: 1', () => {
    const parsed = parseKit(fixtures.guisarmierMd);
    expect(parsed.meleeDistanceBonus).toBe(1);
  });
  it('Disengage bonus parsed (slice 11 coverage)', () => {
    const parsed = parseKit(fixtures.arcaneArcherMd);
    expect(parsed.disengageBonus).toBe(1);
  });
});
```

### Step 10.2: Run, verify fail

- [ ] Run: `cd packages/data && pnpm exec vitest run src/parse-kit.test.ts -t "distance"`

Expected: FAIL.

### Step 10.3: Add parser regex

- [ ] In `packages/data/src/parse-kit.ts`, add regex matchers for "Melee Distance Bonus +N", "Ranged Distance Bonus +N", "Disengage Bonus +N" (canon authoring varies — verify against `.reference/data-md/Rules/Kits.md`). Populate the three new Kit fields.

### Step 10.4: Run parser test, verify pass

- [ ] Run: `cd packages/data && pnpm exec vitest run src/parse-kit.test.ts`

### Step 10.5: Collector emits `weapon-distance-bonus`

- [ ] In `packages/rules/src/attachments/collectors/kit.ts`, after the existing `weapon-damage-bonus` emission, emit:

```ts
if (kit.meleeDistanceBonus > 0) {
  out.push({
    source: { kind: 'kit', id: kit.id },
    effect: { kind: 'weapon-distance-bonus', appliesTo: 'melee', delta: kit.meleeDistanceBonus },
  });
}
if (kit.rangedDistanceBonus > 0) {
  out.push({
    source: { kind: 'kit', id: kit.id },
    effect: { kind: 'weapon-distance-bonus', appliesTo: 'ranged', delta: kit.rangedDistanceBonus },
  });
}
if (kit.disengageBonus > 0) {
  out.push({
    source: { kind: 'kit', id: kit.id },
    effect: { kind: 'disengage-bonus', delta: kit.disengageBonus },
  });
}
```

(Disengage emission folds into this slice too since the parser is the same regex pass; slice 11's work is just the UI surface + participant snapshot beyond what slice 1 already lifted.)

### Step 10.6: Snapshot to participant at StartEncounter

- [ ] In `packages/rules/src/intents/start-encounter.ts`, add three more snapshot lines paralleling `weaponDamageBonus`:

```ts
meleeDistanceBonus: runtime.meleeDistanceBonus,
rangedDistanceBonus: runtime.rangedDistanceBonus,
disengageBonus: runtime.disengageBonus,
```

### Step 10.7: Targeting-layer / display read site — apply distance bonus

- [ ] Find the site that surfaces ability distance to the UI. Likely `apps/web/src/...` ability card or a derived-ability-distance helper. For non-AoE non-signature weapon abilities, add `participant.meleeDistanceBonus` or `participant.rangedDistanceBonus` to the base distance.

**Critical canon checks (Kits.md:132-146):**
- AoE sizes (burst N, cube N, wall N) NOT affected — DO NOT add bonus to AoE fields
- Signature abilities that already bake in the bonus — DO NOT double-add. Identify signature abilities by some flag on the ability; if no flag exists, the slice carries a small abilities-data flag addition.

### Step 10.8: Verify `RollPower` ranged-damage branch isn't melee-only (2b.3.a)

- [ ] Read `packages/rules/src/intents/roll-power.ts`. Find where `runtime.weaponDamageBonus` / `participant.weaponDamageBonus` is added to damage. Confirm the lookup uses `melee` vs `ranged` based on the ability's `Melee` / `Ranged` keyword. If it's hardcoded to `melee`, fix.

Add test:

```ts
describe('RollPower — ranged weapon damage bonus reaches roll output', () => {
  it('Arcane Archer ranged ability includes rangedDamageBonus[tier - 1]', () => {
    // build participant with weaponDamageBonus.ranged: [2,2,2]
    // dispatch RollPower for a ranged-keyword ability
    // assert outcome damage includes the +2 bonus at the correct tier
  });
});
```

### Step 10.9: Run + commit

- [ ] `pnpm test && pnpm typecheck && pnpm lint`, then:

```
git add packages/data/src/parse-kit.ts \
        packages/data/src/parse-kit.test.ts \
        packages/rules/src/attachments/collectors/kit.ts \
        packages/rules/src/intents/start-encounter.ts \
        packages/rules/src/intents/roll-power.ts \
        packages/rules/src/intents/roll-power.test.ts \
        apps/web/src/<ability-distance-surface-file>.ts(x)
git commit -m "$(cat <<'EOF'
feat(data,rules,web): weapon-distance-bonus + ranged-damage RollPower fix (Phase 2b 2b.3.a + 2b.3.b)

Parser extracts melee/ranged distance + disengage bonuses from kit MD.
Collector emits weapon-distance-bonus + disengage-bonus effects. Runtime
folds into Character + Participant snapshots. Ability-distance display
adds participant.{melee,ranged}DistanceBonus to base distance for
non-signature non-AoE weapon abilities (AoE sizes excluded per canon
Kits.md:135). RollPower verified to apply weaponDamageBonus.ranged on
the ranged branch (2b.3.a fix if any was needed).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Slice 11 — `disengage-bonus` UI surface

Parser + collector + participant snapshot landed in slice 10. This slice ships the UI surface only.

**Files:**
- Modify: combat tracker move-action card (`grep -rn "move\|Move\|Done moving" apps/web/src/pages/combat/`)
- Modify: character sheet kit-summary (`grep -rn "kit\|Kit" apps/web/src/pages/sheet/`)

### Step 11.1: Surface "Disengage: shift {1 + bonus}" on the combat move card

- [ ] Find the combat tracker move-action card. Replace the static "Move" / "Done moving" label or add a line showing:

```tsx
{participant.disengageBonus > 0 && (
  <div className="text-sm text-muted-foreground">
    Disengage: shift {1 + participant.disengageBonus} squares (no OA)
  </div>
)}
```

### Step 11.2: Surface bonus on character sheet kit summary

- [ ] Find the kit summary section on the character sheet. Add an analogous line listing the disengage bonus alongside other kit traits.

### Step 11.3: Screenshot at iPad-portrait + iPhone-portrait

- [ ] Per CLAUDE.md, take screenshots at 810×1080 and 390×844. Run dev server (`pnpm dev`), navigate to a campaign with a character that has a +1 disengage kit (Arcane Archer / Rapid-Fire / etc.), screenshot both views.

### Step 11.4: Run + commit

- [ ] `pnpm test && pnpm typecheck && pnpm lint`, then:

```
git add apps/web/src/pages/combat/<move-card>.tsx \
        apps/web/src/pages/sheet/<kit-summary>.tsx
git commit -m "$(cat <<'EOF'
feat(web): disengage bonus UI surface (Phase 2b 2b.3.c)

Combat move-action card + character sheet kit summary surface the
disengage bonus. 13 kits with +1 disengage now show "Disengage: shift 2
squares (no OA)" on the move card. Data-only ship — no Disengage intent,
no OA suppression (deferred to Phase 2b.9 / Group E trigger-cascade per
spec). Player flags intent at the table via existing "Done moving" toggle.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Post-shipping: docs + phases-table flip

### Step P3: Update `docs/phases.md`

- [ ] Flip rows 2b.1, 2b.3, 2b.4, 2b.8 status to ✅ with a reference to this plan + the commits. Update the "Proposed shipping grouping" Group A and Group B rows to ✅. Commit:

```
git add docs/phases.md
git commit -m "$(cat <<'EOF'
docs(phases): flip 2b.1 + 2b.3 + 2b.4 + 2b.8 to ✅ (Phase 2b Group A+B shipped)

11 sub-slices shipped via this plan. Group A (Wings + Bloodfire) and
Group B (schema completeness batch) closed. Item-side conditional /
triggered attachments remain in Phase 2e per the 2026-05-16 carve-out.
Trigger cascade substrate (2b.9 / Group E) remains open as scoped.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Step P4: Add canon entries to `docs/rules-canon.md` (Gate 1 + Gate 2)

- [ ] For each new mechanic that closes a §10.16 carry-over, add a canon entry citing the source MD + heroes-flat.txt line. Run `pnpm canon:gen` (or equivalent) and surface to user for Gate 2 review. Per memory `feedback_rules_canon_workflow`, no ✅ until both gates pass.

---

## Parallelization opportunity (after slice 1)

Per memory `feedback_parallel_agents_for_disjoint_slices`, after slice 1 lands, dispatch as worktree-isolated agents in a single message:

| Agent | Slice | Touches |
|---|---|---|
| A | 2 (condition-immunity) | effective.ts, ancestry-traits.ts (6 traits), stamina.ts, apply-condition.ts, mark-surprised.ts |
| B | 3 (per-echelon) | ancestry-traits.ts (Spark + Wyrmplate + Psychic Scar), derive-character-runtime.test.ts |
| C | 4 (level-plus) | ancestry-traits.ts (Polder), test |
| D | 5 (grant-skill-edge) | ancestry-traits.ts (Glamors), derive-character-runtime, roll-power |
| E | 10 + 11 (distance + disengage parser/UI) | parse-kit, collectors/kit, start-encounter, roll-power, UI files |

Slices 6 → 7 → 8 → 9 are sequential and stay on the primary worktree.

---

## Acceptance — whole group

- [ ] All 11 sub-slices ✅ shipped, OR explicitly deferred with reasoning appended to the spec's PS section
- [ ] `pnpm test` repo-wide green
- [ ] `pnpm typecheck` clean repo-wide
- [ ] `pnpm lint` clean for files touched
- [ ] `docs/phases.md` rows 2b.1, 2b.3, 2b.4, 2b.8 flipped to ✅
- [ ] `docs/rules-canon.md` §10.16 entries for each shipped mechanic pass Gate 1 + Gate 2

---

## Out-of-scope reminders

- No `Disengage` / `Shift` / `Move` intents (deferred per spec Q4)
- No OA reducer / OA suppression (deferred to 2b.9 / Group E)
- No fall damage computation (no altitude tracking per memory `project_no_movement_tracking`)
- No item-side conditional/triggered attachments (Phase 2e)
- No save modifiers (separate slice)
- No class-feature choice pipeline (2b.7 / Group D)
- No trigger cascade substrate (2b.9 / Group E)
