# Pass 2b2a — Combat-Tracker UI Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the four locked Pass-2b2a inventory items — monster stat-block deepening with rank-tinted rails (B4), hero resource/recoveries cells + taller inline-readout stamina bar (B4 follow-on), three-column tier-grid AbilityCard with inline Roll button (B3), refactored OpenActions row with for-you signal (B5), and the nine-hue per-condition palette (B6) — per the [Pass 2b2a spec](../specs/2026-05-14-phase-5-layer-1-base-pass-2b2a-combat-tracker-design.md).

**Architecture:** One small reducer touch at `StartEncounter` denormalizes monster meta (role/ancestry/size/speed/stability/freeStrike/ev/withCaptain) + PC className onto the Participant. The rest is UI: new `RoleReadout` / `MonsterStatBlock` / `HeroResourceCell` / `HeroRecoveriesCell` / `RollOverflowPopover` / `OpenActionRow` components composed onto existing primitives; an `HpBar variant: 'inline'` addition (preserves the existing `compact` and `size` modes); 15 new CSS variables in `tokens.css` (6 rank palette + 9 condition palette); a `targetCharacteristic` regex addition to `parse-ability.ts`; `ConditionChip.COLORS` rewrite for nine distinct hues.

**Tech Stack:** TypeScript strict mode, React 19, Vite, Tailwind 4 (CSS-variable theme tokens), Zod schemas, Radix Popover (already in graph), Vitest + Testing Library, Drizzle (no schema changes here).

---

## File structure

```
packages/shared/src/
├── participant.ts                           +9 nullable monster/PC meta fields
└── data/ability.ts                          +optional targetCharacteristic field

packages/rules/src/
└── intents/start-encounter.ts               stamps the new fields at materialization

packages/data/src/
└── parse-ability.ts                         emits targetCharacteristic when extractable

apps/web/src/
├── theme/
│   └── tokens.css                           +6 rank + 9 cond + 3 hp-dim CSS variables
├── tailwind.config.ts                       extend with rank.*, cond.*, hp.*-dim namespaces
├── primitives/
│   ├── HpBar.tsx                            +variant: 'inline' mode (22px + inset text)
│   └── ParticipantRow.tsx                   stamina cell → single inline HpBar (140px)
├── pages/combat/
│   ├── ConditionChip.tsx                    COLORS rewrite (9 distinct hues)
│   ├── AbilityCard.tsx                      full rewrite — tier-grid + inline Roll + overflow
│   ├── OpenActionsList.tsx                  primitive-based wrapper
│   ├── OpenActionRow.tsx                    NEW — single-row component
│   ├── RollOverflowPopover.tsx              NEW — manual-tier popover (Radix)
│   ├── PartyRail.tsx                        populates resource + recoveries slots
│   ├── detail/
│   │   ├── FullSheetTab.tsx                 monster branch composes MonsterStatBlock
│   │   ├── DetailHeader.tsx                 +rank pill + ancestry chips
│   │   └── MonsterStatBlock.tsx             NEW — rulebook stat-block
│   └── rails/
│       ├── rail-utils.ts                    summarizeRole rewrite (discriminated tuple)
│       ├── RoleReadout.tsx                  NEW — rank-pill + family + level
│       ├── rank-palette.ts                  NEW — RANK_PALETTE table
│       ├── HeroResourceCell.tsx             NEW — label + 8-pip + overflow
│       └── HeroRecoveriesCell.tsx           NEW — label + current/max
├── lib/
│   └── format-expiry.ts                     NEW — formatExpiry helper
└── styles.css                               removes .open-actions-list* CSS classes
```

---

## Task 1: CSS tokens — rank palette, condition palette, hp-dim

**Files:**
- Modify: `apps/web/src/theme/tokens.css`
- Modify: `apps/web/tailwind.config.ts`

No tests — pure styling tokens, verified by visual render in later tasks.

- [ ] **Step 1: Add 18 new CSS variables to `tokens.css`**

Append inside the existing `:root { ... }` block in `apps/web/src/theme/tokens.css`:

```css
  /* Pass 2b2a — monster rank palette (categorical) */
  --rank-min: oklch(0.74 0.004 80);            /* neutral gray */
  --rank-hor: oklch(0.72 0.10 150);            /* green */
  --rank-pla: oklch(0.74 0.10 200);            /* teal */
  --rank-eli: oklch(0.78 0.12 280);            /* violet */
  --rank-led: oklch(0.78 0.14 60);             /* amber */
  --rank-sol: oklch(0.66 0.22 25);             /* foe-red */

  /* Pass 2b2a — per-condition palette (nine distinct hues) */
  --cond-bleed:  oklch(0.66 0.22 25);          /* red       — DoT */
  --cond-daze:   oklch(0.74 0.14 290);         /* violet    — mental */
  --cond-fright: oklch(0.74 0.14 330);         /* magenta   — fear */
  --cond-grab:   oklch(0.78 0.14 60);          /* amber     — physical hold */
  --cond-prone:  oklch(0.74 0.10 90);          /* olive     — physical */
  --cond-restr:  oklch(0.70 0.14 40);          /* orange    — physical hold */
  --cond-slow:   oklch(0.78 0.14 130);         /* yellow-green — mobility */
  --cond-taunt:  oklch(0.78 0.14 250);         /* blue      — mental */
  --cond-weak:   oklch(0.72 0.06 240);         /* gray-blue — debuff */

  /* Pass 2b2a — desaturated HP zone pairs for the inline-variant stamina bar */
  --hp-good-dim: oklch(0.50 0.12 150);
  --hp-warn-dim: oklch(0.55 0.14 60);
  --hp-bad-dim:  oklch(0.42 0.18 25);
```

- [ ] **Step 2: Extend Tailwind config to expose the new tokens**

Edit `apps/web/tailwind.config.ts`. Inside `theme.extend.colors`, add three new namespace entries alongside the existing `ink`, `accent`, `hp`, etc.:

```ts
rank: {
  min: 'var(--rank-min)',
  hor: 'var(--rank-hor)',
  pla: 'var(--rank-pla)',
  eli: 'var(--rank-eli)',
  led: 'var(--rank-led)',
  sol: 'var(--rank-sol)',
},
cond: {
  bleed:  'var(--cond-bleed)',
  daze:   'var(--cond-daze)',
  fright: 'var(--cond-fright)',
  grab:   'var(--cond-grab)',
  prone:  'var(--cond-prone)',
  restr:  'var(--cond-restr)',
  slow:   'var(--cond-slow)',
  taunt:  'var(--cond-taunt)',
  weak:   'var(--cond-weak)',
},
```

Extend the existing `hp` entry to add the `-dim` keys:

```ts
hp: {
  good:     'var(--hp-good)',
  warn:     'var(--hp-warn)',
  bad:      'var(--hp-bad)',
  'good-dim': 'var(--hp-good-dim)',
  'warn-dim': 'var(--hp-warn-dim)',
  'bad-dim':  'var(--hp-bad-dim)',
},
```

- [ ] **Step 3: Verify the dev server compiles**

Run: `pnpm --filter @ironyard/web dev`
Expected: server starts on 5173 (or 5174) with no Tailwind config errors. Visit any page — visual output unchanged at this point.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/theme/tokens.css apps/web/tailwind.config.ts
git commit -m "feat(web/theme): rank + condition palette + hp-dim tokens for Pass 2b2a"
```

---

## Task 2: ParticipantSchema — monster meta + PC className fields

**Files:**
- Modify: `packages/shared/src/participant.ts`
- Test: `packages/rules/tests/participant-schema.spec.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `packages/rules/tests/participant-schema.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ParticipantSchema } from '@ironyard/shared';

describe('Pass 2b2a ParticipantSchema additions', () => {
  it('defaults the new monster-meta + PC-className fields to null/[] when omitted', () => {
    const minimal = {
      id: 'p1',
      name: 'Korva',
      kind: 'pc' as const,
      currentStamina: 50,
      maxStamina: 80,
      characteristics: { might: 2, agility: 1, reason: 0, intuition: 0, presence: -1 },
    };
    const parsed = ParticipantSchema.parse(minimal);
    expect(parsed.role).toBeNull();
    expect(parsed.ancestry).toEqual([]);
    expect(parsed.size).toBeNull();
    expect(parsed.speed).toBeNull();
    expect(parsed.stability).toBeNull();
    expect(parsed.freeStrike).toBeNull();
    expect(parsed.ev).toBeNull();
    expect(parsed.withCaptain).toBeNull();
    expect(parsed.className).toBeNull();
  });

  it('accepts populated monster-meta + className fields', () => {
    const monster = {
      id: 'm1',
      name: 'Knight Heretic',
      kind: 'monster' as const,
      currentStamina: 52,
      maxStamina: 52,
      characteristics: { might: 3, agility: 1, reason: -1, intuition: 0, presence: 2 },
      role: 'Elite Defender',
      ancestry: ['Human'],
      size: '1M',
      speed: 5,
      stability: 2,
      freeStrike: 5,
      ev: 12,
      withCaptain: '+1 to Free Strike',
    };
    const parsed = ParticipantSchema.parse(monster);
    expect(parsed.role).toBe('Elite Defender');
    expect(parsed.ancestry).toEqual(['Human']);
    expect(parsed.size).toBe('1M');
    expect(parsed.speed).toBe(5);
    expect(parsed.stability).toBe(2);
    expect(parsed.freeStrike).toBe(5);
    expect(parsed.ev).toBe(12);
    expect(parsed.withCaptain).toBe('+1 to Free Strike');
  });

  it('accepts a populated className on a PC participant', () => {
    const pc = {
      id: 'p2',
      name: 'Sir John',
      kind: 'pc' as const,
      currentStamina: 90,
      maxStamina: 120,
      characteristics: { might: 3, agility: 2, reason: 0, intuition: 1, presence: 1 },
      className: 'Censor',
    };
    expect(ParticipantSchema.parse(pc).className).toBe('Censor');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ironyard/rules test -- participant-schema`
Expected: FAIL — the new fields aren't on the schema yet, so the `.parse()` calls return participants without the asserted keys (test fails on `expect(parsed.role).toBeNull()`).

- [ ] **Step 3: Add the new fields to `ParticipantSchema`**

Edit `packages/shared/src/participant.ts`. Insert before the closing `})` of `ParticipantSchema`, after the existing `surprised` field:

```ts
  // Pass 5 Pass 2b2a — monster meta stamped at StartEncounter from the
  // monster definition. Null on PC participants and on pre-2b2a snapshots.
  role: z.string().nullable().default(null),
  ancestry: z.array(z.string()).default([]),
  size: z.string().nullable().default(null),
  speed: z.number().int().nullable().default(null),
  stability: z.number().int().nullable().default(null),
  freeStrike: z.number().int().nullable().default(null),
  ev: z.number().int().nullable().default(null),
  withCaptain: z.string().nullable().default(null),
  // Pass 5 Pass 2b2a — PC class display name stamped at StartEncounter from
  // the character blob. Null on monster participants and pre-2b2a snapshots.
  className: z.string().nullable().default(null),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ironyard/rules test -- participant-schema`
Expected: PASS — all three cases assert correctly.

