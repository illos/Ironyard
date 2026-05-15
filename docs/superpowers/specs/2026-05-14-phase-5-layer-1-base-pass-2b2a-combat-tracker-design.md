# Phase 5 Layer 1 (Base) — Pass 2b2a: combat-tracker UI deepening

**Status:** Designed, awaiting plan.
**Parent:** Phase 5 — UI rebuild ([phases.md](../../phases.md#phase-5--ui-rebuild)). Pass 1 ([spec](2026-05-14-phase-5-layer-1-base-pass-1-design.md)) shipped tokens + primitives + role-aware shell on 2026-05-14. Pass 2a ([spec](2026-05-14-phase-5-layer-1-base-pass-2a-content-gating-design.md)) shipped content gating + Turn flow + role-asymmetric chrome the same day. Pass 2b1 ([spec](2026-05-14-phase-5-layer-1-base-pass-2b1-zipper-initiative-design.md)) shipped zipper initiative + per-row reticle targeting also on 2026-05-14.
**Successor:** Pass 2b2b — encounter-builder deepening (C1 monster previews / C2 threat budget / C3 picker filtering). Pass 2b2c — chrome (D2 embellished Mode-C chip / D3 Mode-B nav surface). Each ships separately.
**Scope notes:** brainstormed 2026-05-14 against the `docs/design ref/director-combat/` reference mockup + user-supplied screenshots. 2b2a is the first of three slices closing out Pass-2b inventory items B3 / B4 / B5 / B6. The remaining inventory items C1–C3 (encounter-builder) and D2–D3 (chrome) defer to 2b2b and 2b2c.

## One-line summary

Deepen the combat tracker's visual content: monster rails finally show a rank-tinted role readout backed by a denormalized `role` / `ancestry` / `size` / `ev` fold on the Participant; hero rails surface the heroic-resource pip row + recoveries readout that PartyRail leaves empty today; the DetailPane Full-sheet tab grows a real rulebook-style stat-block for monsters; the AbilityCard refactors to a three-column tier-grid with an inline lighter-gray Roll button and a `⋯` overflow popover for manual rolls; the OpenActionsList sheds its pre-Pass-1 styling onto primitives with a "for you" signal layered across leading dot, row tint, expiry metadata, and role-aware Claim button; the nine canon conditions get nine distinct hues. One small reducer touch — the `StartEncounter` participant-stamping path materializes the new monster-meta fields and PC class name onto the participant — makes the rail readouts source-of-truth-clean.

## Goals

- Make the rail role-readout finally legible (rank-pill + family for monsters; class for PCs) by materializing the data onto the participant at `StartEncounter`, single source of truth.
- Surface the hero resource + recoveries content that `PartyRail` already passes `undefined` through to the primitive — 8-pip per-resource row + `Rec current/max` readout.
- Ship a real monster stat-block in the DetailPane Full-sheet tab so the director can read characteristics / size / speed / stability / free-strike / EV / immunities at-a-glance without consulting the codex.
- Refactor the AbilityCard onto a three-column tier-grid with a small inline Roll button and a `⋯` overflow popover for manual rolls; eliminate the inline manual-roll expander entirely.
- Refactor `OpenActionsList` off its pre-Pass-1 CSS classes onto the primitive system (Section + new OpenActionRow). Layer four signals for "this is your decision": leading dot, row tint, expiry metadata, role-aware Claim button.
- Distinguish the nine canon conditions visually so a player carrying two conditions reads "I'm Bleeding and Slowed" instead of "I have two gray chips."

## Non-goals (deferred to Pass 2b2b/c, Phase 2b umbrella, or Layer 2/3)

- **Pass 2b2b** — encounter-builder previews (C1), threat-budget readout (C2), picker filtering (C3).
- **Pass 2b2c** — embellished Mode-C chip (D2), Mode-B nav surface beyond Foes (D3).
- **Phase 2b umbrella** — no new OpenAction kinds. Real OpenAction queues stay empty until 2b.0.1 populates `OpenActionKindSchema` with the first real kinds (pray-to-the-gods, the four spatial triggers, etc.). The new chrome ships but is exercised only by fixtures + the eventual first kind-add in 2b.0.1.
- **Phase 2b umbrella (B4 follow-on)** — the rank-pill data shape supports future encounter-builder threat-tier filtering (C3 / 2b2b) at zero rework cost, but that filtering is not built here.
- **Layer 2** — pack-color persistence + theme picker. The per-row pack-class hook on `ParticipantRow` already exists (Pass 1); 2b2a's resource pips read `--pk` with fallback to `--accent` so when Layer 2 ships, per-PC pip colors light up with no rework. Until then, every PC's pip color is the global Lightning accent.
- **Layer 3** — action effects entirely (roll-button ember borders, defeated-foe skull glyphs, etc.).
- **Glyph-only condition chips.** The reference mockup uses single-glyph chips; we keep the full condition label in 2b2a for readability. Glyph-mode is a compact-mode option for future work.
- **Per-condition palette inside ability-card tier outcomes.** Predictive outcomes in ability cards stay as prose ("9 damage · Bleed (EoT)") — the per-condition hue palette applies to applied-conditions-on-participants only, where the chip means "this is on me right now."

## Architecture

### Engine: `ParticipantSchema` field additions

The single (small) engine touch in 2b2a. New optional fields on `ParticipantSchema` (`packages/shared/src/participant.ts`):

```ts
// Monster meta — stamped at StartEncounter from the monster definition.
// Null on PC participants (and on pre-2b2a snapshot monster participants).
role:        z.string().nullable().default(null),            // "Boss Brute", "Minion Skirmisher", etc.
ancestry:    z.array(z.string()).default([]),                // ["Abyssal", "Animal", "Gnoll"]
size:        z.string().nullable().default(null),            // "1M", "2L", "3T"
speed:       z.number().int().nullable().default(null),      // squares
stability:   z.number().int().nullable().default(null),
freeStrike:  z.number().int().nullable().default(null),
ev:          z.number().int().nullable().default(null),
withCaptain: z.string().nullable().default(null),            // free-form effect text

// PC meta — stamped at StartEncounter from the character blob.
// Null on monster participants.
className:   z.string().nullable().default(null),            // "Tactician", "Censor"
```

All nullable + defaulted so existing snapshots parse without change.

### Engine: `StartEncounter` stamping

`packages/rules/src/intents/start-encounter.ts` already stamps PC blobs (currentStamina, recoveriesUsed, weaponDamageBonus, victories, heroic-resource preload) and monster stat blocks from static data at materialization time (Phase 2 Epic 2D). Extend the same path:

- **Monster participants** — lookup the monster definition (already in the DO's `staticMonsters` map), copy `roles[0]` → `role`, `ancestry` → `ancestry`, `size` → `size`, `speed` → `speed`, `stability` → `stability`, `freeStrike` → `freeStrike`, `ev.ev` → `ev`, `withCaptain` → `withCaptain` (nullable when absent from the source).
- **PC participants** — resolve `character.classId` → display name via the existing class registry (used by the wizard) → `className`.

No new intents. No reducer logic beyond the stamp. Pre-2b2a snapshots load with `role: null`, `className: null` etc.; the rail falls back to today's `L{level} · FOE` / `L{level} · HERO` readout — graceful degradation, no migration intent needed.

### UI: rail role readout

`apps/web/src/pages/combat/rails/rail-utils.ts` gains a rank palette table and rewrites `summarizeRole`:

```ts
// rank-palette.ts (new)
export const RANK_PALETTE = {
  Minion:  { abbr: 'MIN', cssVar: '--rank-min' },
  Horde:   { abbr: 'HOR', cssVar: '--rank-hor' },
  Platoon: { abbr: 'PLA', cssVar: '--rank-pla' },
  Elite:   { abbr: 'ELI', cssVar: '--rank-eli' },
  Leader:  { abbr: 'LED', cssVar: '--rank-led' },
  Solo:    { abbr: 'SOL', cssVar: '--rank-sol' },
} as const;
export type RankKey = keyof typeof RANK_PALETTE;
```

Six new CSS variables in `theme/tokens.css` (categorical-palette decision):

```css
--rank-min: oklch(0.74 0.004 80);    /* neutral gray */
--rank-hor: oklch(0.72 0.10 150);    /* green */
--rank-pla: oklch(0.74 0.10 200);    /* teal */
--rank-eli: oklch(0.78 0.12 280);    /* violet */
--rank-led: oklch(0.78 0.14 60);     /* amber */
--rank-sol: oklch(0.66 0.22 25);     /* foe-red */
```

`summarizeRole(p)` becomes a discriminated tuple:

```ts
type RoleReadoutData =
  | { kind: 'monster-ranked'; level: number; rank: RankKey; family: string }
  | { kind: 'monster-unranked'; level: number; family: string }
  | { kind: 'monster-fallback'; level: number }              // pre-2b2a snapshot
  | { kind: 'pc'; level: number; className: string | null };
```

- Monster, `role` parses cleanly into known rank + family → `monster-ranked`. Renders rank-pill + `L{level} · {FAMILY}`.
- Monster, `role` doesn't match a known rank prefix (7 outlier rows in current data: 2× `"Controller"` / 2× `"Artillery"` / 2× `"Hexer"` / 1× `"\-"`) → `monster-unranked`. Renders just `L{level} · {FAMILY}` (no pill).
- Monster, `role === null` (pre-2b2a snapshot) → `monster-fallback`. Renders `L{level} · FOE`.
- PC → `pc`. Renders `L{level} · {CLASSNAME}` (uppercase), falling back to `L{level} · HERO` when `className === null`.

New component `apps/web/src/pages/combat/rails/RoleReadout.tsx` accepts the tuple and renders into the existing `role` slot on `ParticipantRow`. `PartyRail` and `EncounterRail` both consume the new tuple instead of the stringly-typed result.

### UI: hero resource + recoveries on PartyRail

Today `PartyRail.tsx` passes `resource={isGated ? null : undefined}` and `recoveries={isGated ? null : undefined}` — `undefined` causes the primitive to render an empty cell. The slots exist; they just never have content.

Three changes:

1. **Populate the slots** with a new helper `apps/web/src/pages/combat/rails/HeroResourceCell.tsx`:

   ```
   ┌─────────────────────┐
   │ Focus               │   resource display name, mono-dim
   │ ●●●○○○○○            │   8-pip row; filled count = min(value, 8)
   │ 7+2                 │   numeric overflow when value > 8 (else omitted)
   └─────────────────────┘
   ```

   - The row picks the primary heroic resource from `participant.heroicResources[0]` (canon: every class baselines exactly one heroic resource per `HEROIC_RESOURCES` registry).
   - 8-pip array; pips 1..min(value, 8) filled. When `value > 8`, render a small `+{value-8}` numeric below the pips (mono-dim, tabular). When `value ≤ 8`, the overflow line is omitted.
   - Pip color reads `var(--pk, var(--accent))` — picks up the per-row `pack-X` class scope when Layer 2 ships color-pack; defaults to the global accent today.
   - **No-resource case** — PC participants whose class has no heroic resource (none in current canon, but a future homebrew class might): the cell collapses to empty, recovers horizontal space for adjacent cells.

2. **Populate recoveries** with a sibling `HeroRecoveriesCell.tsx`:

   ```
   ┌──────────┐
   │ Rec      │   "Rec" label, mono-dim
   │ 5/8      │   tabular current/max
   └──────────┘
   ```

   - `participant.recoveries.current / participant.recoveries.max` straight from the existing pool.
   - No visualization beyond the count (recoveries are 0–10 typically; a pip row would compete with the resource cell).

3. **Lift the player-view gating for resources + recoveries.** Pass-2a hid both for non-self rows on player view; that was a row-compactness call from before resources had real visual treatment. With the new cells, heroic resources stay public (canon: a player can see another player's resource pool at the table). The role-line stays gated as today on player view (still a row-compactness choice for the meta line).

`PartyRail.tsx` change:

```tsx
// before
resource={isGated ? null : undefined}
recoveries={isGated ? null : undefined}

// after
resource={<HeroResourceCell participant={h} />}
recoveries={<HeroRecoveriesCell participant={h} />}
```

Monster rows on `EncounterRail.tsx` keep `resource={undefined}` and `recoveries={undefined}` — both cells collapse to empty space in the grid (same as today).

**Mobile fallback** — at phone-portrait widths (≤ 440px container), `HeroResourceCell` drops the pip row and renders just `{Name} {value}` ("Focus 7"). The recoveries cell stays. Stamina + reticle continue to pin to the right edge.

### UI: stamina bar with inset readout

The `ParticipantRow` stamina cell currently stacks a `<numeric>` element above a 4px `HpBar compact` bar. 2b2a replaces both with a single taller bar that hosts the readout inside it.

```
┌──────────────────────────────────┐
│           ████████ 78/110        │   22px tall; fill colored by HP zone;
└──────────────────────────────────┘    text centered atop the cell with shadow
```

`apps/web/src/primitives/HpBar.tsx` gains a new `variant: 'inline'` mode alongside the existing `compact` and `size` props:

```ts
export type HpBarProps = {
  current: number;
  max: number;
  size?: 'sm' | 'lg';
  compact?: boolean;
  variant?: 'inline';     // NEW — 22px tall with inset current/max readout
};
```

Inline variant rules:

- **Container** — 22px tall, no rounded corners (matches Pass-1 `--r-* = 0` token).
- **Unfilled background** — same hue as the active fill but desaturated, so a low-HP row reads as "red zone" even before the eye finds the fill.
- **Fill rectangle** — uses today's good / warn / bad thresholds (≥50% / ≥25% / <25%) with the existing `--hp-good` / `--hp-warn` / `--hp-bad` tokens. New paired tokens `--hp-good-dim` / `--hp-warn-dim` / `--hp-bad-dim` (~0.50 lightness, same chroma) for the background half.
- **Inset text** — mono-bold cream, centered, with a subtle dark text-shadow (legibility independent of fill color underlying any given pixel). The `/max` portion renders in a dimmer weight so `current` reads dominant.

`ParticipantRow.tsx` stamina cell:

- Cell width grows from 110px to 140px to accommodate 4-digit stamina (`152/200`) cleanly.
- Cell collapses from a two-element flex-column (numeric label + compact bar) to a single `<HpBar variant="inline" current={s} max={m} />` element.

Existing non-rail consumers of `HpBar` (DetailHeader stamina readout, character-sheet stamina display) keep their `compact` / `size` modes — the inline variant is opt-in and rail-scoped in 2b2a.

### UI: DetailPane Full-sheet for monsters

`apps/web/src/pages/combat/detail/FullSheetTab.tsx` already branches on `focused.kind === 'pc' ? <PcBlocks /> : <MonsterBlocks />`. Today the monster branch shows just the abilities list. Replace with a real stat-block above the abilities.

New `apps/web/src/pages/combat/detail/MonsterStatBlock.tsx` (~90 lines):

```
┌─────────────────────────────────────┐
│ Knight Heretic                      │   header carries through to outer DetailHeader
│ [ELI] L5 · DEFENDER  [HUMAN]        │   meta line: rank pill, level+family, ancestry chip(s)
├─────────────────────────────────────┤
│ Might  Agil  Reas  Intu  Pres       │   characteristic 5-up grid (one cell each)
│  +3     +1   -1    +0    +2         │
├─────────────────────────────────────┤
│ Size 1M · Speed 5 · Stab 2          │   physical-stats row (wraps as needed)
│ Free Strike 5 · EV 12               │
│ Immune Fire 2 · Weak Holy 2         │   defenses (rendered only when non-empty)
│ With Captain                        │   label-line + body (rendered only when non-null)
│   +1 to Free Strike                 │
└─────────────────────────────────────┘
```

The header (name + meta) is rendered by the existing `DetailHeader.tsx` — extend it to accept the rank-pill data and the ancestry chip list (it already takes name + level today). The "stat-block card" below the header is the new `MonsterStatBlock` component. The existing condition row, stamina readout, and abilities list flow above and below as today.

### UI: AbilityCard refactor

`apps/web/src/pages/combat/AbilityCard.tsx` (240 lines today) rewritten. New shape:

```
┌──────────────────────────────────────────────────┐
│ Reaving Slash                          Melee 1   │   name left, distance right (mono dim)
│ Strike · Weapon · Melee · Signature              │   keywords as mono-dim inline list
│                                                  │
│ [ SET A TARGET ]                                 │   (optional) prompt strip when no target picked
│                                                  │
│ 2d10 +5 · vs Stamina    [ Roll 2d10 ] [ ⋯ ]      │   formula + soft-gray Roll + overflow
│                                                  │
│ ┌─────────┬─────────┬─────────┐                  │
│ │ ≤11     │ 12–16   │ 17+     │                  │
│ │ 5 dmg   │ 9 dmg · │ 13 dmg ·│                  │
│ │         │ Bleed   │ Bleed · │                  │
│ │         │ (EoT)   │ push 1  │                  │
│ └─────────┴─────────┴─────────┘                  │
│                                                  │
│ Effect  If this attack reduces the target to 0…  │   only when ability.effect present
└──────────────────────────────────────────────────┘
```

Decisions locked in brainstorming:

- **Roll button** is small (~32px height), mono-uppercase label, **lighter-gray chrome** (background bound to a new soft-action token — pale cream tint, ink-0 foreground — sits with quiet presence). Not the filled accent variant. Inline next to the power-roll formula. Disabled when no target picked / not your turn / WS closed.
- **Overflow `⋯`** — 32px square button next to Roll. Opens a popover with Tier 1 / Tier 2 / Tier 3 force buttons (replaces today's inline expander entirely). New component `RollOverflowPopover` leans on Radix Popover (already in the dependency graph from Pass-1 primitives).
- **Tier columns** — three equal-weight cells. Each cell renders prose: `{damage}{ damageType when typed} damage` followed by ` · {Condition} ({duration})` for each tier condition, then ` · {effect}` for the tier's effect text. Untyped damage omits the type word ("5 damage" not "5 untyped damage"). Typed damage folds into the prose ("9 fire damage"). Today's `target` vs. `other` condition-scope distinction renders as `other`-scope conditions in italic-dim text (preserving the "this won't auto-apply" hint).
- **Power-roll formula line** — `2d10 {bonus} · vs {targetCharacteristic}`. The bonus is `ability.powerRoll.bonus` rendered verbatim (already a string like `+2` or `+5`). The `vs {target}` half requires a `targetCharacteristic` field that the current data pipeline doesn't surface — the parser change is described under "Data pipeline addition" below.
- **No-target-yet state** — replaces the existing `disabled`-only state with a `target-prompt` strip rendered between the keywords line and the formula line, reading `SET A TARGET` in foe-tone with a dashed border. The Roll button stays disabled. Strip clears as soon as `targetParticipantIds[0]` is set.
- **Read-only view** (other-player observation of someone else's sheet) — formula line, tier columns, and effect text all render; Roll button and `⋯` are hidden entirely.

The `TYPE_CHIP_STYLE` map and the type-chip render path are retained — useful in PC card density even though the new mockup omits the chip for visual quiet. The `costLabel` (e.g. `Signature Ability`, `2 Malice`) folds into the keyword line as the last entry (mono-dim, consistent with the others) and the explicit type chip drops out of the default render. Spec note: if a future eye-test reveals the chip is missed, restoring it is a 5-line addition — keep `TYPE_CHIP_STYLE` exported.

### Data pipeline addition: `targetCharacteristic`

`AbilitySchema.target` today is free-text ("One creature within Melee 1"). The "vs Stamina" / "vs Reason" half of the power-roll formula is buried in `powerRoll.bonus` parsing context but isn't separately exposed.

`packages/data/src/parse-ability.ts` extends the ability-record output with an optional `targetCharacteristic: 'Stamina' | 'Reason' | 'Reflexes' | null`. The regex extracts it from the powerRoll header line in the source markdown ("Power Roll + Might vs Stamina"). When the parser can't isolate it (free-form effects, area abilities, etc.), the field stays `null` and the UI's formula line gracefully degrades to `2d10 +5` without the `· vs X` suffix.

`AbilitySchema` (`packages/shared/src/data/ability.ts`) gains the optional field. Default `null` keeps every existing parsed-ability fixture parseable.

Coverage expectation: the regex hits ~70-90% of attack-like abilities on first pass. Coverage delta is documented in the spec PS after the parser change lands.

### UI: OpenActions row refactor

`apps/web/src/pages/combat/OpenActionsList.tsx` rewritten onto primitives. New file pair:

- `OpenActionsList.tsx` — wraps a `Section` primitive with heading `Open actions {count}`. Empty-state collapses the whole section (today's behavior, retained).
- `OpenActionRow.tsx` — single row component.

Per-row layout:

```
┌────────────────────────────────────────────────┐
│ ● {title}                          [ CLAIM ]   │   leading dot (hero-tone for-me, gray else)
│   {body text, dim, wraps}                      │
│   FOR YOU · expires end of turn                │   mono-uppercase meta line
└────────────────────────────────────────────────┘
```

Viewer × target matrix:

| Viewer | Target | Background | Dot | Meta line | Button |
|---|---|---|---|---|---|
| Player | self | `bg-hero/6` | hero-tone with glow | `FOR YOU · expires …` | filled hero-tone `Claim` |
| Player | other-player | default ink-2 | neutral gray | `FOR {OWNER} · expires …` | outlined gray `Watching` (disabled) |
| Director | self | `bg-hero/6` | hero-tone with glow | `FOR YOU · expires …` | filled hero-tone `Claim` |
| Director | other-player | default ink-2 | neutral gray | `FOR {OWNER} · expires …` | outlined hero-tone `Claim` (director override) |

Expiry helper in new `apps/web/src/lib/format-expiry.ts`:

```ts
function formatExpiry(oa: OpenAction, currentRound: number): string {
  if (oa.expiresAtRound === null) return 'expires end of encounter';
  if (oa.expiresAtRound === currentRound) return 'expires end of turn';
  if (oa.expiresAtRound === currentRound + 1) return 'expires end of round';
  return `expires round ${oa.expiresAtRound}`;
}
```

The existing `participantOwnerLookup` contract (returns `userId | null`) is extended to a sibling `participantDisplayLookup: (id: string) => { ownerId: string | null; name: string | null }` so the meta line can render `FOR KORVA` rather than `FOR 01KRH2K8…`. The current ID-only resolver moves into the new function (one return field).

CSS-class removal: the `.open-actions-list*` class hierarchy in `apps/web/src/styles.css` is removed; the new rows compose Tailwind utilities + token-bound colors only.

### UI: per-condition palette

`apps/web/src/pages/combat/ConditionChip.tsx` — the `COLORS` map gains nine distinct entries:

```ts
const COLORS: Record<ConditionType, string> = {
  Bleeding:   'text-cond-bleed bg-cond-bleed/14 ring-cond-bleed/50',
  Dazed:      'text-cond-daze   bg-cond-daze/14   ring-cond-daze/50',
  Frightened: 'text-cond-fright bg-cond-fright/14 ring-cond-fright/50',
  Grabbed:    'text-cond-grab   bg-cond-grab/14   ring-cond-grab/50',
  Prone:      'text-cond-prone  bg-cond-prone/14  ring-cond-prone/50',
  Restrained: 'text-cond-restr  bg-cond-restr/14  ring-cond-restr/50',
  Slowed:     'text-cond-slow   bg-cond-slow/14   ring-cond-slow/50',
  Taunted:    'text-cond-taunt  bg-cond-taunt/14  ring-cond-taunt/50',
  Weakened:   'text-cond-weak   bg-cond-weak/14   ring-cond-weak/50',
};
```

Nine new CSS variables in `theme/tokens.css` (per-condition palette decision):

```css
--cond-bleed:  oklch(0.66 0.22 25);    /* red       — DoT */
--cond-daze:   oklch(0.74 0.14 290);   /* violet    — mental */
--cond-fright: oklch(0.74 0.14 330);   /* magenta   — fear */
--cond-grab:   oklch(0.78 0.14 60);    /* amber     — physical hold */
--cond-prone:  oklch(0.74 0.10 90);    /* olive     — physical */
--cond-restr:  oklch(0.70 0.14 40);    /* orange    — physical hold */
--cond-slow:   oklch(0.78 0.14 130);   /* yellow-green — mobility */
--cond-taunt:  oklch(0.78 0.14 250);   /* blue      — mental */
--cond-weak:   oklch(0.72 0.06 240);   /* gray-blue — debuff */
```

Tailwind config extension picks them up under the `cond.*` namespace.

Chip text-color is the saturated hue; backgrounds/rings use the same hue at 14% / 50% opacity for soft fill + visible outline. Touch hit target stays 44pt-min via the existing `min-h-11`. The chip applies to **applied conditions on participants** only — predictive conditions inside AbilityCard tier outcomes render as prose (`Bleed (EoT)`), not chips, to preserve the "applied vs. predicted" semantic separation.

### File organization

```
apps/web/src/
├── theme/
│   └── tokens.css                                +6 rank + 9 cond + 3 hp-dim CSS variables
├── primitives/
│   ├── HpBar.tsx                                 +variant: 'inline' mode (22px + inset text)
│   └── ParticipantRow.tsx                        stamina cell → single inline HpBar (140px)
├── pages/combat/
│   ├── ConditionChip.tsx                         COLORS rewrite (9 distinct)
│   ├── AbilityCard.tsx                           full rewrite — tier-grid + inline Roll + overflow
│   ├── OpenActionsList.tsx                       primitive-based wrapper
│   ├── OpenActionRow.tsx                         NEW — single-row component
│   ├── RollOverflowPopover.tsx                   NEW — manual-tier popover (Radix)
│   ├── PartyRail.tsx                             populates resource + recoveries slots
│   ├── detail/
│   │   ├── FullSheetTab.tsx                      monster branch composes MonsterStatBlock
│   │   ├── DetailHeader.tsx                      +rank pill + ancestry chips
│   │   └── MonsterStatBlock.tsx                  NEW — rulebook stat-block
│   └── rails/
│       ├── rail-utils.ts                         summarizeRole rewrite (discriminated tuple)
│       ├── RoleReadout.tsx                       NEW — rank-pill + family + level
│       ├── rank-palette.ts                       NEW — RANK_PALETTE table
│       ├── HeroResourceCell.tsx                  NEW — label + 8-pip + overflow
│       └── HeroRecoveriesCell.tsx                NEW — label + current/max
├── lib/
│   └── format-expiry.ts                          NEW — formatExpiry helper
└── styles.css                                    removes .open-actions-list* CSS classes

packages/shared/src/
├── participant.ts                                +9 nullable monster/PC meta fields
└── data/ability.ts                               +optional targetCharacteristic field

packages/rules/src/
└── intents/start-encounter.ts                    stamps the new fields at materialization

packages/data/src/
└── parse-ability.ts                              emits targetCharacteristic when extractable
```

## Constraints and risks

- **AbilityCard rewrite is the largest single change.** 240 lines → ~180 lines but with a different structure. Test surface: the tier-prose extraction logic (typed-damage formatting, multi-condition concatenation, target-scope vs. other-scope italicization), the no-target prompt, the read-only render path. Migrate the existing snapshot tests panel-by-panel.
- **`targetCharacteristic` parsing crosses the data-pipeline boundary.** The regex coverage isn't 100% — abilities with non-standard power-roll headers will keep `null`. The UI's formula line gracefully degrades to `2d10 +5` (no `· vs X` suffix) so the worst-case is a less-informative line, not a crash. Document coverage in the PS after the parser change lands.
- **Pre-2b2a snapshot graceful degradation.** A loaded snapshot of a 2b1-era encounter has `role: null` on every monster and `className: null` on every PC. The rail readout falls back to `L{level} · FOE` / `L{level} · HERO` (no rank pill, no class name). The DetailPane monster stat-block renders the characteristic grid + immunities + weaknesses (already on the participant via Epic 2D's snapshot) but shows `—` placeholders for `size`, `speed`, `stability`, `freeStrike`, `ev`. The director can restart the encounter to refresh; no migration intent is required.
- **Tier-prose loses the "auto-applied vs. manual" pill-chip distinction** today rendered as colored-chip-vs-italic-chip in TierRow. New prose: target-scope conditions render normal weight; other-scope conditions render italic-dim. Same information, different surface. The tooltip hover (today: `Auto-applied on hit · {duration}`) becomes a `title` attribute on the italic-dim text.
- **OpenAction queue is empty most of the time in 2b2a.** Until 2b.0.1 populates `OpenActionKindSchema` and adds raisers, queued entries come only from manual-test fixtures. The new chrome ships but isn't exercised at the table until 2b.0.1.
- **Rank palette extends into the encounter builder later.** When 2b2b ships C3 picker filtering, the rank filter chips reuse the same `RANK_PALETTE` table. Today's palette is encoder-aware ("MIN" abbreviates Minion) — if a future SteelCompendium ingest changes the rank vocabulary, the palette needs the same change.
- **Power-roll formula source.** `ability.powerRoll.bonus` is a string today; the new formula line just prepends `2d10 ` and appends ` · vs {targetCharacteristic}` — no numeric parse, no risk of mis-handling odd inputs ("+1d3", etc., which DO occur in fixture data).
- **Read-only state preservation for AbilityCard.** Pass-2a's `readOnly` prop hides Auto-roll + Manual today; the new design hides Roll + `⋯`. Behavior parity preserved; tests update to match button names.
- **Color-pack pip color today is global.** Every PC's resource pips read `var(--pk, var(--accent))` which falls back to the global accent in 2b2a (because no row carries a `pack-X` class yet). When Layer 2 wires per-PC `colorPack` persistence + the `pack-X` class application, every PC's pips switch to their pack hue with zero changes inside 2b2a.
- **Geist Mono in the rendered app vs. system mono in mockups.** The visual companion screens render with `ui-monospace` (SF Mono on Mac); the app uses Geist Mono per Pass-1 tokens. The two are visually similar but not pixel-identical — the user's expectation set in the browser mockups will be ~95% met by Geist Mono.
- **`HeroResourceCell` for classes without a heroic resource.** Canon: every PC class has one heroic resource baseline. The cell collapses to empty when `participant.heroicResources[0]` is undefined, recovering horizontal space — no error path. A future homebrew class without a resource just renders without the cell.
- **`participantDisplayLookup` extension.** The new resolver returns `{ ownerId, name }` — the existing `participantOwnerLookup` callers (just the OpenActionsList itself) migrate atomically. No other consumers.
- **`HpBar` variant addition is opt-in.** Existing `compact` and `size` modes preserved verbatim; non-rail consumers (DetailHeader stamina readout, character-sheet displays) keep their current rendering. Spec change is purely additive — adding `variant: 'inline'` to the discriminated prop set.

## Acceptance

Pass 2b2a is done when:

1. A fresh encounter started after 2b2a deploys shows rank-pill + family on every monster row (Min gray / Hor green / Pla teal / Eli violet / Led amber / Sol red) and class-name on every hero row (`L5 · TACTICIAN`).
2. Loading a pre-2b2a snapshot falls back to `L{level} · FOE` on monsters and `L{level} · HERO` on heroes with no crashes; the DetailPane monster stat-block shows `—` placeholders for the new fields.
3. Each hero row on `PartyRail` shows the heroic-resource cell (resource name + 8-pip row + `+N` overflow when value > 8) and the recoveries cell (`Rec current/max`). Player view sees the same content on every hero row (resource gating lifted).
3a. Every `ParticipantRow` (hero and foe) renders the stamina cell as a single 22px-tall `HpBar variant="inline"` with the `current/max` readout centered inside; the fill switches good/warn/bad against the existing thresholds and the unfilled half uses a desaturated paired hue. Cell width is 140px.
4. The DetailPane Full-sheet tab focused on a monster renders the rulebook stat-block (characteristic 5-up + size/speed/stab/free-strike/EV row + immunities/weaknesses when present + With-Captain when present) above the abilities list.
5. The AbilityCard renders as a three-column tier-grid with an inline lighter-gray Roll button and a `⋯` overflow popover for manual rolls. Tier columns render damage / conditions / effect as prose; typed damage folds the type into the prose; untyped damage omits the type word.
6. Selecting no target shows the `SET A TARGET` foe-dashed prompt strip and disables Roll; setting a target clears the prompt and enables Roll.
7. The `⋯` overflow popover opens a Tier 1 / Tier 2 / Tier 3 chooser; clicking dispatches a manual roll with the source flag, same as today's expander.
8. The OpenActionsList renders inside a Section primitive with the active count appended to the heading; each row carries a leading dot, the for-you tint when relevant, the expiry meta line, and the role-aware Claim/Watching button per the viewer × target matrix.
9. The nine canon conditions each render with their own hue per the palette (Bleeding red, Dazed violet, Frightened magenta, Grabbed amber, Prone olive, Restrained orange, Slowed yellow-green, Taunted blue, Weakened blue-gray) — visible on a participant carrying multiple conditions.
10. The `open-actions-list*` CSS class hierarchy is removed from `styles.css`; OpenActions composes utilities only.
11. `pnpm test`, `pnpm typecheck`, `pnpm lint` clean repo-wide. New reducer test on `start-encounter.spec.ts` asserts monster meta fields are stamped from static data and PC className is stamped from the character blob; the existing PC-snapshot tests get the new fields as `null` and remain green.
12. Spot-check screenshots at iPad-portrait (810 × 1080) and iPhone-portrait (390 × 844): rails with 6 different rank tiers, monster Full-sheet stat-block, ability card with target picked, ability card with `SET A TARGET` prompt visible, OpenActions row in for-you variant + watching variant, condition chip cluster on a participant with three conditions.

## Out-of-scope confirmations

- No new OpenAction kinds — that's 2b.0.1.
- No encounter-builder changes — that's 2b2b.
- No chrome (Mode-C chip embellishment or Mode-B nav additions) — that's 2b2c.
- No theme picker / pack-color picker — Layer 2.
- No action effects — Layer 3.
- No engine work beyond the `StartEncounter` stamping path.
- No DB migration.

## PS — post-shipping fixes

After the plan lands and the dev server comes up, eye-testing will likely surface gaps that aren't visible at design time. Each is a small change layered on top of the Pass-2b2a plan. Capturing them here so the spec stays a complete record of what shipped.

### 1. Combat tracker crashed on encounters with pre-2b2a participants — WS-mirror undefined-vs-null gap

**Symptom.** Opening `/campaigns/$id/play` on an encounter that started before 2b2a deployed threw `TypeError: Cannot read properties of undefined (reading 'split')` from `parseMonsterRole`. Stack: `EncounterRail` → `roleReadoutFor` → `parseMonsterRole(p.role)`. The crash bypassed the `monster-fallback` branch because the check `p.role === null` is strict equality, but the field was `undefined` (not `null`) on WS-mirrored monster snapshots.

**Root cause.** Identical to Pass 2a PS #1. The WS mirror in `useSessionSocket.ts` builds Participant snapshots without running them through `ParticipantSchema.parse`, so the new `.default(null)` clauses never fire — fields are genuinely `undefined`, not the `null` the TypeScript type promises. Every Pass-2b2a-introduced field that the consumer accesses without defaulting is a latent crash.

**Fix** ([`d7e112d`](../../..)). Defensive `undefined`-tolerance in three consumers:
- `rail-utils.ts` — `p.role === null` → `p.role == null` (loose equality catches both null and undefined).
- `DetailHeader.tsx` — `focused.ancestry.length > 0` → `(focused.ancestry ?? []).length > 0`, same guard on the `.map()` site.
- `MonsterStatBlock.tsx` — destructured `immunities` / `weaknesses` rebound as `safeImmunities` / `safeWeaknesses` with `?? []` fallback (used by `hasDefenses` and the render); `withCaptain !== null` → `withCaptain != null`.

Plus regression tests in `RoleReadout.spec.tsx` (asserts `roleReadoutFor({ role: undefined })` returns `monster-fallback`) and `MonsterStatBlock.spec.tsx` (asserts a monster with `immunities/weaknesses/withCaptain` all `undefined` renders without throwing).

**Lesson.** Same as Pass 2a PS #1: when adding optional `nullable().default(...)` fields to `ParticipantSchema`, the WS-mirror path bypasses Zod parsing. Every consumer of a new field must defend against runtime `undefined` regardless of the TypeScript contract. The WS mirror itself should ideally re-parse through the schema, but that's a broader refactor — for now, consumer-side `??` / `==` is the pragmatic guard.

### 2. Stamina bars rendered with no fill — Tailwind v4 JIT can't see template-interpolated class names

**Symptom.** At the table the new inline-variant stamina bars rendered as bordered outlines with the `current/max` numeric centered inside, but no colored fill — neither the `--hp-*-dim` background nor the `--hp-*` fill rectangle showed any color. The bars looked like empty boxes with text.

**Root cause.** `HpBar.tsx`'s inline variant used template-literal class names: `` `… bg-hp-${zone}-dim` `` and `` `… bg-hp-${zone}` ``. Tailwind v4's JIT scanner only generates CSS for class strings it can see as static literals in source. Template interpolation silently fails — the six classes (`bg-hp-good`, `bg-hp-warn`, `bg-hp-bad`, `bg-hp-good-dim`, `bg-hp-warn-dim`, `bg-hp-bad-dim`) never made it into the generated CSS bundle. Test assertions on `container.innerHTML` matching `/hp-good/` still passed because the class names *were* in the HTML — they just had no corresponding CSS rules.

**Fix** ([`995272d`](../../..)). Static lookup maps for the inline variant:

```ts
const INLINE_FILL: Record<'good' | 'warn' | 'bad', string> = {
  good: 'bg-hp-good', warn: 'bg-hp-warn', bad: 'bg-hp-bad',
};
const INLINE_BG: Record<'good' | 'warn' | 'bad', string> = {
  good: 'bg-hp-good-dim', warn: 'bg-hp-warn-dim', bad: 'bg-hp-bad-dim',
};
```

JSX consumes `${INLINE_FILL[zone]}` / `${INLINE_BG[zone]}` instead of template-interpolated names. Comment added above the maps documenting the Tailwind v4 pitfall so future passes don't reintroduce it. The legacy non-inline path's `` `bg-hp-${zone}` `` is left as-is — it sits inside a literal-string ternary structure that the scanner already picks up via the existing branches.

**Lesson.** Tailwind v4 JIT requires literal class strings. Any time a class name is composed from a variable, hoist the variants into a static `Record<KeyEnum, 'class-name'>` map so the scanner sees every literal. Template interpolation will compile and pass tests but silently produce empty CSS.

### 3. HeroResourceCell — inline total next to label; drop the +N overflow line

**Symptom.** At the table the overflow numeric below the pips read awkwardly. With Sir John at 11 Focus, the cell stacked `FOCUS` / `●●●●●●●●` / `+3` across three lines — the `+3` looked like a stat modifier, not "you have 11 total." Pips read as the source of truth; the total only appeared when overflowing.

**Fix** ([`d6c323c`](../../..)). Inline the total numeric next to the resource name on the label line; pips become a pure glance-aid. `HeroResourceCell` now renders:

```
FOCUS 11      (name mono-mute + value bright bold)
●●●●●●●●     (8 pips, capped at 8 filled regardless of value)
```

The `+{overflow}` block is removed entirely. Pip semantics unchanged (`min(value, 8)` filled). Spec test renamed to "value > 8 fills all 8 pips and shows the full total on the label" — drops the `/\+2/` assertion, adds `getByText('10')` for the on-label total.

**Lesson.** When a cell has both a discrete visual and a numeric, the numeric should be the source of truth and live on the labeled line; the visual should saturate without leaking arithmetic. The original design's two-line overflow read as a separate datum.

### Maintenance note

Future post-shipping fixes to Pass 2b2a layer the same way: append a numbered entry to this PS section with a one-line symptom, a one-paragraph fix, and the relevant commit SHA. Once a follow-up entry has shipped *and* been verified in real use, leave it in place — the doc is the historical record, not a TODO list.
