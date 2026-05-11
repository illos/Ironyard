# Character sharing

A persistent, user-to-user permission model for letting other people view or control entities you own. Powers four distinct use cases with one mechanism:

1. **Preview** — let a friend see your character sheet during play (read-only).
2. **Lend** — let a friend run your character when you can't make it, or share two-handed play between players.
3. **Monster handoff** — director gives a player tactical control of a monster instance for a fight.
4. **NPC ally / retainer** — director gives the party a persistent friendly NPC that travels with them across sessions.

All four flow through one table and one resolver.

## Scope

- This doc specifies the data model, permission resolution, lifecycle, and intent surface for sharing.
- UI sketches in this doc are illustrative. The considered design lands in **Phase 5 (UI rebuild)**. Phase 3 ships prototype-grade UI for everything described here.
- This is a Phase 3 capability. Phase 1 and Phase 2 reducer / character work doesn't need to know about grants — they're additive.

## Concepts

**Entity.** Anything in a session that can be acted upon and has a controller. Three kinds exist:

| Entity kind | Owner | Persistence | Initiative side (default) | Built from |
|---|---|---|---|---|
| `character` | player user | global (across sessions) | hero | character creator (class / ancestry / career / etc.) |
| `npc_ally` | director user | global (across sessions) | hero | monster stat block |
| `monster_instance` | director user | encounter only | enemy (director/malice slot) | monster stat block |

All three are entities. All three can be granted. They differ only in lifetime and default initiative side.

**Owner.** The user who created the entity. `character.owner_user_id` is the player. `npc_ally.owner_user_id` and `monster_instance.owner_user_id` are the director. The owner has full authority over the entity — including granting access to others, revoking grants, editing the underlying record, and deleting it.

**Grant.** A persistent permission granted by the owner to another user for a specific entity. Two kinds:

- `preview` — the grantee can see the full sheet / stat block, including director-side details for monsters.
- `control` — the grantee can dispatch intents that affect the entity, subject to the active-controller rule (below). Implies `preview`.

**Controller.** The user currently dispatching intents on behalf of the entity in a live encounter. Distinct from "users who have a control grant" — at most one user is the active controller per entity per encounter, even if many users have control grants. Owner is always implicitly an eligible controller.

## Data model

### `entity_grants` table

```
entity_grants (
  id              text primary key,
  entity_kind     text not null,         -- 'character' | 'npc_ally' | 'monster_instance'
  entity_id       text not null,
  grantee_user_id text not null,
  kind            text not null,         -- 'preview' | 'control'
  granted_by      text not null,         -- always the owner's user_id
  granted_at      integer not null,      -- unix millis
  unique (entity_kind, entity_id, grantee_user_id, kind)
)
```

The `unique` constraint enforces "one grant per (entity, grantee, kind)." A grantee can hold both a `preview` and a `control` grant on the same entity, but `control` already implies `preview` so the second row is redundant — store one row of whichever kind the owner most recently granted, and let the resolver upgrade reads when a control grant exists.

### Active controller

Lives on the encounter participant row, not the entity:

```
encounter_participants (
  id                       text primary key,
  encounter_id             text not null,
  entity_kind              text not null,
  entity_id                text not null,
  active_controller_user_id text,        -- null = unclaimed
  ...
)
```

Set at encounter start by the claim flow; locked for the duration of the encounter. Resettable between encounters (any eligible user can claim).

## The resolver

```ts
function effective_controller(entity: Entity, encounter: Encounter | null): UserId | null {
  // In an active encounter, the locked-in claimer is authoritative.
  if (encounter && encounter.state === 'active') {
    const participant = encounter.participants.find(p => p.entityId === entity.id);
    if (participant?.active_controller_user_id) {
      return participant.active_controller_user_id;
    }
  }
  // Outside an active encounter, owner controls by default.
  return entity.owner_user_id;
}

function can_dispatch(intent: Intent, user: User, state: SessionState): boolean {
  if (user.role === 'director') return true;       // director override

  const entity = state.entities[intent.target];
  const encounter = state.activeEncounter;

  const controller = effective_controller(entity, encounter);
  if (controller === user.id) return true;

  // Cross-target attack rule (preserved from current model): any player can roll
  // attacks targeting any entity. The intent reducer enforces that the *acting*
  // entity is one the user controls.
  if (intent.kind === 'attack-roll' && controller_of(intent.actor) === user.id) {
    return true;
  }

  return false;
}
```

Two principles fall out:

