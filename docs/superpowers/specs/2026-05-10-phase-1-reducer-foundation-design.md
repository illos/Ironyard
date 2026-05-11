---
name: Phase 1 reducer foundation
description: First slice of Phase 1 — packages/rules reducer skeleton wired through the DO with intent log persistence and replay-on-restart
type: spec
---

# Phase 1 slice 1 — reducer foundation

## Goal

Make the Durable Object an authoritative state machine driven by intents:

- `packages/rules` exports a pure `applyIntent(state, intent)` reducer with three intent types.
- The DO maintains `SessionState` in memory, runs the reducer on every dispatch, persists each intent to D1, snapshots state periodically, and replays from D1 on restart.
- The wire format gains real `applied` envelopes; the Phase 0 `member_*` envelopes stay alongside so the web app needs no changes.

This is the smallest slice that gives us the full engine plumbing — state shape, dispatcher, persistence, replay, sync envelope. Subsequent slices add rolls, conditions, turn state, etc. by adding intent types; the plumbing is paid for once.

## Out of scope

- Client-side reducer / optimistic UI
- Director-vs-player permission gating beyond actor-spoof prevention
- Retiring the `member_joined` / `member_left` / `member_list` envelopes
- Any rolls, damage, conditions, resources, encounters, participants, turns
- UI changes

## Module layout

```
packages/rules/src/
├── index.ts                       # public exports
├── reducer.ts                     # applyIntent dispatcher
├── types.ts                       # SessionState, IntentResult, LogEntry, ValidationError
├── intents/
│   ├── index.ts
│   ├── join-session.ts            # handler
│   ├── leave-session.ts
│   └── note.ts
├── canon-status.generated.ts      # unchanged
└── require-canon.ts               # unchanged
```

## Public surface

```ts
export function applyIntent(state: SessionState, intent: Intent): IntentResult;

export type SessionState = {
  sessionId: string;
  seq: number;                     // last applied intent seq
  connectedMembers: Member[];      // driven by JoinSession / LeaveSession
  notes: NoteEntry[];              // append-only Note log
};

export type NoteEntry = {
  intentId: string;
  actorId: string;
  text: string;
  timestamp: number;
};

export type IntentResult = {
  state: SessionState;
  derived: Intent[];               // empty in this slice
  log: LogEntry[];                 // human-readable
  errors?: ValidationError[];
};

export type LogEntry = {
  kind: 'info' | 'error';
  text: string;
  intentId: string;
};

export type ValidationError = { code: string; message: string };

export function emptySessionState(sessionId: string): SessionState;
```

`applyIntent` is pure. No `Date.now()`, no `Math.random()`. The DO sets `intent.timestamp` before calling.

## Intent payloads (in `@ironyard/shared`)

New `packages/shared/src/intents/` directory mirroring the rules package layout. Phase 0's blanket `IntentSchema.payload = z.unknown()` stays — narrowing to a per-type discriminated union waits until more intent types exist (avoids two refactors).

```ts
// JoinSession — auto-emitted by the DO when a WS connects
JoinSessionPayloadSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1),
})

// LeaveSession — auto-emitted by the DO when a WS closes
LeaveSessionPayloadSchema = z.object({
  userId: z.string().min(1),
})

// Note — user-dispatched annotation, log-only
NotePayloadSchema = z.object({
  text: z.string().min(1).max(2000),
})
```

A small payload-validator helper picks the right schema by `intent.type` and returns the parsed payload or a `ValidationError`. Reducers receive the already-validated payload.

## Reducer dispatch

```ts
export function applyIntent(state: SessionState, intent: Intent): IntentResult {
  switch (intent.type) {
    case 'JoinSession': return applyJoinSession(state, intent);
    case 'LeaveSession': return applyLeaveSession(state, intent);
    case 'Note': return applyNote(state, intent);
    default: return {
      state,
      derived: [],
      log: [],
      errors: [{ code: 'unknown_intent', message: `Unknown intent type: ${intent.type}` }],
    };
  }
}
```

Each handler:
- Validates payload via Zod.
- Returns updated state via immutable spread (no mutation).
- Appends a `LogEntry`.
- Increments `state.seq` to `intent` envelope's seq (DO-assigned before calling).

Per-handler semantics:

- **JoinSession**: idempotent. If `connectedMembers` already contains `userId`, no change. Otherwise append.
- **LeaveSession**: idempotent. If `userId` not in `connectedMembers`, no change. Otherwise filter out.
- **Note**: validates text, appends `NoteEntry { intentId, actorId, text, timestamp }`.

## DO integration (apps/api/src/session-do.ts)

State lifecycle:

