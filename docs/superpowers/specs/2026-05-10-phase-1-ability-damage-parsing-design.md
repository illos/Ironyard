# Phase 1 — Real ability damage parsing + UI passthrough

Status: in-progress (2026-05-10)
Owner: parallel agent (worktree `agent-a4c59b35103ff472b`)

## Why

Slice 11 shipped the combat run loop on top of a synthetic level-scaled `Strike`
stub (`apps/web/src/data/monsterAbilities.ts`). The monster ingest extension
(2026-05-09) populated `monsters.json` with real ability blocks — but per-tier
outcomes are stored as raw markdown strings like `"6 damage; push 2"`. The
RollPower payload requires a structured `{ damage, damageType }` ladder, so the
UI cannot feed real abilities into the engine: the director has to open the
rulebook to know what each tier does.

This is the biggest gap remaining against Phase 1's "run a session without
paper" bar. Fixing it:

1. Adds a tier-outcome parser in `packages/data`.
2. Extends `PowerRollSchema` so each tier carries `{ raw, damage, damageType,
   effect }` — `raw` preserved (UI must always be honest), structured fields
   optional.
3. Replaces `StubAbility` in the combat UI with passthrough of the real
   `Ability` shape.
4. Keeps a single PC fallback (`Free Strike`) since the data layer doesn't
   ingest PC abilities until Phase 2.

## Observed tier shapes (from a fresh `pnpm -F @ironyard/data build:data` run)

1926 total tier outcomes across 416 monsters and 1770 ability blocks. Sampled
30 random:

```
"15 damage; slide 3; M < 3 5 acid damage"
"2 psychic damage"
"Pull 10; I < 4 slowed (save ends)"
"2 damage"
"19 lightning damage; the lightning spreads 2 squares; I < 4 dazed (save ends)"
"The target regains 12 Stamina and the Director gains 3 Malice."
"7 cold damage"
"5 damage; the target takes a bane on their next strike"
"11 damage; A < 3 grabbed"
"1 damage"
"19 damage; P < 4 the target can't hide (save ends)"
"2 damage; push 1"
"14 damage; A < 3 bleeding and dazed (save ends)"
"3 damage"
"5 psychic damage; A < 2 the target is warped (save ends)"
"Prone; I < 2 can't stand (save ends)"
"Vertical push 3"
"16 damage; M < 3 prone"
"2 damage; M < 0 bleeding (save ends)"
"13 damage; R < 2 dazed and slowed (EoT)"
"25 holy damage; A < 6 weakened (save ends)"
"10 damage; the effect ends at the end of Lord Syuul's next turn"
"10 damage; A < 3 bleeding and weakened (save ends)"
"9 cold damage; P < 5 slowed (save ends); the wraith shifts up to 3 squares"
"12 fire damage; A < 1 the target is burning (save ends)"
"8 sonic damage; slide 5, the maestro shifts up to 5 squares"
"R < 3 slowed (save ends)"
"6 damage; push 3; the target gains 1 rage"
"13 damage; push 3"
"7 damage"
```

Patterns:

- **Damage-leading (1782 / 1926 = 92.5%)**: `N damage` or `N <type> damage`,
  optionally followed by `; <effect text>`.
- **Effect-only (144 / 1926 = 7.5%)**: starts with a movement verb (`Pull`,
  `Push`, `Slide`, `Prone`), a save clause (`M < 3 ...`), or a healing /
  narrative sentence. No leading number-damage clause.

Damage-type distribution: 1166 untyped, 167 corruption, 111 psychic, 107 fire,
72 poison, 49 acid, 36 lightning, 31 cold, 24 holy, 19 sonic. **All types map
cleanly to the existing `DAMAGE_TYPES` enum.** Zero unknown types across the
corpus.

Notably absent: no `miss:` / `graze:` / `hit:` / `crit:` prefixes in any tier
string. No `≤11:` / `12-16:` / `17+:` re-emitted prefix either — the parser
already stripped those when extracting the tier string from markdown. Both
prefix sets get defensive code in `parseTierOutcome` for forward compat, but
zero cases exist today.

## Schema change (`packages/shared/src/data/monster.ts`)

```ts
export const TierOutcomeSchema = z.object({
  raw: z.string(),                                          // always preserved
  damage: z.number().int().nonnegative().nullable(),        // null = no damage clause
  damageType: DamageTypeSchema.optional(),                  // present iff damage non-null
  effect: z.string().optional(),                            // post-damage suffix
});
export type TierOutcome = z.infer<typeof TierOutcomeSchema>;

export const PowerRollSchema = z.object({
  bonus: z.string().min(1),
  tier1: TierOutcomeSchema,
  tier2: TierOutcomeSchema,
  tier3: TierOutcomeSchema,
});
```

`bonus` stays a raw string. The combat UI derives the `Characteristic` enum
from it (see "characteristic mapping" below). `Ability.raw` stays for full-card
fallback.

## Parser (`packages/data/src/parse-monster.ts`)

```ts
export function parseTierOutcome(raw: string): TierOutcome
```

Behavior:

1. Defensive prefix strip: leading `(<=|≤|miss|graze|hit|crit)\s*[:\-]?\s*` —
   trim if present, otherwise unchanged. These don't appear in current data.
2. Damage regex: `^(\d+)\s+(?:([A-Za-z]+)\s+)?damage\b`.
   - Group 1 → `damage` integer.
   - Group 2 → `damageType`, lowercased; if absent or `damage` literal →
     `untyped`; if not in `DAMAGE_TYPES` → fall back to `untyped` AND keep the
     unknown word in `effect` (defensive; zero cases today).
