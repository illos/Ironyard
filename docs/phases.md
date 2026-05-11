# Phased build plan

The plan that survived contact with the requirements. Each phase ends in something usable; we don't lay plumbing for months without a payoff.

## Phase 0 — Foundation + auth + campaign model

**Goal:** "I can log in, create a campaign, and a friend can join. Nothing happens inside the campaign yet, but the plumbing is real."

- Monorepo scaffolding (pnpm workspaces): `apps/web`, `apps/api`, `packages/shared`, `packages/rules`, `packages/data`
- Cloudflare Pages for `apps/web`, Worker for `apps/api`
- Magic-link auth (Resend or comparable)
- D1 schema deployed; Drizzle migrations working
- `LobbyDO` class wired up; one DO per campaign
- WebSocket handshake working — client can connect to a campaign's lobby DO and exchange a `ping`/`pong`
- Intent envelope schemas in `packages/shared`, validated end-to-end with Zod
- `packages/data` build script pulls SteelCompendium SDK and emits `monsters.json` (the rest follow in Phase 1+)
- **Rules-canon registry pipeline:** `scripts/gen-canon-status.ts` parses `docs/rules-canon.md` and emits `packages/rules/src/canon-status.generated.ts`. The reducer ships with a `requireCanon(slug)` helper that gates auto-application on `'verified'` status. CI runs `pnpm canon:gen` and fails on diff. `pnpm canon:report` prints rule status. Mechanism is in place even though Phase 0 doesn't ship reducer behavior yet — when Phase 1 lights up the engine, the gating already works.
- "Hello campaign" page at `/campaigns/:id` lists members in realtime

**Acceptance:** two browsers logged in as different users, both connected to the same campaign lobby, both see each other's connect/disconnect events live. Plus: `pnpm canon:gen` and `pnpm canon:report` run cleanly, and CI fails when the canon doc is edited without regenerating the registry.

## Phase 1 — Multi-user combat tracker (authoritative engine)

**Goal:** "We can run a real fight at the table tonight, with players on their phones."

**UI quality bar:** prototype-grade — functional, dark theme, 44pt touch targets, no embarrassing wrong-feeling moments. **Not** a finished product. The visual / interaction / motion / brand pass happens in **Phase 5 (UI rebuild)**. Don't over-invest in polish, refactors, design-system extraction, or animation here.

- `packages/rules` reducer with the core intents: combat lifecycle, rolls, damage, conditions, resources, undo
- Monster browser at `/codex/monsters` (read-only)
- Director item list at `/codex/items` (read-only, same pattern as monster browser) — browse all treasure types (leveled, artifacts, consumables, trinkets); director can hand an item to a player from here
- `CharacterAttachment` framework in `packages/rules`: effect schema + folding logic, canon-gated via `requireCanon`. **No attachment content ships in Phase 1** — this is scaffolding only, same philosophy as the canon-status registry in Phase 0. Phase 2 lights it up. Magic items and titles are both instances of the same abstraction.
- **Encounter template builder:** the active director picks monsters and quantities and saves them as a named encounter template (stored in `encounter_templates` D1 table). Templates are separate from lobby state — saving a template does not alter who is in the lobby roster.
- **In-lobby Add affordance:** an "Add" menu on the lobby/run screen lets the active director add participants to the lobby roster three ways: (1) single monster from the codex, (2) single hero from the campaign's approved characters, (3) a saved encounter template (additive — merges into the current roster without replacing it). Works whether or not an encounter is active.
- Combat run screen: initiative, HP/conditions/resources per participant, monster ability cards with auto-roll
- Players join the campaign lobby, submit a character for director approval (`SubmitCharacter`), and once approved claim their participant slot and roll attacks from their phone
- PCs are quick stat blocks for now (name, max stamina, immunities, characteristics) — full sheet comes in Phase 2
- Per-round undo with toast attribution ("Sarah → Goblin 3 took 14 fire — Ash bolt hit. Undo · Edit")
- Manual override on every stat (long-press)
- Intent log persisted to D1; lobby DO recovers on restart
- **`EndEncounter` preserves the lobby roster.** Participants (heroes and monsters) stay in the lobby when the encounter phase ends; only encounter-phase state (round, turn order, malice, conditions) is reset. Monsters must be explicitly removed via `RemoveParticipant` or `ClearLobby`.

