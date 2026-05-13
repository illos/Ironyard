# Phase 2 Epic 2D — Scope Notes

Pre-brainstorm punch list. Design decisions locked in via conversation 2026-05-13. Not a spec — these are the things to brainstorm into a real spec when 2D kicks off.

## Context

Phase 2 Epic 2 was originally a three-sub-epic trio (2A / 2B / 2C, all shipping). Epic 2D was surfaced during post-2C UX review: the user found the "bring into lobby" + placeholder + StartEncounter materialization flow obtuse. After reviewing the design, the placeholder/two-phase materialization isn't load-bearing — it can be replaced with a cleaner "everyone joins at StartEncounter" model.

Previous epics:
- 2A — data ingest + inventory schema (SHIPPED)
- 2B — `CharacterAttachment` activation engine (SHIPPED)
- 2C — interactive UI + runtime intents (SHIPPED). Side-effect of 2C work: surfaced the placeholder UX obtuseness this epic addresses.

## What 2D delivers

**One-line summary:** Replace `BringCharacterIntoEncounter` + `PcPlaceholder` with a `StartEncounter` payload that lists characters + monsters atomically. Persist `currentStamina` / `recoveriesUsed` on the Character row between encounters.

The user-facing change: there is no "bring into lobby" step anymore. The director clicks "Start the fight" with the approved characters they want and a monster list, and everything is materialized in one shot. Latency only matters once the encounter starts (which matches user intuition).

## Locked design decisions (from 2026-05-13 conversation)

**1. Auto-include all approved characters; director deselects to exclude.**
Approved character checklist on the encounter builder, all checked by default. Common case is "everyone's playing tonight."

**2. Encounter draft lives as local state in `EncounterBuilder`, not lobby state.**
The current "lobby roster of monsters" disappears. The encounter builder is now a working draft: pick monsters, pick characters, click start. If the director closes the tab without starting, selections are gone (or saved as a template).

**3. Character runtime state (`currentStamina` / `recoveriesUsed`) persists on the Character row in D1.**
`EndEncounter` side-effect writes back per-PC state. `StartEncounter` stamper reads it. Respite refills to full. Same shape as `Character.inventory` (mutable, written by intents). Not a separate `campaign_character_state` table.

## Suggested slice breakdown

4 slices, executed sequentially. Each closes with `pnpm test && pnpm typecheck && pnpm lint` green.

### Slice 1 — Character schema extension *(small)*

```ts
// packages/shared/src/character.ts
currentStamina: z.number().int().nullable().default(null),  // null = "use derived max"
recoveriesUsed: z.number().int().nonnegative().default(0),
```

Defaults keep existing character rows parseable. New characters start with `null`/`0`. The wizard doesn't surface these fields directly — they're written by `EndEncounter` and read by `StartEncounter`.

### Slice 2 — Engine shape change *(medium-large, atomic refactor)*

The biggest slice. Done atomically because the parts can't ship independently without breaking tests.

**Payload:** `StartEncounterPayloadSchema` becomes:
```ts
{
  encounterId?: string,
  characterIds: string[],           // approved chars to bring in
  monsters: { monsterId, quantity, nameOverride? }[]
}
```

**Stamper rewrite:** `stampStartEncounter` reads D1 for each `characterId` (parse character data + read `currentStamina`/`recoveriesUsed`); reads static monster data for each `monsterId`; outputs full stamped payload.

**Reducer rewrite:** `applyStartEncounter` materializes participants directly from stamped payload:
- For each character: `deriveCharacterRuntime` → snapshot to Participant; apply stamped `currentStamina` if non-null (clamped to `maxStamina`); apply stamped `recoveriesUsed` (`recoveries.current = max - used`).
- For each monster: `participantFromMonster` (unchanged shape).

**Deletions:**
- `BringCharacterIntoEncounterPayloadSchema` + intent file (shared)
- `applyBringCharacterIntoEncounter` (rules)
- `stampBringCharacterIntoEncounter` (api stamper)
- `PcPlaceholder` type + `pc-placeholder` kind from `RosterEntry` union
- `preservedRuntime()` helper in `start-encounter.ts`
- `IntentTypes.BringCharacterIntoEncounter` entry
- Tests that reference placeholders or BCIE (rewrite to new shape)

Files: `packages/shared/src/{intents,participant,character}` + `packages/rules/src/intents/{start-encounter,bring-character-into-encounter,types}.ts` + tests + `apps/api/src/lobby-do-stampers.ts`.

### Slice 3 — UI follow-on *(medium)*

EncounterBuilder becomes a true encounter draft:
- Local component state holds `selectedCharacterIds: Set<string>` (defaults to all approved) + `selectedMonsters: { monsterId, quantity }[]`
- Approved-character checklist with checkboxes (default checked)
- "Add monster" updates local state, not the WS-mirror
- "Start the fight" collects local state, dispatches `StartEncounter` with full payload, navigates

CampaignView cleanup:
- Remove "Bring into lobby" button from `ApprovedRosterPanel`
- Remove the "in lobby" badge + disabled state logic
- Roster panel becomes just a list of approved characters