- [ ] **Step 5: Verify the rest of the test suite still passes**

Run: `pnpm --filter @ironyard/rules test`
Expected: PASS. Existing snapshot tests must keep working — the new fields default to null/[] and don't disturb anything.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/participant.ts packages/rules/tests/participant-schema.spec.ts
git commit -m "feat(shared): ParticipantSchema — monster meta + PC className for Pass 2b2a"
```

---

## Task 3: AbilitySchema + parser — targetCharacteristic

**Files:**
- Modify: `packages/shared/src/data/ability.ts`
- Modify: `packages/data/src/parse-ability.ts`
- Test: `packages/data/tests/parse-ability.spec.ts` (existing — extend)

- [ ] **Step 1: Read the existing parser test to understand the fixture pattern**

Read: `packages/data/tests/parse-ability.spec.ts`

Confirm: the test uses raw markdown snippets passed to a `parseAbility(...)` function (or similar). Note the existing assertion style for `bonus`, `tier1`, etc.

- [ ] **Step 2: Write the failing test**

Append to `packages/data/tests/parse-ability.spec.ts` inside the existing `describe` block (or in a new `describe('targetCharacteristic', ...)` block at the bottom of the file):

```ts
describe('targetCharacteristic extraction', () => {
  it('extracts the target characteristic from a "vs X" power-roll header', () => {
    const md = `**Reaving Slash** (Signature Ability)
- Power Roll + Might vs Stamina
- ≤11: 3 damage
- 12-16: 5 damage
- 17+: 8 damage`;
    const parsed = parseAbility(md); // use the package's actual parser entry-point
    expect(parsed.targetCharacteristic).toBe('Stamina');
  });

  it('returns null when no "vs X" clause is present', () => {
    const md = `**Maintenance** (Maneuver)
- Effect: maintain your essence pool`;
    const parsed = parseAbility(md);
    expect(parsed.targetCharacteristic).toBeNull();
  });

  it('recognises all three target characteristics (Stamina, Reason, Reflexes)', () => {
    const reason = parseAbility(`**X**\n- Power Roll + Intuition vs Reason\n- ≤11: 0\n- 12-16: 0\n- 17+: 0`);
    expect(reason.targetCharacteristic).toBe('Reason');
    const reflexes = parseAbility(`**Y**\n- Power Roll + Agility vs Reflexes\n- ≤11: 0\n- 12-16: 0\n- 17+: 0`);
    expect(reflexes.targetCharacteristic).toBe('Reflexes');
  });
});
```

If the test file uses a different parser entry-point name, adjust accordingly — read the existing imports at the top of the file and reuse the same import.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @ironyard/data test -- parse-ability`
Expected: FAIL — `parsed.targetCharacteristic` is `undefined` because the field doesn't exist on the schema yet.

- [ ] **Step 4: Add the field to `AbilitySchema`**

Edit `packages/shared/src/data/ability.ts`. Add a new optional field after `sourceClassId`:

```ts
  // Pass 5 Pass 2b2a — the "vs X" half of the power-roll header.
  // Extracted by parse-ability.ts when the markdown contains a "vs Stamina"
  // / "vs Reason" / "vs Reflexes" clause. Null when the ability has no
  // standard power-roll header.
  targetCharacteristic: z.enum(['Stamina', 'Reason', 'Reflexes']).nullable().default(null),
```

- [ ] **Step 5: Add the parser regex**

Edit `packages/data/src/parse-ability.ts`. Inside the function body where the power-roll header is parsed (look for the existing regex that captures `bonus`), add a sibling extraction:

```ts
// Pass 2b2a — extract the target characteristic from the power-roll header.
// Matches "vs Stamina" / "vs Reason" / "vs Reflexes" anywhere in the header line.
const targetMatch = headerLine.match(/\bvs\s+(Stamina|Reason|Reflexes)\b/i);
const targetCharacteristic = targetMatch
  ? (targetMatch[1].charAt(0).toUpperCase() + targetMatch[1].slice(1).toLowerCase()) as 'Stamina' | 'Reason' | 'Reflexes'
  : null;
```

Adapt the variable name `headerLine` to whatever the parser already calls the line containing the power-roll header. Add `targetCharacteristic` to the return object that already carries `bonus`, `tier1`, etc.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @ironyard/data test -- parse-ability`
Expected: PASS — all three new cases assert correctly.

- [ ] **Step 7: Verify the broader data tests still pass**

Run: `pnpm --filter @ironyard/data test`
Expected: PASS. The new optional field defaults to `null` on existing fixtures.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/data/ability.ts packages/data/src/parse-ability.ts packages/data/tests/parse-ability.spec.ts
git commit -m "feat(shared,data): AbilitySchema + parser — targetCharacteristic for Pass 2b2a"
```

---

## Task 4: StartEncounter — stamp monster meta + PC className

**Files:**
- Modify: `packages/rules/src/intents/start-encounter.ts`
- Test: `packages/rules/tests/reducer-encounter.spec.ts` (existing — extend)

- [ ] **Step 1: Read the existing reducer test to understand fixture pattern**

Read: `packages/rules/tests/reducer-encounter.spec.ts`

Confirm: the existing tests dispatch `StartEncounter` against a seeded `CampaignState` with `staticMonsters` + character blobs. Look for how PC and monster participants get materialized — that's the path we're extending.

- [ ] **Step 2: Write the failing test**

Append to `packages/rules/tests/reducer-encounter.spec.ts` inside the existing `describe('StartEncounter', ...)` block (or a new sibling describe):

```ts
describe('Pass 2b2a — monster meta + PC className stamping', () => {
  it('stamps role / ancestry / size / speed / stability / freeStrike / ev / withCaptain onto monster participants', () => {
    const state = createBaseState({
      staticMonsters: {
        'knight-heretic-l5': {
          id: 'knight-heretic-l5',
          name: 'Knight Heretic',
          level: 5,
          roles: ['Elite Defender'],
          ancestry: ['Human'],
          size: '1M',
          speed: 5,
          stability: 2,
          freeStrike: 5,
          ev: { ev: 12, note: '' },
          withCaptain: '+1 to Free Strike',
          stamina: { base: 52 },
          immunities: [],
          weaknesses: [],
          characteristics: { might: 3, agility: 1, reason: -1, intuition: 0, presence: 2 },
          abilities: [],
        },
      },
    });
    const next = applyIntent(state, {
      type: 'StartEncounter',
      payload: {
        characterIds: [],
        monsters: [{ monsterId: 'knight-heretic-l5', count: 1 }],
      },
      actor: { userId: 'director', role: 'director' },
    });
    const monster = next.state.participants.find((p) => p.kind === 'monster');
    expect(monster?.role).toBe('Elite Defender');
    expect(monster?.ancestry).toEqual(['Human']);
    expect(monster?.size).toBe('1M');
    expect(monster?.speed).toBe(5);
    expect(monster?.stability).toBe(2);
    expect(monster?.freeStrike).toBe(5);
    expect(monster?.ev).toBe(12);
    expect(monster?.withCaptain).toBe('+1 to Free Strike');
  });

  it('stamps className onto PC participants from the character class registry', () => {
    const state = createBaseState({
      characters: {
        'char-1': {
          id: 'char-1',
          name: 'Korva',
          classId: 'tactician',
          // …other minimum-required character fields per existing fixtures
        },
      },
    });
    const next = applyIntent(state, {
      type: 'StartEncounter',
      payload: { characterIds: ['char-1'], monsters: [] },
      actor: { userId: 'director', role: 'director' },
    });
    const pc = next.state.participants.find((p) => p.kind === 'pc');
    expect(pc?.className).toBe('Tactician');
  });

  it('leaves monster-meta fields null on PC participants', () => {
    const state = createBaseState({ characters: { 'char-1': makePc({ id: 'char-1' }) } });
    const next = applyIntent(state, {
      type: 'StartEncounter',
      payload: { characterIds: ['char-1'], monsters: [] },
      actor: { userId: 'director', role: 'director' },
    });
    const pc = next.state.participants.find((p) => p.kind === 'pc');
    expect(pc?.role).toBeNull();
    expect(pc?.size).toBeNull();
  });
});
```

Adjust the `createBaseState` / `applyIntent` / `makePc` helper names to match the existing fixture functions in the test file. If the file uses different helpers, swap them in.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @ironyard/rules test -- reducer-encounter`
Expected: FAIL — the participant blobs created by `StartEncounter` don't yet carry `role`, `className`, etc.

- [ ] **Step 4: Extend `applyStartEncounter`**

Edit `packages/rules/src/intents/start-encounter.ts`. Find the section that materializes monster participants (look for a loop or map building participants from `payload.monsters`). Inside the participant construction:

```ts
// Pass 2b2a — denormalize monster meta onto the participant for the new
// rail readout + DetailPane Full-sheet stat-block.
role: monster.roles[0] ?? null,
ancestry: monster.ancestry ?? [],
size: monster.size ?? null,
speed: monster.speed ?? null,
stability: monster.stability ?? null,
freeStrike: monster.freeStrike ?? null,
ev: monster.ev?.ev ?? null,
withCaptain: monster.withCaptain ?? null,
```

Find the section that materializes PC participants from the character blob. Inside the PC participant construction, add:

```ts
// Pass 2b2a — class display name for the rail role readout.
// Resolves character.classId via the existing class registry used by the wizard.
className: resolveClassDisplayName(character.classId),
```

If `resolveClassDisplayName` doesn't exist, look for the wizard's class-lookup helper (likely in `apps/web/src/pages/characters/Wizard.tsx` or `packages/shared/src/class-registry.ts`). Reuse it. If it lives in `apps/web`, move it to `packages/shared` so the reducer can consume it without an import cycle.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @ironyard/rules test -- reducer-encounter`
Expected: PASS — all three new cases assert correctly.

- [ ] **Step 6: Verify the broader reducer suite still passes**

Run: `pnpm --filter @ironyard/rules test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/rules/src/intents/start-encounter.ts packages/rules/tests/reducer-encounter.spec.ts
# plus packages/shared/src/class-registry.ts if you moved the helper
git commit -m "feat(rules): StartEncounter stamps monster meta + PC className"
```

---

## Task 5: Rank palette table

**Files:**
- Create: `apps/web/src/pages/combat/rails/rank-palette.ts`
- Test: `apps/web/src/pages/combat/rails/rank-palette.spec.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/pages/combat/rails/rank-palette.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RANK_PALETTE, parseMonsterRole, type RankKey } from './rank-palette';

describe('RANK_PALETTE', () => {
  it('exposes six canonical ranks with 3-letter abbreviations', () => {
    expect(Object.keys(RANK_PALETTE).sort()).toEqual(
      ['Elite', 'Horde', 'Leader', 'Minion', 'Platoon', 'Solo']
    );
    const expectedAbbrs: Record<RankKey, string> = {
      Minion: 'MIN', Horde: 'HOR', Platoon: 'PLA',
      Elite: 'ELI', Leader: 'LED', Solo: 'SOL',
    };
    for (const [rank, expected] of Object.entries(expectedAbbrs)) {
      expect(RANK_PALETTE[rank as RankKey].abbr).toBe(expected);
    }
  });
});

describe('parseMonsterRole', () => {
  it('parses a rank-family role string into the discriminated parts', () => {
    expect(parseMonsterRole('Boss Brute')).toEqual({ rank: null, family: 'Boss Brute' });
    expect(parseMonsterRole('Elite Defender')).toEqual({ rank: 'Elite', family: 'Defender' });
    expect(parseMonsterRole('Minion Skirmisher')).toEqual({ rank: 'Minion', family: 'Skirmisher' });
    expect(parseMonsterRole('Solo Brute')).toEqual({ rank: 'Solo', family: 'Brute' });
  });

  it('returns the whole string as family when the leading word is not a known rank', () => {
    expect(parseMonsterRole('Controller')).toEqual({ rank: null, family: 'Controller' });
    expect(parseMonsterRole('\\-')).toEqual({ rank: null, family: '\\-' });
  });

  it('handles single-word role strings as unranked', () => {
    expect(parseMonsterRole('Brute')).toEqual({ rank: null, family: 'Brute' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ironyard/web test -- rank-palette`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement `rank-palette.ts`**