3. Effect = everything after the damage clause and its optional terminator
   (`[;,]?\s*` then whitespace), trimmed. Empty → omit `effect`.
4. No damage match → `{ raw, damage: null, effect: raw.trim() || undefined }`.
   We still surface raw text in `effect` so UI can render it directly.
5. `raw` is always echoed verbatim.

Edge cases covered by tests:

- `"2 damage"` → `{ damage: 2, damageType: 'untyped' }`, no effect.
- `"5 fire damage"` → `{ damage: 5, damageType: 'fire' }`.
- `"3 damage; push 1"` → `{ damage: 3, damageType: 'untyped', effect: 'push 1' }`.
- `"6 damage and the target is Slowed (save ends)"` → damage parsed, effect = 
  the rest. (Note: `; ` and ` and ` separators both supported.)
- `"the target is Restrained until end of next turn"` → `damage: null`, effect 
  = full text.
- `"M < 3 restrained (save ends)"` → `damage: null`, effect = full text.
- `"25 holy damage; A < 6 weakened (save ends)"` → `damage: 25`, type holy,
  effect = `A < 6 weakened (save ends)`.

Hook the parser into the existing `parsePowerRoll` flow so each tier1/tier2/
tier3 is parsed at ingest.

## Coverage expectation

Sampled corpus: 92.5% of tier outcomes have `damage` parsed; 7.5% are
effect-only. The build script will report this number in its summary log.

## UI consumer refactor

### Delete the synthetic Strike

Reduce `apps/web/src/data/monsterAbilities.ts` to one export: `pcFreeStrike()`
returns a single `Ability`-shaped free strike (untyped, simple 2/5/8 ladder,
characteristic = might). This is the only stub still needed since PCs don't
ingest abilities until Phase 2.

### Pull real abilities in `DetailPane.tsx`

The monster's `Ability[]` is already available via `useMonsters().data` — see
`monsterLevelById` in `CombatRun.tsx`. Pass a per-monster lookup map down to
`DetailPane`:

```ts
// CombatRun.tsx
const monsterById = useMemo(() => {
  const map = new Map<string, Monster>();
  for (const p of activeEncounter?.participants ?? []) {
    if (p.kind !== 'monster') continue;
    const base = p.id.replace(/-instance-\d+$/, '');
    const m = monsters.data?.monsters.find((mm) => mm.id === base);
    if (m) map.set(p.id, m);
  }
  return map;
}, [monsters.data, activeEncounter]);
```

`DetailPane` reads abilities for `focused`:

```ts
const abilities: Ability[] =
  focused.kind === 'monster'
    ? (monsterById.get(focused.id)?.abilities.filter((a) => a.powerRoll) ?? [])
    : [pcFreeStrike()];
```

We filter out abilities with no `powerRoll` from the rollable list — traits
and pure-effect abilities don't take a roll. They're still discoverable on the
monster page; this is just for the combat-run rollable list.

### Refactor `AbilityCard.tsx`

`AbilityCard` now takes the real `Ability` shape. Renders:

- **Header**: name + type chip + cost chip (if present) + keywords as small 
  chips.
- **Distance / target**: small subtitle if present.
- **Tier ladder (three rows)**: `t1 / t2 / t3` each shows parsed damage 
  prominently (`2 dmg` or `5 fire`) and the effect text under it. `raw` lives 
  in `title` attribute for fallback.
- **Auto-roll button**: dispatches `RollPower` with a damage ladder built from 
  parsed tiers. Tiers with `damage: null` send `damage: 0` (so the engine 
  applies no damage; the director reads the effect text from the toast and 
  dispatches a SetCondition follow-up manually).
- **Manual button**: same affordance as today — pick tier 1 / 2 / 3 explicitly.

### Characteristic mapping

`PowerRoll.bonus` is a raw `"+N"` string (e.g. `"+2"`). The combat UI needs to
hand RollPower a `Characteristic` enum value. Per the data agent's spec, the
bonus is the characteristic add; the SteelCompendium markdown does encode the
characteristic via the column the bonus appears under, but the current parser
collapses to `"+N"` only. For now we default to `'might'` for every monster
ability — same default the stub used. A follow-up data-layer change can
surface the characteristic name; out of scope for this slice.

## Test fixtures

Re-use existing parser fixtures (`goblinWarrior`, `angulotlCleaver`, `baleEye`,
`ajaxBoss`) — they cover untyped, typed (fire/corruption), and damage-with-
suffix patterns. Update assertions in `parse-monster.spec.ts` from comparing
tier strings to comparing `TierOutcome` objects.

Add a dedicated `parseTierOutcome` unit test block (in the same spec file)
exercising the corner cases listed above without needing full monster
fixtures.

## Fallback behavior

- Parser failure (regex doesn't match): emit `{ raw, damage: null }` with full 
  raw text in `effect`. Never throws.
- Unknown damage type: defensively fall back to `untyped` (today: no cases in 
  corpus).
- UI must always render `raw` somewhere reachable (title attribute on the 
  tier row) so the director sees the source string if our parse is wrong.

## Out of scope (punted)

- Surfacing the *characteristic* (might / agility / etc.) from PowerRoll. The
  bonus is captured as a signed integer; the column-header characteristic is
  not. Defaulting to `'might'` matches the stub. Phase 1.5 / 2 data work.
- Parsing the secondary clauses (push, slide, save targets) into structured
  intents. They stay as free-text `effect` on the tier outcome; engine has no
  hook for them today.
- Manual override stack for damage type (e.g. director switching a tier to
  acid). Out of scope; manual button still picks a tier wholesale.
- PC ability ingest. Phase 2.
