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
| **2b.0** | **Combat-resource framework foundation** ([spec](superpowers/specs/2026-05-13-phase-2b-0-resource-framework-foundation-design.md), [plan](superpowers/plans/2026-05-13-phase-2b-0-resource-framework-foundation.md)) — Open Actions framework (state + 2 intents + UI; no consumers in 2b.0); per-character `character.victories` refactor (canon § 8.1); `StartEncounter` heroic resource preload from victories; encounter + round-start Malice generation (`floor(avgVictoriesAlive)` + `aliveHeroes + N`, permissive alive-check); universal per-turn heroic resource gain via `StartTurn` payload extension (flat or `rolls.d3`); end-of-encounter zeroing of all heroic resources + surges; static `HEROIC_RESOURCES` config table for all 9 classes' baseline shape | `StartEncounter`, `StartRound`, `StartTurn`, `EndEncounter`, `Respite`, `EndRound` reducers; new `RaiseOpenAction` / `ClaimOpenAction` intents; new `state.openActions` field; new `character.victories` field | ✅ |
| **2b.0.1** | **Class δ triggers + class-internal affordances** — class-specific gain triggers ("first time per round X happens": Censor judged-target, Fury took-damage, Tactician marked-creature damaged, Shadow surge-damage, Null malice-spend, Talent force-move broadcast); Open Action raisers for spatial triggers (Elementalist, Tactician ally-heroic, Null Field, Troubadour line-of-effect) and Conduit *Pray to the Gods*; Elementalist *Maintenance* state machine; Troubadour posthumous Drama gain + auto-revive at 30 (uses `bodyIntact` flag, refined by 2b.5); Talent class-internal affordances (strained-spend confirm UI, 10th-level Psion opt-into-strained / opt-out-of-clarity-damage toggles); 10th-level Psion's `1d3+2` per-turn gain | event hooks in event-source intents (`ApplyDamage`, `RollPower`, `Push/Pull/Slide`, `SpendMalice`); per-round flag bookkeeping on participant; new `StartMaintenance` / `StopMaintenance` intents; `bodyIntact` flag; OA copy registry populated | ✅ — shipped via [Pass 3 Slice 2a](superpowers/specs/2026-05-15-pass-3-slice-2a-class-delta-and-open-actions-design.md) on 2026-05-15; three permissive predicate stubs (`isJudgedBy` / `isMarkedBy` / `hasActiveNullField`) closed by [Pass 3 Slice 2b](superpowers/specs/2026-05-15-pass-3-slice-2b-targeting-relations-design.md) on 2026-05-15 |
| **2b.1** | **Attachment schema-shape gaps (ancestry-trait subset)** — per-echelon `stat-mod` scaling at the canonical 4th/7th/10th-level thresholds (Dwarf *Spark Off Your Skin* = +6/+12/+18/+24); `level + offset` immunity (Polder *Corruption Immunity* = `level + 2`; canon hardcodes the offset — "level+N" was an over-general framing). Both generalize cleanly to neighboring traits (Wyrmplate / Psychic Scar share the per-echelon shape; item-side effects share the level+offset shape via Phase 2e) | `AttachmentEffect` schema: `stat-mod.perEchelon: [l1, l4, l7, l10]` variant; `immunity.value` extended to `number | 'level' | { kind: 'level-plus', offset: number }`; ancestry-trait override file re-authoring | 🚧 — item-side scaling (per-tier armor leveled treasures) and title benefit-choice slot moved to [Phase 2e](#phase-2e--items-engine-completeness) on 2026-05-16. See [2026-05-16 canon audit](superpowers/notes/2026-05-16-phase-2b-canon-audit.md) for canon quotes |
| **2b.2** | **Moved to [Phase 2e](#phase-2e--items-engine-completeness)** on 2026-05-16 — § 10.10 treasure-bonus stacking and the `magic-damage-bonus` AttachmentEffect variant are both treasure-shaped mechanics; both now consolidate under the Phase 2e canon-audit gate | — | moved |
| **2b.3** | **Kit completeness (kit-side only)** — three explicit sub-slices per [2026-05-16 canon audit](superpowers/notes/2026-05-16-phase-2b-canon-audit.md): **(a)** ranged-damage-bonus RollPower read-site fix — parser + collector already done for all 6 named kits, gap is the `RollPower` handler that may be gated melee-only; **(b)** `weapon-distance-bonus` (melee + ranged flavors; 4 melee-kits, 6 ranged-kits; flat not per-tier; must NOT apply to AoE sizes per canon; signature abilities already bake in the bonus so don't double-add); **(c)** `disengage-bonus` (13 kits with +1) — full greenfield: schema field, parser, runtime, new `Disengage` intent (or `Shift` extension), move-action handler, OA-trigger suppression | new `weapon-distance-bonus` + `disengage-bonus` effect kinds; parser regex for both; targeting layer; move-action engine; `RollPower` ranged-branch fix | 🚧 — kit-keyword leveled-treasure bonuses plumbing moved to [Phase 2e](#phase-2e--items-engine-completeness) on 2026-05-16 |
| **2b.4** | **Conditional / triggered attachments (ancestry-trait subset)** — extend `AttachmentCondition` beyond `kit-has-keyword` / `item-equipped` with a runtime-eval seam. Per [2026-05-16 canon audit](superpowers/notes/2026-05-16-phase-2b-canon-audit.md): **Devil *Wings*** — NOT a simple "while flying" condition; flying is a movement-mode state with a hard duration (Might-score rounds aloft), fall on prone-or-speed=0, plus echelon-1-only weakness 5. Identical mechanic on Dragon Knight *Wings* (design must serve both). Same `movement-mode` primitive covers Polder *Shadowmeld* (mode=shadow) from 2b.8. **Orc *Bloodfire Rush*** — fires on **first** damage per round (self-limiting), lasts **until end of round** (round-scoped, distinct from anything modeled today). **Revenant *Bloodless*** — RECLASSIFIED: canon (*"can't be made bleeding even while dying"*) is a flat **condition immunity**, NOT a save modifier. Same family as 6+ other ancestry traits surfaced in 2b.8 (Great Fortitude, Fearless ×2, Nonstop ×2, Unstoppable Mind, Unphased); cleanest home is Group B's `condition-immunity` effect kind. Slice scope therefore narrows to 2 traits (Wings + Bloodfire) needing the runtime-eval seam | new condition kinds (`movement-mode`, `damage-this-round`); runtime-eval seam in applier; participant fields (`movementMode: { mode, roundsRemaining }`, `bloodfireActive`); EndRound resets | 🚧 — item-side conditional/triggered (Color Cloak weakness conversion, Encepter lasso + power-roll floor, Mortal Coil turn-economy) moved to [Phase 2e](#phase-2e--items-engine-completeness) on 2026-05-16. Bloodless reclassified out of slice-2c scope on 2026-05-16 |
| **2b.5** | **Damage-engine state transitions § 2.7–2.9** — Winded threshold transitions, Dying state (**no death saves — Draw Steel doesn't have them**; dying→dead is the Bleeding-d6 progression plus stamina ≤ -winded), Dead state, KO/Unconscious. State-machine substrate shipped via slice 1; this row is now a concrete cleanup slice per [2026-05-16 canon audit](superpowers/notes/2026-05-16-phase-2b-canon-audit.md): KO 1-hour wake clock + double-edge-vs-unconscious consumer in `RollPower` + Bloodless suppression of dying-Bleeding (bug B3) + speed=0-while-unconscious derivation review + 2b.0 permissive `currentStamina > -windedValue` alive-check sweep + 3 slice-1 PS#2 deferred items. Also folds bugs B1 (inert threshold should be `≤ -winded`, not `≤ 0`) and B2 (inert state should add Prone condition) from the audit | `Participant.staminaState`; `ApplyDamage { intent }`; `StaminaTransitioned`; `WakeFromUnconscious` (or fold into `ClearParticipantOverride`); `RollPower` edge-stack consumer | 🟡 substrate shipped via [Pass 3 Slice 1](superpowers/specs/2026-05-15-pass-3-slice-1-damage-state-machine-design.md) (state machine + per-trait overrides + KO interception + dying-Bleeding). Cleanup slice scope concrete per the audit; "death-save flow" wording removed (Draw Steel has no such mechanic) |
| **2b.6** | **Q16 Revenant inert / 12h Stamina recovery** — Revenant signature trait layered on top of 2b.5's damage-state transitions | `ParticipantStateOverride { kind: 'inert' }`; fire-while-inert instant-death; 12h regain as override data; director-triggered `ClearParticipantOverride` + derived `ApplyHeal { recoveryValue }` | ✅ — mechanically shipped via [Pass 3 Slice 1](superpowers/specs/2026-05-15-pass-3-slice-1-damage-state-machine-design.md) on 2026-05-15 ([Q16 ✅](rules-canon.md) confirmed by [2026-05-16 canon audit](superpowers/notes/2026-05-16-phase-2b-canon-audit.md)). Open cleanup items fold into 2b.5: inert threshold fix (bug B1), Prone-on-inert (bug B2). 12h regain stays director-triggered (Respite at 24h with kit-change is the wrong home) |
| **2b.7** | **Q18 class-feature choice pipeline** — 5 classes, not 2, per [2026-05-16 canon audit](superpowers/notes/2026-05-16-phase-2b-canon-audit.md): Conduit Prayers/Wards (5+4 options; L10 lets you stack 3 Prayers); Censor Domains (1 of 12 Domains drives 3 auto-fold features at L1/L4/L7); Elementalist Enchantments/Wards (5+4); Talent Augmentations/Wards (5+4); Null Augmentations (3). Verified gaps: no schema slot (`LevelChoicesSchema` lacks any of these); most prose-only features absent from `abilities.json` (only the 4 statblock-callout Domain features survive parse); Conduit's "subclass is a *pair* of Domains" doesn't fit `CharacterSchema.subclassId: string`. Per-class slot namespace required from day one. Side bug B5 (Conduit subclass parser emits `['Piety:', 'Prayer Effect:', 'Piety:']`) folds into this slice | `CharacterSchema` per-class slot extension (`prayerId / wardId / domainId / augmentationId / enchantmentId`); new parser for inline `##### Name`-style prose blocks in class-chapter markdowns; class-namespaced override map (`{ [classId]: { [slotName]: { [optionId]: CharacterFold } } }` — supports both static-fold and trigger-shaped variants); fix `parse-class.ts` subclass bullet-filter for Conduit | 🚧 |
| **2b.8** | **Q17B ancestry signature-trait engine gaps** — 2026-05-16 canon audit completed; 12 ancestries (15 signature traits) classified: (a) 7 modelable today / already shipped, (b) 3 need 2b.4 runtime-eval seam (Orc *Relentless*, Memonek *Fall Lightly*, Memonek *Lightweight*), (c) 3 need new effect/condition shape (Polder *Shadowmeld* → `movement-mode` from 2b.4; Wode + High Elf *Glamors* → `grant-skill-edge`), (d) 2 permanent-defer (Human *Detect the Supernatural*, Dwarf *Runic Carving*). Plus a newly-surfaced family not in any other 2b row: **`condition-immunity`** effect kind, covering 6+ ancestry traits across 6 ancestries (Revenant *Bloodless* reclassified from 2b.4 lands here; Dwarf *Great Fortitude*, Polder *Fearless*, Orc + Memonek *Nonstop*, High Elf *Unstoppable Mind*, Memonek *Unphased*) — highest-fanout shape in the corpus | new effect kinds: `condition-immunity`, `grant-skill-edge`; integration with 2b.4 (3 traits) and Group B as a whole; full audit table in the canon-audit notes | 🚧 — scope concrete per the audit |
| **2b.9** | **Q10 cross-side ordering of simultaneous triggered actions + §4.10 substrate** — what's shipped: `ResolveTriggerOrder` intent + `CrossSideTriggerModal` UI (slice 1). What [2026-05-16 canon audit](superpowers/notes/2026-05-16-phase-2b-canon-audit.md) found is missing — the entire trigger cascade pipeline: (1) no event producer ever populates `encounter.pendingTriggers` (modal is dead code in production); (2) `ExecuteTrigger` reducer is a no-op stub; (3) 1-triggered-action-per-round cap unenforced (flag declared + reset, never set; bug B4); (4) ability schema has no `actionType: 'triggered' | 'free-triggered'` discriminant (only `raw` markdown), blocking the cap gate; (5) Dazed/Surprised/Unconscious gating on triggered actions not enforced. Sequencing: ability-data `actionType` discriminant first → `ExecuteTrigger` body + 1/round set point → trigger emitter in event reducers → dazed/surprised gating consumer | ability schema `actionType` discriminant + ingest extension; `ExecuteTrigger` reducer body; per-event trigger-candidate enumeration in `ApplyDamage` / `RollPower` / `ApplyForceMove` / `EndTurn`; condition-gated triggered-action dispatch | 🟡 resolution mechanism shipped via [Pass 3 Slice 1](superpowers/specs/2026-05-15-pass-3-slice-1-damage-state-machine-design.md). Cascade producer + cap-enforcer + actionType discriminant + condition-gating all open — what looked like an audit slice is closer to a full substrate ship |
| **2b.10** | **Canon housekeeping** — flip § 5 + § 10 parent flags now that subsections are ✅; refresh § 10.16 to reflect what's been closed each sub-epic; update the 2C spec status header (currently stale "Designed, awaiting plan." → shipped). Rides alongside every sub-epic | docs only | trivial |
| **2b.12** | **Shipped-slice cleanup epic — Victories/XP pipeline** — per [2026-05-16 shipped-code audit](superpowers/notes/2026-05-16-phase-2b-shipped-code-audit.md) cluster 2: bugs B6 (Respite incremented instead of reset), B7 (XP read from deprecated `state.partyVictories`, never wrote per-PC `xp`), B8 (EndEncounter never granted victories) | `respite.ts` reducer + post-reducer xp side-effect; `end-encounter.ts` per-PC victory grant; spec 2b.0 design line 58 corrected (originally said "increments" which contradicted canon) | ✅ shipped 2026-05-16 — EndEncounter grants +1 victory to surviving PCs; Respite resets victories + writes per-PC XP to D1; spec corrected |
| **2b.13** | **Shipped-slice cleanup epic — Level-scaling for class heroic resources** — per [2026-05-16 audit](superpowers/notes/2026-05-16-phase-2b-shipped-code-audit.md) cluster 3: bugs B9-B12, B22, plus a Tactician bonus surfaced during the audit. Echelon ramps (L4/L7/L10) for Censor/Conduit/Elementalist/Tactician per-turn gain + Censor dealer-side trigger + Elementalist spatial-OA claim + Talent force-move broadcast | `heroic-resources.ts:PER_TURN_BUMPS` lookup table; per-class trigger evaluators (censor/talent); claim-open-action.ts (Elementalist) | ✅ shipped 2026-05-16 — single chokepoint in heroic-resources + per-trigger level-aware amounts; 22 new tests |
| **2b.14** | **Shipped-slice cleanup epic — Targeting-relations end-clauses** — per [2026-05-16 audit](superpowers/notes/2026-05-16-phase-2b-shipped-code-audit.md) cluster 5: bugs B16/B27 (Null Field + Tactician Mark don't clear on dying); B24/B28 (cross-Censor / cross-Tactician sweep missing — `mode: 'replace'` only clears acting hero's own list) | `class-triggers/stamina-transition.ts` adds dying-state triggers for Tactician/Null; `intents/use-ability.ts` cascade emitter sweeps other participants' arrays; `intents/set-targeting-relation.ts` accepts `intent.source === 'server'` for the derived cascade | ✅ shipped 2026-05-16 — 9 new tests; Censor `judged` deliberately excluded from dying-clear (canon Judgment has no dying end-clause) |
| **2b.15** | **Shipped-slice cleanup epic — Damage-engine cleanup** — per [2026-05-16 shipped-code audit](superpowers/notes/2026-05-16-phase-2b-shipped-code-audit.md) cluster 1: B1 (inert threshold), B2 (Prone-on-inert), B3 (Bloodless dying-Bleeding suppression), B30 (`title-doomed-opt-in` claim applies override), B31 (rubble + inert + title-doomed `canRegainStamina:false` + ApplyHeal gate), B33 (Bleeding-d6 Might/Agility gate). Also folded: KO wake intent (`WakeFromUnconscious`), double-edge against unconscious target, alive predicate lifted to `staminaState !== 'dead'`, heal-from-unconscious clears KO Unconscious+Prone (slice-1 PS#2). B34 documented as deferred to 2b.9 (BleedingTrigger main_action/triggered_action wiring depends on trigger-cascade substrate to avoid double-fire) | `stamina.ts`, `apply-damage.ts`, `apply-heal.ts`, `claim-open-action.ts`, `stamina-override.ts`, `roll-power.ts`, `condition-hooks.ts`, `state-helpers.ts`, new `wake-from-unconscious.ts` intent | ✅ shipped 2026-05-16 — 30+ new tests; B34 carry-over to 2b.9 |
| **2b.16** | **Shipped-slice cleanup epic — Other class-trigger bugs (P1-P3, 13 mixed items)** — per [2026-05-16 audit](superpowers/notes/2026-05-16-phase-2b-shipped-code-audit.md) cluster 6: B13 Elementalist 5×Reason auto-drop (apply-damage.ts emits StopMaintenance derived intents when accumulator crosses); B14 Maintenance multi-target cardinality (added optional `targetId` to MaintainedAbility schema; dedup now (abilityId, targetId)); B15 spatial-OA latch-at-claim-time (Elementalist Essence + Tactician ally-heroic; Troubadour LoE intentionally no latch); B17 Null side-check via `participantSide`; B18 `main-action-used` gated on `intent.source !== 'manual'`; B19 Shadow Insight checks post-immunity delivered damage; B20 `spatial-trigger-null-field` OA kind removed from registry; B21 Troubadour state-transition triggers gain `canGainDrama` predicate; B23 Troubadour winded cause widened to `damage` + `override-applied`; B25 Tactician marked-damage dealer must be `kind === 'pc'`; B26 Psion toggles gated to L10+ Talent; B29 WS-mirror cascades targeting relations (own + cross-PC sweep); B32 deferred — no flip site for `bodyIntact` exists yet | per-bug; mostly small surface | ✅ shipped 2026-05-16 — 10+ new tests; B32 deferred-as-designed |

### Sequencing notes

- **2b.0 first, then 2b.0.1.** Engine-≈0% on § 5 generation is the most visible playability hole — sit down to play and the Director can't spend Malice, the Talent can't spend Clarity, no class can fire a premium ability on turn 1. 2b.0 wires the universal mechanics + the foundational Open Actions framework; 2b.0.1 then attaches the class-specific triggers and affordances on top. 2b.0 is a prerequisite for any meaningful playtest of subsequent attachment work.
- **2b.1 (ancestry subset) and 2b.3 (kit-side only) are independent of 2b.5.** Can interleave in any order; recommended order is "ancestry-trait schema gaps first (biggest visible-bug win) → kit completeness (medium)". The item-side work that previously batched with these now ships under Phase 2e behind its own canon-audit gate.
- **2b.6 is closed mechanically** (per 2026-05-16 audit). Its remaining cleanup items (bugs B1 + B2) fold into the 2b.5 audit slice rather than a standalone follow-up.
- **2b.5 unlocks better 2b.0 + 2b.0.1 triggers.** Fury "becoming winded → +1d3 ferocity", Troubadour "any hero becomes winded → +2 drama", Malice "hero death stops generation" all already wired against slice 1's `StaminaTransitioned` substrate; the open 2b.5 cleanup just lifts the remaining 2b.0 permissive `currentStamina > -windedValue` alive-checks to `staminaState !== 'dead'`.
- **2b.4 is the deepest architectural change.** After the 2026-05-16 audit reclassified Bloodless out of scope (condition-immunity belongs in Group B / 2b.8), slice 2c covers 2 ancestry-trait attachments needing per-encounter state: Devil/Dragon Knight *Wings* (movement-mode primitive with duration + fall trigger; same primitive serves Polder *Shadowmeld*) and Orc *Bloodfire Rush* (first-damage-this-round, until-end-of-round). The runtime-eval seam built here is the substrate that Phase 2e item-conditional attachments (Color Cloak / Encepter / Mortal Coil) will ride on top of.
- **2b.7, 2b.8, 2b.9 are independent of everything else.** Can slot in any time. 2b.9 is meaningfully larger than its prior "audit slice" framing implied — full trigger-cascade substrate.
- **2b.10 rides alongside every sub-epic** — each delivers a piece of canon ✅ that updates the doc.

Minion squads (previously 2b.11) moved out of Phase 2b on 2026-05-16; they ride with initiative-group + captain mechanics in **Phase 2c — Advanced monster mechanics**.

### Proposed shipping grouping (post 2026-05-16 dual audit)

The remaining open sub-epics fold into **9 shipping groups + 1 ride-alongside doc-housekeeping**. Sub-epic descriptions revised per the [2026-05-16 unshipped audit](superpowers/notes/2026-05-16-phase-2b-canon-audit.md) and [2026-05-16 shipped-code audit](superpowers/notes/2026-05-16-phase-2b-shipped-code-audit.md); group composition shifts to match. The shipped-code audit surfaced 34 distinct bugs (3 P0) across the shipped Phase 2b surface, organized into 5 cleanup sub-epics (2b.12–2b.16). Order shown is recommended ship order.

| Group | Sub-epics | Why grouped (or not) | Effort |
|---|---|---|---|
| **CLEANUP-0. Victories/XP pipeline (P0)** | 2b.12 | Broken end-to-end in shipped code: no Victories grant at EndEncounter, Respite increments instead of resetting, per-PC `xp` never written. 3 bugs, single small surface. **Ship FIRST — playtest-visible bug** | Small — half-day spec + PR |
| **CLEANUP-1. Level-scaling for heroic resources** | 2b.13 | One chokepoint refactor + per-trigger amount-aware factors. 6 bugs across 4-5 classes. High-level play (L4+) is currently under-powered for affected classes | Small-Medium — one PR |
| **CLEANUP-2. Targeting-relations end-clauses** | 2b.14 | Two centralized helpers (dying-state hook + cross-PC sweep). 4 bugs, 2 root causes | Small — one PR |
| **A. Slice 2c — Conditional / triggered attachments (ancestry-trait subset)** | 2b.4 | Deepest architectural lift (runtime-eval seam, mid-encounter applier re-eval). Audit reclassified Bloodless out → 2 attachments instead of 3: Devil/Dragon Knight *Wings* + Orc *Bloodfire Rush*. Same `movement-mode` primitive Wings establishes serves Polder *Shadowmeld* in Group B. Ships the substrate that Phase 2e item-conditional attachments (Color Cloak / Encepter / Mortal Coil) ride on top of | Small-Medium — own brainstorm + spec + plan |
| **B. Schema completeness batch** | 2b.1 + 2b.3 (3 sub-slices) + 2b.8 | All extend ancestry/kit-side `AttachmentEffect` / `AttachmentCondition` variants + override files + parser. Share the fixture sweep, the §10.16 doc cleanup, and the applier touchpoints. Audit-surfaced shapes consolidate here: **`condition-immunity`** effect kind (6+ ancestry traits incl. reclassified Bloodless — highest-fanout shape in the corpus); **`grant-skill-edge`** (2 Glamors); per-echelon `stat-mod`; `immunity { level-plus, offset }`; `weapon-distance-bonus`; `disengage-bonus` + new `Disengage` move-action handler; ranged-damage `RollPower` read-site fix; the 3 ancestry signature traits riding on Group A's runtime-eval seam (Relentless, Fall Lightly, Lightweight) | Medium-Large — one spec covering the batch; multiple logical commits in one PR |
| **C. Damage-engine cleanup (merged)** | 2b.5 + 2b.15 | Combines the unshipped-audit 2b.5 punch-list with the shipped-code-audit Cluster 1 cleanup. KO 1-hour wake clock, double-edge-vs-unconscious in `RollPower`, Bloodless × dying-Bleeding suppression (B3), speed=0 derivation review, 2b.0 permissive-alive sweep, slice-1 PS#2 deferred items, bugs B1 (inert threshold) + B2 (Prone-on-inert), B30 (title-doomed claim no-op), B31 (rubble/inert lack `canRegainStamina:false`), B33 (Bleeding fires on any characteristic), B34 (Bleeding discriminants unused) | ✅ 2b.15 shipped 2026-05-16; B34 carry-over to 2b.9 |
| **D. Class-feature choice pipeline** | 2b.7 | Audit expanded scope to 5 classes (Conduit Prayers/Wards, Censor Domains, Elementalist Enchantments/Wards, Talent Augmentations/Wards, Null Augmentations). New parser for inline `##### Name`-style class-chapter prose blocks; per-class slot namespace on `CharacterSchema`; class-namespaced override map. Conduit subclass parser side-bug B5 folds in. No useful overlap with B (different data path). Independent of A | Medium-Large — standalone slice |
| **E. Trigger cascade substrate** | 2b.9 | Audit found this is dramatically less shipped than 🟡 implied: cascade producer + 1-per-round cap + ability-data `actionType` discriminant + dazed/surprised gating consumer + `ExecuteTrigger` body — all open. Plus the spec-vs-canon foes-first vs heroes-first default ordering question (canon Combat.md:125 reads heroes-first). Sequence: ability-data `actionType` first → `ExecuteTrigger` body + 1/round set point → trigger emitter in event reducers → condition-gating consumer | Medium — standalone slice |
| **CLEANUP-3. Other class-trigger bugs** | 2b.16 | 13 mixed P1-P3 items. Mostly small per-bug fixes; B13 (Elementalist 5×Reason auto-drop) is the biggest at "new event-source hook" complexity | ✅ shipped 2026-05-16 (B32 deferred — depends on ablation events) |

**Cycle count:** 9 brainstorm-and-ship cycles total (3 cleanup + 5 forward + 1 ride-alongside doc-housekeeping). Cleanup work ships first to clear the bug debt, then forward work resumes. The cleanup sub-epics are individually small (Small-Medium each); aggregate effort is meaningful but bisect-friendly.

**Why not "do A first, batch all the rest"?** C touches the damage pipeline; D touches the parser; E touches the trigger substrate (different blast radii). Batching disparate concerns into one mega-PR loses bisect-friendliness. B is the only group where batching genuinely earns its keep.

**2b.10 housekeeping** rides alongside every group's PR as it has since the umbrella was written.

### Acceptance

Phase 2b is done when:

1. Every § 5 sub-section (resources, malice, surges) runs end-to-end in the engine without manual intervention.
2. Every § 10 effect category whose canonical shape does **not** depend on item-specific clauses folds correctly; § 10.16 has no remaining 🚧 carry-overs in the ancestry / kit / class buckets (item-shaped carry-overs move to [Phase 2e](#phase-2e--items-engine-completeness) acceptance).
3. Damage-engine §§ 2.7–2.9 (winded / dying / dead) state transitions run; the participant stamina state machine matches the rulebook.
4. `rule-questions.md` has no open 🟡 entries except those explicitly tagged permanent defer or rehomed to Phase 2c / 2e.
5. Every modeled ancestry × kit combination at level 1–10 produces the correct runtime number on a representative fixture sweep. (Title × treasure × artifact × trinket × consumable coverage moves to [Phase 2e](#phase-2e--items-engine-completeness) acceptance.)
6. `pnpm test`, `pnpm typecheck`, `pnpm lint` clean repo-wide.

## Phase 2c — Advanced monster mechanics

**Goal:** "The director can run encounters that use the parts of the Draw Steel monster system Phase 1 / 2 / 2b deliberately punted — minion squads with their pooled-Stamina and squad-attack mechanics, captain attachments that buff a squad, and initiative groups that bundle multiple actors into a single director turn."

**UI quality bar:** same prototype-grade rule as Phases 1–2b. The visual / interaction / motion pass happens in **Phase 5 (UI rebuild)**. Don't over-invest here.

**Note on naming.** "Phase 2c" (lowercase c) is distinct from "Phase 2 Epic 2C" (uppercase C; shipped under Phase 2 above). They are different scopes; the lowercase letter is a sub-phase suffix, not an epic identifier — same convention as the existing Phase 2b vs. Epic 2B disambiguation.

**Origin.** Three concepts in `Bestiary/Monsters/Chapters/Monster Basics.md` don't reduce to "another row in `Participant`": squads (pooled-Stamina minion aggregates with single-roll squad attacks), captains (non-minion creatures attached to a squad to grant a per-minion benefit), and initiative groups (the encounter-builder construct that collapses multiple actors into one slot in the alternating zipper). The full data model and rules summary lives in [`encounter-model.md`](encounter-model.md); the canon source is `.reference/data-md/Bestiary/Monsters/Chapters/Monster Basics.md`. The minion-squads sub-epic that previously lived at 2b.11 is rehomed here so squads, captains, and initiative groups ship as one coherent piece rather than as a half-built squad system that needs to be retrofitted twice.

### Sub-epics

| # | Sub-epic | Touches | Status |
|---|---|---|---|
| **2c.1** | **Squad entity + pooled-Stamina mechanics** — new `Squad` entity (sibling of `Participant`, not a subtype); `CreateSquad` / `RemoveSquad` / `DamageSquad` intents; pool-threshold logic that drops one minion per single-minion-Stamina the pool crosses; squad-eliminated log entry; size cap ≤ 8 invariant; minion-weakness/immunity applies-once rule; area-effect rule (only minions in the area contribute to pool damage) | new `state.squads` field; new intents; `DamageSquad` integration with the damage path used by both squad attacks and area attacks | 🚧 |
| **2c.2** | **Squad action economy + squad attacks** — single attack roll for the squad with per-target damage (each target hit by only one instance); squad maneuvers (Grab, Hide, Knockback, Search) with single-roll semantics; opt-out path for an individual minion to take a personal maneuver; free-strike-together damage summation; minion action economy (move + one of main / maneuver / move) | reducer for squad-action intents; UI for the combined squad turn pane; targeting layer extension for "N minions targeting M creatures" | 🚧 — depends on 2c.1 |
| **2c.3** | **Captain attachment** — `AttachCaptain` / `DetachCaptain` / `ReassignCaptain` intents with the full eligibility check (non-minion, non-mount, shared language; 1:1 cardinality on both sides); combined squad+captain turn flow (captain takes full main + maneuver alongside the squad's action economy); reactive `DetachCaptain` when the captain reaches 0 Stamina or leaves the encounter; round-boundary reassignment per canon. Captain benefit *application* (the `With Captain` field on minion stat blocks) folds into the squad-attack damage path | new `Squad.captainParticipantId` ↔ `Participant.captainOfSquadId` fields; `withCaptain` field surfaced from monster ingest; reducer enforcement of the 7 invariants in `encounter-model.md` | 🚧 — depends on 2c.1; can develop in parallel with 2c.2 |
| **2c.4** | **Initiative groups** — `InitiativeGroup` entity holding a discriminated mix of participant and squad references; `CreateInitiativeGroup` / `UpdateInitiativeGroup` intents (encounter-builder UI); `PickInitiativeGroup` replaces single-participant director picks during the zipper's director half; cascade-walks members in order, emitting `StartTurn` per participant and `StartSquadTurn` per squad-member; cascade-prune when a referenced participant/squad is removed | new `state.initiativeGroups` field; encounter-builder grouping UI (dnd-kit); zipper-initiative integration with the side-aware picker shipped in Pass 5 Layer 1 Pass 2b1 | 🚧 — depends on 2c.1 for squad references; otherwise independent |
| **2c.5** | **Encounter-builder ingest of `With Captain`** — surface the `With Captain` field on every minion stat block through the monster data pipeline; render in the codex monster card; honor it in 2c.3's captain-benefit fold | `packages/data` parser; codex monster-card component; attachment-fold path used by squad-attack damage | 🚧 — rides with 2c.3 |
| **2c.6** | **Canon housekeeping** — author canon entries in `rules-canon.md` for squad mechanics, captain attachment, and initiative groups (each gated Gate 1 → Gate 2 like the rest of the canon doc); cross-link `encounter-model.md` from `rules-canon.md`; verify `pnpm canon:gen` picks up the new entries | docs only | trivial — rides with each sub-epic |

### Sequencing notes

- **2c.1 first.** Squad entity + pooled-Stamina mechanics is the foundation; 2c.2 and 2c.3 both depend on it. No good way to ship 2c.2 or 2c.3 in isolation without speculative scaffolding.
- **2c.2 and 2c.3 can run in parallel** once 2c.1 lands. They touch different surfaces (squad-action reducer vs. captain attachment + invariant enforcement). Disjoint enough to fan out per `feedback_parallel_agents_for_disjoint_slices`.
- **2c.4 is independent of 2c.2 / 2c.3** at the data-model level (it just needs the `Squad` discriminator from 2c.1), but UX-wise pairs well with them — running an encounter where a squad is in an initiative group is the first realistic playtest of the whole stack.
- **2c.5 rides with 2c.3.** The captain benefit is moot until the parser surfaces `withCaptain` on minion stat blocks; can ship them in the same PR if the data-pipeline change is small.
- **2c.6 rides alongside every sub-epic** — each delivers a piece of canon that updates the doc.

### Acceptance

Phase 2c is done when:

1. The director can build an encounter that includes a squad of 6+ minions, optionally attach a captain to it, and place it in an initiative group with non-minion creatures.
2. On the squad's turn, the engine fires a single squad attack with one to-hit roll and per-target damage, applies area damage to the squad pool correctly, drops the right number of minions when the pool crosses thresholds, and applies the captain's per-minion benefit when one is attached.
3. The captain takes its own full-action-economy turn alongside the squad's combined turn, with separate Stamina, and the engine fires `DetachCaptain` automatically when the captain reaches 0 Stamina or leaves the encounter.
4. The zipper initiative picks an entire initiative group as one director-half slot, walking its members in order.
5. The 7 reducer invariants in [`encounter-model.md`](encounter-model.md) are enforced and produce structured intent-rejection errors when violated.
6. `pnpm test`, `pnpm typecheck`, `pnpm lint` clean repo-wide.

## Phase 2e — Items engine completeness

**Goal:** "Every modeled item — leveled treasures, artifacts, trinkets, titles, consumables — folds correctly into the runtime per canon. Each item gets a per-instance canon audit against the printed Heroes Book before any engine work."

**UI quality bar:** same prototype-grade rule as Phases 1–2c. Phase 5 handles polish. Don't over-invest.

**Note on naming.** "Phase 2e" (lowercase e) is distinct from "Epic 2E" (uppercase E; the Sessions-layer epic shipped under Phase 2 above). They are different scopes; the lowercase letter is a sub-phase suffix — same convention as Phase 2b vs. Epic 2B and Phase 2c vs. Epic 2C.

**Origin.** Item engine work was originally scattered across the Phase 2b sub-epic table (2b.1 per-tier armor scaling and title benefit-choice slot; 2b.2 treasure-bonus stacking + magic-damage-bonus; 2b.3 kit-keyword leveled-treasure bonuses plumbing; 2b.4 conditional/triggered Color Cloak + Encepter + Mortal Coil). Brainstorming slice 2c on 2026-05-16 surfaced that the umbrella's per-item descriptions were imprecise — "Encepter aura" turned out to describe a player-managed lasso relation + a separate Shining Presence power-roll floor, not the "emit effect onto nearby participants" pattern the umbrella suggested. Items are uniquely vulnerable to this kind of misframing because each one is a one-off with bespoke clauses (a single artifact carries 4–5 distinct mechanical entries; a trinket can vary its effects per color variant). Phase 2e gathers all item engine work under a single canon-audit gate so the engineering shape is derived from the printed Heroes Book directly, not from anyone's recollection of what the item "kind of does".

### Prerequisite gate

Before any Phase 2e sub-epic ships a spec, each candidate item gets a side-by-side audit document:

- The canon text from `.reference/data-md/Rules/Treasures/...` (and printed-book verification per memory `feedback_rules_canon_workflow` — both Gate 1 source check AND Gate 2 manual user review).
- The proposed engine handling per clause (which `AttachmentEffect` variant(s), which `AttachmentCondition` kinds, which read sites, which `targetingRelations` kinds if relation-driven, which existing intents need extending).
- Any unmodelable clauses (e.g. spatial geometry that has no battlemap analog per `CLAUDE.md`'s explicit non-goal) called out explicitly as SKIPPED-DEFERRED with the canon reasoning.

The audit document lives at `docs/superpowers/notes/2026-MM-DD-item-canon-audit-<item-id>.md` (or one document per item cluster — e.g. all Color Cloak color variants together). The user does Gate 2 (printed-book verification) on each one before sub-epic decomposition.

### Sub-epics

Final decomposition emerges from the canon-audit pass, not pre-determined here. Items rehomed from Phase 2b at carve-out time (2026-05-16):

| From | Item engine work pulled into Phase 2e |
|---|---|
| **2b.1 (split)** | Per-tier armor leveled-treasure stat scaling (L1 baseline → L5/L9 scaling for +Stamina, shield bonuses, etc.); title benefit-choice slot (Knight: Heraldic Fame / Knightly Aegis / Knightly Challenge; Zombie Slayer: Blessed Weapons / Divine Health / Holy Terror; etc.) — needs `CharacterSchema.titleBenefitId` slot + override map keyed on `{titleId}.{benefitId}` + wizard step |
| **2b.2 (whole)** | § 10.10 "only the higher applies" stacking rule for treasure-bonus stat-mods; new `magic-damage-bonus` AttachmentEffect variant for implement-style leveled treasures (mirrors `weapon-damage-bonus` from Epic 2C Slice 5) |
| **2b.3 (split)** | Kit-keyword leveled-treasure bonuses plumbing — the "treasure-side bonus that requires the kit keyword match" engine path |
| **2b.4 (split)** | Conditional / triggered item attachments — Color Cloak (triggered weakness conversion); Encepter (Shining Presence tier-3 power-roll floor + Champion's Lasso lassoed-relation + Dominion apply-Restrained + Obliteration as a regular ability consuming lasso state); Mortal Coil (+1 main action per turn turn-economy modifier) |
| **Epic 2C carry-overs** | Consumable duration / two-phase branches (Growth Potion 3-round buff; Blood Essence Vial capture-then-drink) — temp-buff state machine the engine doesn't have today |
| **Epic 2C carry-overs** | Artifact-specific shapes not yet read against canon (Blade of a Thousand Years clauses) |

### Sequencing notes

- **The canon-audit pass is the first task in Phase 2e** — before any sub-epic decomposition. The audit may surface new variants that change the decomposition.
- Each audited item becomes either: (a) a clean fit for existing schema → small overrides PR; (b) needs a new effect/condition variant → groups with other items needing the same variant; (c) unmodelable in v1 → SKIPPED-DEFERRED with explicit canon reasoning.
- **Phase 2e is independent of the remaining Phase 2b sub-epics.** Can ship in parallel with Phase 2b cleanup, in any order. Phase 2e *does* depend on slice 2c's runtime-eval seam (Phase 2b Group A) for conditional item attachments to ride on; non-conditional item work (stacking, magic-damage-bonus, per-tier armor scaling, title benefit-choice slot) is fully independent.
- Phase 2e canon housekeeping (a sibling of 2b.10) refreshes `docs/rules-canon.md` § 10.16 as item-related carry-overs close.

### Acceptance

Phase 2e is done when:

1. Every modeled item in `apps/web/public/data/items.json` (artifacts, leveled treasures, trinkets, consumables) and every title in `apps/web/public/data/titles.json` has either an audit document (modelable) or an explicit SKIPPED-DEFERRED classification with canon reasoning.
2. Every item the audit classified "modelable" folds correctly into the runtime on a representative fixture sweep (ancestry × kit × title × treasure × artifact × trinket at level 1–10).
3. `docs/rules-canon.md` § 10.16 has no remaining 🚧 item-related carry-overs except those explicitly classified SKIPPED-DEFERRED.
4. `pnpm test`, `pnpm typecheck`, `pnpm lint` clean repo-wide.

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
