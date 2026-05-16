# Combat rules roadmap

A categorized inventory of every Draw Steel combat mechanic the engine and tracker need to handle. Each bucket is independently testable. Source-of-truth references are to the markdown rules under `.reference/data-md/Rules/` (cross-checked against the v1.01 PDFs in `.reference/core-rules/`).

This is a planning document, not a spec. The intent reducer in `packages/rules` is where the rules in this document get exercised; some buckets already have partial coverage (see `docs/follow-ups.md` for known gaps).

The document is organized along **two complementary axes**:

- **Axis A — mechanic cut** (engine testing). Organized by engine responsibility. Each bucket maps to a coherent reducer surface. Use this view when working on the rules engine itself or planning targeted mechanic-level test suites.
- **Axis B — source cut** (content coverage). Organized by where the rules come from — core rules, monsters, ancestries, classes, kits, etc. Use this view when auditing whether every piece of content is wired into the engine, and when planning per-content test sweeps.

The two axes are orthogonal, not competing — every individual rule appears under exactly one Axis A bucket *and* exactly one Axis B bucket. Together they form a 2D matrix you can walk in either direction.

## Two cross-cutting concerns

Two mechanics touch every bucket below. If they're wrong, everything downstream is wrong, so they deserve their own attention before any bucket-level work:

- **Effect duration.** Every effect has one of four lifetimes — `EoT` (end of target's next turn), `save ends` (d10 ≥ 6 at end of each of the target's turns; a hero token can auto-succeed), end of encounter, or "the creature who imposed it ends it as a free maneuver." Plus end-of-combat cleanup: effects expire unless they're winded / unconscious / dying. Source: Combat.md, Classes.md §Ending Effects.
- **Stacking rules.** Same ability used multiple times → most impactful wins, latest use sets duration. Different abilities that grant the same condition → applies once. Different abilities with different unique effects → stack. Source: Classes.md §Stacking Unique Effects.

---

# Axis A — Mechanic cut (engine testing)

Seven buckets organized by engine responsibility. Combat-focused: this is what the rules engine has to *do*, regardless of where the rule comes from. Use this view when designing test suites for reducer logic, intent dispatch, and state transitions.

## A1. Encounter lifecycle

The container around everything else. Mostly state-machine work in the lobby DO, dispatched via encounter-level intents.

