---
name: Phase 1 — auto-apply conditions from ability tier text
description: regex extraction of canon conditions from RollPower tier-outcome effect text; engine derives SetCondition per landing tier per target alongside ApplyDamage; forced movement deferred
type: spec
---

# Phase 1 — auto-apply conditions from ability tier text

## Goal

Damage auto-applies; conditions in ability tier text don't. Until this slice, the director had to manually tap condition chips on the target after every hit. After this slice, when a tier resolves and its text reads "the target is Slowed (save ends)", the engine derives a SetCondition intent alongside ApplyDamage and the chip lights up automatically.

**Permissive regex** is the parsing strategy — chosen permanently for homebrew-friendliness, not as a stopgap toward a grammar. See `~/.claude/projects/.../memory/feedback_regex_over_grammars_for_effect_text.md`.

## Scope

**In:**

- Parser pass over `TierOutcome.effect` text → extract `ConditionApplicationOutcome[]` per tier
- The 9 canon conditions only: Bleeding, Dazed, Frightened, Grabbed, Prone, Restrained, Slowed, Taunted, Weakened
- Duration markers: `(save ends)`, `(EoT)`, `until end of … turn`, `until start of … turn`, `until end of encounter`, `for the rest of the encounter`
- Scope tagging: `'target'` (auto-applied) vs `'other'` (multi-target — visible but manual)
- Potency-test prefix capture into `note` ("A < 2", "M < 3") — not enforced; flagged as biggest correctness gap
- Bleeding numeric rating capture into `note` ("Bleeding 5") — pending canon answer (Q14)
- Engine: `RollPower` derives one `SetCondition` per `ladder.tN.conditions[]` per `targetIds[]` for the landing tier, with `source = { kind: 'creature', id: attackerId }` and `causedBy = rollPower.intent.id` so slice 8 undo treats it as part of the chain
- UI: AbilityCard renders amber condition chips for `scope: 'target'` and a separate manual chip for `scope: 'other'`
- Wire: `RollPowerPayload.ladder.tN.conditions: ConditionApplicationDispatch[]` (default `[]`)
- CombatRun: `buildLadder` filters parser output to `scope === 'target'` and rewrites `until_start_next_turn.ownerId` placeholder to the attacker's id at dispatch time

**Out (deferred):**

- Forced movement (`push N`, `pull N`, `slide N`) — no Move intent exists; spec'd as a separate slice
- Potency-test gating (`A < 2`) — conditions apply unconditionally; the prefix is preserved in `note` for the director to read. Biggest correctness gap of this slice.
- Numeric Bleeding rating semantics (Q14) — parser captures it, engine ignores it
- Non-canon condition words ("burning", "cursed", "wet") — left in raw `effect` text; no extraction
- Multi-target scope auto-apply — `scope: 'other'` stays visual-only

## Schemas added

`packages/shared/src/condition.ts`:

```ts
export const ConditionApplicationOutcomeSchema = z.object({
  condition: ConditionTypeSchema,
  duration: ConditionDurationSchema,
  scope: z.enum(['target', 'other']),
  note: z.string().optional(),
});

export const ConditionApplicationDispatchSchema = z.object({
  condition: ConditionTypeSchema,
  duration: ConditionDurationSchema,
});
```

`packages/shared/src/data/monster.ts` extends `TierOutcomeSchema` with `conditions: z.array(ConditionApplicationOutcomeSchema).default([])`.

`packages/shared/src/intents/roll-power.ts` extends `TierEffectSchema` with `conditions: z.array(ConditionApplicationDispatchSchema).default([])`.

`packages/shared/src/data/monster.ts` `MonsterFileSchema.coverage` adds optional `tiersWithConditions: number`.

## Parser shape (`packages/data/src/parse-monster.ts`)

`parseTierOutcome` already runs the damage extraction; this slice adds clause-by-clause condition extraction on the residue:

