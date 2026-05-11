# Phase 1 — monster ingest extension (design)

Date: 2026-05-10
Status: in progress
Owner: data-layer agent (worktree)

## Goal

Today's `packages/data` ingest emits only `{id, name, level}` for each
SteelCompendium statblock. The encounter builder downstream stubs every monster
at 20 stamina with zero characteristics — so combat is unplayable.

This slice extends the ingest to emit a real `Monster` record with stamina, EV,
immunities, weaknesses, characteristics, speed, size, stability, free strike,
movement modes, and an `abilities[]` list with structured ability cards.
Downstream consumers (encounter builder, combat run screen, monster codex) can
then construct real `Participant`s and render real ability cards.

## Scope (this worktree)

This worktree was branched off `Phase 1 slice 3` (`fbffb57`), so it does not
contain `EncounterBuilder.tsx`, `DetailPane.tsx`, `AbilityCard.tsx`,
`monsterAbilities.ts`, or `useMonsters.ts` — those live on `master` from
slices 9/10/11. A parallel agent owns the UI lane.

**This worktree owns:**

- `packages/data/src/parse-monster.ts` — parser
- `packages/data/build.ts` — script wiring
- `packages/shared/src/data/monster.ts` — output schema
- `packages/data/tests/parse-monster.spec.ts` — unit tests

**Out of scope here (orchestrator will reconcile at merge):**

- Touching `EncounterBuilder.tsx` / `DetailPane.tsx` / `AbilityCard.tsx` /
  `monsterAbilities.ts` — they don't exist on this branch
- Editing `participant.ts` (parallel agent's territory; the schema there
  already has fields we need, and adding more is their lane)
- Anything in `packages/rules/` or `apps/api/`

## Output schema additions

`MonsterSchema` gains:

```ts
ev: { ev: number, eliteEv?: number, note?: string }
stamina: { base: number, withCaptain?: number }
immunities: TypedResistance[]
weaknesses: TypedResistance[]
speed: number
movement: MovementMode[]   // walk implicit; explicit list captures fly/climb/swim/burrow/teleport/hover
size: string               // e.g. "1S", "1M", "1L", "2L"
stability: number
freeStrike: number
withCaptain?: string       // narrative bonus string; structured parsing comes later
characteristics: Characteristics  // already a Zod schema in shared
roles: string[]            // e.g. ["Minion Ambusher"], ["Solo"]
ancestry: string[]         // e.g. ["Goblin", "Humanoid"]
abilities: Ability[]
```

Where `Ability` is a new schema:

```ts
{
  name: string,
  type: 'action' | 'maneuver' | 'triggered' | 'free-triggered' | 'villain' | 'trait',
  cost?: string,                    // "Signature Ability", "2 Malice", "Villain Action 1"
  keywords: string[],               // ["Charge", "Melee", "Strike", "Weapon"]
  distance?: string,                // raw text — "Melee 1", "Ranged 10", "5 cube within 20"
  target?: string,                  // raw text — "One creature", "Each enemy in the area"
  powerRoll?: {
    characteristic: '+0'..'+5' (string),  // raw bonus text — "+2"
    tier1: string,                  // raw "≤11" effect text
    tier2: string,                  // raw "12-16" effect text
    tier3: string,                  // raw "17+" effect text
  },
  effect?: string,                  // free text below the roll table
  trigger?: string,                 // for triggered actions
  raw: string,                      // full block text — UI always-correct fallback
}
```

Per `docs/data-pipeline.md` rule #1, we keep the raw text **and** the structured
parse. UI can show `raw`; engine reads structured fields where available.

### Immunity / weakness shape

The body table reads e.g. `**Poison 2**`, `**Fire 5**`, `**Corruption 4, poison 4**`,
or rare narrative `**Cold, fire, or lightning**`.

Parser produces `TypedResistance[]` from comma-split tokens. Each token is
`<DamageType> <int>`. If the value is missing (narrative-only), parser logs
the original text into `monster.notes.immunityRaw` (loss is acceptable for v1
— the raw string is preserved for the UI). `Damage <int>` (untyped damage
immunity) maps to `{ type: 'untyped', value: int }`.

### EV shape

EV strings include `"3"`, `"19"`, `"19/40"` (elite), `"3 for 4 minions"`,
`"156"`. Parser:

- `19/40` → `{ ev: 19, eliteEv: 40 }`
- `3 for 4 minions` → `{ ev: 3, note: 'for 4 minions' }`
- plain int → `{ ev: 3 }`

## Parser strategy

Two passes:

1. **Frontmatter pass** — `gray-matter`. Pulls level, characteristics, speed,
   stamina (base), free_strike, size, stability, ancestry, roles, ev (string),
   item_name. Already wired; we extend it.
