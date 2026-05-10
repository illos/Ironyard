# Intent protocol

Every state change in Ironyard is an **intent**: a typed, serializable object that flows through the rules reducer. This is the most important convention in the codebase. Skip it and you break sync, undo, attribution, and the log.

## Anatomy of an intent

```ts
type Intent = {
  id: string;              // ULID, generated client-side
  sessionId: string;       // which session this affects
  actor: {                 // who initiated
    userId: string;
    role: 'director' | 'player';
  };
  timestamp: number;       // ms since epoch, set by the DO on receive
  source: 'auto' | 'manual'; // 'auto' = engine-rolled, 'manual' = user typed
  type: IntentType;        // discriminator
  payload: IntentPayload;  // type-specific data, validated by Zod
  causedBy?: string;       // intent id this was derived from (for undo)
};
```

The DO assigns `timestamp` on receive so client clocks don't matter. The DO also assigns a monotonic sequence number stored alongside the intent for ordering.

## Intent type taxonomy

The full list lives in `packages/shared/src/intents.ts`. This is the conceptual taxonomy.

### Combat lifecycle

- `StartEncounter { encounterId }`
- `EndEncounter`
- `StartRound`
- `EndRound`
- `StartTurn { participantId }`
- `EndTurn { participantId }`
- `SetInitiative { participantId, position }` (manual reorder)

### Rolls

- `RollPower { abilityId, attackerId, targetIds[], edges, banes, rolls: { d10: [number, number] } }`
  - The dispatcher generates the 2d10 values and writes them into `rolls`. The reducer reads `rolls`, applies edges/banes (capped at ±2), evaluates the t1/t2/t3/crit ladder, and emits derived intents (one or more `ApplyDamage`, `SetCondition`, `Push`, etc.) per the ability's effect text.
- `RollTest { characterId, characteristic, edges, banes, rolls: { d10: [number, number] } }` (skill / save tests)
- `RollResistance { characterId, type, rolls: { d10: [number, number] } }` (saves on Draw Steel's "10+" mechanic)
- `RollFreeStrike { attackerId, targetId, rolls: { d10: [number, number] } }`

Why the dice live in the payload: the reducer is pure (see below), so randomness must enter as data, not be sampled inside the reducer. Today the rolling client generates the values; when we move to server-side rolling, the DO generates them before logging the intent. The intent shape doesn't change.

### Effects

- `ApplyDamage { targetId, amount, damageType, sourceIntentId }`
  - Engine consults `immunities`, `weaknesses`, conditions; computes net damage; updates stamina
- `Heal { targetId, amount }`
- `SetCondition { targetId, condition, duration, sourceIntentId }`
- `RemoveCondition { targetId, condition }`
- `Push { targetId, distance, direction? }`
- `Pull { targetId, distance, direction? }`
- `Slide { targetId, distance, direction? }`
- `SpendResource { characterId, resource, amount }` (heroic resource, surges)
- `GainResource { characterId, resource, amount }`
- `EarnVictory { sessionId, amount }`

### Manual override

- `SetStat { participantId, field, value, reason }`
  - The escape hatch. Used when a director long-presses a stat and edits it.
  - `field` is a typed enum of overridable stats (`stamina`, `tempStamina`, `surges`, etc.) — not arbitrary keys.

### Session-level

- `JoinSession { userId, characterId? }`
- `LeaveSession { userId }`
- `BringCharacterIntoEncounter { characterId, encounterId, position }`
- `RemoveParticipant { participantId }`

### Meta

- `Undo { intentId }` — the DO replays the inverse of `intentId` and marks it voided
- `Redo { intentId }` — re-applies a previously-undone intent
- `Note { text }` — director's free-text annotation in the log

## The reducer contract

```ts
function applyIntent(
  state: SessionState,
  intent: Intent,
): {
  state: SessionState;       // new state (immutable update)
  derived: Intent[];         // intents the engine emits in response
  log: LogEntry[];           // human-readable log entries
  errors?: ValidationError[]; // empty array on success
};
```

- **Pure.** No `Date.now()`, no `Math.random()`. Both are passed in via the intent (`timestamp`, and roll results pre-computed by the dispatcher) so the same intent applied twice produces the same state.
- **Derived intents.** A `RollPower` whose t2 effect is "8 fire damage and Bleeding (EoT)" produces two derived intents: `ApplyDamage` and `SetCondition`. They're pushed to the log with `causedBy = parent.id` and applied transactionally.
- **Idempotent.** Re-applying the same intent produces the same result (we use the id to dedupe on reconnect).

## Undo

Each intent type has an `inverse(intent, stateBefore)` function. The DO's undo flow:

1. Look up the target intent in the log
2. Find its derived chain by selecting current-round intents `WHERE causedBy = parentId AND voided = 0`
3. Compute the inverse of each derived intent using its `stateBefore`, apply in reverse-application order
4. Compute and apply the inverse of the parent
5. Mark the entire chain as `voided: true` (kept in log, hidden from default UI)

The `causedBy` field already on every derived intent is the only lookup mechanism we need; no extra parent→children pointer is stored on the intent.

**Undo is bounded to the current round.** Once `EndRound` fires, prior intents are committed. This keeps the undo stack small and prevents weird interactions ("undo last turn's death save").

## Optimistic UI

When a client dispatches an intent:

1. Apply locally with the same reducer code that runs in the DO
2. Show an optimistic UI update with a subtle pending indicator
3. Send the intent to the DO via WebSocket
4. DO applies authoritatively, broadcasts the canonical result + sequence number

Reconciliation rules per `applied` envelope received:

1. **Matches a pending optimistic intent** (by `id`): drop the pending marker, adopt the DO's `seq`. No state change beyond marker removal — local apply already happened.
2. **New to this client** (e.g. another user's intent): splice into local state at its seq position via the same reducer.
3. **A pending optimistic intent comes back as `rejected`** (permission failure, or a state precondition the optimistic copy didn't see): revert it locally and surface a brief toast. The DO's `rejected` envelope carries the reason.

Two clients can dispatch in the same network window without conflict in the database sense — the DO is the single writer, assigns canonical seqs in receive order, and broadcasts. Display flicker inside the optimistic window is acceptable.

For rolls, dice values live in the intent payload (see "Rolls" above). Today the dispatching client generates them; per the trust model the DO accepts them and records the actor. When rolling moves server-side later, the DO generates the values before assigning a seq — no other code changes.

## Permission gates

The DO runs `canDispatch(intent, actor, state)` before applying. Gate logic lives in `packages/rules/src/permissions.ts` and is the single place to change permission rules.

## Wire format

WebSocket messages are envelopes:

```ts
type ClientMsg =
  | { kind: 'dispatch'; intent: Intent }
  | { kind: 'sync'; sinceSeq: number }
  | { kind: 'ping' };

type ServerMsg =
  | { kind: 'applied'; intent: Intent; seq: number; state?: PartialState }
  | { kind: 'rejected'; intentId: string; reason: string }
  | { kind: 'snapshot'; state: SessionState; seq: number }
  | { kind: 'pong' };
```

Both ends validate envelopes with Zod. Anything malformed is dropped and logged.
