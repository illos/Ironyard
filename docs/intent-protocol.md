# Intent protocol

Every state change in Ironyard is an **intent**: a typed, serializable object that flows through the rules reducer. This is the most important convention in the codebase. Skip it and you break sync, undo, attribution, and the log.

## Anatomy of an intent

```ts
type Intent = {
  id: string;              // ULID, generated client-side
  campaignId: string;      // which campaign this affects
  actor: {                 // who initiated
    userId: string;
  };
  timestamp: number;       // ms since epoch, set by the DO on receive
  source: 'auto' | 'manual' | 'server'; // 'server' for DO-emitted synthetic intents
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
- `RollTest { characterId, characteristic, difficulty: 'easy' | 'medium' | 'hard', skillId?, edges, banes, rolls: { d10: [number, number] } }` — non-ability power rolls (climb, sneak, recall lore, etc.). The reducer follows the test outcome ladder in [rules-canon § 7.2](rules-canon.md#72-test-difficulty).
- `RollResistance { characterId, effectId, rolls: { d10: number } }` — the **saving throw** to end a `save_ends` effect. Mechanic: a **single d10**, **≥ 6 ends the effect**, per [rules-canon § 3.3](rules-canon.md#33-saving-throws). Note: this is **not** a power roll (no characteristic, no edges/banes) — only one d10 in the payload.
- `RollOpposedTest { aId, bId, aCharacteristic, bCharacteristic, aEdges, aBanes, bEdges, bBanes, aRolls: { d10: [number, number] }, bRolls: { d10: [number, number] } }` — both sides roll simultaneously, dispatcher pre-rolls both, reducer compares totals and emits the winner. Per [Q13](rule-questions.md#q13-opposed-power-rolls--simultaneous-or-sequential-).
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
- `EarnVictory { campaignId, amount }`

### Manual override

- `SetStat { participantId, field, value, reason }`
  - The escape hatch. Used when a director long-presses a stat and edits it.
  - `field` is a typed enum of overridable stats (`stamina`, `tempStamina`, `surges`, etc.) — not arbitrary keys.

### Lobby / campaign management

- `JoinLobby { userId, characterId? }` — server-only; DO emits when a WebSocket connects
- `LeaveLobby { userId }` — server-only; DO emits on disconnect
- `BringCharacterIntoEncounter { characterId, position }` — adds a hero to the lobby roster (works whether or not an encounter is active)
- `AddMonster { monsterId, quantity, nameOverride? }` — active-director gated; DO stamps the resolved monster payload from `monsters.json` before the reducer sees it
- `RemoveParticipant { participantId }` — active-director gated; rejected if the participant is the currently active turn participant
- `ClearLobby` — active-director gated; rejected while an encounter is active
- `LoadEncounterTemplate { templateId }` — active-director gated; DO resolves the template row from D1 and stamps `{ templateId, monsters: [...] }` onto the payload; the reducer fans into one derived `AddMonster` per entry
- `JumpBehindScreen` — director-permitted gated; DO stamps `{ permitted: boolean }` from `campaign_memberships.is_director`; reducer accepts if `permitted === true` OR `actor.userId === state.ownerId`; sets `state.activeDirectorId = actor.userId`

### Campaign-character lifecycle (side-effect intents)

These intents flow through the intent log for attribution but mutate D1 directly — the reducer validates authority and returns unchanged `CampaignState`. They are **not undoable** today (the Undo flow has no hook to reverse D1 row writes). See "Side-effect intent pattern" below.

- `SubmitCharacter { characterId }` — any campaign member; DO writes `campaign_characters` row with `status='pending'`; rejects if actor doesn't own the character or isn't a campaign member
- `ApproveCharacter { characterId }` — active-director gated; DO updates row to `status='approved'`
- `DenyCharacter { characterId }` — active-director gated; DO deletes the row
- `RemoveApprovedCharacter { characterId }` — active-director gated; DO deletes the row; also removes the participant from the lobby roster if present
- `KickPlayer { userId }` — active-director gated; rejected if `userId === state.ownerId`; DO deletes the target's `campaign_memberships` row and all their `campaign_characters` rows, then emits derived `RemoveParticipant` intents for any of their characters in the lobby roster

### Meta

- `Undo { intentId }` — the DO replays the inverse of `intentId` and marks it voided
- `Redo { intentId }` — re-applies a previously-undone intent
- `Note { text }` — director's free-text annotation in the log

## The reducer contract

```ts
function applyIntent(
  state: CampaignState,
  intent: Intent,
): {
  state: CampaignState;      // new state (immutable update)
  derived: Intent[];         // intents the engine emits in response
  log: LogEntry[];           // human-readable log entries
  errors?: ValidationError[]; // empty array on success
};
```

- **Pure.** No `Date.now()`, no `Math.random()`. Both are passed in via the intent (`timestamp`, and roll results pre-computed by the dispatcher) so the same intent applied twice produces the same state.
- **Derived intents.** A `RollPower` whose t2 effect is "8 fire damage and Bleeding (EoT)" produces two derived intents: `ApplyDamage` and `SetCondition`. They're pushed to the log with `causedBy = parent.id` and applied transactionally.
- **Idempotent.** Re-applying the same intent produces the same result (we use the id to dedupe on reconnect).

## DO stamping pattern

Some intents require data that lives in D1 or in static JSON — data the pure reducer cannot fetch. The DO handler reads that data inside the serialized op (before calling the reducer) and stamps the resolved fields onto the intent payload. The reducer sees a complete payload and remains pure (no D1 access).

Examples:

| Intent | What the DO stamps |
|---|---|
| `LoadEncounterTemplate` | Reads `encounter_templates` row from D1; stamps `{ monsters: [...] }` |
| `JumpBehindScreen` | Reads `campaign_memberships.is_director` for the actor; stamps `{ permitted: boolean }` |
| `AddMonster` | Resolves monster data from `monsters.json`; stamps the full monster payload |

The pattern generalises: whenever the reducer needs external data to make a decision, the DO attaches it to the payload at the boundary. The intent then contains its full context and can be replayed faithfully from the log.

## Side-effect intent pattern

A subset of intents — `SubmitCharacter`, `ApproveCharacter`, `DenyCharacter`, `RemoveApprovedCharacter`, `KickPlayer` — mutate D1 rows (in `campaign_characters` or `campaign_memberships`) rather than `CampaignState`. These are **side-effect intents**:

- The DO validates authority and executes the D1 write inside the serialized op.
- The intent is persisted to the `intents` log for attribution and auditability.
- The reducer is still called and still performs its authority checks, but returns unchanged `CampaignState`.
- Clients re-fetch the affected data via `GET /api/campaigns/:id/characters` or `GET /api/campaigns/:id/members` when they receive an `applied` envelope for one of these intents.
- **These intents are not undoable.** The Undo flow voids rows in the log and replays `CampaignState` — it has no mechanism to reverse D1 row writes outside state. Instead of undoing, the director dispatches the opposing intent (e.g. `ApproveCharacter` after a mistaken deny flow is a fresh submission + approval).

## Server-only intents

`SERVER_ONLY_INTENTS` in the DO: `{ JoinLobby, LeaveLobby, ApplyDamage }`. These are emitted by the DO itself (on connect/disconnect events or as derived intents) and are **rejected if dispatched by a client** — the DO drops them at the envelope boundary before permission or reducer checks.

The admin-style intents (`SubmitCharacter`, `Approve/DenyCharacter`, `RemoveApprovedCharacter`, `KickPlayer`, `RemoveParticipant`, `ClearLobby`, `JumpBehindScreen`) are **not** server-only. Clients dispatch them; authority is validated inside the reducer (and via DO stamping for `JumpBehindScreen`).

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
  | { kind: 'snapshot'; state: CampaignState; seq: number }
  | { kind: 'pong' };
```

Both ends validate envelopes with Zod. Anything malformed is dropped and logged.