**Acceptance:** run a campaign session of Draw Steel using only Ironyard. The active director uses an iPad in landscape; players use phones. No paper, no other tools, no major bugs that force a restart.

## Phase 2 — Character creator + interactive sheet

**Goal:** "Players make their PCs in the app and the sheet drives play."

- Markdown ingest for class / ancestry / career / inciting incident / complication
- Character creator wizard, mobile-friendly, savable as a draft
- Interactive character sheet: stamina/recoveries/surges/heroic resource, ability cards with auto-roll, rest mechanics
- Characters stored in D1, owned by a user
- "Bring this character into the lobby" replaces the quick stat block from Phase 1
- **Item data pipeline:** ingest all treasure types from `data-md` (leveled weapon/armor/other, artifacts, consumables, trinkets). Display text is available immediately from the markdown body. Structured effect data (stat mods, ability grants) must be hand-authored in `packages/data/overrides/` — the compendium's effect text is prose only, not structured fields. Coverage is incremental, same as ability parsing.
- **Character inventory:** items owned by and carried by a character; stored in the character JSON blob. Director can push items to a character from the item list; player manages from the sheet. Inventory tracks four distinct item categories with different rules:
  - **Consumables** — quantity-tracked (carry any number). Activated via `UseConsumable` intent (usually a maneuver), then removed from inventory. Effect type varies: instant (Healing Potion → derive `ApplyHeal`), timed/duration (Growth Potion lasts 3 rounds → temporary buff with duration), two-phase (Blood Essence Vial: capture-then-drink), attack (Black Ash Dart → derive `RollPower`), or summon/area. Consumable Stamina and damage bonuses stack with other treasure bonuses — the engine must track source type when folding modifiers.
  - **Trinkets** — passive effects while worn/carried, no carry limit. Use `CharacterAttachment` with `tier: null`. Wearable trinkets carry a body slot keyword (Arms, Feet, Hands, Head, Neck, Waist, Ring); the engine tracks worn slots and surfaces conflicts when the director rules too many of the same slot means none function.
  - **Leveled treasures** — `CharacterAttachment` with tier derived from character level (1st for levels 1–4, 5th for 5–8, 9th for 9–10). **Carry limit: 3 safely.** Carrying more than 3 requires a Presence test each respite. The engine enforces the count and surfaces a warning at 4+; the test result is a manual prompt, not auto-applied.
  - **Artifacts** — unique, singular. Treated as leveled treasure (tier null, no level scaling) but flagged as artifact for UI distinction.
- **Equipped vs. carried:** leveled treasures and trinkets must be worn/wielded to activate their `CharacterAttachment` effects; they can be carried without being active. Consumables are always "ready" while carried.
- **Kit integration:** weapon and armor leveled treasures must match kit keywords to grant benefits — the attachment fold checks kit compatibility before applying weapon/armor effects.
- **Magic items and titles** equipped to a character plug into the `CharacterAttachment` system (Phase 1 framework). The engine folds active attachments into effective character state — stat mods, ability grants, passive conditions — via `requireCanon` gating. Items without structured overrides yet fall back to manual override with the effect text displayed.
- Titles follow the same attachment path as trinkets/leveled treasures; no separate implementation needed.

**Acceptance:** a player can build a character from scratch in the app, bring it into the campaign lobby, and play a full encounter using only the sheet (no rulebook open). A player can equip a magic item and see its abilities on their sheet; a player can activate a consumable during combat and see the effect applied.

## Phase 3 — Collaborative campaign capabilities

**Goal:** "The campaign feels like a place, and people can share characters and entities with each other."