1. Strip leading tier prefix (already existed)
2. Match leading `N (type)? damage` (already existed)
3. Split residue on top-level semicolons
4. For each clause:
   - Match every canon condition name (case-insensitive, word-boundary; optional numeric rating after)
   - Detect duration via ordered regex list (specificity-first so `until end of … turn` doesn't shadow `until start of … turn`)
   - Detect scope via multi-target regexes
   - Capture potency prefix + scope qualifier + rating as `note`
   - Strip the matched spans from the clause and push the residue to `effect` ONLY when at least one canon condition was extracted (so clauses with non-canon words like "burning" stay verbatim)

If no damage AND no conditions match, fall back to the historical "full raw → effect" behavior.

## Engine (`packages/rules/src/intents/roll-power.ts`)

After deriving ApplyDamage for the landing tier, iterate `tierEffect.conditions` and `targetIds`; derive one `SetCondition` per pairing. Guarded by `requireCanon('conditions.what-a-condition-is')`. Same `causedBy` as the parent RollPower so slice 8 void-and-replay groups them.

The dispatcher side (CombatRun's `buildLadder`) is responsible for:
- Filtering `scope === 'target'` (the engine never sees scope === 'other')
- Rewriting `until_start_next_turn.ownerId === '<auto>'` to the real attacker id

## UI (`apps/web/src/pages/combat/AbilityCard.tsx`)

`TierRow` renders amber chips for target-scope conditions and neutral "·manual" chips for other-scope. Hover/title shows full duration phrasing + note. The auto-roll button triggers the engine derivation; the chips just confirm what's auto-applying.

## Coverage

After landing, `pnpm -F @ironyard/data build:data` reports both `tier damage` and `tier conditions` coverage. Current pinned data: **813 / 1926 (42.2%)** of tier outcomes have at least one structured condition extracted. The remaining ~58% are damage-only, movement-only, or healing/narrative tiers that legitimately have no condition.

## Forced-movement gap

Push / pull / slide mentions appear in **~21.6% of tier outcomes** (per the prior agent's count). The director must apply forced movement manually until a future slice adds a `Move` (or `ForceMove`) intent. This is the next-biggest acceptance-bar-relevant gap after potency gating.

## Test plan

`packages/data/tests/parse-ability-damage.spec.ts` — updated existing tests to match new behavior (use `toMatchObject` so new fields are tolerated) and added expectations for the `conditions` array shape:

- non-canon condition stays in effect (no extraction)
- canon condition gets extracted (and stripped from effect)
- save-clause without damage — extracts condition, preserves potency prefix in `note`
- condition-only narrative — extracts with default EoT duration
- "push 10" / "pull N" — number not followed by "damage" stays in effect; canon conditions in same clause still extract
- Bury the Point (Goblin Warrior): extracts Bleeding from `M < 0 bleeding (save ends)` with note `"M < 0"`

`packages/rules/tests/reducer-condition-hooks.spec.ts` — 3 new tests under "RollPower — auto-applies conditions from landing tier":

- derives SetCondition for the landing tier per target (correct source attribution to attacker)
- does not derive conditions from non-landing tiers
- multi-target × multi-condition: derives one SetCondition per pairing

## Deferred / open

- **Q14** (Bleeding N) — pending user's printed-rulebook check
- **Q15** (default duration) — parser defaults to EoT; pending canon §3.2 literal check
- **Potency gating** — conditions apply regardless of `A < 2` prefix; correctness gap
- **Forced movement** — separate slice once `Move` intent exists
- **Non-canon condition synonyms** ("cursed", "wet", "illuminated") — left as raw effect text; future slice if any become canon

## Files touched

- `packages/shared/src/condition.ts` — new schemas
- `packages/shared/src/index.ts` — exports
- `packages/shared/src/data/monster.ts` — `TierOutcome.conditions`, coverage field
- `packages/shared/src/intents/roll-power.ts` — `TierEffect.conditions`
- `packages/data/src/parse-monster.ts` — regex helpers + `parseTierOutcome` extension
- `packages/data/tests/parse-ability-damage.spec.ts` — updated expectations
- `packages/data/tests/parse-monster.spec.ts` — updated Spear Charge + Bury the Point
- `packages/data/build.ts` — `tiersWithConditions` telemetry + log line
- `packages/rules/src/intents/roll-power.ts` — derived `SetCondition` per tier
- `packages/rules/tests/reducer-condition-hooks.spec.ts` — 3 derivation tests
- `apps/web/src/pages/CombatRun.tsx` — `buildLadder` scope filter + ownerId rewrite
- `apps/web/src/pages/combat/AbilityCard.tsx` — condition chips
- `apps/web/src/data/monsterAbilities.ts` — Free Strike tier shapes include `conditions: []`
- `docs/rule-questions.md` — Q14, Q15
