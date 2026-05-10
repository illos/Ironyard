---
name: Pre-Phase-0 decisions
description: Resolutions for 13 open questions identified during readiness review, before scaffolding begins
type: spec-patch
---

# Pre-Phase-0 decisions (2026-05-10)

A readiness review surfaced 13 small but load-bearing questions in the existing docs. This file records the resolutions; the affected docs are updated in the same change so the in-tree spec stays the source of truth.

## Spec inconsistencies

### 1. Sync envelope keys on `seq`, not intent id
`ClientMsg.sync` is `{ kind: 'sync', sinceSeq: number }`. The DO assigns `seq` monotonically; clients track the highest seq applied and the DO replays from there.

Patches: `ARCHITECTURE.md` (Error handling and recovery).

### 2. Dice rolls travel inside the intent payload
The reducer stays pure. Whoever creates a roll-producing intent — the rolling client today, the DO when we move dice server-side — generates the random values and writes them into the payload. The reducer reads `rolls` plus deterministic state (characteristic, ability bonus, conditions) to compute totals.

Roll payloads add a `rolls` field. Example:

```ts
type RollPowerPayload = {
  abilityId: string;
  attackerId: string;
  targetIds: string[];
  edges: number;   // 0..2
  banes: number;   // 0..2
  rolls: { d10: [number, number] };
};
```

The reducer computes `total = d10[0] + d10[1] + characteristic + ability_bonus + (edges - banes) * 2`, walks the t1/t2/t3 ladder, and emits derived intents (`ApplyDamage`, `SetCondition`, etc.). Lookups for characteristic and ability bonus stay in the reducer — only randomness goes in the payload.

Patches: `intent-protocol.md` (Anatomy of an intent, Rolls), `rules-engine.md` (Public surface, purity note).

### 3. Undo finds derived intents through `causedBy`
The intent log already records `causedBy` on each derived intent. Undo of a parent is: select intents from the current round where `causedBy = parentId` and `voided = 0`, invert in reverse-application order, then invert the parent. No new field on `Intent` is needed.

Patches: `intent-protocol.md` (Undo) — clarification only.

### 4. Damage type enum is closed and validated at ingest
The enum `fire | cold | holy | corruption | psychic | lightning | poison | acid | sonic | untyped` matches Draw Steel's published types as of the pinned SteelCompendium release. The ingest's coverage report fails the build if any parsed effect text references a type outside this set — additions surface as a deliberate enum change, not a silent drift.

Patches: `data-pipeline.md` (Effect text parsing → coverage tracking).

## Scaffolding choices

| # | Decision | Notes |
|---|---|---|
| 5 | **Vitest** for tests, with `@cloudflare/vitest-pool-workers` for `apps/api` | Native for the Vite stack; runs Workers tests in real isolates. |
| 6 | **Biome** for lint + format | One tool, very fast, low config burden. Trade-off: smaller plugin ecosystem than ESLint. Revisit only if a Tailwind-specific linter becomes essential. |
| 7 | **`pnpm dev`** runs both apps via workspace scripts; Vite proxies `/api/*` to `wrangler dev` on `:8787` | Web `:5173`, api `:8787`, one command, one terminal. |
| 8 | **Resend** for magic-link email | Already named in `ARCHITECTURE.md`. |
| 9 | **GitHub Actions** for CI | Cloudflare publishes first-party actions for D1 migrations and Pages/Workers deploys. |
| 10 | **Node 22 LTS** + **pnpm 9**, pinned in `engines` and `packageManager` | |
| 11 | **Tailwind v4** | Stable, CSS-first config, better Vite integration. Our UI is Radix-headless + Tailwind, so 3rd-party-component lag isn't load-bearing. |
| 12 | `data-md` pin in `packages/data/sources.json` is a placeholder | Phase 0's data PR replaces it with the real release tag at first ingest. |

## Optimistic UI reconciliation

### 13. Divergence is expected; reconciliation is sequence replay
Two clients can dispatch intents in the same network window. Each applies locally with whatever seq it last knew; the DO assigns canonical seqs in receive order; clients reconcile on each `applied` envelope:

1. If the applied intent matches a pending optimistic one by `id`, drop the pending marker and adopt the DO's `seq`.
2. If the applied intent is new (e.g. another user's), splice it into local state at its seq position.
3. If a pending optimistic intent comes back as `rejected` (permission failure, or a state precondition the optimistic copy didn't see), revert it locally and surface a brief toast.

The DO is the single writer per session, so merge conflicts in the database sense are impossible by construction. Display flicker inside the optimistic window is acceptable.

Patches: `ARCHITECTURE.md` (Error handling and recovery — extend), `intent-protocol.md` (Optimistic UI — extend).

## Rules-canon pipeline

### 14. Canon status drives the engine via a generated registry
The two-gate workflow in `rules-canon.md` is enforced mechanically, not by trust. A build-time script parses the canon doc and emits a typed registry; the engine reads it; CI fails if the registry is stale.

**Pipeline:**

```
.reference/data-md/   →  docs/rules-canon.md   →  packages/rules/src/canon-status.generated.ts   →   reducer
       (source)              (drafted + status table)         (typed registry)                       (gates auto-apply)
```

**Components:**

- **Generator.** `packages/rules/scripts/gen-canon-status.ts` parses `docs/rules-canon.md`. It reads the top-level status table and the per-section status markers (`## 1. Power rolls (resolution) 🚧`, `### 5.3 Talent — Clarity ✅`), and emits a TypeScript module:

  ```ts
  // generated — do not edit by hand
  export const canonStatus = {
    'power-rolls': 'drafted',
    'power-rolls.edges-and-banes': 'drafted',
    'heroic-resources': 'drafted',
    'heroic-resources.talent-clarity': 'verified',
    'damage-application': 'tbd',
    // ...
  } as const satisfies Record<string, CanonStatus>;
  ```

- **Section IDs are stable slugs.** Numbers in the doc (§ 1, § 5.3) can be reordered; the slug after the heading text becomes the canonical id (`power-rolls`, `heroic-resources.talent-clarity`). Reordering sections never breaks engine code.

- **Granularity matches the engine's gates.** Sub-sections override their parent. § 5 may be 🚧 overall while § 5.3 (Talent Clarity) is ✅; the engine may auto-apply Talent's clarity rules but not other classes' until each is verified.

- **Engine consumption.** The reducer wraps any auto-application path in a `requireCanon('heroic-resources.talent-clarity')` check. If the slug's status is not `'verified'`, the reducer emits a `manual_override_required` log entry and surfaces the question to the UI instead of guessing.

- **CI gate.** `pnpm canon:gen && git diff --exit-code packages/rules/src/canon-status.generated.ts` runs in CI. Drift between the doc and the registry fails the build.

- **Visibility.** `pnpm canon:report` prints a table of all rule ids and their statuses. Cheap operator tool for "where are we on rules verification."

**Open questions (resolve at first implementation, not now):**

1. Slug derivation algorithm (kebab-case the heading? strip leading punctuation? handle emojis in headings).
2. Where to declare the rule slugs the engine *expects* — a constants file consumed by both the generator (to error on missing slugs) and the reducer.
3. How to handle a rule whose canon status is verified but whose engine implementation isn't yet wired up — a separate `'implemented'` flag, or just a TODO check in the reducer.

Patches: `rules-engine.md` (Registry-driven gating — new section), `phases.md` (Phase 0 scope — add generator and CI check).