2. **Body pass** — split on `<!-- -->` separators to get blocks. The first
   block is the stat table; later blocks are abilities/features.
   - Stat table: parse the three-row markdown grid for Immunity / Weakness /
     Movement / With Captain values via cell regex
     `\*\*([^*]+)\*\*<br/>\s*Immunity` style.
   - Ability blocks: each starts with an icon + `**Name**` line. Identify type
     by icon: `🗡` strike (action), `🏹` ranged-strike (action), `🔳` area
     (action), `⭐️` trait, `❗️` triggered, `☠️` villain or solo trait,
     `🌀` maneuver. Some blocks have an action-type label in the right column
     (`**Main Action**`, `**Maneuver**`, `**Triggered action**`,
     `**Villain Action N**`) which is the authoritative source — we prefer it
     over the icon when both are present.
   - Power-roll parsing: look for a line `**Power Roll + N:**` followed by
     three bullets `**≤11:** …`, `**12-16:** …`, `**17+:** …`. Both ASCII
     `<=` and unicode `≤` show up in the source; tolerate both.
   - Effect parsing: the paragraph after `**Effect:**`, up to next bold
     keyword (`**Special:**`, `**Trigger:**`, `**N Malice:**`, etc.).
   - Defensive: any malformed block records its raw text and an `unparsed: true`
     flag rather than crashing the file. The build emits a coverage % per
     field at the end.

## Fixture monsters for tests

Picked for variety:

1. **Goblin Warrior** (level 1, horde) — vanilla action + malice-cost +
   trait
2. **Angulotl Cleaver** (level 1, minion) — typed immunity ("Poison 2"),
   with-captain bonus, jump effect
3. **Ajax the Invincible** (level 11, solo) — boss tier (level >10),
   multiple triggered actions, villain actions, narrative trait,
   "I'm Not Done Yet" feature
4. **Bale Eye demon** (mid-level) — typed weakness ("Holy 5")

Each fixture is included inline in the test file (raw markdown string),
mirroring the existing slice-2 pattern.

## EncounterBuilder integration (NOT in this worktree)

A future merge will:

- Replace the 20 HP / zero-characteristics stub with a constructor that takes
  a `Monster` record and produces a `Participant`:
  - `currentStamina = maxStamina = monster.stamina.base`
  - `characteristics = monster.characteristics`
  - `immunities = monster.immunities`
  - `weaknesses = monster.weaknesses`
- Replace `monsterAbilities.ts` stub Strike with `monster.abilities[]` read
  directly. AbilityCard renders from the structured fields (with raw fallback).

Flagged for orchestrator: `Participant` may need `level`, `size`, `speed`,
`stability`, `freeStrike`, `roles` fields when slice 6 (condition gating) and
slice 11 (combat run UI) need them — the parallel agent owns that schema.
Nothing this worktree emits is wider than what those slices already need.

## Coverage tracking (measured)

`build.ts` accumulates per-field counters and prints a summary. Actual numbers
from the current data-md pin:

```
build:data — wrote 416 monsters to apps/web/public/data/monsters.json
  source files scanned: 416
  parsed monsters:      416  (100.0%)
  coverage:
    stamina:           416/416  (100.0%)
    ev:                409/416  (98.3%)
    characteristics:   415/416  (99.8%)
    abilities:         416/416  (100.0%)
    any immunity:      140/416  (33.7%)
    any weakness:      44/416  (10.6%)
    ability blocks:    1770/1770  (100.0%)
```

The 7 monsters with EV = 0 are legitimately "no EV": Noncombatant template
and the six Xorannox sub-eyes (Compulsion / Mover / Necrotic / Toxic /
Zapper / Demolition Eye), which exist only as components of the parent
boss and have `ev: '-'` in source.

Immunity and weakness coverage is low because most monsters have neither;
this is by design in the source (140 monsters do have at least one).

## Gotchas observed

- `ev` can be a string in YAML (`'3'`) or unquoted (`3`); both must parse.
  Also: minion EVs read `"3 for 4 minions"`, captain EVs read `"19/40"` —
  the `/` is the elite-tier split.
- `size` is a free-form string (`"1S"`, `"1M"`, `"2L"`); we store as-is.
- Immunity tokens can be `"Holy 5"` (capitalized type) or `"holy 5"` —
  lowercase before matching against `DAMAGE_TYPES`.
- The "Damage N" untyped immunity exists (e.g. some constructs) — map to
  `untyped`.
- Some monsters have `Cold, fire, or lightning` as immunity — that's
  narrative "creature choice at start of combat". We can't structurally
  represent it; capture the raw text into a `narrativeImmunity` note and
  emit no `TypedResistance` for it.
- A few solo bosses have trait blocks with no action-type label at all
  (Ajax's "Ajax" trait at top); detect by absence of the `|` table and
  classify as `trait`.
- "Effect:" can appear multiple times in a block (e.g. ability effect +
  malice option). We capture the first as the canonical `effect`; further
  bold sections fall into `raw` only.

## Verification gates

```
pnpm -F @ironyard/data test
pnpm test
pnpm typecheck
pnpm lint
pnpm -F @ironyard/data build:data
```

Re-run ingest and confirm coverage threshold. Paste raw output in commit /
summary.
