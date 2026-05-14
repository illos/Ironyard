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
- Monster browser at `/foes` (read-only)
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

### Phase 2 Epic 1 — shipping

The first epic of Phase 2 (character creator + sheet, bring-to-lobby flow, Respite) is now shipping — both the backend ([plan](superpowers/plans/2026-05-11-phase-2-epic-1-backend.md)) and the frontend ([design spec](superpowers/specs/2026-05-11-phase-2-epic-1-frontend-design.md), [plan](superpowers/plans/2026-05-11-phase-2-epic-1-frontend.md)).

Known Epic 1 limitations deferred to Epic 2:

- **PC ability rolling** (`PlayerSheetPanel`) renders ability ids as plain text, not interactive cards — requires PC ability data ingest (class abilities JSON, Epic 2).
- **Kit picker** (`KitStep`) shows an empty-state placeholder for kit-using classes — kit data ingest is also Epic 2.
- **Class-D ancestry signature abilities** (Human's Detect the Supernatural, Orc's Relentless, Dwarf's Runic Carving) don't yet show on the character sheet. `AncestrySchema.signatureAbilityId` is wired in the schema (Slice 5) but `collectAbilityIds()` doesn't read it because PC ability data ingest is also Epic 2. The three traits exist in the rules text on the ancestry display but have no interactive surface yet.
- **Culture skill/language pools** (`CultureStep`) are hardcoded placeholder lists — Phase 5 will replace with real compendium data.

### Phase 2 Epic 1.1 — wizard polish (shipping)

Follow-up to Epic 1 covering: name/level required + reordered details, ancestry trait-point cap, characteristic array drag-drop (dnd-kit), ancestry size/speed/immunity derivation (fixed the silent "1M for all" bug), and per-ancestry sub-pickers for the three Class-C ancestries (Devil → Silver Tongue skill; Dragon Knight → Wyrmplate + conditional Prismatic Scales; Revenant → Former Life ancestry + Previous Life trait sub-picker, including the +1 budget for Size 1S former life). The ancestry custom-logic review notes are at [`superpowers/notes/2026-05-11-ancestry-custom-logic-review.md`](superpowers/notes/2026-05-11-ancestry-custom-logic-review.md).

### Phase 2 Epic 2 — items + inventory + `CharacterAttachment` activation

Decomposed into three sub-epics. Each gets its own spec → plan → implementation cycle.

**Sub-epic 2A — data ingest + inventory schema** ([design spec](superpowers/specs/2026-05-11-phase-2-epic-2a-data-ingest-design.md), [plan](superpowers/plans/2026-05-11-phase-2-epic-2a-data-ingest.md)) — **shipping**

Parsers + structured JSON outputs for items (treasures, 4 categories), kits, abilities, titles. Schema additions for `CharacterSchema.inventory`. Empty override file scaffolds at `packages/data/overrides/`.

Shipped counts: kits 21, items 98 (3 artifacts + 35 consumables + 35 leveled + 25 trinkets), abilities 545 (56% with structured powerRoll — the rest are maneuvers/traits without tier ladders), titles 59. Wizard's KitStep lit up with zero UI changes once `kits.json` populated.

Slice 3's optional freebie (switching PlayerSheetPanel from id-list to interactive `AbilityCard`s) was deferred to 2B — the wizard's level-pick stub stores placeholder ability ids that don't yet map to `abilities.json` entries. Prerequisites for the wiring to be cheap: add a stable `id` field to `AbilitySchema`, update the wizard's level picker to store real ability ids.

**Sub-epic 2B — `CharacterAttachment` activation engine** — **shipping**

Six slices landed: `CharacterAttachment` schema in shared; activation engine in `packages/rules/src/attachments/` (collectors + applier with canon-gated `requireCanonSlug` + condition gates + recoveryValue-after-maxStamina ordering); ancestry/kit derivation refactored through the engine; ancestry-trait override file populated for every flat-stat purchased trait the markdown structurally exposes (~10 entries); canonical-example item + title overrides (Lightning Treads, Color Cloak Yellow, Knight, Zombie Slayer) wired end-to-end; and `docs/rules-canon.md` Section 10 documents every attachment effect-category (🚧 — Gate 1 only).

**Pending user action:** Gate 2 manual review of Section 10 entries against the printed Heroes Book. Once each sub-section's status flips ✅, the collectors can retro-add `requireCanonSlug` references — today they intentionally omit it so attachments continue to apply, preserving Slice 4/5 behavior.

Carry-overs deferred to 2C (or later):
- **Per-echelon stat scaling** — Dwarf *Spark Off Your Skin* +6 Stamina with 4th/7th/10th echelon bumps; current `stat-mod.delta` is a flat integer.
- **Level + N immunity offsets** — Polder *Corruption Immunity* (level + 2); `immunity.value` is `number | 'level'`, no `'level + N'` form.
- **Conditional / triggered attachments** — Devil *Wings* (only-while-flying), Color Cloak triggered weakness conversion, Encepter aura effects; current `AttachmentCondition` only models `kit-has-keyword` / `item-equipped`.
- **Class-feature overrides** — none authored. Draw Steel class features are split between per-level ability picks (no static stat-mods) and inline class prose (Conduit prayers, domain blessings) that the parser doesn't surface as ability ids; pipeline gap, not an engine gap.
- **Kit-keyword leveled-treasure bonuses** — `KIT_OVERRIDES` ships empty. The Slice 4 sweep found no kit-side flat-bonus pattern of this shape in SteelCompendium markdown; the analogous rules (weapon-bonus / armor-bonus conditional gating) live on the *treasure* side as conditions.

Deferred from earlier work that lands here:
- **PC ability rolling** on PlayerSheetPanel — switch from id list to interactive `AbilityCard`s. Still deferred — needs the wizard-side picker to store real ability ids first.
- **Class-D ancestry signature abilities** on the sheet — now wired through `collectFromAncestry`'s `attachment.ancestry-signature-ability` path (the schema field had been in place since Epic 1.1 Slice 5).
- **Kit-keyword matching gate** for weapon/armor leveled-treasure bonuses — gate plumbing exists (`condition.kit-has-keyword`); per-treasure authoring is 2C territory.

**Sub-epic 2C — interactive UI + runtime intents** ([design spec](superpowers/specs/2026-05-12-phase-2-epic-2c-interactive-ui-design.md), [plan](superpowers/plans/2026-05-12-phase-2-epic-2c-interactive-ui.md)) — **shipping**

Six slices landed: EquipItem / UnequipItem ratification intents (stamper → reducer → side-effect pattern) + `InventoryPanel` rendered on `PlayerSheetPanel` with body-slot conflict chips + `SwapKitModal`; `UseConsumable` intent with instant/attack/area branches dispatching `ApplyHeal` (duration/two-phase fall through to manual log path); `PushItem` director intent + modal in `CampaignView`; `Respite` expansion (stamina restoration, Talent clarity floor reset, new canon § 10.17 three-safely-carry warning, Wyrmplate damage-type change for Dragon Knight); § 10.8 `weapon-damage-bonus` engine variant — kit melee/ranged bonuses now apply tier-scaled (`+X/+Y/+Z`) damage to all Melee+Weapon / Ranged+Weapon abilities; comprehensive item + title override sweep (22 new entries across weapon treasures, armor treasures, trinkets, titles).

Carry-overs deferred (each tracked in canon § 10.16 or a separate Q-entry):
- **Revenant Q16** (inert state / 12h Stamina recovery) — depends on § 2.7+ damage-engine winded/dying transitions, not yet built.
- **Q18 class-feature choice pipeline** (Conduit Prayers / Wards, Censor Domains) — separate engine epic.
- **UseConsumable duration / two-phase branches** — need a temp-buff state machine the engine doesn't have. Fall through to the manual log path today.
- **§ 10.10 treasure-bonus stacking** ("only the higher applies") — engine sums today; canon flags but doesn't block this epic.
- **Ranged-distance / disengage kit-bonus variants** — § 10.8 covers tier-scaled melee + ranged damage only.
- **`magic-damage-bonus` AttachmentEffect variant** — implement-style leveled treasures need this; tracked in § 10.16 carry-overs.
- **Per-tier `stat-mod` scaling** — armor leveled treasures author L1 baseline only; per-tier scaling is § 10.16 carry-over.

**Sub-epic 2D — encounter lifecycle cleanup** ([plan](superpowers/plans/2026-05-13-phase-2-epic-2d-encounter-lifecycle-cleanup.md)) — **shipping**

Unplanned cleanup epic born out of Epic 1 / 2C playtesting. Killed the two-step `BringCharacterIntoEncounter` + `PcPlaceholder` model in favor of an atomic `StartEncounter` that takes `characterIds[] + monsters[]`, with the DO stamping both PC blobs (from D1) and monster stat blocks (from static data) before the reducer materializes participants in one pass. Lobby roster is replaced wholesale at each encounter start. Added `CharacterSchema.currentStamina` + `recoveriesUsed` runtime fields; `EndEncounter` writes them back to D1, `Respite` resets them. `EncounterBuilder` is now a local-draft UI (checklist + monster picker) with no per-step lobby intents. Concludes Phase 2 feature work.

**Sub-epic 2E — Sessions layer (MVP)** ([spec](superpowers/specs/2026-05-13-phase-2-epic-2e-sessions-design.md), [plan](superpowers/plans/2026-05-13-phase-2-epic-2e-sessions.md)) — **shipping**

Introduces a play-session boundary as a thin scaffold: new `sessions` D1 table, `currentSessionId` pointer on Campaign, five new intents (`StartSession` / `EndSession` / `UpdateSessionAttendance` / `GainHeroToken` / `SpendHeroToken`). Hero tokens initialize from session attendance per canon (party size at session start); two cheap spend paths land in this epic (+2 surges, regain stamina). Retroactive variants (reroll, succeed-on-fail-save) defer to a follow-up epic. `StartEncounter` now requires an active session. Forward-compatible with Phase 3 character sharing.

## Phase 2b — Combat completeness

**Goal:** "Every combat rule the printed Draw Steel rulebook ships with produces the correct behavior in the engine — Malice and heroic resources generate at the right boundaries, every modeled ancestry/kit/title/treasure folds to the correct runtime number, the damage state machine (winded/dying/dead) runs, and conditional/triggered attachments fold when their conditions hold."

**UI quality bar:** same prototype-grade rule as Phases 1–2. The visual / interaction / motion pass happens in **Phase 5 (UI rebuild)**. Don't over-invest here.

**Origin.** The Epic 2A–2E sweep landed the attachment engine and inventory mechanics but explicitly deferred a list of mechanics into [`rules-canon.md § 10.16`](rules-canon.md) and [`rule-questions.md`](rule-questions.md). A mid-roadmap review also surfaced that `§ 5 Heroic resources & surges` is canon-✅ but engine-≈0%: `StartEncounter` initializes both `heroicResources: []` (every PC) and `malice: { current: 0 }` (every encounter), and no `StartRound` / `StartTurn` hook generates the per-round / per-turn gains. The Director sits down to play and cannot spend Malice; the Talent cannot spend Clarity. Phase 2b is the umbrella for closing the full list.

**Note on naming.** "Phase 2b" (lowercase b) is distinct from "Epic 2B" (uppercase B; shipping under Phase 2 above). They are different scopes; the lowercase letter is a sub-phase suffix, not an epic identifier.

### Sub-epics

The decomposition below is sequenced for shipping; each gets its own spec → plan → implementation cycle.

| # | Sub-epic | Touches | Status |
|---|---|---|---|
| **2b.0** | **Combat-resource framework foundation** ([spec](superpowers/specs/2026-05-13-phase-2b-0-resource-framework-foundation-design.md), [plan](superpowers/plans/2026-05-13-phase-2b-0-resource-framework-foundation.md)) — Open Actions framework (state + 2 intents + UI; no consumers in 2b.0); per-character `character.victories` refactor (canon § 8.1); `StartEncounter` heroic resource preload from victories; encounter + round-start Malice generation (`floor(avgVictoriesAlive)` + `aliveHeroes + N`, permissive alive-check); universal per-turn heroic resource gain via `StartTurn` payload extension (flat or `rolls.d3`); end-of-encounter zeroing of all heroic resources + surges; static `HEROIC_RESOURCES` config table for all 9 classes' baseline shape | `StartEncounter`, `StartRound`, `StartTurn`, `EndEncounter`, `Respite`, `EndRound` reducers; new `RaiseOpenAction` / `ClaimOpenAction` intents; new `state.openActions` field; new `character.victories` field | **shipping** |
| **2b.0.1** | **Class δ triggers + class-internal affordances** — class-specific gain triggers ("first time per round X happens": Censor judged-target, Fury took-damage, Tactician marked-creature damaged, Shadow surge-damage, Null malice-spend, Talent force-move broadcast); Open Action raisers for spatial triggers (Elementalist, Tactician ally-heroic, Null Field, Troubadour line-of-effect) and Conduit *Pray to the Gods*; Elementalist *Maintenance* state machine; Troubadour posthumous Drama gain + auto-revive at 30 (uses `bodyIntact` flag, refined by 2b.5); Talent class-internal affordances (strained-spend confirm UI, 10th-level Psion opt-into-strained / opt-out-of-clarity-damage toggles); 10th-level Psion's `1d3+2` per-turn gain | event hooks in event-source intents (`ApplyDamage`, `RollPower`, `Push/Pull/Slide`, `SpendMalice`); per-round flag bookkeeping on participant; new `StartMaintenance` / `StopMaintenance` intents; `bodyIntact` flag; OA copy registry populated | 🚧 |
| **2b.1** | **Attachment schema-shape gaps with visible runtime bugs** — per-echelon `stat-mod` scaling (Dwarf *Spark Off Your Skin*, per-tier armor leveled treasures); level+N immunity (Polder *Corruption Immunity*); title benefit-choice slot (Knight Heraldic Fame / Knightly Aegis / Knightly Challenge; Zombie Slayer; etc.) | `AttachmentEffect` schema; override file re-authoring; `CharacterSchema.titleBenefitId` field + wizard step | 🚧 |
| **2b.2** | **Stacking + magic-damage-bonus** — § 10.10 "only the higher applies" reduction rule per effect kind; new `magic-damage-bonus` AttachmentEffect variant with power-roll integration (mirrors `weapon-damage-bonus` from 2C Slice 5) | applier reduction logic; `intents/roll-power.ts` | 🚧 |
| **2b.3** | **Kit completeness** — ranged-damage-bonus emission (6 silent kits today: Arcane Archer, Cloak and Dagger, Raider, Ranger, Rapid-Fire, Sniper); kit distance bonus (parser + targeting layer); kit disengage bonus (parser + move-action engine); kit-keyword leveled-treasure bonuses plumbing | parser; targeting; move-action engine | 🚧 |
| **2b.4** | **Conditional / triggered attachments** — extend `AttachmentCondition` beyond `kit-has-keyword` / `item-equipped`; per-encounter evaluation for Devil *Wings* (only while flying), Color Cloak triggered weakness conversion, Orc *Bloodfire Rush* (round you took damage), Revenant *Bloodless* (save modifier), Encepter aura, power-roll floors (Encepter tier-3 floor on Presence), turn-economy modifiers (Mortal Coil +1 main action) | new condition kinds; runtime-eval seam; new effect variants | 🚧 |
| **2b.5** | **Damage-engine state transitions § 2.7–2.9** — Winded threshold transitions, Dying state (death saves), Dead state, KO/unconscious. Prerequisite for 2b.6 and lifts the "hero death stops Malice generation" + "becoming winded triggers Fury and Troubadour gains" hooks left permissive in 2b.0 | `Participant.stamina` state machine; new intents (e.g. `SaveAgainstDeath`); event hooks for becoming-winded / dying / dead | 🚧 |
| **2b.6** | **Q16 Revenant inert / 12h Stamina recovery** — Revenant signature trait layered on top of 2b.5's damage-state transitions | new attachment effect or per-class transition rule | 🚧 — blocked by 2b.5 |
| **2b.7** | **Q18 class-feature choice pipeline** — Conduit Prayers/Wards, Censor Domains. Schema slot for choice ids, parser for inline class-chapter blocks, override map keyed on the new id. Real stat effects today miss the runtime (Prayer of Steel's +6 Stamina + +1 stability doesn't apply) | `CharacterSchema` extension; new parser; override file | 🚧 |
| **2b.8** | **Q17B ancestry signature-trait engine gaps** — audit each ancestry signature trait that today fails to fold; classify each as (a) modelable with existing schema, (b) needs new effect/condition shape (likely overlaps 2b.4), or (c) permanent-defer | per-ancestry, varies | 🚧 |
| **2b.9** | **Q10 cross-side ordering of simultaneous triggered actions** — when both a hero and a monster have a triggered action that fires on the same event, what order do they resolve in? Currently undefined in the engine | action-economy resolution rules | 🚧 |
| **2b.10** | **Canon housekeeping** — flip § 5 + § 10 parent flags now that subsections are ✅; refresh § 10.16 to reflect what's been closed each sub-epic; update the 2C spec status header (currently stale "Designed, awaiting plan." → shipped). Rides alongside every sub-epic | docs only | trivial |

### Sequencing notes

- **2b.0 first, then 2b.0.1.** Engine-≈0% on § 5 generation is the most visible playability hole — sit down to play and the Director can't spend Malice, the Talent can't spend Clarity, no class can fire a premium ability on turn 1. 2b.0 wires the universal mechanics + the foundational Open Actions framework; 2b.0.1 then attaches the class-specific triggers and affordances on top. 2b.0 is a prerequisite for any meaningful playtest of subsequent attachment work.
- **2b.1 → 2b.2 → 2b.3 are independent of 2b.5 / 2b.6.** Can interleave in any order; recommended order is "schema gaps first (biggest visible-bug win) → stacking + magic-damage (small) → kit completeness (medium)".
- **2b.5 gates 2b.6.** Q16 Revenant explicitly waits on the damage state machine.
- **2b.5 also unlocks better 2b.0 + 2b.0.1 triggers.** Fury "becoming winded → +1d3 ferocity", Troubadour "any hero becomes winded → +2 drama", Malice "hero death stops generation". 2b.0 + 2b.0.1 ship with a permissive `currentStamina > -windedValue` alive-check and a simple `bodyIntact` participant flag; 2b.5 lifts these to the formal state machine.
- **2b.4 is the deepest architectural change.** Some conditional attachments need per-encounter state (flight, recent damage) which forces the applier to re-evaluate mid-encounter rather than statically on character build. May want to split 2b.4 further once we brainstorm it.
- **2b.7, 2b.8, 2b.9 are independent of everything else.** Can slot in any time.
- **2b.10 rides alongside every sub-epic** — each delivers a piece of canon ✅ that updates the doc.

### Acceptance

Phase 2b is done when:

1. Every § 5 sub-section (resources, malice, surges) runs end-to-end in the engine without manual intervention.
2. Every § 10 effect category folds correctly; § 10.16 has no remaining 🚧 carry-overs except items explicitly tagged as permanent defer.
3. Damage-engine §§ 2.7–2.9 (winded / dying / dead) state transitions run; the participant stamina state machine matches the rulebook.
4. `rule-questions.md` has no open 🟡 entries except those explicitly tagged permanent defer.
5. Every modeled ancestry × kit × title × treasure combination at level 1–10 produces the correct runtime number on a representative fixture sweep.
6. `pnpm test`, `pnpm typecheck`, `pnpm lint` clean repo-wide.

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