```
constructor + first request
  → state.blockConcurrencyWhile(load):
      load latest session_snapshots row (if any) → deserialize SessionState
      SELECT intents WHERE session_id = ? AND seq > snapshot.seq ORDER BY seq
      replay each through applyIntent
      this.state = result
      this.seq = state.seq
```

Per-dispatch:

```
ws.onmessage(raw)
  → ClientMsgSchema.safeParse(raw)
  → if kind === 'dispatch':
      validate intent payload per type → on failure, send 'rejected' { intentId, reason }
      override intent.actor with the WS-authenticated user
      assign seq = ++this.seq
      stamp timestamp = Date.now()
      result = applyIntent(this.state, intent)
      if result.errors: send 'rejected', rollback seq, return
      this.state = result.state
      INSERT into intents (id, session_id, seq, actor_id, payload JSON, created_at)
      if seq % 50 === 0 OR (now - lastSnapshotAt) >= 30000:
        INSERT OR REPLACE into session_snapshots
        lastSnapshotSeq = seq; lastSnapshotAt = now
      broadcast { kind: 'applied', intent, seq } to all sockets
  → if kind === 'sync': stream missed intents as 'applied' envelopes in seq order
  → if kind === 'ping': send 'pong'
```

Connect/disconnect hooks (alongside existing lobby tracking):

```
ws.onopen
  → existing: sockets.set + send member_list + broadcast member_joined
  → new: dispatch synthetic JoinSession { userId, displayName } through the full pipeline
         (so it's persisted + broadcast as 'applied')

ws.onclose
  → existing: sockets.delete + broadcast member_left
  → new: dispatch synthetic LeaveSession { userId }
```

Two parallel mechanisms by design — the legacy envelopes keep the web app working unchanged; the new intent log is the source of truth for replay.

## Persistence details

- D1 `intents` table already exists (Phase 0 schema). One INSERT per applied intent.
- D1 `session_snapshots` table already exists. INSERT OR REPLACE keyed on `session_id`.
- Snapshot payload: JSON-serialized `SessionState`.
- Snapshot cadence: every 50 intents OR every 30s (whichever first). Tracked in DO instance state, not persisted (recomputed from `lastSnapshotSeq` on cold start).
- Rejected intents (validation/permission failure) are *not* persisted and *not* assigned a seq.

## Sync envelope

`{ kind: 'sync', sinceSeq: N }` → DO replies with a series of `{ kind: 'applied', intent, seq }` envelopes for every intent with `seq > N`, in seq order. No batching/snapshot envelope for the plumbing slice — sufficient at expected volumes.

## Permissions (minimal)

- DO overrides `intent.actor` with the WS-authenticated user before calling the reducer. Clients can't spoof.
- `JoinSession` / `LeaveSession`: not user-dispatchable. If a client sends one, return `rejected { reason: 'permission' }`.
- `Note`: any connected member can dispatch.

Director-vs-player gates land with the rolls slice.

## Wire envelope changes

ServerMsg: no schema change. The slice exercises the existing `applied` and `rejected` variants for the first time. `member_*` envelopes continue alongside.

ClientMsg: no schema change. `dispatch` and `sync` are exercised for the first time.

## Testing

- `packages/rules/tests/reducer.spec.ts` — fixture-driven scenarios. Target ~15 tests:
  - empty state apply (each intent type)
  - duplicate JoinSession is idempotent
  - LeaveSession for unknown user no-ops
  - Note appends with intentId, actorId, text, timestamp
  - bad payloads surface as ValidationErrors and leave state unchanged
  - seq advances per applied intent
  - unknown intent type returns ValidationError
- `packages/shared/tests/intents.spec.ts` — payload schema validation: required fields, length limits, type narrowing.
- `apps/api/tests/persistence.spec.ts` — pure persistence helpers if any (state serialization round-trip).
- Manual smoke (Phase 0-style /tmp script): two users connect; one posts a Note; both see `applied`; restart wrangler dev; reconnect; verify state replays.

## Risks / open questions

- **DO storage vs D1**: spec says D1 for both intent log and snapshot. DO storage API is faster but tied to the DO instance (no cross-restart durability if DO migrates). D1 it is. Re-evaluate if D1 latency hurts dispatch throughput.
- **Snapshot bloat**: at 50-intent cadence, a long session could have many snapshots. We INSERT OR REPLACE so only the latest survives — fine for Phase 1.
- **Cold-start latency**: replaying N intents at session open could be slow if N is large. For Phase 1 plumbing slice, N stays small. Phase 2+ should add a compaction step.

## Verification baseline (after slice lands)

- `pnpm typecheck`, `pnpm lint`, `pnpm test` all clean
- Reducer test count: ~15 new passes
- Manual smoke: two-client connect + Note + restart + replay reproduces state