- **Acting authority is always the active controller.** Whether you own the entity, were lent it, or are the director running it — same code path.
- **Director override is unconditional.** No special permission UI needed for the director to take over a mis-assigned entity mid-fight; the director just dispatches, and the log records it.

## Grant lifecycle

### Creating a grant

Owner adds a grantee from the entity's Sharing settings panel. Grants are persistent, user-to-user, and outlive any specific session. The grantee receives a notification on next sign-in (or in real time if they're connected): "Tom granted you control of Brennan." Their `/characters` route now shows the entity in their Borrowed section.

### Viewing access

A `preview` grantee can open the entity's sheet from their Borrowed section at any time, even outside a session. They see whatever the owner sees, minus owner-only metadata (sharing settings, notes the owner has marked private if we add that later).

### Claiming the seat at encounter start

When the director starts an encounter that includes entity E:

- The director picks which user takes the active controller seat for each participant, from the eligible set (`{owner} ∪ {control grantees}`). Default is owner if connected, else first connected eligible user.
- The choice is recorded on the participant row and locked for the encounter.
- Any user can preview the entity during the encounter regardless of who controls it (per grant table). Only the locked controller (or the director) can dispatch intents.

### Encounter-lock

Once an encounter is `active`, the active controller cannot be changed for that entity. This applies to:

- The owner revoking a control grant: the revoke is queued; the controller finishes the encounter as a courtesy; the grant is removed at encounter end.
- The owner trying to "take back" their own character: same — locked until encounter ends.
- A second grantee trying to claim: blocked; the seat is taken.

The director can override anything, but should rarely need to mid-encounter.

### Between encounters

Between encounters in the same session (or in a later session), the seat is up for grabs again. The director re-runs the claim flow at the next encounter start. This is the natural place to handle:

- Owner shows up late and reclaims their character.
- Player swap: "Mike played Brennan in encounter 1, Sarah plays Brennan in encounter 2."
- Two-handed play reshuffle: who's running which characters this fight.

### Revoking

Owner can revoke a grant at any time via the Sharing settings panel.

- If the entity is **not** locked in an active encounter: revoke is immediate. The grantee gets a quiet notification ("Tom revoked your access to Brennan") and the entity drops out of their Borrowed section.
- If the entity **is** in an active encounter and the grantee is the active controller: revoke is queued for end-of-encounter. UI tells the owner "Mike will lose control of Ash at the end of this encounter."
- For `monster_instance` grants: no encounter-lock courtesy. Director revoke is immediate.

### Deletion

Owner deletes the entity → cascade-delete all grants. No notification to grantees beyond the natural "this entity is no longer in your Borrowed section." Deleted is deleted.

## Active controller and intents

The intent envelope grows two fields for attribution:

```ts
type IntentEnvelope = {
  // ... existing fields
  dispatched_by: UserId;     // the user who actually sent the intent
  acting_as: ParticipantId;  // the entity being acted as
};
```

For owners dispatching for their own entity, both fields resolve to the same person/character. For controllers running someone else's entity, they diverge. The session log displays both:

```
Mike (controlling Sarah's Ash) → Goblin 3 took 14 fire — Ash bolt hit.
Undo · Edit
```

This is the receipt that makes the trust-with-receipts model work for lent characters.

## Entity kind specifics

### Character

The Phase 2 character. Persistent. Owned by a player. Acts on hero initiative.

Grants are global — they survive past the game where they were created, past the session, past everything until explicitly revoked. The relationship lives at the user-to-user level, scoped to one character.

### NPC ally (`npc_ally`)

New persistent entity. Owned by the director. Built from a monster stat block (name, stat block reference, current stamina, plus a chosen `faction`). Acts on hero initiative by default; the director can set `faction` to `enemy` (e.g., a turncoat NPC) or `neutral` (acts independently) at create time or via override.

**Creation flow.** The director picks a monster from the bestiary → "Create NPC ally" → assigns a name, faction (default `hero`), optionally adds initial `control` and `preview` grants → save. The ally now exists at the campaign / user level and can be brought into any session the director runs.

**Promote-from-monster.** During or after an encounter, the director taps a `monster_instance` card → "Keep this as an ally." The instance becomes an `npc_ally` row, carrying its current stamina, name (if set), and any existing grants. Conditions are cleared (per Draw Steel encounter-end rules). The director is prompted for faction (defaults to `hero`).

**Bring into a session.** The director's encounter builder shows their owned NPC allies alongside the bestiary. They drop in like any other participant.

### Monster instance (`monster_instance`)

Spawned at encounter start from a monster template. Encounter-scoped — dies with the encounter. Owned by the director.

