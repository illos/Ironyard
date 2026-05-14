# Phase 5 Layer 1 (Base) — Pass 1: light full base pass + active-context-aware IA

**Status:** Designed, awaiting plan.
**Parent:** Phase 5 — UI rebuild ([phases.md](../../phases.md#phase-5--ui-rebuild)). Pulled forward from end-of-Phase-4 to unblock visual eye-tests of Phase 2b work.
**Successor:** Pass 2 — combat tracker + encounter builder deepening (a follow-up spec). Layer 2 (Theme picker + pack-color implementation) and Layer 3 (Action Effects) remain in their original Phase 5 sequence.
**Scope notes:** designed inline through a brainstorming session on 2026-05-14 with reference HTML mockups at `docs/design ref/` as the directional anchor. The mockups are "closer to what the user wants, not final" — Pass 1 establishes structural bones; further iteration is expected on top.

## One-line summary

Replace the prototype-grade UI with a token-driven, primitive-extracted Base layer applied across every route, restructure the navigation and home flow around the new "active campaign + active character" model with role-gated chrome (active-director vs. player), and replace `CombatRun` with a unified Director Combat surface — while leaving the deeper combat / encounter-builder polish for Pass 2.

## Goals

- Establish a single source of truth for visual tokens (color, type, space, motion) as CSS variables in OKLCH, scoped so theme (light/dark) and pack-color accent can both compose at runtime.
- Extract a primitives layer (`AppShell`, `TopBar`, `ContextStrip`, `Section`, `SplitPane`, atoms, composites) that every page consumes; eliminate the inline-style accumulation that produced today's UI.
- Replace the static `Nav` with a role-aware `TopBar` driven by **active campaign** and **active director** state; surface the active character to players via a right-aligned chip.
- Make `/` (Home) dynamic: an empty-state with Start/Join CTAs when no active campaign, the active campaign's content otherwise.
- Replace `CombatRun` with `DirectorCombat` — a unified surface (party rail + encounter rail + selected-participant detail + Mode-B contextual top bar) matching the `docs/design ref/director-combat/` mockup.
- Add the sheet's tabbed sub-nav (Overview / Abilities / Features / Story / Activity) and the wizard's split-pane live preview from the reference mockups.
- Re-theme every other route on the new tokens and primitives.
- Design (do not implement) the active-context persistence model so a later pass can wire it up without restructuring this layer.

## Non-goals (deferred to Pass 2 or to Layer 2 / 3 as noted)

- **Pass 2:** deeper Director Combat interactions (drag-reorder of initiative, gestural target-picking, ability-card layout polish, monster stat-block deepening, OpenActions row affordances refinement). Deeper EncounterBuilder UI. Embellished active-character right-chip (status/token counts/etc.).
- **Layer 2:** Light theme palette beyond a placeholder slot in tokens; theme picker UI. Pack-color picker UI. Per-character `color_pack` persistence. Per-participant pack-color tinting in the combat tracker (Pass 1 ships uniform accent — the CSS-variable scope mechanism is in place but every row uses the default).
- **Layer 3:** Action effects entirely (animations, sound, haptics, ember-border ability buttons, level-up bar, etc.).
- **Active-context persistence:** the schema target is documented below; Pass 1 hardcodes / infers active context (e.g., from the URL or the user's only-campaign-or-character).
- **Director nav trailing items beyond `Foes`** — the user expects additional director-only entries to appear here; their surface and content are not yet decided and are tracked as a Pass 2 design item. The chrome leaves room.
- **Brand identity (logo, marketing site).** Pass 1 keeps the simple `Ironyard` wordmark + monogram square from the mockup; full identity work stays in Layer 1 long term, but is not a Pass 1 deliverable.

## Architecture

### Token system

Tokens live in `apps/web/src/theme/tokens.css` and are consumed by Tailwind via `theme.extend` reading the CSS variables. The token surface is:

```css
:root {
  /* Surface elevation — warm charcoal */
  --ink-0: oklch(0.20 0.003 80);   /* page */
  --ink-1: oklch(0.235 0.003 80);  /* card */
  --ink-2: oklch(0.275 0.003 80);  /* row */
  --ink-3: oklch(0.32 0.003 80);   /* chip / inner */
  --ink-4: oklch(0.40 0.003 80);   /* emphasis */
  --line: oklch(0.44 0.003 80 / 0.7);
  --line-soft: oklch(0.44 0.003 80 / 0.35);

  /* Text */
  --text: oklch(0.90 0.003 80);
  --text-dim: oklch(0.70 0.004 80);
  --text-mute: oklch(0.54 0.004 80);

  /* Side tones */
  --hero: oklch(0.78 0.04 220);
  --foe:  oklch(0.62 0.16 25);

  /* Stamina states */
  --hp-good: oklch(0.76 0.16 150);
  --hp-warn: oklch(0.82 0.18 80);
  --hp-bad:  oklch(0.66 0.22 25);

  /* Accent (per-character pack) — defaults to Lightning */
  --accent:        oklch(0.82 0.16 230);
  --accent-strong: oklch(0.90 0.18 220);
  --accent-glow:   oklch(0.78 0.18 230 / 0.5);

  /* Geometry */
  --r-sm: 0; --r-md: 0; --r-lg: 0; --r-xl: 0;  /* flat */
  --shadow-card: none;
}

:root[data-theme="light"]  { /* light palette overrides — slot-only in Pass 1 */ }
:root[data-pack="shadow"]   { --accent: …; --accent-strong: …; --accent-glow: …; }
:root[data-pack="fireball"] { … }
:root[data-pack="chrome"]   { … }

/* Per-element pack scoping — only needed where multiple packs coexist (combat tracker rows) */
.pack-lightning { --pk: …; --pk-strong: …; --pk-glow: …; }
.pack-shadow    { … }
.pack-fireball  { … }
.pack-chrome    { … }
```

Convention: page-wide accent reads `--accent` (set on `:root` via `data-pack`); per-row contexts (combat-tracker participant rows) use `--pk` (set via a `.pack-X` class on the row). Components default to `--pk, var(--accent)` so they work in either scope. Pass 1 ships with the page-wide `--accent` only — `--pk` plumbing is wired in primitives but every row falls back to the global accent until Layer 2.

Typography: Geist sans + Geist Mono, with `font-feature-settings: "ss01", "ss02", "cv11"`. `font-variant-numeric: tabular-nums` on all stat readouts. Five sizes: display / title / body / label (uppercase tracked) / mono-num.

Spacing: 4px base; canonical steps 4 / 8 / 10 / 12 / 14 / 16 / 24 / 32.

Motion: 140ms ease standard transitions, 360ms ease progress bars, 480ms `cubic-bezier(.3, .7, .4, 1)` for stamina, 2.2s pulse loop for active-turn affordances. No spring physics.

Density: `data-density` on the AppShell root accepts `compact` / `default` / `roomy` — drives row padding on participant lists and similar density-sensitive primitives.

### Theming architecture

The `ThemeProvider` mounts at the AppShell level. It reads the active-context (see below) and sets three attributes on the document root:

| Attribute | Source | Pass 1 default |
|---|---|---|
| `data-theme` | `users.theme` (eventually) | `"dark"` |
| `data-pack` | active character's `colorPack` | `"lightning"` |
| `data-density` | user preference (eventually) | `"default"` |

The provider is a thin client-only component; no flash-of-unstyled-content protection is needed for Pass 1 because we ship a single hardcoded combination. When Layer 2 wires real preferences, the provider becomes the single place to hydrate them.

### Active-context model (designed; persistence deferred)

This is the load-bearing IA decision. The site organizes itself around two pieces of per-user state:

- `users.active_campaign_id` — the campaign the user is currently "in." Set automatically on join/create. Switched explicitly via Account → Campaigns.
- `campaign_memberships.active_character_id` — per campaign, which of the member's characters is the player's active hero. (A user may have multiple characters per campaign; one is active. Director-permitted users still have an active character in campaigns where they play.)

Eventual D1 additions (not in Pass 1):

```sql
ALTER TABLE users ADD COLUMN active_campaign_id TEXT REFERENCES campaigns(id);
ALTER TABLE campaign_memberships ADD COLUMN active_character_id TEXT REFERENCES characters(id);
ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'dark';
ALTER TABLE characters ADD COLUMN color_pack TEXT NOT NULL DEFAULT 'lightning';
```

Pass 1 does **not** add these columns. It surfaces the concept in the type system (a `useActiveContext()` hook) and infers values:

- `active_campaign_id` ← inferred from the URL (`/campaigns/:id/*` routes), with `null` otherwise. The eventual persisted value subsumes this trivially.
- `active_character_id` ← inferred from the campaign roster: the first approved character the user owns in that campaign.
- `theme` ← hardcoded `"dark"`.
- `color_pack` ← hardcoded `"lightning"` for everyone (so the visual landscape uses a single accent until Layer 2).

When Layer 2 / a later epic adds the columns, the hook switches from URL-inference to a fetched user-state query; no consumer changes.

### Chrome — three top-bar modes

`TopBar` is rendered by `AppShell` and chooses a mode from the resolved route + active-context:

- **Mode A — No active campaign.** Brand · Home · Account ▾. Sign-in / sign-out flows are inside the Account menu.
- **Mode B — Active campaign, active director.** Brand · Home · Account ▾ · Foes. Additional director-only items may appear here in later work (see Non-goals). The campaign breadcrumb (campaign / session / encounter) and round/victories/malice readouts from the reference mockup appear here when inside the campaign's surfaces (`/campaigns/:id*`).
- **Mode C — Active campaign, player.** Brand · Home · Account ▾ · right-aligned active-character chip. The chip is stacked: small mono uppercase username above, larger character name in pack color below. Embellishment (token counts, status indicators) is Pass 2.

Director gating semantic: **active director only** — `actor.userId === state.activeDirectorId`. A director-permitted member who is not currently behind the screen sees Mode C until they `JumpBehindScreen`.

Account ▾ contents (identical across modes): `Campaigns` · `Characters` · `Sign out`.

### Home (`/`) — dynamic

| Active context | Behavior |
|---|---|
| No active campaign | Empty-state page: "No active campaign — Start a campaign · Join a campaign" with prominent CTAs |
| Active campaign set | Navigates to `/campaigns/:activeId` and renders that campaign's surface. (Pass 1: simple redirect. Pass 2 may render the campaign content in-place under `/`.) |

### Route restructure summary

| Route | Pass 1 treatment |
|---|---|
| `/` | **Dynamic** — empty-state or routes to the active campaign |
| `/campaigns` | Re-theme |
| `/campaigns/:id` | Campaign admin hub (members, character approval, sessions, templates, owner controls). Structure kept; re-themed |
| `/campaigns/:id/build` | EncounterBuilder, re-theme only (Pass 2 deepens) |
| `/campaigns/:id/play` | **Replaced** by `DirectorCombat` — unified party rail + encounter rail + selected-participant detail; Mode-B top bar |
| `/characters` | Re-theme |
| `/characters/:id` | Sheet, re-theme + new in-page tabs: Overview / Abilities / Features / Story / Activity |
| `/characters/:id/edit` & `/characters/new` | Wizard, re-theme + split-pane live preview |
| `/foes`, `/foes/:id` | Re-theme; nav link visible to active director only |

### Component primitives — extraction list

Each primitive lives in `apps/web/src/primitives/` and is exported via `primitives/index.ts`. The list is not optional surface area — these are what every page composes from.

**Layout / chrome**

- `AppShell` — root frame. Mounts `ThemeProvider`, resolves the top-bar mode from route + active-context, renders `TopBar` and `Outlet`. Holds `data-theme` / `data-pack` / `data-density` attributes.
- `TopBar` — single component, mode passed as prop (or self-resolved from route). Slots: brand (fixed), middle (links or breadcrumb), trailing (buttons or active-character chip).
- `ActiveCharacterChip` — Mode-C trailing element: stacked small-username + larger character-name in pack color. Plain content in Pass 1; embellished in Pass 2.
- `Section` — bordered card with an uppercase tracked header (`PARTY · 4 HEROES`) plus a right slot. Used across the campaign hub, sheet panels, combat rails.
- `SplitPane` — two-column responsive layout with a configurable column ratio. Single-column on phone breakpoint.

**Atoms**

- `Button` — variants `default | primary | ghost`, sizes `sm | md`. Flat, accent-aware (primary fills with `--accent`).
- `Chip` — pill or square depending on role; selected state; size variants. Used for skills, conditions, tags.
- `Stat` — small uppercase mono label + tabular numeric value (`ROUND 3`, `VICTORIES 2`).
- `Pill` — rounded container with leading dot; used for Malice indicator and similar status.
- `Sigil` — 2-letter monogram square (32px default). Used in participant rows and character lists.
- `Pip` / `PipRow` — discrete count display for hero tokens, surges, recoveries.
- `HpBar` — stamina bar with `good | warn | bad` color states; over-max / temp-stam slots; existing `HpBar.tsx` is refactored onto this primitive.
- `Divider` — hairline; vertical or horizontal; soft / full variants.

**Composites**

- `ParticipantRow` — combat-tracker row. Sigil · name + role · conditions · per-class resource pips · stamina. Accepts a `colorPack` prop that applies `pack-X` class (Pass 1: ignored; defaults to global accent).
- `CharacteristicCell` — `MIG +0` / `AGI +1` / etc. Shared by sheet and wizard.
- `SkillChipGroup` — grouped skill chips (Crafting / Exploration / Interpersonal / Intrigue / Lore) with selected state.
- `Tabs` — keyboard-accessible tab strip. Used by the sheet's new in-page sub-nav.
- `Modal` — re-themes the existing `PushItemModal`, `SwapKitModal`, `RespiteConfirm` shells.
- `Toast` — `ToastStack.tsx` reskinned with Undo affordance.

Existing components retained but re-themed onto the primitives: `AbilityCard`, `ConditionChip`, `OpenActionsList`, `PlayerSheetPanel`, `DetailPane`, `InitiativePanel`, the wizard steps. Their structural logic stays; only their visual shell changes.

### File organization

```
apps/web/src/
├── theme/
│   ├── tokens.css                CSS variables :root + data-theme + data-pack rules
│   ├── ThemeProvider.tsx         resolves active-context → sets data-* on document root
│   ├── density.ts                small helper for data-density resolution
│   └── index.ts                  re-exports ThemeProvider + helpers
├── primitives/
│   ├── AppShell.tsx
│   ├── TopBar.tsx                exports TopBar with modes A/B/C
│   ├── ActiveCharacterChip.tsx
│   ├── Section.tsx
│   ├── SplitPane.tsx
│   ├── Button.tsx · Chip.tsx · Stat.tsx · Pill.tsx · Sigil.tsx
│   ├── Pip.tsx · HpBar.tsx · Divider.tsx · Tabs.tsx · Modal.tsx · Toast.tsx
│   ├── ParticipantRow.tsx · CharacteristicCell.tsx · SkillChipGroup.tsx
│   └── index.ts                  public exports
├── lib/active-context.ts         useActiveContext() hook — URL-inferred in Pass 1
├── components/Nav.tsx            DELETED (replaced by AppShell + TopBar)
├── pages/
│   ├── Home.tsx                  dynamic by active context
│   ├── CampaignsList.tsx         re-theme
│   ├── CampaignView.tsx          re-theme only
│   ├── EncounterBuilder.tsx      re-theme only
│   ├── CombatRun.tsx             DELETED (functionality moved to combat/DirectorCombat)
│   ├── combat/
│   │   ├── DirectorCombat.tsx    NEW — replaces CombatRun.tsx
│   │   ├── PartyRail.tsx
│   │   ├── EncounterRail.tsx
│   │   ├── DetailPane.tsx        re-themed; existing structure retained
│   │   └── (re-themed) AbilityCard / HpBar / ConditionChip / OpenActionsList / PlayerSheetPanel
│   ├── CharactersList.tsx        re-theme
│   ├── characters/Sheet.tsx      re-theme + Tabs
│   ├── characters/Wizard.tsx     re-theme + SplitPane live preview
│   ├── MonsterBrowser.tsx · MonsterDetail.tsx   re-theme
│   └── director/                  re-themed modals
├── router.tsx                    AppShell becomes the root component
└── styles.css                    trimmed to global resets + token import
```

The `CombatRun.tsx` file is deleted as part of this work — its logic is rehomed inside `pages/combat/DirectorCombat.tsx` plus the new rail components. Tests for the old screen are migrated; the WS / dispatch surface in `useSessionSocket` does not change.

### Tailwind integration

Tailwind config reads the CSS variables via `theme.extend`:

```ts
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        ink: { 0: 'var(--ink-0)', 1: 'var(--ink-1)', 2: 'var(--ink-2)', 3: 'var(--ink-3)', 4: 'var(--ink-4)' },
        line: { DEFAULT: 'var(--line)', soft: 'var(--line-soft)' },
        text: { DEFAULT: 'var(--text)', dim: 'var(--text-dim)', mute: 'var(--text-mute)' },
        hero: 'var(--hero)', foe: 'var(--foe)',
        accent: { DEFAULT: 'var(--accent)', strong: 'var(--accent-strong)', glow: 'var(--accent-glow)' },
        pk: { DEFAULT: 'var(--pk, var(--accent))', strong: 'var(--pk-strong, var(--accent-strong))', glow: 'var(--pk-glow, var(--accent-glow))' },
        hp: { good: 'var(--hp-good)', warn: 'var(--hp-warn)', bad: 'var(--hp-bad)' },
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: { DEFAULT: '0', sm: '0', md: '0', lg: '0', xl: '0' },
    },
  },
};
```

Authoring guidance: primitives expose semantic prop APIs; pages use Tailwind utility classes against the token-bound color names rather than raw hex. The reference CSS in `docs/design ref/*/styles.css` is the source of truth for visual values but is **not** what ships — those files stay as reference. The shipping styles live in `theme/tokens.css` plus Tailwind utilities.

## Constraints and risks

- **Reference CSS is dense and stateful** (turn-pulse animations, multi-state participant rows). Pass 1 implements the static visual states; the dynamic states (active-turn ring pulse, hover/selection animations) are part of Pass 1 only to the extent the existing JSX trees expose those state flags. Anything that requires structural restructuring of state derivation is deferred to Pass 2.
- **CombatRun is the longest file in the app (710 lines)**. Replacing it is the highest-risk slice. The plan should sequence this **last** so primitives are stable when DirectorCombat is built, and migrate behavior tests one panel at a time.
- **Active-context inference may produce surprises** when the user has multiple approved characters in a campaign. Pass 1 picks the first; the eventual persisted setting will fix this. Document this as known.
- **CampaignView is 1214 lines** and gets re-themed (not restructured). Risk: pages with deeply inline styles will need careful migration to primitives. Allocate budget for visual regressions in the panels (`SubmitCharacterPanel`, `PendingCharactersPanel`, `ApprovedRosterPanel`, etc.).
- **Existing tests** for `OpenActionsList`, `RespiteConfirm`, `PushItemModal` reference DOM structure. Re-theming should preserve the test-relevant structure; otherwise plan to update assertions.
- **The mockup's `data-theme="light"` rules** exist but are not exercised in Pass 1; ship dark only and accept that the light slot will need real values from a designer pass later.
- **No design-system documentation site** in Pass 1. Primitives are documented inline (JSDoc + the spec). A Storybook or similar is out of scope here.

## Acceptance

Pass 1 is done when:

1. Every route renders on the new tokens with no remaining inline-style accumulations producing visual inconsistency.
2. `AppShell` + `TopBar` correctly resolve mode A / B / C from the route and `useActiveContext()`; the Foes link is hidden from non-director users in mode B/C.
3. Home shows the empty-state or routes to the active campaign per the active-context rule.
4. `CombatRun.tsx` is deleted; `DirectorCombat.tsx` ships with party rail, encounter rail, selected-participant detail, and the Mode-B top bar — visually matching the `docs/design ref/director-combat/` mockup at static-state fidelity.
5. The sheet has working in-page tabs (Overview / Abilities / Features / Story / Activity); the wizard renders the split-pane live preview alongside its step forms.
6. The Account menu surfaces Campaigns / Characters / Sign out across all states.
7. `pnpm test`, `pnpm typecheck`, `pnpm lint` clean repo-wide.
8. Spot-check screenshots at iPad-portrait (810 × 1080) and iPhone-portrait (390 × 844) for every primary route.

## Out-of-scope confirmations

- Pack-color picker, theme picker, density picker — none ship in Pass 1.
- The schema migration for `active_*` columns is **not** part of Pass 1's work.
- DirectorCombat's mid-encounter interactions (drag-reorder initiative, gestural target picking, ability-card layout deepening) are Pass 2.
- Foes browser content / IA changes are out — only the gating + re-theme.

## PS — Pass-1 follow-up fixes (2026-05-14, post-shipping)

After the 35-task plan landed and the dev server came up, eye-testing surfaced gaps that weren't visible at design time. Each is a small change layered on top of the Pass-1 plan. Capturing them here so the spec stays a complete record of what shipped.

### 1. Active campaign needed an actual UI affordance and persistence

**Symptom.** Spec said active-context was URL-inferred in Pass 1, with persistence deferred. In practice that meant: no visible signal that a campaign was active, no way to set or unset one explicitly, and Home's redirect-to-active-campaign couldn't latch because the only "active" signal was the current URL — which was Home itself.

**Fix** ([`7a1dba0`](../../..)). Promoted `useActiveContext` from URL-only to **localStorage-backed** (`ironyard:activeCampaignId`), with URL inference as a fallback when storage is empty. Added a `setActiveCampaignId(id | null)` setter, a same-tab `'ironyard:active-context-change'` event so multiple consumers stay in sync, and a `storage` listener for cross-tab. Auto-promote on URL visit only writes when storage is empty so an explicit Make-active choice isn't clobbered.

DB columns (`users.active_campaign_id`, `campaign_memberships.active_character_id`) remain deferred — localStorage is the Pass-1.5 wire.

### 2. Home was an empty CTA stub; users couldn't get anywhere useful

**Symptom.** Home's no-active-campaign branch showed `Start campaign` / `Join campaign` buttons that both just routed to `/campaigns`. Users on a fresh open had to click through twice to do anything.

**Fix** ([`7a1dba0`](../../..)). Home's no-active-campaign branch now renders **YOUR CAMPAIGNS** inline:
- One row per owned + joined campaign, with role chip (owner / director / player), invite code, and a per-row **Make active** button (sets active and navigates to `/campaigns/$id`).
- Empty-state copy when the user is in zero campaigns.
- Below the list: **+ Start a new campaign** (primary, → `/campaigns/new`) and **Join with code** (opens a Modal with an invite-code field; on success, sets the joined campaign active and navigates).

The DevLoginPanel (unauthenticated branch) and the active-campaign redirect branch are unchanged.

### 3. New `/campaigns/new` route

**Symptom.** Create-campaign was a form embedded in the `/campaigns` list page, which doesn't compose with Home's "Start a new campaign" CTA.

**Fix** ([`7a1dba0`](../../..)). Added a dedicated `/campaigns/new` route + `apps/web/src/pages/CampaignNew.tsx`. Single name field; on submit calls `useCreateCampaign`, sets the new campaign active, and navigates to its detail page. The legacy create-form still lives in `/campaigns` for direct entry.

Router note: `/campaigns/new` is registered **before** the parameterized `/campaigns/$id` route in `addChildren` to make the static-vs-param ordering explicit (TanStack Router prefers static segments, but explicit ordering is cheaper than a future surprise).

### 4. Test harness gap: Node 25's experimental built-in `localStorage`

**Symptom.** Adding the storage-backed active context's tests revealed that Node 25.9 ships an experimental built-in `localStorage` global that *shadows* jsdom's. The methods aren't actually present on the built-in, so storage-touching code threw at test time.

**Fix** ([`7a1dba0`](../../..)). Added an in-memory `Storage` shim to `apps/web/src/test-setup.ts` that restores `getItem` / `setItem` / `removeItem` / `clear` semantics. Activates only inside the vitest setup file.

### 5. No way to deactivate an active campaign

**Symptom.** Once a campaign was active, clicking Home redirected straight back into it. No affordance to "step out."

**Fix** ([`5feba6d`](../../..) and [`8327186`](../../..)). Two surfaces:
- **AccountMenu** dropdown now shows an `ACTIVE CAMPAIGN` block at the top when one is set: campaign name + a `Deactivate` button (mono uppercase, dim → hover foe). Clicking Deactivate calls `setActiveCampaignId(null)` and navigates to `/`. The block is hidden when no campaign is active.
- **`/campaigns` page rows** mirror Home's interaction: the active row carries an `ACTIVE` chip + `Deactivate` button (which stays on `/campaigns`); inactive rows get `Make active` (which navigates to that campaign).

The active row also uses `border-accent` instead of `border-line` so it's visually distinguishable from inactive rows.

### 6. DirectorCombat crashed with "Rendered more hooks than during the previous render"

**Symptom.** Loading `/campaigns/$id/play` with an active encounter blew up with a Rules-of-Hooks violation. The first render exited via one of the guard returns (loading / not-signed-in / no-campaign-data); subsequent renders, where the guards no longer fired, reached a `useMemo` further down — making the hook count jump.

**Fix** ([`f327af4`](../../..)). Moved `actedIds`' `useMemo` above the three guard-return branches in `DirectorCombat`. Hooks now all sit at the top of the component, returns happen unconditionally below them. The plain `const` derivations (`participants`, `heroes`, `liveFoes`, `defeatedCount`, `round`, etc.) stay inline below the guards — they're not hooks, so the rule doesn't apply to them.

**Lesson.** When wiring a new component that combines TanStack-Query guard returns with derived `useMemo` state, lift every hook above every return. Cheap check: `grep -n` for hook calls and `return` statements; all hook line numbers should be lower than all return line numbers.

### Side-fallout (no spec change required)

- `TopBar.spec.tsx` had to widen its `@tanstack/react-router` mock to cover `useLocation` and `useNavigate` (AccountMenu now reaches into them transitively via `useActiveContext`), plus stub `useActiveContext` and `useMyCampaigns`. Test logic is unchanged.

### Acceptance addendum

In addition to the eight Pass-1 acceptance criteria above:

9. From a fresh `localStorage`, the user can land on `/`, see their campaigns, pick one with **Make active**, and end up viewing that campaign — with the active state persisting across reloads and reachable from every page via the AccountMenu's ACTIVE CAMPAIGN block.
10. The user can deactivate from either AccountMenu or `/campaigns`, and Home returns to its no-active-campaign landing.

### Maintenance note

Future post-shipping fixes to Pass 1 layer the same way: append a numbered entry to this PS section with a one-line symptom, a one-paragraph fix, and the relevant commit SHA. Once a follow-up entry has shipped *and* been verified in real use, leave it in place — the doc is the historical record, not a TODO list.