**UI quality bar:** same prototype-grade rule as Phase 1 — functional, dark theme, 44pt touch targets, no embarrassing wrong-feeling moments. The visual / interaction / motion pass happens in **Phase 5 (UI rebuild)**. Don't over-invest here.

**Party sheet**

- Campaign-scoped entity: not owned by any player, visible and editable by the whole table (active director has override). A shared bag, not a per-player ledger.
- Tracks: currency, consumables, plot items, and any other party-level resources the director adds.
- Items in the party sheet are the same item types as character inventory; a player can move an item from the party sheet to their character (and back), which dispatches a `TransferItem` intent so the log attributes it.
- The party sheet lives in `CampaignState` alongside participants — it's a first-class campaign entity, not a character.

**Lobby capabilities**

- Shared 3D dice tray (or 2D, depending on iPad performance) — visible to all members
- Text chat per campaign, with intent log visible in a separate tab
- Ready / AFK states; turn timers (optional, configurable per campaign)
- Character portraits, monster art (where licensable)
- Sound effects for hits, crits, conditions (toggleable)
- Campaign settings panel — rename, grant/revoke director permission, kick member

**Sharing and lending model** (spec: [`character-sharing.md`](character-sharing.md))

- `entity_grants` table: persistent user-to-user grants over a specific entity, two kinds — `preview` (read-only sheet visibility) and `control` (act as the entity)
- Generalized `effective_controller(entity)` resolver used by the intent permission check
- **Player→player PC lending:** character owner can grant preview and/or control of a PC to any number of other users; grants are persistent until revoked; encounter-lock prevents revocation mid-encounter
- **Active controller per encounter:** at encounter start, one eligible user (character owner + any control grantees) claims the seat; locked for the encounter; reshuffleable between encounters
- **One human, multiple participants:** a user can be active controller of N participants in a single encounter (the duo-solo / two-handed pattern); tab strip switches between them
- **Director→player monster handoff:** director grants control of a `monster_instance` to a player for tactical convenience; ephemeral (dies with the encounter); revocable instantly by the director; monster still acts on malice/director initiative
- **Director-owned NPC allies:** new persistent entity kind (`npc_ally`), built from a monster stat block, owned by the director, acts on hero initiative by default; same grant model as PCs (control + preview, multi-grantee, encounter-lock); promote-from-monster flow at encounter end
- Sharing settings panel per character / NPC ally (prototype-grade UI; the considered design lands in Phase 5)
- Log attribution carries both `dispatched_by` and `acting_as` on every intent envelope

**Acceptance:** a campaign lobby feels social — friends join early to chat before play begins. A player can lend their character to another player and that player can run it through a full encounter, with the character owner watching in real time. The active director can hand off a monster to a player mid-fight, and can grant a persistent NPC ally to the party that travels with them across campaign sessions.

## Phase 4 — Polish, hardening, PWA

**Goal:** "Ready to invite a small player base beyond our friends."

- Sharing links (read-only spectator mode for guests)
- Role-based permission tightening, audit
- Rate limits and abuse protections
- Observability — error tracking (Sentry), basic analytics, DO health metrics
- Accessibility pass (keyboard nav, screen-reader labels)
- Performance pass on iPad: bundle splitting, image optimization, animation tuning

**Acceptance:** an external playtester not in the original friend group can sign up, build a character, join a session, and play without help.

## Phase 5 — UI rebuild

**Goal:** "The app looks and feels like a finished product, not a prototype — beautiful by default, personal by choice, alive at the table."

All UI shipped in Phases 1–4 is intentionally scaffolding — built to validate that the engine, data pipeline, intent protocol, realtime, and feature logic actually work end-to-end. The quality bar is "functional, dark theme, touch-first, no embarrassing wrong-feeling moments" — not "considered, distinctive, finished."

Once everything from Phases 1–4 is shipping and stable, the UI gets stripped to the floorboards and rebuilt across three distinct layers. Each layer is independent: the base is fixed, the theme is player-chosen, the action effects are contextual. A player with a plain light theme still gets the full action effect treatment; a player who turns effects off still gets a beautiful themed app.

