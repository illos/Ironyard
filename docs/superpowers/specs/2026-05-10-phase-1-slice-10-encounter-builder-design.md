---
name: Phase 1 slice 10 — encounter builder UI
description: A /sessions/:id/build screen for staging an encounter. Pick monsters from the codex, add quick-PC stat blocks, see the live participant list, navigate to play. Pure UI work — uses existing engine intents.
type: spec
---

# Phase 1 slice 10 — encounter builder UI

## Goal

Compose what slices 2 + 3 + 4 already shipped into a real, browser-driveable screen so directors can stage an encounter before play. After this slice lands, you can sign in → create a session → join → go to the builder → pick a monster from the codex → add a quick-PC for each player → start a round → end turns → all without curl scripts.

Combat run screen (live HP, ability cards, damage rolls) is **slice 11**. This slice stops at "the participants exist in `activeEncounter.participants`."

## Scope cut

**In:**
- New route `/sessions/:id/build`.
- Three-pane layout:
  1. **Monster picker** (left): the slice 2 monsters.json list with name filter. Click a row to add. Each added monster gets a fresh `id = "<monsterId>-instance-<count>"` so adding "Goblin" twice produces "Goblin 1" and "Goblin 2".
  2. **Encounter list** (centre): live `activeEncounter.participants[]` read from the DO. Shows name + kind + current/max stamina + level (for monsters). Empty state with a "Create encounter" CTA when `activeEncounter === null`.
  3. **Quick-PC form** (right): name + max stamina + characteristics (5 numeric inputs ranging −5..+5) + a "Bring in" button.
- "Start the fight" button: dispatches `StartRound` and navigates to `/sessions/:id` (the existing lobby/in-progress view). Disabled until at least 1 participant exists.
- Link from the existing `/sessions/:id` view header → `/sessions/:id/build`.
- Touch-first sizing (44pt minimum hit targets per `CLAUDE.md`); dark theme matching the rest of the app.

**Out:**
- Combat run screen / live HP edits / ability cards / auto-roll (slice 11)
- Initiative reorder UI (a sensible default order is `participants[]` insertion order; explicit reorder via dispatching `SetInitiative` is slice 11+)
- Removing participants from an encounter (skippable for slice 10 — director can dispatch `RemoveParticipant` later when that intent lands)
- Encounter scaling by victories
- Monster stat-block detail (slice 2 only ingested id/name/level; richer fields land in a later data slice)

## Files to add / modify

**New:**
- `apps/web/src/pages/EncounterBuilder.tsx` — the three-pane page.
- `apps/web/src/api/dispatch.ts` — a small helper exporting `useDispatchIntent(sessionId)` that gets the live WS from `useSessionSocket` (which needs a tiny extension — see below) and sends `dispatch` envelopes with a generated ULID for `intent.id`.

**Modify:**
- `apps/web/src/router.tsx` — add the `/sessions/$id/build` route.
- `apps/web/src/pages/SessionView.tsx` — add a `<Link to="/sessions/$id/build">Build encounter</Link>` in the header.
- `apps/web/src/ws/useSessionSocket.ts` — extend its return to expose:
  - the current `activeEncounter` (parsed from `applied` envelopes by running a *tiny* mirror reducer: process `StartEncounter` → set encounter; `BringCharacterIntoEncounter` → append participant; everything else ignored for now)
  - a `dispatch(intent)` function to send raw intents over the WS
  - (existing) `members` and `status`
  - **NB:** Phase 1 doesn't yet ship the full client-side reducer; this is a slice-10-scoped mini-derivation, NOT a fork of `applyIntent`. Keep it ~20 lines and clearly comment that the real client reducer lands later.

## Key UX details

- **Monster picker** is a virtualised-feel list. With 416 monsters it works to filter then scroll; no need for actual virtualisation in this slice.
- **Adding the first monster**: if `activeEncounter === null`, auto-dispatch `StartEncounter { encounterId: ulid() }` first, then `BringCharacterIntoEncounter` for the chosen monster. Subsequent adds skip the StartEncounter.
- **Quick-PC form**: react-hook-form is already in the stack? No — actually it's not yet installed. Use plain controlled state, the form is small. Validate on submit (name non-empty, stamina ≥ 1, characteristics in −5..+5) and dispatch on success.
- **Optimistic feel**: don't show a spinner on add — the WS is fast and the `applied` envelope arrives before the user notices. If an `applied` envelope doesn't arrive within ~3s, show a brief warning toast (Phase 0 doesn't have a toast system; just inline text under the list is fine).
- **Connection status**: show the existing `status` badge from `useSessionSocket` so a disconnected state is obvious.

## Wire flow

For each "add monster" click:
```
1. Look up the monster in the cached monsters.json (already loaded via useMonsters)
2. Build a Participant payload:
   {
     id: `${monster.id}-${counterForThisType}`,
     name: counterForThisType > 1 ? `${monster.name} ${counterForThisType}` : monster.name,
     kind: 'monster',
     currentStamina: 20,     // placeholder until data slice ships stamina
     maxStamina: 20,         // placeholder
     characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },  // placeholder
     immunities: [],
     weaknesses: [],
   }
3. If activeEncounter === null: dispatch StartEncounter first.
4. Dispatch BringCharacterIntoEncounter { participant }.
```

Placeholder stat blocks are honest given the data slice only ships id/name/level. Add a small TODO comment so this is easy to find when the data ingest extends.

## Constraints for the agent

- **Touch only `apps/web`.** Do not modify `packages/rules`, `packages/shared`, `packages/data`, or `apps/api`. (Read-only reference is fine — the engine intent shapes are public via `@ironyard/shared`.)
- Reuse existing patterns: `useQuery` for /data fetches, fetch wrapper in `api/client.ts`, `useSessionSocket` for the WS, dark Tailwind theme.
- Don't add new dependencies. Everything needed is already installed.
- Don't add tests (no React testing setup yet); slice 11 can add Vitest + Testing Library together.
- Verify with `pnpm typecheck`, `pnpm lint`, `pnpm --filter @ironyard/web build`. Don't run `pnpm dev` — another worktree may be holding the ports.

## Acceptance

After your branch is merged the user can:
1. `pnpm dev`
2. Sign in, create a session, navigate to `/sessions/:id/build`.
3. Filter and click 2 monsters from the codex → both show in the encounter list with auto-numbered names.
4. Fill the quick-PC form and submit → the PC appears in the list.
5. Click "Start the fight" → the round starts and the user lands on `/sessions/:id`.
6. Reload the page mid-flow → the encounter state is reloaded from D1 (slice 1's replay) and the list reflects the same participants.

## Expected output (return summary)

1. List of files added/modified.
2. Screenshot description (since you can't take screenshots — describe what the user should see on iPad-portrait and iPhone-portrait widths).
3. Any deviations from the spec (with reasoning).
4. Anything that needs the data slice to extend before the placeholder stat blocks become real.