Create `apps/web/src/pages/combat/rails/rank-palette.ts`:

```ts
/**
 * Pass 5 Pass 2b2a — monster rank → display-pill palette.
 *
 * Six canonical Draw Steel ranks per the SteelCompendium ingest. Categorical
 * palette: each rank gets its own hue (gray / green / teal / violet / amber /
 * red). The 3-letter abbreviation keeps every pill the same width — full
 * words wouldn't fit alongside the level + family on a phone-portrait rail.
 *
 * Seven monsters in the current ingest have role strings that don't match
 * a known rank prefix ("Controller", "Artillery", "Hexer", "\\-"); those
 * render without a pill via `parseMonsterRole` returning `rank: null`.
 */

export const RANK_PALETTE = {
  Minion:  { abbr: 'MIN', cssVar: '--rank-min', tailwindClass: 'text-rank-min bg-rank-min/12 border-rank-min/40' },
  Horde:   { abbr: 'HOR', cssVar: '--rank-hor', tailwindClass: 'text-rank-hor bg-rank-hor/12 border-rank-hor/45' },
  Platoon: { abbr: 'PLA', cssVar: '--rank-pla', tailwindClass: 'text-rank-pla bg-rank-pla/12 border-rank-pla/45' },
  Elite:   { abbr: 'ELI', cssVar: '--rank-eli', tailwindClass: 'text-rank-eli bg-rank-eli/12 border-rank-eli/45' },
  Leader:  { abbr: 'LED', cssVar: '--rank-led', tailwindClass: 'text-rank-led bg-rank-led/14 border-rank-led/50' },
  Solo:    { abbr: 'SOL', cssVar: '--rank-sol', tailwindClass: 'text-rank-sol bg-rank-sol/16 border-rank-sol/55' },
} as const;

export type RankKey = keyof typeof RANK_PALETTE;

const KNOWN_RANKS = new Set(Object.keys(RANK_PALETTE) as RankKey[]);

export function parseMonsterRole(role: string): { rank: RankKey | null; family: string } {
  const parts = role.split(/\s+/);
  if (parts.length >= 2 && KNOWN_RANKS.has(parts[0] as RankKey)) {
    return { rank: parts[0] as RankKey, family: parts.slice(1).join(' ') };
  }
  return { rank: null, family: role };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ironyard/web test -- rank-palette`
Expected: PASS — all assertions correct.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/combat/rails/rank-palette.ts apps/web/src/pages/combat/rails/rank-palette.spec.ts
git commit -m "feat(web/combat): rank-palette + parseMonsterRole helper"
```

---

## Task 6: `RoleReadout` component

**Files:**
- Create: `apps/web/src/pages/combat/rails/RoleReadout.tsx`
- Test: `apps/web/src/pages/combat/rails/RoleReadout.spec.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/pages/combat/rails/RoleReadout.spec.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleReadout } from './RoleReadout';