- When combat starts (someone intends harm — and this is when heroic abilities start costing Heroic Resource)
- Surprise determination (surprised creatures can't take triggered actions; ability rolls against them gain edge)
- Determining first side (Director rolls d10; 6+ → players choose, else Director chooses)
- Side-alternation turn order; Director-controlled creatures act in groups
- "Remaining side finishes the round when the other is empty" rule
- Side that went first goes first in subsequent rounds
- End-of-round, end-of-encounter cleanup (effects expire unless winded / unconscious / dying)
- Victory awards on encounter resolution
- Knockout-vs-kill choice on the killing blow

Source: Combat.md §Combat Round, §End of Combat.

## A2. Action economy on a turn

The slot machine. Each turn = 1 main + 1 maneuver + 1 move, in any order, breakable around movement.

- Main → maneuver or move conversion
- Triggered actions (1/round, only when the trigger occurs)
- Free triggered actions (off the per-round limit)
- Free maneuvers (unlimited, simple stuff)
- No-action activities (off-turn, Director discretion)
- Opportunity attacks (free triggered melee free strike when adjacent enemy moves away without shifting; blocked if you have a bane vs them)

Canonical maneuver list:

- Aid Attack, Catch Breath, Escape Grab, Grab, Hide, Knockback, Make/Assist a Test, Search for Hidden Creatures, Stand Up, Use Consumable

Canonical main action list:

- Charge, Defend, Free Strike, Heal (plus all class abilities)

Canonical move action list:

- Advance, Disengage, Ride

Source: Combat.md §Taking a Turn, §Maneuvers, §Main Actions, §Move Actions, §Free Strikes.

## A3. Power roll engine

The 2d10 + characteristic core. Foundational for every ability roll and every test.

- Tier 1 (≤11) / Tier 2 (12–16) / Tier 3 (17+)
- Natural 19/20 → auto Tier 3; if the roll is an ability roll made as a main action, also a critical hit (extra main action — including off-turn, including while dazed)
- Edges/banes: ±2 single, double = automatic tier shift, capped at two each
- Cancellation: edge + bane → no mod; double edge + 1 bane → 1 edge; double bane + 1 edge → 1 bane
- Bonuses/penalties (skills, etc.) stack independently of edges/banes
- Automatic tier outcomes supersede edges/banes/bonuses
- Downgrade option (player choice to take a lower-tier outcome)
- Opposed rolls use +4/−4 (not tier shifts) for double edge/bane and automatic tier shifts
- Multi-target: one power roll applied per target, but per-target edges/banes can land different tiers per target

Source: The Basics.md §Power Rolls, Classes.md §Critical Hit, §Roll Against Multiple Creatures, Tests.md §Opposed Power Rolls.

## A4. Abilities, strikes & damage

How a single ability resolves end-to-end. Most of the existing engine surface lives here.

- Keywords: Area, Charge, Magic, Melee, Psionic, Ranged, Strike, Weapon
- Distance: Self / Melee X / Ranged X
- Area shapes: Aura, Burst, Cube, Line, Wall — each with origin-square + line-of-effect rules; areas don't pass through solid barriers or around corners by default
- Ability roll vs effect-only abilities
- Signature vs heroic vs "spend Heroic Resource to enhance" abilities
- Rolled vs unrolled damage (matters for surges and rolled-damage triggers)
- Damage types: untyped, plus acid, cold, corruption, fire, holy, lightning, poison, psychic, sonic
- Damage pipeline order: rolled → external modifiers/halving → weakness → immunity → temp Stamina → Stamina (immunity always last)
- Stamina, temporary Stamina (max-of, not sum; expires at end of encounter)
- Object Stamina (glass 1 / wood 3 / stone 6 / metal 9 per square; poison & psychic immunity all)
- Knock out vs kill on lethal damage

Source: Classes.md §Abilities, §Damage Types, Combat.md §Damage, §Stamina.

## A5. Conditions, effects & potencies

The status layer. Each of the nine conditions is an independent unit of testable behavior.

- **Bleeding** — lose 1d6 + level on main action / triggered action / Might or Agility power roll
- **Dazed** — only one of {main, maneuver, move} per turn; no triggered/free-triggered/free maneuvers
- **Frightened** — bane against source, edge for source, can't willingly approach source
- **Grabbed** — speed 0, no Knockback, bane on non-grabber abilities, grabber drags target on move
- **Prone** — strike bane, melee-against edge, crawl only, can't climb/jump/swim/fly
- **Restrained** — speed 0, no Stand Up, can't be force moved, bane on rolls + Might/Agility tests, edge for attackers
- **Slowed** — speed 2 (unless already lower), can't shift
- **Taunted** — double bane on abilities not targeting the taunter (when line of effect exists)
- **Weakened** — bane on power rolls

Source: Conditions/ folder, one file per condition.

Potencies (the resist-via-characteristic layer):

- Weak / average / strong values from your highest characteristic (−2 / −1 / 0)
- `M/A/R/I/P < value` pattern; target's characteristic must equal or exceed the value to resist
- Resource refund rule: if a potency is the only effect of a Heroic-Resource spend and the target resists, the resource isn't spent (same for Director-side Malice)
- Potency adjustment via abilities (e.g. Null Field, Judgment)
- Surge interaction: 2 surges → +1 potency for one target, capped at +1 per target

Saving throws live here: d10 ≥ 6 at end of each turn for `save ends` effects.

Source: Classes.md §Potencies, §Effect, §Saving Throw, §Surges.

## A6. Resources

Per-character and per-party economies. Mostly counters and thresholds; the test surface is the rules around when they tick.

- **Stamina + thresholds** — winded (≤ ½ max), dying (≤ 0; bleeding while there, can't Catch Breath, can still act), dead (≤ −winded value)
- **Recoveries** — class-determined count; recovery value = ⅓ Stamina max, rounded down; spent via Catch Breath maneuver in combat, freely outside combat; refresh on respite
- **Heroic Resources** — class-specific (nine of them); spent on heroic abilities and ability enhancements; class-specific earn rules
- **Surges** — earned during combat from class features/abilities; up to 3 per damage instance for +highest-characteristic extra damage; 2 → +1 potency for one target; lost at end of combat
- **Hero tokens** — party pool, starts each session = party size; spend modes: 2 surges / auto-succeed a save / reroll a test / 2 tokens for recovery-value of Stamina (no action); one benefit per turn or per test; expire at session end (default rule)
- **Victories** — 1 per encounter won; convert to XP on respite
- **Malice** — Director-side combat resource; rules in the Monsters book, but the tracker needs to surface it

Source: The Basics.md §Hero Tokens, §Recoveries, §Victories; Combat.md §Stamina; Classes.md §Surges; Heroes PDF index for Malice.

## A7. Geometry — movement, positioning, forced movement

The densest bucket. Probably the largest single test-writing investment.

### Movement primitives

- Size and space (1T / 1S / 1M / 1L / 2 / 3 / …); creature occupies a cube `size` squares on a side; squeeze penalty (bane on rolls/tests when sharing space with creature of size within 1)
- Speed, Advance / Disengage / Ride move actions
- Shift (no opportunity attacks triggered by it; can't enter difficult/damaging terrain; can't combine with normal move within a single shift)
- Can't-exceed-speed (single move/effect can't exceed current speed unless stated)
- Can't-cut-corners (no diagonal through a wall corner)
- Moving through allies (free) / enemies (difficult terrain) / squeezing rules
- Difficult terrain (+1 square cost), damaging terrain (damage when entered or while inside)

### Eight movement types

- **Walk** — default
- **Burrow** — through dirt horizontally; Dig maneuver for vertical; burrowing forced movement rules; targeting burrowing creatures (cover, line of effect rules); non-burrowing pull-up
- **Climb** — auto at full speed if in speed entry; else 2 squares cost per square climbed; Might test for difficult surfaces; climbing creatures (consensual + opposed test)
- **Swim** — same shape as climb
- **Jump** — long jump baseline = Might or Agility (min 1 square), height 1 square; extended via test
- **Crawl** — while prone, +1 movement cost per square; fall-prone-as-free-maneuver
- **Fly** — full speed vertical/horizontal; if speed reaches 0 or knocked prone, falls
- **Teleport** — instantaneous; ignores opportunity attacks; line-of-effect to destination; destination unoccupied; ends grabbed/restrained on teleporter; can stand up if prone

Plus **Hover** (overlay on fly/teleport; doesn't fall when prone or speed 0).

### Falling

- 2 damage per square fallen, cap 50, land prone
- Agility score reduces effective height (min 0)
- Liquid 1 square+ deep reduces height by 4 (min 0)
- Falling onto a creature → both take fall damage; larger faller's size > target's Might → target knocked prone
- Falling far — 100 squares in round 1, 100 per subsequent round

### Targeting & visibility

- Line of effect (corner-to-corner rule; solid objects block; Director discretion on flimsy obstructions)
- Cover (≥ half blocked by solid object → bane on damage abilities against)
- Concealment (darkness/fog/invisibility → bane on strikes against; can target only if not hidden)
- Invisible creatures (always concealed; Search test takes a bane)
- Hidden creatures (Hide maneuver auto-succeeds in combat if cover/concealment + unobserved; Search for Hidden Creatures uses opposed Intuition vs Agility/Hide within 10 squares; can't be single-target-targeted while hidden; hidden grants edge on ability rolls vs that creature through end of revealing turn)
- High ground (fully above target's space → edge on power rolls against)
- Flanking (allies on opposite sides of an enemy → edge on melee strikes; requires line of effect + triggered actions available)

### Forced movement

- **Push X** — straight line away, each square must increase distance
- **Pull X** — straight line toward, each square must decrease distance
- **Slide X** — any direction (not vertical), no straight-line requirement
- Vertical variant — adds up/down to any of the three
- Big-vs-little — larger force-mover of smaller target via melee weapon ability → distance +1
- Stability — target reduces distance by stability score (heroes start 0)
- Forced movement ignores difficult terrain and never provokes opportunity attacks
- Multitarget abilities — force-mover picks order, complete one target's movement before starting the next
- Slamming into creatures — 1 damage per remaining square to both; one larger creature into multiple smaller creatures only takes damage once
- Slamming into objects — 2 + 1/remaining square; downward into ground = also fall damage with Agility 0
- Hurling through objects — glass 1sq → 3 dmg, wood 3sq → 5 dmg, stone 6sq → 8 dmg, metal 9sq → 11 dmg; remaining movement continues if object destroyed
- Forced into a fall — finish horizontal movement first, then fall
- Death effects + forced movement — forced movement resolves first, then triggered effects
- "When a creature moves" triggers — forced movement triggers these unless stated otherwise

### Special environments

- Underwater combat (fire immunity 5, lightning weakness 5, bane on power rolls if can't auto-swim)
- Suffocating (Might rounds, then 1d6/round)
- Mounted combat (Ride move action, mount + rider each have a turn, force-move knocks rider off)

Source: Combat.md §Movement, §Forced Movement, §Falling, §Underwater, §Suffocating, §Mounted Combat; Movement/ folder for edge cases.

---

# Axis B — Source cut (content coverage)

Twelve buckets organized by where the rules originate. Use this view when auditing content coverage — does every ancestry's signature trait fold correctly? Is every kit's distance bonus parsed? Are all 100 complications wired up? Each bucket below has a corresponding folder (or section) under `.reference/data-md/Rules/`.

## B1. Core rules

The system primitives shared by everything else — power rolls, edges/banes, conditions, damage pipeline, action economy, line of effect, forced movement. This is the rule layer Axis A enumerates; it has no per-content variants, just the engine machinery.

Source: `Chapters/{The Basics, Tests, Combat}.md`, `Conditions/`, `Movement/`.

## B2. Monster features

Stat blocks, creature roles, minion squads, Malice abilities. Includes role-based behavior (artillery, brute, controller, harrier, hexer, mount, support), squad-level action-economy, and the Malice resource itself. Phase 2b.11 covers squads specifically.

Source: `.reference/core-rules/Draw_Steel_Monsters_v1.01.pdf` and the Bestiary markdown.

## B3. Ancestries (12)

Per-ancestry signature traits and feature trees. Each entry has a folder of features. Phase 2b.8 (Q17B) is auditing per-ancestry signature-trait engine gaps.

Source: `Ancestries/` (12 folders).

## B4. Classes (10)

Per-class features, ability progression, Heroic Resource generation, subclass features. Each class has its own state machinery (Talent strained, Fury ferocity, Conduit prayer effects, etc.). Phase 2b.0.1 hooks the class δ-triggers; 2b.7 (Q18) closes the Conduit Prayers / Censor Domains pipeline.

Source: `Classes/` (10 folders), `Classes By Level/`, `Abilities/`.

## B5. Kits (22)

Per-kit weapon and armor bonuses, damage bonuses (melee + ranged), distance bonuses, disengage bonuses, kit-specific abilities. Phase 2b.3 is the kit-completeness sub-epic (six silent ranged-damage kits, distance + disengage parser gaps, kit-keyword leveled-treasure bonuses).

Source: `Kits/` (22 folders).

## B6. Titles (4)

Story-progression rewards with title benefits — Knightly Aegis, Heraldic Fame, Zombie Slayer, etc. Phase 2b.1 covers title benefit-choice slot wiring.

Source: `Titles/` (4 folders).

## B7. Careers (18)

Starting equipment, perks, skill grants, and an inciting incident hook per career. Mechanical surface is mostly perks + skills (granted at character creation, then static).

Source: `Careers/` (18 folders).

## B8. Cultures (3)

Region-of-origin skill and language grants. Smallest content bucket; rules are uniform across cultures (pick from a list).

Source: `Cultures/` (3 folders).

## B9. Perks (6 categories, many perks)

Small grants from various sources — crafting perks, exploration perks, interpersonal perks, intrigue perks, lore perks, supernatural perks. Each perk is a single mechanical effect (a skill, a bonus, a granted feature).

Source: `Perks/` (6 categories).

## B10. Complications (100)

Character flaws + their mechanical implications. Each complication has a benefit and a drawback that fold into the runtime numbers and condition triggers. Phase 2b.4 (conditional / triggered attachments) closes the engine-eval surface complications need.

Source: `Complications/` (100 folders).

## B11. Treasures, non-consumable (4 categories)

Leveled treasures, trinkets, magic items, artifacts. Non-consumable means equipped or carried persistently. Each tier has different rules (leveled scale with level, artifacts have quest-binding, etc.). Phase 2b.1 + 2b.3 cover per-echelon stat-mod scaling and kit-keyword leveled-treasure bonuses.

Source: `Treasures/` (4 folders).

## B12. Consumables

One-shot use items (potions, scrolls, oils). Activated via the Use Consumable maneuver. Distinct from B11 because they're spent rather than persisted, and their intent shape is different (consume + apply effect, no equipped state).

Source: `Treasures/Consumables/` (or wherever the consumables file lives).

---

## Notes on scope

A few items in the rules are pure narrative scaffolding the engine doesn't need to encode:

- Objective endings, dramatic finish, event ending — these are all "the Director declares combat over." The engine just needs `EndEncounter` to accept a reason string.
- Fleeing foes / chasing down — narrative-only.
- Argument timer for player deliberation — out-of-band.
- Alternative turn order (Agility-test-based) — explicitly optional in the rules; defer unless someone asks.