WS mirror cleanup:
- Remove the `BringCharacterIntoEncounter` branch from `reflect()`
- `LoadEncounterTemplate` branch likely also goes away (templates are now applied client-side as monster picks, not via a separate intent — verify whether the intent still has a purpose)
- Placeholder rendering branch in `EncounterList` deleted

Files: `apps/web/src/pages/EncounterBuilder.tsx`, `apps/web/src/pages/CampaignView.tsx` (`ApprovedRosterPanel`), `apps/web/src/ws/useSessionSocket.ts`, a few web tests.

### Slice 4 — EndEncounter writeback *(medium)*

Closes the character-state persistence loop.

- Add `sideEffectEndEncounter` (or extend existing). For every PC participant in the ended encounter:
  - `UPDATE characters SET data = ... WHERE id = ?`
  - Set `currentStamina = participant.currentStamina`
  - Set `recoveriesUsed = participant.recoveries.max - participant.recoveries.current`
- Audit `applyRespite` + `sideEffectRespite` (from 2C Slice 4): the respite side-effect already writes to D1 via `wyrmplateChoices`. Extend it (or align the new EndEncounter side-effect) so respite refills to full (`currentStamina = null`, `recoveriesUsed = 0`).

Files: `apps/api/src/lobby-do-side-effects.ts` + audit `packages/rules/src/intents/respite.ts`.

## Open questions

- **Mid-fight character add.** Do we need `AddCharacterToEncounter` intent? Today `BringCharacterIntoEncounter` is the only way; killing it leaves a gap. Suggestion: add as Slice 4.5 if trivial (same stamper/reducer shape as the new StartEncounter PC path). Otherwise defer with a known gap and document.
- **`LoadEncounterTemplate` intent**: with monsters now picked client-side and sent in the StartEncounter payload, does this intent still have a purpose? Verify during Slice 3 — likely deleted or repurposed as a client-side "apply template to draft" affordance (UI-only, no intent).
- **`useApprovedCharactersFull` N+1**: today's checklist will need to display real names + classes. The N+1 fan-out fetch (added in 2C Slice 4) stays for now; known issue for a later API endpoint cleanup.

## Out of 2D (deferred)

- Mid-fight `AddCharacterToEncounter` if Slice 4.5 isn't tight scope
- Wizard-edit-during-active-encounter freeze enforcement (the snapshot at StartEncounter already gives the right semantics — wizard edits during the live encounter don't affect it because the participant is snapshotted)
- Multi-select polish on the character checklist (basic checkbox is enough)
- Encounter templates including character selection (templates stay monster-only)
- Unified out-of-combat character sheet (the `/characters/$id` vs `PlayerSheetPanel` split) — separate UX consolidation pass after 2D

## Acceptance

Epic 2D ships when:

1. A user can build a character, get approved by the director, and the director clicks "Start the fight" — the player's PC is materialized in the encounter without any explicit "bring into lobby" step.
2. After an encounter ends, the character's stamina + recoveries reflect what happened. Starting a new encounter inherits that state. Respite refills to full.
3. The director can deselect characters from the encounter draft (e.g. "Sarah's not here tonight").
4. `BringCharacterIntoEncounter`, `PcPlaceholder`, and the materialization loop don't exist anywhere in the codebase.
5. All existing tests are green or rewritten; no orphaned references.
6. `pnpm test`, `pnpm typecheck`, `pnpm lint` clean repo-wide.

## Where to start the next conversation

1. Read this file.
2. Read `docs/phases.md` § "Phase 2 Epic 2" for overarching scope.
3. Read `docs/superpowers/specs/2026-05-12-phase-2-epic-2c-interactive-ui-design.md` § "Architectural pattern — character-side mutations are 'ratification intents'" to understand the stamper → reducer → side-effect pattern this epic extends.
4. Glance at the 2C plan (`docs/superpowers/plans/2026-05-12-phase-2-epic-2c-interactive-ui.md`) to mirror its shape.
5. Brainstorm the spec via `superpowers:brainstorming` (the three core design decisions are already locked above — should be a short brainstorm focused on the open questions).
6. Spec → plan → execute via `superpowers:subagent-driven-development`, same pattern as 2A / 2B / 2C.

The three locked design decisions (auto-include all approved, encounter-draft-in-component-state, character-row-writeback) should not need re-litigating. The open questions in this doc (mid-fight add, LoadEncounterTemplate fate) are the ones to surface during brainstorm.

## Why this is worth doing before the engine carry-overs

The remaining Phase 2 engine work — § 2.7+ damage-engine transitions, temp-buff state machine, Q18 class-feature pipeline, magic-damage-bonus, per-echelon scaling — should be designed against the cleaner lifecycle, not the placeholder hack. Specifically:

- Temp-buff state machine needs to attach durations to participants. Cleaner with one participant kind, not two.
- §2.7+ winded/dying transitions interact with stamina state. The new "currentStamina persists to D1" path lets the engine treat negative stamina + dying-on-death consistently across encounters.
- The Q18 pipeline (class-feature choice slots) reads the Character blob — the same field that's now home to runtime state. Schema decisions should account for both at once.

Ship 2D first; the rest of the carry-overs become cheaper and cleaner.
