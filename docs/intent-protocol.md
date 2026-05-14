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

- `StartEncounter { encounterId?, characterIds[], monsters[], stampedPcs[], stampedMonsters[] }` — atomic encounter setup. Client sends `characterIds` + `monsters`; the DO resolves each PC's character blob from D1 (→ `stampedPcs`) and each monster entry's stat block from static data (→ `stampedMonsters`). The reducer materializes a full `Participant` for every PC (via `deriveCharacterRuntime`) and every monster instance, then REPLACES the lobby roster with the new encounter's participants. PC runtime state (`currentStamina`, `recoveriesUsed`) persists in the `characters` row between encounters; `EndEncounter` writes it back, `Respite` resets it.
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

### Character-runtime

- `SwapKit { characterId, newKitId, ownerId }` — side-effect intent. `ownerId` is stamped by the DO from D1 (the character row is the source of truth for ownership). Mutates `characters.data.kitId` in D1. Rejected if `state.encounter !== null`. Authority: character owner OR active director. Next `StartEncounter` re-derives with the new kit.
- `Respite` — hybrid intent (state-mutating AND D1 side-effect). State: refills `recoveries.current = max` on every PC participant; drains `state.partyVictories` to 0. D1: increments each PC's character `data.xp` by `partyVictories` (1:1 conversion). Rejected if `state.encounter !== null`. Not undoable.

### Manual override

- `SetStat { participantId, field, value, reason }`
  - The escape hatch. Used when a director long-presses a stat and edits it.
  - `field` is a typed enum of overridable stats (`stamina`, `tempStamina`, `surges`, etc.) — not arbitrary keys.

### Lobby / campaign management

- `JoinLobby { userId, characterId? }` — server-only; DO emits when a WebSocket connects
- `LeaveLobby { userId }` — server-only; DO emits on disconnect
- `AddMonster { monsterId, quantity, nameOverride? }` — active-director gated; DO stamps the resolved monster payload from `monsters.json` before the reducer sees it
- `RemoveParticipant { participantId }` — active-director gated; rejected if the participant is the currently active turn participant
- `ClearLobby` — active-director gated; rejected while an encounter is active
- `LoadEncounterTemplate { templateId }` — active-director gated; DO resolves the template row from D1 and stamps `{ templateId, monsters: [...] }` onto the payload; the reducer fans into one derived `AddMonster` per entry
- `JumpBehindScreen` — director-permitted gated; DO stamps `{ permitted: boolean }` from `campaign_memberships.is_director`; reducer accepts if `permitted === true` OR `actor.userId === state.ownerId`; sets `state.activeDirectorId = actor.userId`

### Sessions

- `StartSession { sessionId?, name?, attendingCharacterIds, heroTokens? }` — director-only. Opens a play session, declares attending characters, initializes the hero token pool. Rejects if a session is already active. DO stamper validates attendingCharacterIds against the campaign's approved roster and assigns a default `Session N` name. Client SHOULD provide `sessionId` (a `sess_<ulid>` string) so the optimistic mirror picks it up without a snapshot round-trip; the reducer falls back to ulid() generation if absent.
- `EndSession {}` — director-only. Closes the active session. Side-effect snapshots `hero_tokens_end` to D1 for history.
- `UpdateSessionAttendance { add?, remove? }` — director-only. Adjusts attendance mid-session for late arrivals / departures. Does not auto-grant or revoke hero tokens (canon: tokens are 'at session start').
- `GainHeroToken { amount }` — director-only mid-session bonus award.
- `SpendHeroToken { amount, reason, participantId }` — player or director. Reason is `surge_burst` (amount 1 → derived GainResource surges +2), `regain_stamina` (amount 2 → derived ApplyHeal of recoveryValue), or `narrative` (amount ≥ 1, no derived intent).

**Precondition added to combat intents:** `StartEncounter` rejects with `no_active_session` if `state.currentSessionId === null`. Other encounter-scoped intents (turn, roll, damage, condition, resource) still work within an active encounter regardless of session state — sessions are an outer boundary, not a per-intent check.

### Campaign-character lifecycle (side-effect intents)

These intents flow through the intent log for attribution but mutate D1 directly — the reducer validates authority and returns unchanged `CampaignState`. They are **not undoable** today (the Undo flow has no hook to reverse D1 row writes). See "Side-effect intent pattern" below.

- `SubmitCharacter { characterId }` — any campaign member; DO writes `campaign_characters` row with `status='pending'`; rejects if actor doesn't own the character or isn't a campaign member
- `ApproveCharacter { characterId }` — active-director gated; DO updates row to `status='approved'`
- `DenyCharacter { characterId }` — active-director gated; DO deletes the row
- `RemoveApprovedCharacter { characterId }` — active-director gated; DO deletes the row; also removes the participant from the lobby roster if present
- `KickPlayer { userId }` — active-director gated; rejected if `userId === state.ownerId`; DO deletes the target's `campaign_memberships` row and all their `campaign_characters` rows, then emits derived `RemoveParticipant` intents for any of their characters in the lobby roster