Grants exist but are ephemeral: they live only for the duration of the encounter (or until revoked / promoted). When the encounter ends, all `monster_instance` grants are dropped along with the instance itself.

**Preview-only monster grants.** A `preview` grant on a monster instance lets a player see the full stat block including director-side details — useful for lore reveals ("your rogue has fought this thing before, you know its abilities") or coaching ("here's what this enemy can do"). Default for v1: **enabled**, generous-by-default consistent with the broader sharing principle.

## Multi-character control: one user, many entities

A user can be the active controller of multiple participants in a single encounter. This is the duo-solo / two-handed pattern: one human runs two characters, or runs their own character plus an NPC ally the director granted them.

UI consequence: the character sheet / participant tab strip during a session shows every entity the user is currently controlling. Tapping a tab switches which entity the user is "playing" for the next dispatch. Combat tracker initiative shows all of them on the hero side (or wherever their faction lands).

Data consequence: nothing special. Each `encounter_participants` row has its own `active_controller_user_id`. The same user_id appearing on several rows is fine.

## Discovery

**`/characters` route** shows three sections:

- **Mine** — entities you own. For players: characters. For the director: NPC allies (and a separate `/codex/monsters` for the bestiary).
- **Borrowed** — entities with a `control` grant to you. Badged with the owner's name.
- **Viewing** — entities with a `preview`-only grant to you.

**Sharing settings panel** per entity (owner view): two lists, Preview and Lend. Add by user handle / email. Revoke buttons inline. Shows which session (if any) the entity is currently in use in, and who's currently controlling it.

**In-session UI:** participant cards on the combat tracker show "controlled by Mike" as a small chip when the controller is not the owner. Tabs strip on the character sheet route lists everything the connected user is currently the active controller of.

## Permissions summary

| Action | Owner | Control grantee | Preview grantee | Director | Other player |
|---|---|---|---|---|---|
| View full sheet | yes | yes | yes | yes | no (public stat block only) |
| Dispatch intents for entity | yes (when seated) | yes (when seated) | no | yes (override) | no |
| Claim seat at encounter start | yes | yes | no | n/a | no |
| Grant access to others | yes | no | no | only for director-owned entities | no |
| Revoke grant | yes (own grants only) | n/a | n/a | only for director-owned entities | no |
| Delete entity | yes | no | no | only for director-owned entities | no |

## Edge cases

- **Cross-owner re-granting.** A control grantee cannot lend the entity to a third party. Only the owner grants.
- **Owner revokes mid-encounter.** Queued for encounter end. Owner sees a "will take effect at encounter end" indicator.
- **Owner deletes mid-encounter.** Same — the entity finishes the encounter as a courtesy, then is gone for everyone.
- **Grantee leaves the session mid-encounter.** Active controller goes offline; the participant remains seated to them, intents queue waiting for their return. The director can override to take temporary control.
- **Grant on an entity that's never been in a session yet.** Fine — grants are independent of session state. The grantee sees it in Borrowed; it becomes claimable the next time it's brought into an encounter.
- **Multiple grantees, owner present.** Owner is always an eligible claimer; default priority is owner if connected.
- **NPC ally with no grants.** The director is the sole controller. Fine — sometimes the director just wants to run a recurring NPC themselves.
- **Faction mismatch on promotion.** Promoting a monster to an ally and keeping `faction: 'enemy'` is allowed (treacherous retainer trope); the resulting ally acts on the director/malice slot.

## Out of scope for Phase 3

- Custom (non-bestiary) stat blocks for NPC allies. Phase 3 builds from existing monsters; freeform NPC stats wait for the homebrew editor (post-v1).
- Granular preview redaction (e.g., "show my sheet but hide my notes"). Phase 3 is all-or-nothing per `preview` grant.
- Group / circle sharing ("everyone in my friend group can preview Brennan"). Per-user grants only in v1; group features are post-v1 if they happen at all.
- Showing the owner where their lent entity is currently being used across other sessions ("Mike is playing Brennan right now in his Tuesday game"). Nice-to-have; deferred.

## Phase 5 implications

The UI rebuild needs to honor:

- The Sharing settings panel as a real first-class affordance, not buried in a menu.
- A clear visual language for "owned vs borrowed" — players should never confuse them at 2am.
- The active-controller chip on participant cards needs to be glanceable.
- The promote-from-monster gesture (director tap → keep as ally) should be a fluid, one-handed action mid-encounter.

The protocol described here (the grants table, the resolver, the `acting_as` envelope field) is a Phase 3 contract that Phase 5 must consume as-is. UI questions only.