describe('RoleReadout', () => {
  it('renders a rank pill + family when role parses cleanly', () => {
    render(<RoleReadout data={{ kind: 'monster-ranked', level: 5, rank: 'Elite', family: 'Defender' }} />);
    expect(screen.getByText('ELI')).toBeInTheDocument();
    expect(screen.getByText(/L5 · DEFENDER/i)).toBeInTheDocument();
  });

  it('renders family-only (no pill) for an unranked monster', () => {
    render(<RoleReadout data={{ kind: 'monster-unranked', level: 3, family: 'Controller' }} />);
    expect(screen.queryByText(/MIN|HOR|PLA|ELI|LED|SOL/)).not.toBeInTheDocument();
    expect(screen.getByText(/L3 · CONTROLLER/i)).toBeInTheDocument();
  });

  it('falls back to "L{level} · FOE" for a pre-2b2a monster snapshot', () => {
    render(<RoleReadout data={{ kind: 'monster-fallback', level: 4 }} />);
    expect(screen.getByText(/L4 · FOE/i)).toBeInTheDocument();
  });

  it('renders "L{level} · {CLASSNAME}" for a PC with a className', () => {
    render(<RoleReadout data={{ kind: 'pc', level: 5, className: 'Tactician' }} />);
    expect(screen.getByText(/L5 · TACTICIAN/i)).toBeInTheDocument();
  });

  it('falls back to "L{level} · HERO" when PC className is null', () => {
    render(<RoleReadout data={{ kind: 'pc', level: 2, className: null }} />);
    expect(screen.getByText(/L2 · HERO/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ironyard/web test -- RoleReadout`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement `RoleReadout.tsx`**

Create `apps/web/src/pages/combat/rails/RoleReadout.tsx`:

```tsx
import { RANK_PALETTE, type RankKey } from './rank-palette';

export type RoleReadoutData =
  | { kind: 'monster-ranked'; level: number; rank: RankKey; family: string }
  | { kind: 'monster-unranked'; level: number; family: string }
  | { kind: 'monster-fallback'; level: number }
  | { kind: 'pc'; level: number; className: string | null };

export interface RoleReadoutProps {
  data: RoleReadoutData;
}

/**
 * Renders the role-readout meta line inside a ParticipantRow's `role` slot.
 * Three monster variants (ranked, unranked, pre-2b2a fallback) plus PC.
 * Returns a mono-uppercase line composed in dimmed accent.
 */
export function RoleReadout({ data }: RoleReadoutProps) {
  if (data.kind === 'monster-ranked') {
    const palette = RANK_PALETTE[data.rank];
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`inline-block px-1 border ${palette.tailwindClass} font-mono text-[9px] tracking-[0.08em]`}
        >
          {palette.abbr}
        </span>
        <span>L{data.level} · {data.family.toUpperCase()}</span>
      </span>
    );
  }
  if (data.kind === 'monster-unranked') {
    return <span>L{data.level} · {data.family.toUpperCase()}</span>;
  }
  if (data.kind === 'monster-fallback') {
    return <span>L{data.level} · FOE</span>;
  }
  // pc
  const label = data.className ? data.className.toUpperCase() : 'HERO';
  return <span>L{data.level} · {label}</span>;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ironyard/web test -- RoleReadout`
Expected: PASS — all 5 cases assert correctly.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/combat/rails/RoleReadout.tsx apps/web/src/pages/combat/rails/RoleReadout.spec.tsx
git commit -m "feat(web/combat): RoleReadout component (rank-pill + family + level)"
```

---

## Task 7: Wire PartyRail + EncounterRail to consume RoleReadout

**Files:**
- Modify: `apps/web/src/pages/combat/rails/rail-utils.ts`
- Modify: `apps/web/src/pages/combat/PartyRail.tsx`
- Modify: `apps/web/src/pages/combat/EncounterRail.tsx`

- [ ] **Step 1: Rewrite `summarizeRole` to return the discriminated tuple**

Edit `apps/web/src/pages/combat/rails/rail-utils.ts`. Replace the existing `summarizeRole` with:

```ts
import type { Participant } from '@ironyard/shared';
import { parseMonsterRole } from './rank-palette';
import type { RoleReadoutData } from './RoleReadout';

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Resolve a Participant into the data shape RoleReadout consumes.
 * Pre-2b2a monster snapshots (role === null) fall back to the FOE readout.
 */
export function roleReadoutFor(p: Participant): RoleReadoutData {
  if (p.kind === 'monster') {
    if (p.role === null) {
      return { kind: 'monster-fallback', level: p.level };
    }
    const { rank, family } = parseMonsterRole(p.role);
    if (rank === null) {
      return { kind: 'monster-unranked', level: p.level, family };
    }
    return { kind: 'monster-ranked', level: p.level, rank, family };
  }
  return { kind: 'pc', level: p.level, className: p.className };
}
```

Delete the old stringly-typed `summarizeRole` export.

- [ ] **Step 2: Update PartyRail to use `roleReadoutFor` + `<RoleReadout>`**

Edit `apps/web/src/pages/combat/PartyRail.tsx`. Replace the import:

```ts
import { initials, roleReadoutFor } from './rails/rail-utils';
import { RoleReadout } from './rails/RoleReadout';
```

Replace the `role={isGated ? null : summarizeRole(h)}` prop on `<ParticipantRow>` with:

```tsx
role={isGated ? null : <RoleReadout data={roleReadoutFor(h)} />}
```

- [ ] **Step 3: Update EncounterRail the same way**

Edit `apps/web/src/pages/combat/EncounterRail.tsx`. Mirror the changes from Step 2.

- [ ] **Step 4: Verify dev server compiles and rails render**

Run: `pnpm --filter @ironyard/web dev`

Visit `/campaigns/<id>/play` for a campaign with an active encounter. Expected: hero rows show `L{level} · {className}` (or `L{level} · HERO` for pre-2b2a snapshots); monster rows show the rank pill + `L{level} · {family}` (or `L{level} · FOE` for pre-2b2a snapshots).

- [ ] **Step 5: Run the web test suite**

Run: `pnpm --filter @ironyard/web test`
Expected: PASS. Existing tests that reference `summarizeRole` need updating — search for the import and migrate to `roleReadoutFor`; any direct string assertion on the role-line needs to be updated to assert the rendered text.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/combat/rails/rail-utils.ts apps/web/src/pages/combat/PartyRail.tsx apps/web/src/pages/combat/EncounterRail.tsx
git commit -m "refactor(web/combat): PartyRail/EncounterRail consume RoleReadout"
```

---

## Task 8: `HeroResourceCell` component

**Files:**
- Create: `apps/web/src/pages/combat/rails/HeroResourceCell.tsx`
- Test: `apps/web/src/pages/combat/rails/HeroResourceCell.spec.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/pages/combat/rails/HeroResourceCell.spec.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroResourceCell } from './HeroResourceCell';
import type { Participant } from '@ironyard/shared';

function makePc(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'p1',
    name: 'Korva',
    kind: 'pc',
    ownerId: 'u1',
    characterId: 'c1',
    level: 5,
    currentStamina: 78,
    maxStamina: 110,
    characteristics: { might: 2, agility: 2, reason: 1, intuition: 0, presence: -1 },
    immunities: [],
    weaknesses: [],
    conditions: [],
    heroicResources: [{ name: 'Focus', value: 3, floor: 0 }],
    extras: [],
    surges: 0,
    recoveries: { current: 5, max: 8 },
    recoveryValue: 0,
    weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
    activeAbilities: [],
    victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false },
    surprised: false,
    role: null,
    ancestry: [],
    size: null,
    speed: null,
    stability: null,
    freeStrike: null,
    ev: null,
    withCaptain: null,
    className: 'Tactician',
    ...overrides,
  } as Participant;
}

describe('HeroResourceCell', () => {
  it('renders the resource name + filled/unfilled pip row', () => {
    render(<HeroResourceCell participant={makePc({ heroicResources: [{ name: 'Focus', value: 3, floor: 0 }] })} />);
    expect(screen.getByText('Focus')).toBeInTheDocument();
    const pips = screen.getAllByTestId('resource-pip');
    expect(pips).toHaveLength(8);
    expect(pips.filter((p) => p.dataset.filled === 'true')).toHaveLength(3);
  });

  it('fills all 8 pips + renders the +N overflow numeric when value > 8', () => {
    render(<HeroResourceCell participant={makePc({ heroicResources: [{ name: 'Ferocity', value: 10, floor: 0 }] })} />);
    const pips = screen.getAllByTestId('resource-pip');
    expect(pips.filter((p) => p.dataset.filled === 'true')).toHaveLength(8);
    expect(screen.getByText(/\+2/)).toBeInTheDocument();
  });

  it('renders nothing when the participant has no heroic resource', () => {
    const { container } = render(<HeroResourceCell participant={makePc({ heroicResources: [] })} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ironyard/web test -- HeroResourceCell`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement `HeroResourceCell.tsx`**

Create `apps/web/src/pages/combat/rails/HeroResourceCell.tsx`:

```tsx
import type { Participant } from '@ironyard/shared';

export interface HeroResourceCellProps {
  participant: Participant;
}

const PIP_COUNT = 8;

/**
 * Pass 5 Pass 2b2a — heroic-resource readout for the PartyRail row.
 * Shows the resource display name + an 8-pip row + an optional +N overflow
 * numeric when the value exceeds 8.
 *
 * Pip color reads `var(--pk, var(--accent))` — the per-row pack-class scope
 * (set by ParticipantRow's `pack` prop) overrides --pk when Layer 2 ships
 * color-pack persistence. Until then every PC's pips use the global accent.
 */
export function HeroResourceCell({ participant }: HeroResourceCellProps) {
  const resource = participant.heroicResources[0];
  if (!resource) return null;

  const filled = Math.min(resource.value, PIP_COUNT);
  const overflow = Math.max(0, resource.value - PIP_COUNT);

  return (
    <div className="flex flex-col items-end gap-1 leading-none">
      <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-text-mute">
        {resource.name}
      </span>
      <span className="flex gap-[2px]">
        {Array.from({ length: PIP_COUNT }, (_, i) => {
          const on = i < filled;
          return (
            <span
              key={i}
              data-testid="resource-pip"
              data-filled={on ? 'true' : 'false'}
              className={`h-[7px] w-[7px] rounded-full border ${
                on ? 'border-pk bg-pk' : 'border-line bg-ink-0'
              }`}
            />
          );
        })}
      </span>
      {overflow > 0 && (
        <span className="font-mono text-[10px] tabular-nums text-text-dim">
          +{overflow}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ironyard/web test -- HeroResourceCell`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/combat/rails/HeroResourceCell.tsx apps/web/src/pages/combat/rails/HeroResourceCell.spec.tsx
git commit -m "feat(web/combat): HeroResourceCell — 8-pip resource readout"
```

---

## Task 9: `HeroRecoveriesCell` component

**Files:**
- Create: `apps/web/src/pages/combat/rails/HeroRecoveriesCell.tsx`
- Test: `apps/web/src/pages/combat/rails/HeroRecoveriesCell.spec.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/pages/combat/rails/HeroRecoveriesCell.spec.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroRecoveriesCell } from './HeroRecoveriesCell';
import type { Participant } from '@ironyard/shared';

function makePc(recoveries: { current: number; max: number }): Participant {
  return {
    id: 'p1', name: 'Korva', kind: 'pc',
    ownerId: 'u1', characterId: 'c1', level: 5,
    currentStamina: 78, maxStamina: 110,
    characteristics: { might: 2, agility: 2, reason: 1, intuition: 0, presence: -1 },
    immunities: [], weaknesses: [], conditions: [],
    heroicResources: [], extras: [], surges: 0,
    recoveries, recoveryValue: 0,
    weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
    activeAbilities: [], victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false }, surprised: false,
    role: null, ancestry: [], size: null, speed: null, stability: null,
    freeStrike: null, ev: null, withCaptain: null, className: 'Tactician',
  } as Participant;
}

describe('HeroRecoveriesCell', () => {
  it('renders the Rec label + current/max readout', () => {
    render(<HeroRecoveriesCell participant={makePc({ current: 5, max: 8 })} />);
    expect(screen.getByText('Rec')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('/8')).toBeInTheDocument();
  });

  it('shows 0/0 when the pool is empty', () => {
    render(<HeroRecoveriesCell participant={makePc({ current: 0, max: 0 })} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('/0')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ironyard/web test -- HeroRecoveriesCell`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement `HeroRecoveriesCell.tsx`**

Create `apps/web/src/pages/combat/rails/HeroRecoveriesCell.tsx`:

```tsx
import type { Participant } from '@ironyard/shared';

export interface HeroRecoveriesCellProps {
  participant: Participant;
}

export function HeroRecoveriesCell({ participant }: HeroRecoveriesCellProps) {
  const { current, max } = participant.recoveries;
  return (
    <div className="flex flex-col items-end gap-1 leading-none">
      <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-text-mute">
        Rec
      </span>
      <span className="font-mono text-[11px] font-semibold tabular-nums text-text">
        {current}
        <span className="text-text-mute font-normal text-[9px]">/{max}</span>
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ironyard/web test -- HeroRecoveriesCell`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/combat/rails/HeroRecoveriesCell.tsx apps/web/src/pages/combat/rails/HeroRecoveriesCell.spec.tsx
git commit -m "feat(web/combat): HeroRecoveriesCell — current/max readout"
```

---

## Task 10: Wire PartyRail to populate resource + recoveries cells; lift gating

**Files:**
- Modify: `apps/web/src/pages/combat/PartyRail.tsx`

- [ ] **Step 1: Populate the slots**

Edit `apps/web/src/pages/combat/PartyRail.tsx`. Add imports:

```ts
import { HeroResourceCell } from './rails/HeroResourceCell';
import { HeroRecoveriesCell } from './rails/HeroRecoveriesCell';
```

Replace the two `resource` / `recoveries` props on `<ParticipantRow>` with:

```tsx
resource={<HeroResourceCell participant={h} />}
recoveries={<HeroRecoveriesCell participant={h} />}
```

Note: the existing player-view gating (`isGated ? null : undefined`) is replaced — both cells render for every viewer per the spec's "lift the player-view gating for resources + recoveries." Role-line gating (the `<RoleReadout>` slot above) stays as-is.

- [ ] **Step 2: Verify dev server renders the cells**

Run: `pnpm --filter @ironyard/web dev`

Visit a campaign with an active encounter that has at least one PC participant carrying a heroic resource (e.g., a Tactician with `Focus: 3`). Expected: the PartyRail row shows the Focus label, an 8-pip row with the first 3 filled, and `Rec 5/8` (or whatever the character's pool is).

- [ ] **Step 3: Run the web test suite**

Run: `pnpm --filter @ironyard/web test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/combat/PartyRail.tsx
git commit -m "feat(web/combat): PartyRail populates resource + recoveries cells"
```

---

## Task 11: `HpBar` variant: 'inline' mode

**Files:**
- Modify: `apps/web/src/primitives/HpBar.tsx`
- Test: `apps/web/src/primitives/HpBar.spec.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/primitives/HpBar.spec.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HpBar } from './HpBar';

describe('HpBar', () => {
  describe('compact (existing) variant', () => {
    it('renders a 4px bar with no inset text', () => {
      const { container } = render(<HpBar current={50} max={100} compact />);
      const bar = container.querySelector('[role="presentation"], [aria-hidden="true"]');
      expect(bar).toBeTruthy();
      expect(container.textContent).toBe('');
    });
  });

  describe('variant: "inline"', () => {
    it('renders the current/max readout inside a taller bar', () => {
      render(<HpBar current={78} max={110} variant="inline" />);
      expect(screen.getByText('78')).toBeInTheDocument();
      expect(screen.getByText('/110')).toBeInTheDocument();
    });

    it('uses hp-good styling when current >= 50% of max', () => {
      const { container } = render(<HpBar current={75} max={100} variant="inline" />);
      expect(container.innerHTML).toMatch(/hp-good/);
    });

    it('uses hp-warn styling when current is 25-50% of max', () => {
      const { container } = render(<HpBar current={30} max={100} variant="inline" />);
      expect(container.innerHTML).toMatch(/hp-warn/);
    });

    it('uses hp-bad styling when current is <25% of max', () => {
      const { container } = render(<HpBar current={10} max={100} variant="inline" />);
      expect(container.innerHTML).toMatch(/hp-bad/);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ironyard/web test -- HpBar`
Expected: FAIL — `variant: 'inline'` doesn't exist.

- [ ] **Step 3: Add the inline variant**

Edit `apps/web/src/primitives/HpBar.tsx`. Replace the whole file:

```tsx
export type HpBarProps = {
  current: number;
  max: number;
  /** Visual size; iPad detail pane uses 'lg', initiative panel rows use 'sm'. */
  size?: 'sm' | 'lg';
  /** Slim 4px-tall variant. The numeric label is the caller's responsibility. */
  compact?: boolean;
  /**
   * Pass 5 Pass 2b2a — 22px-tall variant with the current/max readout
   * centered inside. Used by ParticipantRow rails. Composes its own colors
   * (good/warn/bad fill + desaturated background pair) — caller renders no
   * external numeric label.
   */
  variant?: 'inline';
};

export function HpBar({ current, max, size = 'sm', compact = false, variant }: HpBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const zone = pct >= 0.5 ? 'good' : pct >= 0.25 ? 'warn' : 'bad';

  if (variant === 'inline') {
    return (
      <div
        className={`relative h-[22px] w-full overflow-hidden border border-line bg-hp-${zone}-dim`}
        aria-hidden="true"
      >
        <div
          className={`absolute inset-y-0 left-0 bg-hp-${zone} transition-[width] duration-300 ease-out`}
          style={{ width: `${pct * 100}%` }}
        />
        <div className="relative z-10 flex h-full items-center justify-center font-mono text-[13px] font-bold tabular-nums leading-none text-text [text-shadow:0_1px_2px_rgb(0_0_0/0.7)]">
          {current}
          <span className="text-text-dim font-medium text-[10px] ml-px opacity-85">/{max}</span>
        </div>
      </div>
    );
  }

  const color = `bg-hp-${zone}`;
  const height = compact ? 'h-1' : size === 'lg' ? 'h-3' : 'h-1.5';
  return (
    <div
      className={`w-full ${height} rounded-full bg-ink-3 overflow-hidden`}
      aria-hidden="true"
    >
      <div
        className={`${color} ${height} rounded-full transition-[width] duration-300 ease-out`}
        style={{ width: `${pct * 100}%` }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ironyard/web test -- HpBar`
Expected: PASS — both compact-preservation tests + all 4 inline tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/primitives/HpBar.tsx apps/web/src/primitives/HpBar.spec.tsx
git commit -m "feat(web/primitives): HpBar variant 'inline' — 22px bar with inset readout"
```

---

## Task 12: ParticipantRow stamina cell migration

**Files:**
- Modify: `apps/web/src/primitives/ParticipantRow.tsx`

- [ ] **Step 1: Migrate the stamina cell to a single inline HpBar**

Edit `apps/web/src/primitives/ParticipantRow.tsx`. Find the stamina cell block (lines around 112-118 — the `<span className="flex flex-col items-end gap-1 w-[110px]">` that currently stacks a numeric label above a compact HpBar).

Replace with:

```tsx
<span className="block w-[140px]">
  <HpBar current={staminaCurrent} max={staminaMax} variant="inline" />
</span>
```

Update the grid template at the top of the component (the `grid-cols-[32px_1fr_auto_auto_auto_110px_28px]` line) — change `110px` to `140px`:

```tsx
className={`relative grid grid-cols-[32px_1fr_auto_auto_auto_140px_28px] items-center gap-3 ...`}
```

- [ ] **Step 2: Verify dev server renders the new bar**

Run: `pnpm --filter @ironyard/web dev`

Visit a campaign with an active encounter. Expected: every rail row now shows a 22px-tall stamina bar with the current/max readout centered inside. Low-HP rows (Ajax at 50/140) read as warn-amber; very-low rows (Mira at 15/85) read as bad-red even before the fill registers.

- [ ] **Step 3: Run the web test suite**

Run: `pnpm --filter @ironyard/web test`
Expected: PASS. Existing snapshot tests on ParticipantRow may need re-snapshotting — review failures and update snapshots if the layout-shape change is intentional.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/primitives/ParticipantRow.tsx
git commit -m "feat(web/primitives): ParticipantRow stamina cell → inline HpBar (140px)"
```

---

## Task 13: ConditionChip — nine-hue palette

**Files:**
- Modify: `apps/web/src/pages/combat/ConditionChip.tsx`

- [ ] **Step 1: Rewrite the COLORS map**

Edit `apps/web/src/pages/combat/ConditionChip.tsx`. Replace the existing `COLORS` constant with:

```ts
// Pass 5 Pass 2b2a — nine distinct hues per condition (categorical palette).
// Maps each ConditionType to its token-bound Tailwind classes.
const COLORS: Record<ConditionType, string> = {
  Bleeding:   'bg-cond-bleed/14  text-cond-bleed  ring-cond-bleed/50',
  Dazed:      'bg-cond-daze/14   text-cond-daze   ring-cond-daze/50',
  Frightened: 'bg-cond-fright/14 text-cond-fright ring-cond-fright/50',
  Grabbed:    'bg-cond-grab/14   text-cond-grab   ring-cond-grab/50',
  Prone:      'bg-cond-prone/14  text-cond-prone  ring-cond-prone/50',
  Restrained: 'bg-cond-restr/14  text-cond-restr  ring-cond-restr/50',
  Slowed:     'bg-cond-slow/14   text-cond-slow   ring-cond-slow/50',
  Taunted:    'bg-cond-taunt/14  text-cond-taunt  ring-cond-taunt/50',
  Weakened:   'bg-cond-weak/14   text-cond-weak   ring-cond-weak/50',
};
```

The rest of the component is unchanged.

- [ ] **Step 2: Verify dev server renders the new palette**

Run: `pnpm --filter @ironyard/web dev`

Visit `/campaigns/<id>/play` with a participant carrying several conditions (use the `+ Condition` picker on the DetailPane to add Bleeding, Slowed, Grabbed, Taunted to a hero or monster). Expected: each chip displays its distinct hue per the palette (red / yellow-green / amber / blue).

- [ ] **Step 3: Run the web test suite**

Run: `pnpm --filter @ironyard/web test`
Expected: PASS — there are no test assertions on the specific CSS classes today.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/combat/ConditionChip.tsx
git commit -m "feat(web/combat): ConditionChip nine-hue palette per Pass 2b2a"
```

---

## Task 14: `MonsterStatBlock` component

**Files:**
- Create: `apps/web/src/pages/combat/detail/MonsterStatBlock.tsx`
- Test: `apps/web/src/pages/combat/detail/MonsterStatBlock.spec.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/pages/combat/detail/MonsterStatBlock.spec.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonsterStatBlock } from './MonsterStatBlock';
import type { Participant } from '@ironyard/shared';

function makeMonster(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'm1', name: 'Knight Heretic', kind: 'monster',
    ownerId: null, characterId: null, level: 5,
    currentStamina: 52, maxStamina: 52,
    characteristics: { might: 3, agility: 1, reason: -1, intuition: 0, presence: 2 },
    immunities: [], weaknesses: [], conditions: [],
    heroicResources: [], extras: [], surges: 0,
    recoveries: { current: 0, max: 0 }, recoveryValue: 0,
    weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
    activeAbilities: [], victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false }, surprised: false,
    role: 'Elite Defender', ancestry: ['Human'],
    size: '1M', speed: 5, stability: 2, freeStrike: 5, ev: 12,
    withCaptain: '+1 to Free Strike', className: null,
    ...overrides,
  } as Participant;
}

describe('MonsterStatBlock', () => {
  it('renders the characteristic 5-up grid', () => {
    render(<MonsterStatBlock participant={makeMonster()} />);
    expect(screen.getByText(/Might/i)).toBeInTheDocument();
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('-1')).toBeInTheDocument();
  });

  it('renders the physical-stats row (size/speed/stability/freeStrike/ev)', () => {
    render(<MonsterStatBlock participant={makeMonster()} />);
    expect(screen.getByText(/1M/)).toBeInTheDocument();
    expect(screen.getByText(/Speed/i)).toBeInTheDocument();
    expect(screen.getByText(/Free Strike/i)).toBeInTheDocument();
    expect(screen.getByText(/EV/)).toBeInTheDocument();
  });

  it('renders the With-Captain line when present', () => {
    render(<MonsterStatBlock participant={makeMonster()} />);
    expect(screen.getByText(/With Captain/i)).toBeInTheDocument();
    expect(screen.getByText('+1 to Free Strike')).toBeInTheDocument();
  });

  it('omits the With-Captain line when null', () => {
    render(<MonsterStatBlock participant={makeMonster({ withCaptain: null })} />);
    expect(screen.queryByText(/With Captain/i)).not.toBeInTheDocument();
  });

  it('shows em-dash placeholders for null pre-2b2a-snapshot fields', () => {
    render(<MonsterStatBlock participant={makeMonster({
      size: null, speed: null, stability: null, freeStrike: null, ev: null,
    })} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ironyard/web test -- MonsterStatBlock`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement `MonsterStatBlock.tsx`**

Create `apps/web/src/pages/combat/detail/MonsterStatBlock.tsx`:

```tsx
import type { Participant } from '@ironyard/shared';

export interface MonsterStatBlockProps {
  participant: Participant;
}

function fmt(n: number | null): string {
  return n === null ? '—' : String(n);
}

function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

const CHAR_LABELS: { key: keyof Participant['characteristics']; label: string }[] = [
  { key: 'might', label: 'Might' },
  { key: 'agility', label: 'Agility' },
  { key: 'reason', label: 'Reason' },
  { key: 'intuition', label: 'Intuition' },
  { key: 'presence', label: 'Presence' },
];

/**
 * Pass 5 Pass 2b2a — DetailPane Full-sheet monster stat-block.
 * Rulebook-style compact block above the abilities list. Renders
 * characteristic 5-up grid, physical-stats row, defenses (when present),
 * and With-Captain effect (when present).
 *
 * Pre-2b2a snapshots show "—" for the new monster-meta fields that load null.
 */
export function MonsterStatBlock({ participant }: MonsterStatBlockProps) {
  const { characteristics, size, speed, stability, freeStrike, ev, immunities, weaknesses, withCaptain } = participant;
  const hasDefenses = immunities.length > 0 || weaknesses.length > 0;

  return (
    <div className="border border-line bg-ink-1 p-3 space-y-2">
      <div className="grid grid-cols-5 gap-1">
        {CHAR_LABELS.map(({ key, label }) => (
          <div key={key} className="border border-line bg-ink-2 px-1.5 py-2 text-center">
            <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-text-mute">{label}</div>
            <div className="font-mono text-base font-bold tabular-nums text-text mt-0.5">
              {fmtMod(characteristics[key])}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span><span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute">Size</span> <span className="font-mono tabular-nums">{size ?? '—'}</span></span>
        <span><span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute">Speed</span> <span className="font-mono tabular-nums">{fmt(speed)}</span></span>
        <span><span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute">Stab</span> <span className="font-mono tabular-nums">{fmt(stability)}</span></span>
        <span><span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute">Free Strike</span> <span className="font-mono tabular-nums">{fmt(freeStrike)}</span></span>
        <span><span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute">EV</span> <span className="font-mono tabular-nums">{fmt(ev)}</span></span>
      </div>

      {hasDefenses && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {immunities.length > 0 && (
            <span>
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute">Immune</span>{' '}
              <span className="font-mono">{immunities.map((i) => `${i.type} ${i.value}`).join(' · ')}</span>
            </span>
          )}
          {weaknesses.length > 0 && (
            <span>
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute">Weak</span>{' '}
              <span className="font-mono">{weaknesses.map((w) => `${w.type} ${w.value}`).join(' · ')}</span>
            </span>
          )}
        </div>
      )}

      {withCaptain !== null && (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute">With Captain</div>
          <div className="text-xs text-text-dim italic mt-0.5">{withCaptain}</div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ironyard/web test -- MonsterStatBlock`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/combat/detail/MonsterStatBlock.tsx apps/web/src/pages/combat/detail/MonsterStatBlock.spec.tsx
git commit -m "feat(web/combat): MonsterStatBlock — rulebook stat-block for Full-sheet"
```

---

## Task 15: DetailHeader — rank pill + ancestry chips for monsters

**Files:**
- Modify: `apps/web/src/pages/combat/detail/DetailHeader.tsx`

- [ ] **Step 1: Read the existing component to find the integration point**

Read: `apps/web/src/pages/combat/detail/DetailHeader.tsx`

Locate where the existing role/level text renders. That's where the rank pill + ancestry chips slot in.

- [ ] **Step 2: Inject the RoleReadout component + ancestry chips**

In `DetailHeader.tsx`, add the imports:

```ts
import { RoleReadout } from '../rails/RoleReadout';
import { roleReadoutFor } from '../rails/rail-utils';
```

Find the existing role-rendering JSX (today probably a plain string like `L{level} · FOE`) and replace with:

```tsx
<div className="flex items-center gap-2 flex-wrap">
  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-mute">
    <RoleReadout data={roleReadoutFor(focused)} />
  </span>
  {focused.kind === 'monster' && focused.ancestry.length > 0 && (
    <span className="flex gap-1">
      {focused.ancestry.map((a) => (
        <span
          key={a}
          className="font-mono text-[9px] uppercase tracking-[0.06em] text-text-mute bg-ink-2 border border-line px-1"
        >
          {a}
        </span>
      ))}
    </span>
  )}
</div>
```

Adapt `focused` to whatever variable the existing component uses for the participant.

- [ ] **Step 3: Verify dev server renders the header**

Run: `pnpm --filter @ironyard/web dev`

Visit a campaign with an active encounter, focus a monster. Expected: header now shows `[ELI] L5 · DEFENDER` plus an ancestry chip like `HUMAN`.

- [ ] **Step 4: Run the web test suite**

Run: `pnpm --filter @ironyard/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/combat/detail/DetailHeader.tsx
git commit -m "feat(web/combat): DetailHeader + rank-pill + ancestry chips for monsters"
```

---

## Task 16: FullSheetTab — compose MonsterStatBlock for monster participants

**Files:**
- Modify: `apps/web/src/pages/combat/detail/FullSheetTab.tsx`

- [ ] **Step 1: Inject MonsterStatBlock into the monster branch**

Edit `apps/web/src/pages/combat/detail/FullSheetTab.tsx`. Find the branch that handles `focused.kind === 'monster'` — today it shows only the ability list. Above the ability list, add:

```tsx
import { MonsterStatBlock } from './MonsterStatBlock';

// inside the monster branch:
<MonsterStatBlock participant={focused} />
```

- [ ] **Step 2: Verify dev server renders the stat-block**

Run: `pnpm --filter @ironyard/web dev`

Focus a monster from the DetailPane. Switch to Full-sheet tab. Expected: stat-block renders above the abilities list.

- [ ] **Step 3: Run the web test suite**

Run: `pnpm --filter @ironyard/web test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/combat/detail/FullSheetTab.tsx
git commit -m "feat(web/combat): FullSheetTab composes MonsterStatBlock for monster participants"
```

---

## Task 17: `RollOverflowPopover` component

**Files:**
- Create: `apps/web/src/pages/combat/RollOverflowPopover.tsx`
- Test: `apps/web/src/pages/combat/RollOverflowPopover.spec.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/pages/combat/RollOverflowPopover.spec.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RollOverflowPopover } from './RollOverflowPopover';

describe('RollOverflowPopover', () => {
  it('opens on trigger click and exposes three tier buttons', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<RollOverflowPopover onPickTier={onPick} disabled={false} />);
    await user.click(screen.getByLabelText(/manual roll/i));
    expect(screen.getByRole('button', { name: /tier 1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tier 2/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tier 3/i })).toBeInTheDocument();
  });

  it('fires onPickTier with the chosen tier and closes the popover', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<RollOverflowPopover onPickTier={onPick} disabled={false} />);
    await user.click(screen.getByLabelText(/manual roll/i));
    await user.click(screen.getByRole('button', { name: /tier 2/i }));
    expect(onPick).toHaveBeenCalledWith(2);
  });

  it('disables the trigger when disabled prop is true', () => {
    render(<RollOverflowPopover onPickTier={vi.fn()} disabled />);
    expect(screen.getByLabelText(/manual roll/i)).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ironyard/web test -- RollOverflowPopover`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement `RollOverflowPopover.tsx`**

Create `apps/web/src/pages/combat/RollOverflowPopover.tsx`:

```tsx
import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';

export interface RollOverflowPopoverProps {
  onPickTier: (tier: 1 | 2 | 3) => void;
  disabled: boolean;
}

/**
 * Pass 5 Pass 2b2a — Manual-tier override popover for AbilityCard.
 * Replaces the inline expander that today's AbilityCard renders below
 * the Auto-roll button. Three tier buttons; clicking dispatches a manual
 * roll with the chosen tier's rigged 2d10 result.
 */
export function RollOverflowPopover({ onPickTier, disabled }: RollOverflowPopoverProps) {
  const [open, setOpen] = useState(false);

  const handlePick = (tier: 1 | 2 | 3) => {
    onPickTier(tier);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Manual roll"
          className="h-8 w-8 border border-line bg-ink-0 text-text-dim hover:bg-ink-2 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center"
        >
          <span aria-hidden="true">⋯</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="border border-line bg-ink-0 p-3 space-y-2 z-50"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute">
            Force tier outcome
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handlePick(t as 1 | 2 | 3)}
                className="min-h-11 px-3 border border-line bg-ink-1 hover:bg-ink-2 font-mono text-xs font-semibold"
              >
                Tier {t}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ironyard/web test -- RollOverflowPopover`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/combat/RollOverflowPopover.tsx apps/web/src/pages/combat/RollOverflowPopover.spec.tsx
git commit -m "feat(web/combat): RollOverflowPopover — manual-tier override popover"
```

---

## Task 18: AbilityCard rewrite — structure + tier-prose

**Files:**
- Modify: `apps/web/src/pages/combat/AbilityCard.tsx`
- Test: `apps/web/src/pages/combat/AbilityCard.spec.tsx` (new — there is no existing spec)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/pages/combat/AbilityCard.spec.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AbilityCard } from './AbilityCard';
import type { Ability } from '@ironyard/shared';

function makeAbility(overrides: Partial<Ability> = {}): Ability {
  return {
    id: 'reaving-slash',
    name: 'Reaving Slash',
    type: 'action',
    costLabel: 'Signature Ability',
    keywords: ['Strike', 'Weapon', 'Melee'],
    distance: 'Melee 1',
    target: 'One creature',
    powerRoll: {
      bonus: '+5',
      tier1: { raw: '5 damage', damage: 5, damageType: 'untyped', effect: undefined, conditions: [] },
      tier2: { raw: '9 damage; bleed', damage: 9, damageType: 'untyped', effect: undefined, conditions: [{ condition: 'Bleeding', duration: { kind: 'EoT' }, scope: 'target' }] },
      tier3: { raw: '13 damage; bleed, push 1', damage: 13, damageType: 'untyped', effect: 'push 1', conditions: [{ condition: 'Bleeding', duration: { kind: 'EoT' }, scope: 'target' }] },
    },
    effect: 'If this attack reduces the target to 0 stamina, you may make a free strike.',
    raw: '',
    cost: null,
    tier: null,
    isSubclass: false,
    sourceClassId: null,
    targetCharacteristic: 'Stamina',
    ...overrides,
  } as Ability;
}

describe('AbilityCard structure', () => {
  it('renders name, distance, keywords, power-roll formula, and the three tier columns', () => {
    render(<AbilityCard ability={makeAbility()} disabled={false} onRoll={vi.fn()} />);
    expect(screen.getByText('Reaving Slash')).toBeInTheDocument();
    expect(screen.getByText('Melee 1')).toBeInTheDocument();
    expect(screen.getByText(/Strike/)).toBeInTheDocument();
    expect(screen.getByText(/2d10/)).toBeInTheDocument();
    expect(screen.getByText(/\+5/)).toBeInTheDocument();
    expect(screen.getByText(/vs Stamina/i)).toBeInTheDocument();
    expect(screen.getByText('≤11')).toBeInTheDocument();
    expect(screen.getByText('12–16')).toBeInTheDocument();
    expect(screen.getByText('17+')).toBeInTheDocument();
  });

  it('renders tier prose with damage + conditions + effect text', () => {
    render(<AbilityCard ability={makeAbility()} disabled={false} onRoll={vi.fn()} />);
    expect(screen.getByText(/5 damage/)).toBeInTheDocument();
    expect(screen.getByText(/9 damage/)).toBeInTheDocument();
    expect(screen.getByText(/13 damage/)).toBeInTheDocument();
    expect(screen.getByText(/Bleeding/i)).toBeInTheDocument();
    expect(screen.getByText(/push 1/)).toBeInTheDocument();
  });

  it('folds the damage type into prose when typed', () => {
    const ability = makeAbility({
      powerRoll: {
        bonus: '+3',
        tier1: { raw: '3 fire damage', damage: 3, damageType: 'fire', effect: undefined, conditions: [] },
        tier2: { raw: '5 fire damage', damage: 5, damageType: 'fire', effect: undefined, conditions: [] },
        tier3: { raw: '8 fire damage', damage: 8, damageType: 'fire', effect: undefined, conditions: [] },
      },
    });
    render(<AbilityCard ability={ability} disabled={false} onRoll={vi.fn()} />);
    expect(screen.getByText(/3 fire damage/)).toBeInTheDocument();
  });

  it('omits the type qualifier for untyped damage ("5 damage" not "5 untyped damage")', () => {
    render(<AbilityCard ability={makeAbility()} disabled={false} onRoll={vi.fn()} />);
    expect(screen.queryByText(/untyped/)).not.toBeInTheDocument();
  });

  it('renders the effect text when present', () => {
    render(<AbilityCard ability={makeAbility()} disabled={false} onRoll={vi.fn()} />);
    expect(screen.getByText(/reduces the target to 0 stamina/i)).toBeInTheDocument();
  });

  it('omits "vs X" from the formula line when targetCharacteristic is null', () => {
    render(<AbilityCard ability={makeAbility({ targetCharacteristic: null })} disabled={false} onRoll={vi.fn()} />);
    expect(screen.queryByText(/vs Stamina/i)).not.toBeInTheDocument();
    expect(screen.getByText(/2d10/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ironyard/web test -- AbilityCard`
Expected: FAIL — the current `AbilityCard` doesn't render the new structure (no `2d10` text, no `vs Stamina`, etc.).

- [ ] **Step 3: Rewrite `AbilityCard.tsx` with the new structure**

Replace `apps/web/src/pages/combat/AbilityCard.tsx` entirely:

```tsx
import type { Ability, TierOutcome } from '@ironyard/shared';
import { TIER_RIGGED_ROLLS, roll2d10 } from '../../lib/rollDice';
import { RollOverflowPopover } from './RollOverflowPopover';

type RollArgs = {
  rolls: [number, number];
  source: 'manual' | 'auto';
};

/**
 * Pass 5 Pass 2b2a — type-chip style map. Retained but not rendered by the
 * default card layout; the costLabel folds into the keyword line instead.
 * Kept exported so a future eye-test could restore the chip with a 5-line
 * JSX addition without re-deriving the palette mapping.
 */
export const TYPE_CHIP_STYLE: Record<Ability['type'], string> = {
  action: 'bg-foe text-text',
  maneuver: 'bg-accent text-ink-0',
  triggered: 'bg-ink-2 text-accent',
  'free-triggered': 'bg-ink-2 text-accent',
  villain: 'bg-ink-2 text-text',
  trait: 'bg-ink-2 text-text-dim',
};

type Props = {
  ability: Ability;
  disabled: boolean;
  readOnly?: boolean;
  onRoll: (ability: Ability, args: RollArgs) => void;
  /** Pass-2b2a — when true, render the SET A TARGET prompt + force Roll disabled. */
  targetMissing?: boolean;
};

export function AbilityCard({ ability, disabled, readOnly = false, onRoll, targetMissing = false }: Props) {
  if (!ability.powerRoll) return null;
  const pr = ability.powerRoll;

  const handleAuto = () => onRoll(ability, { rolls: roll2d10(), source: 'auto' });
  const handleManual = (tier: 1 | 2 | 3) => {
    const rolls = tier === 1 ? TIER_RIGGED_ROLLS.t1 : tier === 2 ? TIER_RIGGED_ROLLS.t2 : TIER_RIGGED_ROLLS.t3;
    onRoll(ability, { rolls, source: 'manual' });
  };

  const keywordsLine = [
    ...ability.keywords,
    ...(ability.costLabel ? [ability.costLabel] : []),
  ].join(' · ');

  const rollDisabled = disabled || targetMissing;

  return (
    <article className="border border-line bg-ink-1 p-3.5 space-y-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{ability.name}</h3>
        {ability.distance && (
          <span className="font-mono text-[11px] text-text-mute">{ability.distance}</span>
        )}
      </header>

      {keywordsLine && (
        <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-text-mute -mt-2">
          {keywordsLine}
        </div>
      )}

      {targetMissing && !readOnly && (
        <div className="border border-dashed border-foe/50 bg-foe/4 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-foe">
          Set a target
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] text-text flex-1">
          2d10 <span className="font-bold">{pr.bonus}</span>
          {ability.targetCharacteristic && (
            <>
              {' '}<span className="text-text-mute">·</span>{' '}
              <span className="text-text-mute">vs</span>{' '}
              <span className="text-text-dim">{ability.targetCharacteristic}</span>
            </>
          )}
        </span>
        {!readOnly && (
          <>
            <button
              type="button"
              onClick={handleAuto}
              disabled={rollDisabled}
              className="font-mono text-[11px] px-3 h-8 bg-text text-ink-0 hover:bg-text-dim disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              Roll <span className="opacity-60 text-[10px]">2d10</span>
            </button>
            <RollOverflowPopover onPickTier={handleManual} disabled={rollDisabled} />
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1">
        <TierCol label="≤11" tier={pr.tier1} />
        <TierCol label="12–16" tier={pr.tier2} />
        <TierCol label="17+" tier={pr.tier3} />
      </div>

      {ability.effect && (
        <p className="text-xs text-text-dim leading-relaxed">
          <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-text-mute mr-1">Effect</span>
          {ability.effect}
        </p>
      )}
    </article>
  );
}

function TierCol({ label, tier }: { label: string; tier: TierOutcome }) {
  return (
    <div className="border border-line bg-ink-2 p-2 space-y-1">
      <div className="font-mono text-[10px] text-text-mute">{label}</div>
      <div className="text-xs text-text leading-snug">{renderTierProse(tier)}</div>
    </div>
  );
}

function renderTierProse(tier: TierOutcome): React.ReactNode {
  const parts: React.ReactNode[] = [];
  if (tier.damage !== null) {
    const typed = tier.damageType && tier.damageType !== 'untyped' ? ` ${tier.damageType}` : '';
    parts.push(<span key="dmg">{tier.damage}{typed} damage</span>);
  }
  for (const c of tier.conditions) {
    const dur = describeDuration(c.duration);
    const text = `${c.condition}${dur ? ` (${dur})` : ''}`;
    parts.push(
      c.scope === 'target' ? (
        <span key={`c-${c.condition}-${c.scope}`}> · {text}</span>
      ) : (
        <span key={`c-${c.condition}-${c.scope}`} className="italic text-text-dim" title="Not auto-applied"> · {text}</span>
      ),
    );
  }
  if (tier.effect) {
    parts.push(<span key="eff"> · {tier.effect}</span>);
  }
  if (parts.length === 0) {
    return <span className="italic text-text-mute">no effect</span>;
  }
  return <>{parts}</>;
}

function describeDuration(d: TierOutcome['conditions'][number]['duration']): string {
  switch (d.kind) {
    case 'save_ends': return 'save';
    case 'EoT': return 'EoT';
    case 'until_start_next_turn': return 'SoT';
    case 'end_of_encounter': return 'EoE';
    case 'trigger': return 'trig';
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ironyard/web test -- AbilityCard`
Expected: PASS — all 6 cases assert correctly.

- [ ] **Step 5: Verify the dev server**

Run: `pnpm --filter @ironyard/web dev`

Visit `/campaigns/<id>/play`, focus the active turn-holder, switch to Full-sheet for a PC (or stay on Turn-flow). Expected: each AbilityCard renders with the new three-column tier-grid, inline Roll button, `⋯` overflow.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/combat/AbilityCard.tsx apps/web/src/pages/combat/AbilityCard.spec.tsx
git commit -m "feat(web/combat): AbilityCard rewrite — tier-grid + inline Roll + overflow"
```

---

## Task 19: AbilityCard — wire target-missing prop from callers

**Files:**
- Modify: every caller of `AbilityCard` (search the repo). Likely candidates:
  - `apps/web/src/pages/combat/detail/TurnFlowSection.tsx`
  - `apps/web/src/pages/combat/detail/FullSheetTab.tsx`
  - `apps/web/src/pages/combat/PlayerSheetPanel.tsx` (if still referenced)

- [ ] **Step 1: Find all `<AbilityCard>` usages**

Run: `grep -rn "AbilityCard" apps/web/src --include="*.tsx" --include="*.ts" | grep -v ".spec."`

Expected: 3-5 caller files. For each, identify whether `targetParticipantIds` is in-scope (it's threaded from `DirectorCombat` down through the DetailPane). If yes, compute `targetMissing` and pass it.

- [ ] **Step 2: For each caller, add `targetMissing={targetParticipantIds.length === 0}`**

Example for `TurnFlowSection.tsx`:

```tsx
<AbilityCard
  ability={ab}
  disabled={!canRoll}
  readOnly={!isOwnTurn}
  onRoll={onRoll}
  targetMissing={targetParticipantIds.length === 0 && ab.type === 'action'}
/>
```

For abilities that don't need a target (e.g., `maneuver` with self-target, or `trait`), pass `targetMissing={false}`. The simplest gate is `ab.powerRoll !== undefined && ab.type !== 'maneuver'` — only `action`-type abilities targeting an enemy need the prompt strip.

If `targetParticipantIds` isn't in-scope at the caller, thread it down from `DirectorCombat` through the props chain — match the existing thread that already carries `targetParticipantIds` to the AbilityCard via the DetailPane composition.

- [ ] **Step 3: Verify dev server**

Run: `pnpm --filter @ironyard/web dev`

Open a combat with a PC focused and no target set. Expected: action-type AbilityCards show the `SET A TARGET` dashed strip; Roll button is disabled. Click a reticle to target a foe. Expected: strip disappears; Roll enables.

- [ ] **Step 4: Run the web test suite**

Run: `pnpm --filter @ironyard/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -p   # stage only the AbilityCard caller files
git commit -m "feat(web/combat): AbilityCard targetMissing prop wired from callers"
```

---

## Task 20: `formatExpiry` helper

**Files:**
- Create: `apps/web/src/lib/format-expiry.ts`
- Test: `apps/web/src/lib/format-expiry.spec.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/format-expiry.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatExpiry } from './format-expiry';
import type { OpenAction } from '@ironyard/shared';

function makeOA(overrides: Partial<OpenAction>): OpenAction {
  return {
    id: 'oa-1',
    kind: '__sentinel_2b_0__' as OpenAction['kind'],
    participantId: 'p1',
    raisedAtRound: 1,
    raisedByIntentId: 'i-1',
    expiresAtRound: null,
    payload: {},
    ...overrides,
  };
}

describe('formatExpiry', () => {
  it('returns "expires end of encounter" when expiresAtRound is null', () => {
    expect(formatExpiry(makeOA({ expiresAtRound: null }), 3)).toBe('expires end of encounter');
  });

  it('returns "expires end of turn" when expiresAtRound equals currentRound', () => {
    expect(formatExpiry(makeOA({ expiresAtRound: 3 }), 3)).toBe('expires end of turn');
  });

  it('returns "expires end of round" when expiresAtRound is currentRound + 1', () => {
    expect(formatExpiry(makeOA({ expiresAtRound: 4 }), 3)).toBe('expires end of round');
  });

  it('returns "expires round N" for further-future expiries', () => {
    expect(formatExpiry(makeOA({ expiresAtRound: 7 }), 3)).toBe('expires round 7');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ironyard/web test -- format-expiry`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `format-expiry.ts`**

Create `apps/web/src/lib/format-expiry.ts`:

```ts
import type { OpenAction } from '@ironyard/shared';

export function formatExpiry(oa: OpenAction, currentRound: number): string {
  if (oa.expiresAtRound === null) return 'expires end of encounter';
  if (oa.expiresAtRound === currentRound) return 'expires end of turn';
  if (oa.expiresAtRound === currentRound + 1) return 'expires end of round';
  return `expires round ${oa.expiresAtRound}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ironyard/web test -- format-expiry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/format-expiry.ts apps/web/src/lib/format-expiry.spec.ts
git commit -m "feat(web): formatExpiry helper for OpenAction meta lines"
```

---

## Task 21: `OpenActionRow` component

**Files:**
- Create: `apps/web/src/pages/combat/OpenActionRow.tsx`
- Test: `apps/web/src/pages/combat/OpenActionRow.spec.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/pages/combat/OpenActionRow.spec.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OpenActionRow } from './OpenActionRow';
import type { OpenAction } from '@ironyard/shared';

function makeOA(overrides: Partial<OpenAction> = {}): OpenAction {
  return {
    id: 'oa-1', kind: '__sentinel_2b_0__' as OpenAction['kind'],
    participantId: 'p1', raisedAtRound: 1, raisedByIntentId: 'i-1',
    expiresAtRound: null, payload: {},
    ...overrides,
  };
}

describe('OpenActionRow', () => {
  it('renders a hero-tone "FOR YOU" meta line + filled Claim button when target is the viewer', () => {
    render(<OpenActionRow
      oa={makeOA()}
      title="Free strike available"
      body="You may make a free strike."
      claimLabel="Claim"
      currentRound={3}
      viewerOwnerForRow="self"
      canClaim
      ownerName="You"
      onClaim={vi.fn()}
    />);
    expect(screen.getByText('Free strike available')).toBeInTheDocument();
    expect(screen.getByText(/FOR YOU/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /claim/i })).toBeEnabled();
  });

  it('renders "FOR KORVA" + a Watching button when target is another player', () => {
    render(<OpenActionRow
      oa={makeOA()}
      title="Hero token spent"
      body="Korva spent a hero token."
      claimLabel="Claim"
      currentRound={3}
      viewerOwnerForRow="other-player"
      canClaim={false}
      ownerName="KORVA"
      onClaim={vi.fn()}
    />);
    expect(screen.getByText(/FOR KORVA/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /watching/i })).toBeDisabled();
  });

  it('renders outlined Claim button for director-override (canClaim=true on other-player row)', () => {
    render(<OpenActionRow
      oa={makeOA()}
      title="Free strike available"
      body="Korva may make a free strike."
      claimLabel="Claim"
      currentRound={3}
      viewerOwnerForRow="other-player"
      canClaim
      ownerName="KORVA"
      onClaim={vi.fn()}
    />);
    const btn = screen.getByRole('button', { name: /claim/i });
    expect(btn).toBeEnabled();
  });

  it('fires onClaim with the OA id when Claim is clicked', async () => {
    const user = userEvent.setup();
    const onClaim = vi.fn();
    render(<OpenActionRow
      oa={makeOA({ id: 'oa-xyz' })}
      title="x" body="y" claimLabel="Claim"
      currentRound={1} viewerOwnerForRow="self" canClaim ownerName="You"
      onClaim={onClaim}
    />);
    await user.click(screen.getByRole('button', { name: /claim/i }));
    expect(onClaim).toHaveBeenCalledWith('oa-xyz');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ironyard/web test -- OpenActionRow`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement `OpenActionRow.tsx`**

Create `apps/web/src/pages/combat/OpenActionRow.tsx`:

```tsx
import type { OpenAction } from '@ironyard/shared';
import { formatExpiry } from '../../lib/format-expiry';

export type ViewerRowRelation = 'self' | 'other-player';

export interface OpenActionRowProps {
  oa: OpenAction;
  title: string;
  body: string;
  claimLabel: string;
  currentRound: number;
  viewerOwnerForRow: ViewerRowRelation;
  /** True when the viewer is the owner of the target participant, or is the active director. */
  canClaim: boolean;
  /** Display name for the meta line — "You" for self, the participant name for others. */
  ownerName: string;
  onClaim: (openActionId: string) => void;
}

export function OpenActionRow({
  oa, title, body, claimLabel, currentRound,
  viewerOwnerForRow, canClaim, ownerName, onClaim,
}: OpenActionRowProps) {
  const isSelf = viewerOwnerForRow === 'self';
  const rowBg = isSelf ? 'bg-hero/6' : 'bg-ink-2';
  const dotClass = isSelf
    ? 'bg-hero shadow-[0_0_6px_oklch(0.78_0.04_220/0.5)]'
    : 'bg-ink-4';
  const metaLabel = isSelf ? 'FOR YOU' : `FOR ${ownerName.toUpperCase()}`;
  const expiryText = formatExpiry(oa, currentRound);

  // Button variants per the viewer × target matrix.
  let buttonClass = '';
  let buttonLabel = claimLabel;
  let buttonDisabled = false;
  if (isSelf) {
    buttonClass = 'bg-hero text-ink-0 font-semibold border-hero';
  } else if (canClaim) {
    // director override on someone else's row
    buttonClass = 'bg-transparent text-hero border-hero/50 hover:bg-hero/10';
  } else {
    buttonClass = 'bg-transparent text-text-mute border-line cursor-not-allowed';
    buttonLabel = 'Watching';
    buttonDisabled = true;
  }

  return (
    <div className={`grid grid-cols-[20px_1fr_auto] gap-3 items-start px-3 py-2.5 border border-line ${rowBg}`}>
      <span className={`mt-1.5 h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-text">{title}</div>
        <div className="text-xs text-text-dim leading-snug mt-0.5">{body}</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute mt-1">
          <span className={isSelf ? 'text-hero' : ''}>{metaLabel}</span>
          <span className="mx-1.5">·</span>
          <span>{expiryText}</span>
        </div>
      </div>
      <button
        type="button"
        disabled={buttonDisabled}
        onClick={() => !buttonDisabled && onClaim(oa.id)}
        className={`font-mono text-[10px] uppercase tracking-[0.06em] px-3 h-8 border ${buttonClass}`}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ironyard/web test -- OpenActionRow`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/combat/OpenActionRow.tsx apps/web/src/pages/combat/OpenActionRow.spec.tsx
git commit -m "feat(web/combat): OpenActionRow — for-you signal + role-aware Claim"
```

---

## Task 22: `OpenActionsList` wrapper + `participantDisplayLookup` migration

**Files:**
- Modify: `apps/web/src/pages/combat/OpenActionsList.tsx`
- Modify: every caller of `OpenActionsList` that passes `participantOwnerLookup` — likely `DirectorCombat.tsx` and any other CombatRun-derived consumer.
- Modify: `apps/web/src/pages/combat/OpenActionsList.spec.tsx` (existing — update)

- [ ] **Step 1: Rewrite `OpenActionsList.tsx` onto primitives**

Replace `apps/web/src/pages/combat/OpenActionsList.tsx` entirely:

```tsx
import type { OpenAction } from '@ironyard/shared';
import { OPEN_ACTION_COPY } from '@ironyard/shared';
import { Section } from '../../primitives';
import { OpenActionRow, type ViewerRowRelation } from './OpenActionRow';

export type ParticipantDisplayLookup = (
  participantId: string,
) => { ownerId: string | null; name: string | null };

type Props = {
  openActions: OpenAction[];
  currentUserId: string;
  activeDirectorId: string;
  currentRound: number;
  participantDisplayLookup: ParticipantDisplayLookup;
  onClaim: (openActionId: string) => void;
};

export function OpenActionsList(props: Props) {
  const { openActions, currentUserId, activeDirectorId, currentRound, participantDisplayLookup, onClaim } = props;

  if (openActions.length === 0) return null;
  const isDirector = currentUserId === activeDirectorId;

  return (
    <Section heading={`OPEN ACTIONS · ${openActions.length}`}>
      <div className="flex flex-col gap-1.5">
        {openActions.map((oa) => {
          const copy = OPEN_ACTION_COPY[oa.kind];
          const title = copy?.title(oa) ?? `Open Action: ${oa.kind}`;
          const body = copy?.body(oa) ?? '';
          const claimLabel = copy?.claimLabel(oa) ?? 'Claim';
          const { ownerId, name } = participantDisplayLookup(oa.participantId);
          const isOwnerSelf = ownerId !== null && currentUserId === ownerId;
          const viewerOwnerForRow: ViewerRowRelation = isOwnerSelf ? 'self' : 'other-player';
          const canClaim = isOwnerSelf || isDirector;
          const ownerName = isOwnerSelf ? 'You' : (name ?? 'someone');

          return (
            <OpenActionRow
              key={oa.id}
              oa={oa}
              title={title}
              body={body}
              claimLabel={claimLabel}
              currentRound={currentRound}
              viewerOwnerForRow={viewerOwnerForRow}
              canClaim={canClaim}
              ownerName={ownerName}
              onClaim={onClaim}
            />
          );
        })}
      </div>
    </Section>
  );
}
```

- [ ] **Step 2: Update the existing OpenActionsList.spec.tsx**

The existing spec asserts the old DOM structure (e.g., querying `.open-actions-list__title`). Open it and migrate the assertions to use `screen.getByText(...)` against the new title/body content. Keep the existing scenarios (claim-enabled-for-owner, claim-disabled-for-watcher, director-override) — those map onto the new rendering.

The spec's prop list also changes — replace `participantOwnerLookup` with `participantDisplayLookup` (the new shape returns `{ ownerId, name }`). Add `currentRound` prop.

- [ ] **Step 3: Update every caller**

Run: `grep -rn "OpenActionsList" apps/web/src --include="*.tsx" | grep -v ".spec."`

For each caller (likely `DirectorCombat.tsx`):

- Rename the prop `participantOwnerLookup` → `participantDisplayLookup` and change the implementation to return `{ ownerId, name }`:

```tsx
const participantDisplayLookup = useCallback((id: string) => {
  const p = participants.find((x) => x.id === id);
  return { ownerId: p?.ownerId ?? null, name: p?.name ?? null };
}, [participants]);
```

- Add `currentRound={round}` prop.

- [ ] **Step 4: Remove `.open-actions-list*` CSS from `styles.css`**

Edit `apps/web/src/styles.css`. Find and delete every `.open-actions-list*` class block (there are several — heading, items, row, title, body, claim, empty). The new component composes Tailwind utilities only.

- [ ] **Step 5: Verify dev server**

Run: `pnpm --filter @ironyard/web dev`

The OpenAction queue is empty in the absence of 2b.0.1 kinds, so the visual verification path is: add a fixture entry via a fixture script or mock; or accept that the empty section collapses and verify the Section heading appears when forced via React DevTools / a temporary fixture commit.

- [ ] **Step 6: Run the web test suite**

Run: `pnpm --filter @ironyard/web test`
Expected: PASS — including the migrated OpenActionsList.spec.tsx.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/combat/OpenActionsList.tsx apps/web/src/pages/combat/OpenActionsList.spec.tsx apps/web/src/pages/combat/DirectorCombat.tsx apps/web/src/styles.css
git commit -m "refactor(web/combat): OpenActionsList → primitives + participantDisplayLookup"
```

---

## Task 23: Final verification — typecheck, lint, full test suite, screenshot check

**Files:** none modified — verification only.

- [ ] **Step 1: Run typecheck repo-wide**

Run: `pnpm typecheck`
Expected: PASS. Fix any type errors that surface (most likely from callers of renamed props).

- [ ] **Step 2: Run lint repo-wide**

Run: `pnpm lint`
Expected: PASS. Fix any biome errors.

- [ ] **Step 3: Run the full test suite**

Run: `pnpm test`
Expected: PASS across `packages/shared`, `packages/rules`, `packages/data`, `apps/web`, `apps/api`.

- [ ] **Step 4: Spot-check screenshots**

Run the dev server: `pnpm --filter @ironyard/web dev`

Visit `/campaigns/<id>/play` with an active encounter that has:
- At least one of each rank tier (Minion / Horde / Platoon / Elite / Leader / Solo) — verify the rank pills render with their distinct hues.
- Multiple PCs with different heroic resources at varying values, including one above 8 for the overflow check.
- One participant carrying 3+ conditions including Bleeding + Slowed + Grabbed — verify the per-condition palette.
- A focused monster — switch to Full-sheet tab and verify the rulebook stat-block renders.
- A PC focused on their own turn with no target picked — verify the `SET A TARGET` prompt shows on their action-type AbilityCards.

Screenshot at iPad-portrait (810 × 1080) and iPhone-portrait (390 × 844). Confirm the layouts hold.

- [ ] **Step 5: Final commit if any fixes from Steps 1-4**

```bash
git add -p
git commit -m "fix(web): Pass 2b2a verification fixes"
```

If no fixes were needed, skip this step.

---

## Spec coverage self-check

Cross-referencing the spec sections against this plan:

| Spec section | Task(s) |
|---|---|
| Engine: ParticipantSchema field additions | 2 |
| Engine: StartEncounter stamping | 4 |
| UI: rail role readout | 5, 6, 7 |
| UI: hero resource + recoveries on PartyRail | 8, 9, 10 |
| UI: stamina bar with inset readout | 11, 12 |
| UI: DetailPane Full-sheet for monsters | 14, 15, 16 |
| UI: AbilityCard refactor | 17, 18, 19 |
| Data pipeline addition: targetCharacteristic | 3 |
| UI: OpenActions row refactor | 20, 21, 22 |
| UI: per-condition palette | 13 |
| CSS tokens (rank + cond + hp-dim) | 1 |
| `open-actions-list*` removal | 22 |
| Verification (typecheck, lint, test, screenshots) | 23 |

All spec sections covered. Acceptance criteria 1-12 (+ 3a) map onto the verification step's manual checks plus the test-suite assertions across Tasks 2, 4, 5, 6, 8, 9, 11, 14, 17, 18, 20, 21.