### Layer 1 — Base

The fixed foundation. No user configuration at this layer — just the best possible layout and visual language for every screen.

- Typography system, spacing scale, iconography, motion principles
- Layout-first redesign of every screen (lobby, builder, run, codex, sheet, settings) — not a re-skin
- Real interaction design: drag affordances, target-picking gestures, status-at-a-glance, attention management for the active turn
- Component library extracted properly (or a new one chosen if we move off Radix)
- Sound and haptic feedback designed alongside the visual pass, not bolted on afterward
- Brand identity (name, logo, marketing site) lands here, not earlier

The base is the glue. Everything else sits on top of it.

### Layer 2 — Theme

Player-selectable customizations that flavor Ironyard to the personality of their character. All flavor, zero change in function.

- **Light / dark** — account-level preference
- **Color pack** — per-character selection; a highlight color and vibe applied across that character's experience. Examples: `Lightning` (electric blue-white), `Chrome` (silver-grey metallic), `Fireball` (amber-orange). Color packs affect accent colors, selection states, resource bars, and ability card borders — anything that "belongs" to the character visually. Other players at the same table can have different packs active simultaneously.
- Color pack is stored on the character entity, applied when that character is the active sheet or participant being viewed by their controlling player.

### Layer 3 — Action Effects

Flashy, contextual animations and embellishments that make the app feel like you're playing a game of fighting dragons and casting spells — not filling out a complicated survey form. These are additions to key moments in the UI, not a coat of paint over everything.

Examples of the intended register:
- A roll button for a fire-typed ability gets an animated ember/flame border while the roll is pending
- A slain foe's card in the combat tracker gains a skull-and-crossbones emblem when their HP hits zero
- The XP bar fills with a slow liquid animation as you approach the next level; at threshold it transitions into a flowing, pulsing **LEVEL UP** button
- Critical hits produce a brief screen flash in the character's color pack accent
- Conditions applied to a participant animate onto their card rather than snapping in

Action effects are anchored to game events and damage types — they're earned by the moment, not decorative noise. Each effect is individually toggleable for players who prefer a calmer experience (accessibility consideration).

**Constraint:** the engine and data layers are **not** rebuilt in this phase. The UI rebuild must consume the existing intent protocol and reducer surface as a stable contract. If a screen needs an intent that doesn't exist, that goes back to the engine phase backlog, not invented at the UI layer. Action effects are purely presentational — they read game state, they never produce it.

**Acceptance:** the app feels like something you'd ship publicly — friends-of-friends ask "what is this," not "what's wrong with this." A player switching color packs between their Wizard and their Fighter notices a meaningfully different feel. A critical hit lands and the table reacts to the screen, not just the dice.

## Phase 6 — Follow-up features

**Goal:** "The app works well even when the network doesn't, and the experience keeps improving beyond v1."

- PWA install + offline mode for the character sheet (combat tracker requires network)
- Additional follow-up features TBD

**Acceptance:** a player can open their character sheet in a place with no signal and still reference their abilities, stats, and inventory without degradation.

## Out of scope (until decided otherwise)

- Maps and grid combat (we track movement as numeric distance; a grid view is a Phase 4+ stretch)
- Voice / video (Discord exists)
- Custom rules / homebrew editor (data layer supports it; UI work is post-v1)
- Marketplace / community sharing
- Native mobile apps

## Cross-cutting work that happens in every phase

- **Rules engine.** Phase 1 lights up the core; every later phase fills in conditions and edge cases. Coverage % from the effect-text parser is a tracked metric.
- **Tests.** Each phase ends with the affected packages passing typecheck, lint, and tests. Phase 1 establishes the fixture-based testing pattern; Phases 2–4 follow it.
- **Docs.** When something surprising lands in code, the relevant doc in `docs/` gets a short note. The docs are the brief for future Claude Code sessions; they need to stay current.