### Open Actions

A non-blocking, lobby-visible queue of rule-driven options a human may claim (Phase 2b.0). The list is visible to every connected user; the Claim button is enabled only for the eligible actor — the targeted participant's owner OR the active director. Unclaimed entries auto-expire when `expiresAtRound` is reached (or at `EndEncounter` unconditionally). Built in 2b.0 with no consumers; first consumers (spatial triggers, Conduit pray-to-the-gods) land in 2b.0.1.

- `RaiseOpenAction { kind, participantId, expiresAtRound?, payload }` — **server-only**. The DO emits this as a derived intent from event-source intents (a damage application, a roll, a forced movement) when a class-specific or spatial condition might allow a player to claim a heroic-resource gain or other rule effect. Reducer appends an `OpenAction` to `state.openActions` with a fresh `oa_<ulid>` id and stamps `raisedByIntentId = intent.id`.
- `ClaimOpenAction { openActionId, choice? }` — player owner of the targeted participant OR active director. Reducer removes the OA and emits any kind-specific derived intents the consumer registers (registry empty in 2b.0; consumers in 2b.0.1).

There is no `DismissOpenAction`. Unclaimed entries auto-expire at `EndRound` (`expiresAtRound === currentRound`) or unconditionally at `EndEncounter`.

Visibility: the OA list is part of `CampaignState`, broadcast to every connected client. The eligible-actor check (`owner || active director`) is enforced server-side in the reducer and mirrored in the UI as a per-row Claim-button enablement.

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
| `AddMonster` | Resolves monster data from `monsters.json`; stamps the full monster payload |
| `JumpBehindScreen` | Reads `campaign_memberships.is_director` for the actor; stamps `{ permitted: boolean }` |
| `LoadEncounterTemplate` | Reads `encounter_templates` row from D1; stamps `{ monsters: [...] }` |
| `StartEncounter` | Reads each `characters` row in `characterIds[]` from D1 (→ `stampedPcs[]`); resolves each entry in `monsters[]` from `monsters.json` (→ `stampedMonsters[]`) |
| `StartSession` | Reads `campaign_characters` for the approved roster (validates `attendingCharacterIds`); reads `sessions` count for default `Session N` name |
| `SwapKit` | Reads `characters.owner_id` from D1; stamps `ownerId` |

The pattern generalises: whenever the reducer needs external data to make a decision, the DO attaches it to the payload at the boundary. The intent then contains its full context and can be replayed faithfully from the log.

## Side-effect intent pattern

A subset of intents — `SubmitCharacter`, `ApproveCharacter`, `DenyCharacter`, `RemoveApprovedCharacter`, `KickPlayer` — mutate D1 rows (in `campaign_characters` or `campaign_memberships`) rather than `CampaignState`. These are **side-effect intents**:

- The DO validates authority and executes the D1 write inside the serialized op.
- The intent is persisted to the `intents` log for attribution and auditability.
- The reducer is still called and still performs its authority checks, but returns unchanged `CampaignState`.
- Clients re-fetch the affected data via `GET /api/campaigns/:id/characters` or `GET /api/campaigns/:id/members` when they receive an `applied` envelope for one of these intents.
- **These intents are not undoable.** The Undo flow voids rows in the log and replays `CampaignState` — it has no mechanism to reverse D1 row writes outside state. Instead of undoing, the director dispatches the opposing intent (e.g. `ApproveCharacter` after a mistaken deny flow is a fresh submission + approval).

## Hybrid intents

A third intent category, sitting between state-mutating intents (which change `CampaignState`) and side-effect intents (which write D1 outside `CampaignState`): **hybrid intents** do both inside a single serialized DO op. `Respite` is the canonical example.

- The DO calls the reducer first; if it returns errors, the side-effect is skipped.
- On success, the DO performs the D1 writes derived from the intent payload + reducer-returned state.
- The intent is logged with full attribution.
- **Not undoable.** The Undo path silently skips hybrid intents, same as pure side-effects, because rolling back the D1 writes isn't a state-replay concern.

## Server-only intents

`SERVER_ONLY_INTENTS` in the DO: `{ JoinLobby, LeaveLobby, ApplyDamage, RaiseOpenAction }`. These are emitted by the DO itself (on connect/disconnect events or as derived intents) and are **rejected if dispatched by a client** — the DO drops them at the envelope boundary before permission or reducer checks.

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
