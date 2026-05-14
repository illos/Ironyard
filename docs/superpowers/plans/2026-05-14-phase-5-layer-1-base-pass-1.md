# Phase 5 Layer 1 Base — Pass 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Phase 5 Layer 1 Base — Pass 1 spec: a token-driven, primitive-extracted UI base applied across every route, role-aware chrome (active-director vs player), dynamic Home, sheet tabs, wizard split-pane live preview, and a unified `DirectorCombat` replacing `CombatRun`.

**Architecture:** CSS-variable tokens in OKLCH expressed through Tailwind v4's `@theme` directive (theme variables ARE CSS variables in v4), plus runtime-swappable `--accent` overridden by `[data-pack=…]` selectors. A new `theme/` directory holds the runtime; a new `primitives/` directory holds the extracted components. Pages refactor onto primitives. The `Nav.tsx` is deleted in favor of an `AppShell` + `TopBar`; `CombatRun.tsx` is deleted in favor of `combat/DirectorCombat.tsx` (party rail + encounter rail + detail pane). Active context is URL-inferred via a `useActiveContext()` hook; persistence is deferred.

**Tech Stack:** React 19, TanStack Router, Tailwind v4 (`@tailwindcss/vite`), Vitest, OKLCH CSS variables, TypeScript strict.

**Spec reference:** [`docs/superpowers/specs/2026-05-14-phase-5-layer-1-base-pass-1-design.md`](../specs/2026-05-14-phase-5-layer-1-base-pass-1-design.md).

---

## File structure

New directories under `apps/web/src/`:

```
theme/
  tokens.css            — :root + data-theme + data-pack rules; @theme block for Tailwind v4
  ThemeProvider.tsx     — wraps Outlet; sets data-theme / data-pack / data-density on <html>
  density.ts            — Density type + helper
  index.ts              — re-exports ThemeProvider, useTheme(), Density

lib/active-context.ts   — useActiveContext() hook (URL-inferred in Pass 1)

primitives/
  index.ts              — public exports

  AppShell.tsx          — root frame; mounts ThemeProvider; renders TopBar + Outlet
  TopBar.tsx            — exports TopBar; uses route + active-context to pick mode A/B/C
  AccountMenu.tsx       — dropdown rendered inside TopBar (Campaigns / Characters / Sign out)
  ActiveCharacterChip.tsx — Mode-C trailing chip
  Section.tsx           — card with uppercase tracked header + right slot
  SplitPane.tsx         — responsive 2-col layout

  Button.tsx            — variants default | primary | ghost; sizes sm | md
  Chip.tsx              — pill or square; selected state; size variants
  Pill.tsx              — rounded container with leading dot
  Stat.tsx              — uppercase mono label + tabular numeric value
  Sigil.tsx             — 2-letter monogram square
  Pip.tsx               — single discrete count display
  PipRow.tsx            — series of Pips
  Divider.tsx           — hairline; soft | full; horizontal | vertical
  HpBar.tsx             — relocated + refactored from pages/combat/HpBar.tsx
  Tabs.tsx              — keyboard-accessible tab strip
  Modal.tsx             — re-themed shell used by existing modals
  Toast.tsx             — re-themed ToastStack content

  ParticipantRow.tsx    — combat-tracker row primitive
  CharacteristicCell.tsx — sheet/wizard characteristic readout
  SkillChipGroup.tsx    — grouped skill chips
```

New / replaced under `pages/`:

```
pages/Home.tsx                                — dynamic by active context (modified)
pages/combat/DirectorCombat.tsx               — NEW; replaces pages/CombatRun.tsx
pages/combat/PartyRail.tsx                    — NEW
pages/combat/EncounterRail.tsx                — NEW
pages/CombatRun.tsx                           — DELETED
components/Nav.tsx                            — DELETED
```

Pages re-themed only (structure preserved): `pages/CampaignsList.tsx`, `pages/CampaignView.tsx`, `pages/EncounterBuilder.tsx`, `pages/CharactersList.tsx`, `pages/MonsterBrowser.tsx`, `pages/MonsterDetail.tsx`. Pages re-themed with IA additions: `pages/characters/Sheet.tsx` (+tabs), `pages/characters/Wizard.tsx` (+split-pane preview).

`router.tsx` updates: swap `Nav` for `AppShell`, swap `CombatRun` import for `DirectorCombat`.

`styles.css` becomes: `@import "tailwindcss"; @import "./theme/tokens.css";` plus the existing toast keyframe.

---

## Phase A — Foundation (tokens, theme runtime, active-context hook)

### Task A1: Tokens CSS file

**Files:**
- Create: `apps/web/src/theme/tokens.css`

- [ ] **Step 1: Write `apps/web/src/theme/tokens.css`**

```css
/* Phase 5 Layer 1 — design tokens.
 * Expressed as CSS variables in OKLCH.
 * Surfaced to Tailwind v4 via @theme; surface ramps and accent are overridable
 * at runtime by data-theme and data-pack attributes on the document root.
 */

:root {
  /* Surface elevation — warm charcoal */
  --ink-0: oklch(0.20 0.003 80);
  --ink-1: oklch(0.235 0.003 80);
  --ink-2: oklch(0.275 0.003 80);
  --ink-3: oklch(0.32 0.003 80);
  --ink-4: oklch(0.40 0.003 80);
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

  /* Accent — default = Lightning. Overridden by [data-pack=...] below. */
  --accent:        oklch(0.82 0.16 230);
  --accent-strong: oklch(0.90 0.18 220);
  --accent-glow:   oklch(0.78 0.18 230 / 0.5);
}

:root[data-theme="light"] {
  /* Pass 1 ships dark only; light is a placeholder slot for Layer 2.
   * Re-derive tokens here when a designer pass authors the light palette.
   */
  --ink-0: oklch(0.985 0.002 80);
  --ink-1: oklch(0.965 0.003 80);
  --ink-2: oklch(0.94 0.004 80);
  --ink-3: oklch(0.90 0.005 80);
  --ink-4: oklch(0.84 0.006 80);
  --line: oklch(0.78 0.006 80 / 0.7);
  --line-soft: oklch(0.78 0.006 80 / 0.35);
  --text: oklch(0.22 0.005 80);
  --text-dim: oklch(0.42 0.005 80);
  --text-mute: oklch(0.58 0.005 80);
  --hero: oklch(0.50 0.08 230);
  --foe: oklch(0.52 0.18 28);
}

:root[data-pack="lightning"] {
  --accent: oklch(0.82 0.16 230);
  --accent-strong: oklch(0.90 0.18 220);
  --accent-glow: oklch(0.78 0.18 230 / 0.5);
}
:root[data-pack="shadow"] {
  --accent: oklch(0.62 0.20 305);
  --accent-strong: oklch(0.72 0.24 305);
  --accent-glow: oklch(0.55 0.22 305 / 0.5);
}
:root[data-pack="fireball"] {
  --accent: oklch(0.74 0.20 50);
  --accent-strong: oklch(0.84 0.22 55);
  --accent-glow: oklch(0.70 0.22 45 / 0.5);
}
:root[data-pack="chrome"] {
  --accent: oklch(0.84 0.025 240);
  --accent-strong: oklch(0.92 0.04 240);
  --accent-glow: oklch(0.78 0.10 240 / 0.4);
}

/* Per-element pack scoping — used inside the combat tracker so each row
 * can carry its character's pack color when Layer 2 wires per-character packs.
 * Pass 1: the .pack-* classes are not yet applied; components fall back to
 * --accent. The classes exist so future work can light them up without
 * touching every component.
 */
.pack-lightning { --pk: oklch(0.82 0.16 230); --pk-strong: oklch(0.90 0.18 220); --pk-glow: oklch(0.78 0.18 230 / 0.5); }
.pack-shadow    { --pk: oklch(0.62 0.20 305); --pk-strong: oklch(0.72 0.24 305); --pk-glow: oklch(0.55 0.22 305 / 0.5); }
.pack-fireball  { --pk: oklch(0.74 0.20 50);  --pk-strong: oklch(0.84 0.22 55);  --pk-glow: oklch(0.70 0.22 45 / 0.5); }
.pack-chrome    { --pk: oklch(0.84 0.025 240); --pk-strong: oklch(0.92 0.04 240); --pk-glow: oklch(0.78 0.10 240 / 0.4); }

/* Tailwind v4 theme — expose the CSS variables as theme tokens so utility
 * classes like bg-ink-1 / text-text-dim / border-line work. The defaults
 * above remain authoritative; Tailwind just references them.
 */
@theme {
  --color-ink-0: var(--ink-0);
  --color-ink-1: var(--ink-1);
  --color-ink-2: var(--ink-2);
  --color-ink-3: var(--ink-3);
  --color-ink-4: var(--ink-4);
  --color-line: var(--line);
  --color-line-soft: var(--line-soft);
  --color-text: var(--text);
  --color-text-dim: var(--text-dim);
  --color-text-mute: var(--text-mute);
  --color-hero: var(--hero);
  --color-foe: var(--foe);
  --color-hp-good: var(--hp-good);
  --color-hp-warn: var(--hp-warn);
  --color-hp-bad: var(--hp-bad);
  --color-accent: var(--accent);
  --color-accent-strong: var(--accent-strong);
  --color-accent-glow: var(--accent-glow);
  --color-pk: var(--pk, var(--accent));
  --color-pk-strong: var(--pk-strong, var(--accent-strong));
  --color-pk-glow: var(--pk-glow, var(--accent-glow));

  --font-sans: "Geist", system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;

  --radius-sm: 0;
  --radius-md: 0;
  --radius-lg: 0;
  --radius-xl: 0;
}

html, body {
  background: var(--ink-0);
  color: var(--text);
  font-family: var(--font-sans);
  font-feature-settings: "ss01", "ss02", "cv11";
  -webkit-font-smoothing: antialiased;
}

.tabular { font-variant-numeric: tabular-nums; }
```

- [ ] **Step 2: Update `apps/web/src/styles.css`**

Replace the whole file with:

```css
@import "tailwindcss";
@import "./theme/tokens.css";

/* Slice 11: tiny toast slide-in. Keeps animation in CSS instead of pulling
   tailwindcss-animate as a dep. */
@keyframes ironyard-toast-enter {
  from { transform: translateY(8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.toast-enter { animation: ironyard-toast-enter 180ms ease-out; }
```

- [ ] **Step 3: Verify Tailwind picks up the tokens**

Run: `pnpm --filter @ironyard/web typecheck`
Expected: PASS (no type errors).

Quick smoke (no commit yet): in `main.tsx` or any rendered component, render `<div className="bg-ink-1 text-text border border-line p-4">Tokens live</div>` and check the dev server (`pnpm --filter @ironyard/web dev`). It should render with the dark charcoal background. Revert the smoke if you added one.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/theme/tokens.css apps/web/src/styles.css
git commit -m "feat(web/theme): Phase 5 Layer 1 tokens — OKLCH ramps, pack scopes, Tailwind v4 @theme"
```

---

### Task A2: ThemeProvider component

**Files:**
- Create: `apps/web/src/theme/ThemeProvider.tsx`
- Create: `apps/web/src/theme/ThemeProvider.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/theme/ThemeProvider.spec.tsx
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from './ThemeProvider';

afterEach(() => cleanup());

describe('ThemeProvider', () => {
  it('sets data-theme=dark and data-pack=lightning by default', () => {
    render(<ThemeProvider><div /></ThemeProvider>);
    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-pack')).toBe('lightning');
    expect(root.getAttribute('data-density')).toBe('default');
  });

  it('updates data-pack when prop changes', () => {
    const { rerender } = render(
      <ThemeProvider pack="shadow"><div /></ThemeProvider>,
    );
    expect(document.documentElement.getAttribute('data-pack')).toBe('shadow');
    rerender(<ThemeProvider pack="fireball"><div /></ThemeProvider>);
    expect(document.documentElement.getAttribute('data-pack')).toBe('fireball');
  });
});
```

Note: this introduces `@testing-library/react`. Add it to `apps/web/package.json` devDependencies if missing — check first with `pnpm --filter @ironyard/web ls @testing-library/react`. If absent: `pnpm --filter @ironyard/web add -D @testing-library/react @testing-library/dom jsdom`.

Also ensure Vitest runs with jsdom — add to `vite.config.ts`:

```ts
// vite.config.ts (within defineConfig)
test: { environment: 'jsdom' }
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
pnpm --filter @ironyard/web test ThemeProvider
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `ThemeProvider`**

```tsx
// apps/web/src/theme/ThemeProvider.tsx
import { type ReactNode, useEffect } from 'react';

export type Theme = 'dark' | 'light';
export type Pack = 'lightning' | 'shadow' | 'fireball' | 'chrome';
export type Density = 'compact' | 'default' | 'roomy';

export interface ThemeProviderProps {
  theme?: Theme;
  pack?: Pack;
  density?: Density;
  children: ReactNode;
}

/** Sets data-theme / data-pack / data-density on <html>. */
export function ThemeProvider({
  theme = 'dark',
  pack = 'lightning',
  density = 'default',
  children,
}: ThemeProviderProps) {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-pack', pack);
    root.setAttribute('data-density', density);
  }, [theme, pack, density]);

  return <>{children}</>;
}
```

- [ ] **Step 4: Run the test, confirm pass**

```bash
pnpm --filter @ironyard/web test ThemeProvider
```

Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/theme/ThemeProvider.tsx apps/web/src/theme/ThemeProvider.spec.tsx apps/web/vite.config.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web/theme): ThemeProvider sets data-theme/pack/density on root"
```

(If you didn't need to touch package.json / pnpm-lock.yaml / vite.config.ts because deps were already present, drop those from `git add`.)

---

### Task A3: useActiveContext hook (URL-inferred)

**Files:**
- Create: `apps/web/src/lib/active-context.ts`
- Create: `apps/web/src/lib/active-context.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/lib/active-context.spec.tsx
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

// Mock TanStack Router useLocation since we're testing hook output purely.
import * as Router from '@tanstack/react-router';
import { vi } from 'vitest';

import { useActiveContext } from './active-context';

function withPath(pathname: string) {
  vi.spyOn(Router, 'useLocation').mockReturnValue({
    pathname,
    search: '',
    hash: '',
    state: {},
    key: 'default',
  } as ReturnType<typeof Router.useLocation>);
}

describe('useActiveContext', () => {
  it('returns no active campaign when not on a /campaigns/:id route', () => {
    withPath('/characters');
    const { result } = renderHook(() => useActiveContext());
    expect(result.current.activeCampaignId).toBeNull();
  });

  it('extracts the campaign id from /campaigns/:id', () => {
    withPath('/campaigns/abc123');
    const { result } = renderHook(() => useActiveContext());
    expect(result.current.activeCampaignId).toBe('abc123');
  });

  it('extracts the campaign id from /campaigns/:id/play', () => {
    withPath('/campaigns/c1/play');
    const { result } = renderHook(() => useActiveContext());
    expect(result.current.activeCampaignId).toBe('c1');
  });

  it('returns null for /campaigns (the list route)', () => {
    withPath('/campaigns');
    const { result } = renderHook(() => useActiveContext());
    expect(result.current.activeCampaignId).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
pnpm --filter @ironyard/web test active-context
```

Expected: FAIL.

- [ ] **Step 3: Implement the hook**

```ts
// apps/web/src/lib/active-context.ts
import { useLocation } from '@tanstack/react-router';

export interface ActiveContext {
  /** Campaign the user is currently in, inferred from URL in Pass 1. */
  activeCampaignId: string | null;
  /** Character the user has active in this campaign. Always null in Pass 1
   *  (no persistence layer); consumers should treat null as "unknown — use
   *  defaults / let pages fetch their own roster pick". */
  activeCharacterId: string | null;
}

const CAMPAIGN_ID_RE = /^\/campaigns\/([^/]+)(?:\/|$)/;

export function useActiveContext(): ActiveContext {
  const { pathname } = useLocation();
  const match = CAMPAIGN_ID_RE.exec(pathname);
  return {
    activeCampaignId: match ? match[1] : null,
    activeCharacterId: null,
  };
}
```

- [ ] **Step 4: Run the test, confirm pass**

```bash
pnpm --filter @ironyard/web test active-context
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/active-context.ts apps/web/src/lib/active-context.spec.tsx
git commit -m "feat(web/lib): useActiveContext — URL-inferred active campaign id"
```

---

### Task A4: theme/index.ts re-exports

**Files:**
- Create: `apps/web/src/theme/index.ts`
- Create: `apps/web/src/theme/density.ts`

- [ ] **Step 1: Write `density.ts`**

```ts
// apps/web/src/theme/density.ts
export type { Density } from './ThemeProvider';
```

(Pass 1 reuses the `Density` type from `ThemeProvider`; this file is a slot for the future `useDensityPreference()` etc.)

- [ ] **Step 2: Write `theme/index.ts`**

```ts
// apps/web/src/theme/index.ts
export { ThemeProvider } from './ThemeProvider';
export type { Theme, Pack, Density, ThemeProviderProps } from './ThemeProvider';
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/theme/index.ts apps/web/src/theme/density.ts
git commit -m "feat(web/theme): public exports for theme module"
```

---

## Phase B — Atoms

Each atom is small and presentational. Per the project pattern (existing `HpBar.tsx`, `ConditionChip.tsx` ship without spec files), atoms here are committed without dedicated unit tests; behavior in composites (Tabs, Modal, TopBar) gets tested where it lives.

### Task B1: Button + Chip + Pill

**Files:**
- Create: `apps/web/src/primitives/Button.tsx`
- Create: `apps/web/src/primitives/Chip.tsx`
- Create: `apps/web/src/primitives/Pill.tsx`

- [ ] **Step 1: Write `Button.tsx`**

```tsx
// apps/web/src/primitives/Button.tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'default' | 'primary' | 'ghost';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-ink-2 text-text border border-line hover:border-accent',
  primary: 'bg-accent text-ink-0 border border-accent-strong hover:bg-accent-strong font-semibold',
  ghost: 'bg-transparent text-text-dim border border-transparent hover:text-text hover:border-line-soft',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-9 px-3 text-sm',
};

export function Button({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-1.5 transition-colors ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Write `Chip.tsx`**

```tsx
// apps/web/src/primitives/Chip.tsx
import type { HTMLAttributes, ReactNode } from 'react';

export type ChipShape = 'square' | 'pill';
export type ChipSize = 'xs' | 'sm';

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  shape?: ChipShape;
  size?: ChipSize;
  selected?: boolean;
  children: ReactNode;
}

const sizeClasses: Record<ChipSize, string> = {
  xs: 'text-[10px] px-1.5 py-0.5',
  sm: 'text-xs px-2 py-1',
};

export function Chip({
  shape = 'square',
  size = 'sm',
  selected = false,
  className = '',
  children,
  ...rest
}: ChipProps) {
  const shapeClass = shape === 'pill' ? 'rounded-full' : '';
  const selectedClass = selected
    ? 'border-accent text-text bg-ink-3'
    : 'border-line text-text-dim bg-ink-2';
  return (
    <span
      {...rest}
      className={`inline-flex items-center gap-1 border tabular ${sizeClasses[size]} ${shapeClass} ${selectedClass} ${className}`}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 3: Write `Pill.tsx`**

```tsx
// apps/web/src/primitives/Pill.tsx
import type { HTMLAttributes, ReactNode } from 'react';

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  /** Color of the leading dot. CSS var or class accepted via `dotClassName`. */
  dotClassName?: string;
  children: ReactNode;
}

export function Pill({ dotClassName = 'bg-foe', children, className = '', ...rest }: PillProps) {
  return (
    <span
      {...rest}
      className={`inline-flex items-center gap-2 px-2.5 py-1 bg-ink-2 border border-line rounded-full text-xs ${className}`}
    >
      <span className={`w-2 h-2 rounded-full ${dotClassName}`} />
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter @ironyard/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/primitives/Button.tsx apps/web/src/primitives/Chip.tsx apps/web/src/primitives/Pill.tsx
git commit -m "feat(web/primitives): Button + Chip + Pill atoms"
```

---

### Task B2: Stat + Sigil + Pip + PipRow

**Files:**
- Create: `apps/web/src/primitives/Stat.tsx`
- Create: `apps/web/src/primitives/Sigil.tsx`
- Create: `apps/web/src/primitives/Pip.tsx`
- Create: `apps/web/src/primitives/PipRow.tsx`

- [ ] **Step 1: Write `Stat.tsx`**

```tsx
// apps/web/src/primitives/Stat.tsx
import type { HTMLAttributes, ReactNode } from 'react';

export interface StatProps extends HTMLAttributes<HTMLSpanElement> {
  label: string;
  value: ReactNode;
}

export function Stat({ label, value, className = '', ...rest }: StatProps) {
  return (
    <span
      {...rest}
      className={`inline-flex items-baseline gap-1.5 font-mono uppercase tracking-[0.08em] text-[11px] text-text-mute ${className}`}
    >
      <span>{label}</span>
      <span className="font-sans text-sm font-semibold text-text tabular">{value}</span>
    </span>
  );
}
```

- [ ] **Step 2: Write `Sigil.tsx`**

```tsx
// apps/web/src/primitives/Sigil.tsx
import type { HTMLAttributes } from 'react';

export interface SigilProps extends HTMLAttributes<HTMLSpanElement> {
  /** Two-letter monogram. Truncated if longer. */
  text: string;
  size?: number;
}

export function Sigil({ text, size = 32, className = '', style, ...rest }: SigilProps) {
  return (
    <span
      {...rest}
      style={{ width: size, height: size, ...style }}
      className={`inline-flex items-center justify-center bg-ink-3 border border-line text-xs font-semibold tracking-wide text-text ${className}`}
    >
      {text.slice(0, 2).toUpperCase()}
    </span>
  );
}
```

- [ ] **Step 3: Write `Pip.tsx` and `PipRow.tsx`**

```tsx
// apps/web/src/primitives/Pip.tsx
import type { HTMLAttributes } from 'react';

export interface PipProps extends HTMLAttributes<HTMLSpanElement> {
  on?: boolean;
}

export function Pip({ on = false, className = '', ...rest }: PipProps) {
  return (
    <span
      {...rest}
      className={`inline-block w-1.5 h-1.5 rounded-full border ${
        on ? 'bg-accent border-accent-strong' : 'bg-ink-3 border-line'
      } ${className}`}
    />
  );
}
```

```tsx
// apps/web/src/primitives/PipRow.tsx
import { Pip } from './Pip';

export interface PipRowProps {
  current: number;
  max: number;
  className?: string;
}

export function PipRow({ current, max, className = '' }: PipRowProps) {
  return (
    <span className={`inline-flex gap-0.5 ${className}`}>
      {Array.from({ length: max }, (_, i) => (
        <Pip key={i} on={i < current} />
      ))}
    </span>
  );
}
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter @ironyard/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/primitives/Stat.tsx apps/web/src/primitives/Sigil.tsx apps/web/src/primitives/Pip.tsx apps/web/src/primitives/PipRow.tsx
git commit -m "feat(web/primitives): Stat + Sigil + Pip + PipRow atoms"
```

---

### Task B3: Divider

**Files:**
- Create: `apps/web/src/primitives/Divider.tsx`

- [ ] **Step 1: Write `Divider.tsx`**

```tsx
// apps/web/src/primitives/Divider.tsx
import type { HTMLAttributes } from 'react';

export interface DividerProps extends HTMLAttributes<HTMLSpanElement> {
  orientation?: 'horizontal' | 'vertical';
  variant?: 'soft' | 'full';
}

export function Divider({
  orientation = 'horizontal',
  variant = 'full',
  className = '',
  ...rest
}: DividerProps) {
  const color = variant === 'soft' ? 'bg-line-soft' : 'bg-line';
  const shape = orientation === 'vertical' ? 'w-px h-4' : 'h-px w-full';
  return <span {...rest} className={`block ${shape} ${color} ${className}`} />;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/primitives/Divider.tsx
git commit -m "feat(web/primitives): Divider"
```

---

### Task B4: HpBar (move + refactor)

**Files:**
- Move + rewrite: `apps/web/src/pages/combat/HpBar.tsx` → `apps/web/src/primitives/HpBar.tsx`
- Update imports in any callers (grep first)

- [ ] **Step 1: Grep current callers**

```bash
grep -rln "from './HpBar'\|from '../combat/HpBar'\|from '../../combat/HpBar'\|/combat/HpBar'" apps/web/src
```

Save the list — you'll update them in step 4.

- [ ] **Step 2: Read the current implementation**

```bash
cat apps/web/src/pages/combat/HpBar.tsx
```

Preserve the prop API. Only the visual styling changes.

- [ ] **Step 3: Write `apps/web/src/primitives/HpBar.tsx`**

Same prop shape as the current file. Internals re-themed to use tokens (`bg-hp-good`, `bg-hp-warn`, `bg-hp-bad`, `bg-ink-3` for the track, `border-line-soft` if there's a border). Preserve the over-max / temp-stam slot if the current file has one.

If the current HpBar exports types, re-export them from the new location.

- [ ] **Step 4: Update all imports**

For every file from Step 1, change the import to `from '@/primitives/HpBar'` or the appropriate relative path (`../../primitives/HpBar` from `pages/combat/*`).

- [ ] **Step 5: Delete the old file**

```bash
git rm apps/web/src/pages/combat/HpBar.tsx
```

- [ ] **Step 6: Run typecheck + tests**

```bash
pnpm --filter @ironyard/web typecheck && pnpm --filter @ironyard/web test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/primitives/HpBar.tsx <updated callers>
git commit -m "refactor(web): relocate HpBar to primitives + re-theme on tokens"
```

---

## Phase C — Layout primitives

### Task C1: Section

**Files:**
- Create: `apps/web/src/primitives/Section.tsx`

- [ ] **Step 1: Write `Section.tsx`**

```tsx
// apps/web/src/primitives/Section.tsx
import type { HTMLAttributes, ReactNode } from 'react';

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  /** Small uppercase tracked header, e.g. "PARTY · 4 HEROES". */
  heading?: ReactNode;
  /** Right-aligned slot in the header. */
  right?: ReactNode;
  /** When true, fill available vertical space. */
  fill?: boolean;
  children: ReactNode;
}

export function Section({
  heading,
  right,
  fill = false,
  className = '',
  children,
  ...rest
}: SectionProps) {
  return (
    <section
      {...rest}
      className={`flex flex-col bg-ink-1 border border-line min-h-0 ${
        fill ? 'flex-1' : ''
      } ${className}`}
    >
      {heading && (
        <header className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 border-b border-line-soft">
          <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-mute">
            {heading}
          </h3>
          {right && (
            <div className="flex items-center gap-2 text-[11px] font-mono tracking-[0.08em] text-text-mute">
              {right}
            </div>
          )}
        </header>
      )}
      <div className={`p-2.5 min-h-0 ${fill ? 'flex-1 overflow-y-auto' : ''}`}>{children}</div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/primitives/Section.tsx
git commit -m "feat(web/primitives): Section"
```

---

### Task C2: SplitPane

**Files:**
- Create: `apps/web/src/primitives/SplitPane.tsx`

- [ ] **Step 1: Write `SplitPane.tsx`**

```tsx
// apps/web/src/primitives/SplitPane.tsx
import type { ReactNode } from 'react';

export interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  /** Column ratio as CSS grid-template-columns value (e.g. "1.18fr 1fr"). */
  ratio?: string;
  /** Vertical gap in px between cols. */
  gap?: number;
  className?: string;
}

export function SplitPane({
  left,
  right,
  ratio = '1fr 1fr',
  gap = 14,
  className = '',
}: SplitPaneProps) {
  return (
    <div
      className={`grid min-h-0 overflow-hidden ${className}`}
      style={{ gridTemplateColumns: ratio, gap }}
    >
      <div className="flex flex-col gap-3 min-w-0 min-h-0 overflow-y-auto">{left}</div>
      <div className="flex flex-col gap-3 min-w-0 min-h-0 overflow-y-auto">{right}</div>
    </div>
  );
}
```

Phone breakpoint (single column) is left as a CSS override the consumer can apply via `className`; centralized media-query handling is Pass 2 work.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/primitives/SplitPane.tsx
git commit -m "feat(web/primitives): SplitPane"
```

---

### Task C3: Tabs (with behavior tests)

**Files:**
- Create: `apps/web/src/primitives/Tabs.tsx`
- Create: `apps/web/src/primitives/Tabs.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/primitives/Tabs.spec.tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

afterEach(() => cleanup());

const items = [
  { id: 'overview', label: 'Overview' },
  { id: 'abilities', label: 'Abilities' },
  { id: 'features', label: 'Features' },
];

describe('Tabs', () => {
  it('renders the active tab as selected', () => {
    render(<Tabs items={items} value="abilities" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Abilities' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('calls onChange when a tab is clicked', () => {
    const onChange = vi.fn();
    render(<Tabs items={items} value="overview" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Features' }));
    expect(onChange).toHaveBeenCalledWith('features');
  });

  it('moves focus with ArrowRight / ArrowLeft', () => {
    const onChange = vi.fn();
    render(<Tabs items={items} value="overview" onChange={onChange} />);
    const overview = screen.getByRole('tab', { name: 'Overview' });
    overview.focus();
    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('abilities');
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
pnpm --filter @ironyard/web test Tabs
```

Expected: FAIL (module not found).

You may need `@testing-library/jest-dom` for `toHaveAttribute`. If absent: `pnpm --filter @ironyard/web add -D @testing-library/jest-dom`, then create `apps/web/src/test-setup.ts` containing `import '@testing-library/jest-dom/vitest';` and add `test.setupFiles: ['./src/test-setup.ts']` to `vite.config.ts`.

- [ ] **Step 3: Implement `Tabs.tsx`**

```tsx
// apps/web/src/primitives/Tabs.tsx
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ items, value, onChange, className = '' }: TabsProps) {
  const tablistRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.id === value);
    if (i < 0) return;
    if (e.key === 'ArrowRight') {
      onChange(items[(i + 1) % items.length].id);
    } else if (e.key === 'ArrowLeft') {
      onChange(items[(i - 1 + items.length) % items.length].id);
    }
  };

  return (
    <div
      ref={tablistRef}
      role="tablist"
      className={`flex gap-0 border-b border-line ${className}`}
      onKeyDown={handleKeyDown}
    >
      {items.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`px-3 h-9 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors border-b-2 ${
              selected
                ? 'text-text border-accent'
                : 'text-text-mute border-transparent hover:text-text-dim'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run the test, confirm pass**

```bash
pnpm --filter @ironyard/web test Tabs
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/primitives/Tabs.tsx apps/web/src/primitives/Tabs.spec.tsx
git commit -m "feat(web/primitives): Tabs — accessible tabstrip with keyboard nav"
```

---

### Task C4: Modal shell + Toast

**Files:**
- Create: `apps/web/src/primitives/Modal.tsx`
- Create: `apps/web/src/primitives/Toast.tsx`

- [ ] **Step 1: Write `Modal.tsx`**

```tsx
// apps/web/src/primitives/Modal.tsx
import type { ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function Modal({ open, onClose, title, footer, children }: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg bg-ink-1 border border-line flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <header className="px-4 py-3 border-b border-line-soft text-[11px] uppercase tracking-[0.16em] text-text-mute font-semibold">
            {title}
          </header>
        )}
        <div className="px-4 py-4 overflow-y-auto">{children}</div>
        {footer && (
          <footer className="px-4 py-3 border-t border-line-soft flex justify-end gap-2">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `Toast.tsx`**

```tsx
// apps/web/src/primitives/Toast.tsx
import type { ReactNode } from 'react';

export interface ToastProps {
  children: ReactNode;
  onDismiss?: () => void;
  /** Undo affordance label; calls onDismiss on click. */
  undoLabel?: string;
}

export function Toast({ children, onDismiss, undoLabel }: ToastProps) {
  return (
    <div className="toast-enter bg-ink-1 border border-line px-3 py-2 flex items-center gap-3 text-sm text-text shadow-lg">
      <span className="flex-1">{children}</span>
      {undoLabel && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent hover:text-accent-strong"
        >
          {undoLabel}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/primitives/Modal.tsx apps/web/src/primitives/Toast.tsx
git commit -m "feat(web/primitives): Modal + Toast shells"
```

---

## Phase D — Composites

### Task D1: CharacteristicCell + SkillChipGroup

**Files:**
- Create: `apps/web/src/primitives/CharacteristicCell.tsx`
- Create: `apps/web/src/primitives/SkillChipGroup.tsx`

- [ ] **Step 1: Write `CharacteristicCell.tsx`**

```tsx
// apps/web/src/primitives/CharacteristicCell.tsx
import type { HTMLAttributes } from 'react';

export interface CharacteristicCellProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: number;
  locked?: boolean;
}

export function CharacteristicCell({
  label,
  value,
  locked = false,
  className = '',
  ...rest
}: CharacteristicCellProps) {
  return (
    <div
      {...rest}
      className={`flex flex-col items-center justify-center gap-1 p-3 bg-ink-2 border border-line ${className}`}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-mute">
        {label}{locked && ' · locked'}
      </span>
      <span className="text-2xl font-semibold tabular text-text">
        {value >= 0 ? `+${value}` : value}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Write `SkillChipGroup.tsx`**

```tsx
// apps/web/src/primitives/SkillChipGroup.tsx
import type { ReactNode } from 'react';
import { Chip } from './Chip';

export interface SkillItem {
  id: string;
  label: ReactNode;
  selected?: boolean;
}

export interface SkillChipGroupProps {
  heading: ReactNode;
  items: SkillItem[];
  onToggle?: (id: string) => void;
}

export function SkillChipGroup({ heading, items, onToggle }: SkillChipGroupProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-mute">
        {heading}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <Chip
            key={it.id}
            selected={!!it.selected}
            onClick={onToggle ? () => onToggle(it.id) : undefined}
            style={onToggle ? { cursor: 'pointer' } : undefined}
          >
            {it.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/primitives/CharacteristicCell.tsx apps/web/src/primitives/SkillChipGroup.tsx
git commit -m "feat(web/primitives): CharacteristicCell + SkillChipGroup"
```

---

### Task D2: ParticipantRow

**Files:**
- Create: `apps/web/src/primitives/ParticipantRow.tsx`

- [ ] **Step 1: Write `ParticipantRow.tsx`**

```tsx
// apps/web/src/primitives/ParticipantRow.tsx
import type { ReactNode } from 'react';
import type { Pack } from '../theme/ThemeProvider';
import { HpBar } from './HpBar';
import { Sigil } from './Sigil';

export interface ParticipantRowProps {
  sigil: string;
  name: ReactNode;
  role?: ReactNode;
  conditions?: ReactNode;     // pre-rendered ConditionChip[] etc.
  resource?: ReactNode;       // pre-rendered Pip rows etc.
  recoveries?: ReactNode;
  staminaCurrent: number;
  staminaMax: number;
  active?: boolean;           // selected for detail pane
  isTurn?: boolean;           // currently the acting participant
  acted?: boolean;            // turn already used this round
  /** Per-character pack scope. Pass 1: pass undefined and the global accent applies. */
  pack?: Pack;
  onSelect?: () => void;
}

export function ParticipantRow({
  sigil,
  name,
  role,
  conditions,
  resource,
  recoveries,
  staminaCurrent,
  staminaMax,
  active = false,
  isTurn = false,
  acted = false,
  pack,
  onSelect,
}: ParticipantRowProps) {
  const packClass = pack ? `pack-${pack}` : '';
  const turnClass = isTurn ? 'border-pk shadow-[0_0_0_1px_var(--pk,var(--accent))]' : '';
  const activeClass = active && !isTurn ? 'border-pk' : '';
  const actedClass = acted ? 'opacity-55' : '';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative grid grid-cols-[32px_1fr_auto_auto_auto_110px] items-center gap-3 px-3 py-2 bg-ink-2 border border-line text-left transition-colors hover:border-pk hover:bg-ink-3 ${packClass} ${turnClass} ${activeClass} ${actedClass}`}
    >
      <Sigil text={sigil} />
      <span className="flex flex-col min-w-0 gap-0.5">
        <span className="text-sm font-semibold tracking-tight truncate">{name}</span>
        {role && (
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute truncate">
            {role}
          </span>
        )}
      </span>
      <span className="flex gap-0.5">{conditions}</span>
      <span className="flex flex-col items-end gap-0.5">{resource}</span>
      <span className="flex flex-col items-end gap-0.5 tabular text-sm">{recoveries}</span>
      <span className="flex flex-col items-end gap-1 w-[110px]">
        <span className="text-base font-semibold tabular">
          {staminaCurrent}
          <span className="text-text-mute font-normal text-[11px]">/{staminaMax}</span>
        </span>
        <HpBar current={staminaCurrent} max={staminaMax} compact />
      </span>
      {acted && (
        <span className="absolute top-1.5 right-2 font-mono text-[8px] tracking-[0.16em] text-text-mute bg-ink-1 px-1.5 border border-line-soft">
          ACTED
        </span>
      )}
    </button>
  );
}
```

If `HpBar` doesn't take a `compact` prop today, add it during Task B4's relocation as a boolean that renders a 4px-tall slim variant.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/primitives/ParticipantRow.tsx
git commit -m "feat(web/primitives): ParticipantRow — combat tracker row"
```

---

### Task D3: ActiveCharacterChip

**Files:**
- Create: `apps/web/src/primitives/ActiveCharacterChip.tsx`

- [ ] **Step 1: Write `ActiveCharacterChip.tsx`**

```tsx
// apps/web/src/primitives/ActiveCharacterChip.tsx
import type { HTMLAttributes } from 'react';

export interface ActiveCharacterChipProps extends HTMLAttributes<HTMLDivElement> {
  username: string;
  characterName: string;
}

export function ActiveCharacterChip({
  username,
  characterName,
  className = '',
  ...rest
}: ActiveCharacterChipProps) {
  return (
    <div
      {...rest}
      className={`flex flex-col items-end gap-px leading-tight ${className}`}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-mute">
        {username} playing
      </span>
      <span className="text-sm font-semibold tracking-tight text-accent">
        {characterName}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/primitives/ActiveCharacterChip.tsx
git commit -m "feat(web/primitives): ActiveCharacterChip — player-view trailing element"
```

---

### Task D4: primitives/index.ts

**Files:**
- Create: `apps/web/src/primitives/index.ts`

- [ ] **Step 1: Write `primitives/index.ts`**

```ts
// apps/web/src/primitives/index.ts
export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';
export { Chip } from './Chip';
export type { ChipProps, ChipShape, ChipSize } from './Chip';
export { Pill } from './Pill';
export type { PillProps } from './Pill';
export { Stat } from './Stat';
export type { StatProps } from './Stat';
export { Sigil } from './Sigil';
export type { SigilProps } from './Sigil';
export { Pip } from './Pip';
export type { PipProps } from './Pip';
export { PipRow } from './PipRow';
export type { PipRowProps } from './PipRow';
export { Divider } from './Divider';
export type { DividerProps } from './Divider';
export { HpBar } from './HpBar';
export { Section } from './Section';
export type { SectionProps } from './Section';
export { SplitPane } from './SplitPane';
export type { SplitPaneProps } from './SplitPane';
export { Tabs } from './Tabs';
export type { TabsProps, TabItem } from './Tabs';
export { Modal } from './Modal';
export type { ModalProps } from './Modal';
export { Toast } from './Toast';
export type { ToastProps } from './Toast';
export { CharacteristicCell } from './CharacteristicCell';
export type { CharacteristicCellProps } from './CharacteristicCell';
export { SkillChipGroup } from './SkillChipGroup';
export type { SkillChipGroupProps, SkillItem } from './SkillChipGroup';
export { ParticipantRow } from './ParticipantRow';
export type { ParticipantRowProps } from './ParticipantRow';
export { ActiveCharacterChip } from './ActiveCharacterChip';
export type { ActiveCharacterChipProps } from './ActiveCharacterChip';
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/primitives/index.ts
git commit -m "feat(web/primitives): public exports"
```

---

## Phase E — App shell, TopBar, dynamic Home

### Task E1: AccountMenu

**Files:**
- Create: `apps/web/src/primitives/AccountMenu.tsx`

- [ ] **Step 1: Write `AccountMenu.tsx`**

```tsx
// apps/web/src/primitives/AccountMenu.tsx
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

export interface AccountMenuProps {
  onSignOut?: () => void;
}

export function AccountMenu({ onSignOut }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-text-dim hover:text-text text-xs cursor-pointer"
      >
        Account <span className="text-text-mute text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute top-7 left-0 z-30 min-w-[160px] bg-ink-1 border border-line py-1">
          <Link
            to="/campaigns"
            onClick={() => setOpen(false)}
            className="block px-3.5 py-2 text-xs text-text-dim hover:bg-ink-2 hover:text-text"
          >
            Campaigns
          </Link>
          <Link
            to="/characters"
            onClick={() => setOpen(false)}
            className="block px-3.5 py-2 text-xs text-text-dim hover:bg-ink-2 hover:text-text"
          >
            Characters
          </Link>
          <div className="h-px bg-line-soft my-1" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut?.();
            }}
            className="w-full text-left block px-3.5 py-2 text-xs text-text-dim hover:bg-ink-2 hover:text-text"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/primitives/AccountMenu.tsx
git commit -m "feat(web/primitives): AccountMenu — Campaigns / Characters / Sign out dropdown"
```

---

### Task E2: TopBar (with mode resolution test)

**Files:**
- Create: `apps/web/src/primitives/TopBar.tsx`
- Create: `apps/web/src/primitives/TopBar.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/primitives/TopBar.spec.tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TopBar } from './TopBar';

afterEach(() => cleanup());

describe('TopBar', () => {
  it('renders Mode A when no active campaign', () => {
    render(<TopBar mode="A" />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.queryByText('Foes')).not.toBeInTheDocument();
  });

  it('renders Mode B with Foes link for active director', () => {
    render(<TopBar mode="B" />);
    expect(screen.getByText('Foes')).toBeInTheDocument();
  });

  it('renders Mode C without Foes; shows active-character chip when provided', () => {
    render(
      <TopBar
        mode="C"
        activeCharacter={{ username: 'mike', characterName: 'Ash Vey' }}
      />,
    );
    expect(screen.queryByText('Foes')).not.toBeInTheDocument();
    expect(screen.getByText('Ash Vey')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
pnpm --filter @ironyard/web test TopBar
```

Expected: FAIL.

- [ ] **Step 3: Implement `TopBar.tsx`**

```tsx
// apps/web/src/primitives/TopBar.tsx
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { AccountMenu } from './AccountMenu';
import { ActiveCharacterChip } from './ActiveCharacterChip';

export type TopBarMode = 'A' | 'B' | 'C';

export interface TopBarProps {
  mode: TopBarMode;
  /** Slot for Mode-B campaign breadcrumb / game readouts; Mode-C status chips. */
  middle?: ReactNode;
  /** Slot for Mode-B trailing action buttons (Tweaks, End Round, etc.). */
  trailing?: ReactNode;
  /** Mode-C only: player active-character chip data. */
  activeCharacter?: { username: string; characterName: string };
  onSignOut?: () => void;
}

export function TopBar({
  mode,
  middle,
  trailing,
  activeCharacter,
  onSignOut,
}: TopBarProps) {
  return (
    <div className="h-12 flex-shrink-0 flex items-center gap-4 px-3.5 bg-ink-1 border-b border-line text-xs">
      <Link to="/" className="flex items-center gap-2 font-semibold text-sm">
        <span className="w-[18px] h-[18px] bg-ink-3 border border-line" />
        Ironyard
      </Link>

      <span className="w-px h-[18px] bg-line-soft" />

      <Link to="/" className="text-text-dim hover:text-text">
        Home
      </Link>
      <AccountMenu onSignOut={onSignOut} />

      {mode === 'B' && (
        <Link to="/foes" className="text-text-dim hover:text-text">
          Foes
        </Link>
      )}

      {middle && <span className="flex items-center gap-3">{middle}</span>}

      <span className="flex-1" />

      {trailing}

      {mode === 'C' && activeCharacter && (
        <ActiveCharacterChip
          username={activeCharacter.username}
          characterName={activeCharacter.characterName}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test, confirm pass**

```bash
pnpm --filter @ironyard/web test TopBar
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/primitives/TopBar.tsx apps/web/src/primitives/TopBar.spec.tsx apps/web/src/primitives/index.ts
git commit -m "feat(web/primitives): TopBar with modes A/B/C"
```

(Don't forget to add `export { TopBar } from './TopBar';` to `primitives/index.ts` before committing.)

---

### Task E3: AppShell — resolves mode + composes

**Files:**
- Create: `apps/web/src/primitives/AppShell.tsx`

- [ ] **Step 1: Write `AppShell.tsx`**

```tsx
// apps/web/src/primitives/AppShell.tsx
import { Outlet, useLocation } from '@tanstack/react-router';
import { type ReactNode } from 'react';
import { useActiveContext } from '../lib/active-context';
import { ThemeProvider } from '../theme';
import { TopBar, type TopBarMode } from './TopBar';

/**
 * Pass-1 director gating placeholder. The real gate is
 *   actor.userId === state.activeDirectorId
 * which requires WS-mirrored lobby state. Pass 1 callers can pass
 * `isActiveDirector` directly when they have it; otherwise this hook
 * falls back to false so the chrome shows Mode C for players.
 */
function useIsActiveDirector(): boolean {
  // Placeholder: pages that know they're director-side will assert this
  // via context or props in later iterations. For Pass 1 chrome we read
  // a lightweight signal (e.g. `?director=1` query param or a per-route
  // hook). To keep the surface honest we default false.
  return false;
}

export interface AppShellProps {
  children?: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { activeCampaignId } = useActiveContext();
  const isActiveDirector = useIsActiveDirector();
  const _location = useLocation();

  let mode: TopBarMode;
  if (activeCampaignId === null) mode = 'A';
  else if (isActiveDirector) mode = 'B';
  else mode = 'C';

  return (
    <ThemeProvider>
      <div className="min-h-screen flex flex-col bg-ink-0 text-text">
        <TopBar mode={mode} />
        <main className="flex-1 min-h-0">{children ?? <Outlet />}</main>
      </div>
    </ThemeProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/primitives/AppShell.tsx
git commit -m "feat(web/primitives): AppShell — mounts ThemeProvider, resolves TopBar mode"
```

Note on `useIsActiveDirector`: Pass 1 keeps this stub-returning-false because the active-director signal lives in lobby DO state, which is route-scoped. The DirectorCombat page (Phase H) is the one place that knows it's director-side; for the other routes the player view is the right default. Pass 2 will replace this stub with a real signal once the active-context columns are persisted.

---

### Task E4: Home — dynamic empty-state vs redirect

**Files:**
- Modify: `apps/web/src/pages/Home.tsx`
- Create: `apps/web/src/pages/Home.spec.tsx`

- [ ] **Step 1: Inspect current Home**

```bash
cat apps/web/src/pages/Home.tsx
```

Note what it currently does so you can preserve any signed-in messaging.

- [ ] **Step 2: Write the failing test**

```tsx
// apps/web/src/pages/Home.spec.tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ActiveContext from '../lib/active-context';
import { Home } from './Home';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Home', () => {
  it('shows the no-active-campaign empty state when activeCampaignId is null', () => {
    vi.spyOn(ActiveContext, 'useActiveContext').mockReturnValue({
      activeCampaignId: null,
      activeCharacterId: null,
    });
    render(<Home />);
    expect(screen.getByText(/no active campaign/i)).toBeInTheDocument();
    expect(screen.getByText(/start campaign/i)).toBeInTheDocument();
    expect(screen.getByText(/join campaign/i)).toBeInTheDocument();
  });
});
```

(Redirect behavior when `activeCampaignId !== null` requires TanStack Router test infrastructure that's not in scope; covered by manual smoke test in Phase I.)

- [ ] **Step 3: Run the test, confirm it fails**

```bash
pnpm --filter @ironyard/web test pages/Home
```

Expected: FAIL.

- [ ] **Step 4: Replace `Home.tsx`**

```tsx
// apps/web/src/pages/Home.tsx
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useActiveContext } from '../lib/active-context';
import { Button } from '../primitives';

export function Home() {
  const { activeCampaignId } = useActiveContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (activeCampaignId) {
      navigate({ to: '/campaigns/$id', params: { id: activeCampaignId } });
    }
  }, [activeCampaignId, navigate]);

  if (activeCampaignId) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center">
      <h1 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-mute">
        No active campaign
      </h1>
      <p className="text-text-dim max-w-md">
        Start a new campaign to run sessions for your table, or join an existing one with an invite code.
      </p>
      <div className="flex gap-3">
        <Link to="/campaigns">
          <Button variant="primary">Start campaign</Button>
        </Link>
        <Link to="/campaigns">
          <Button>Join campaign</Button>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test, confirm pass**

```bash
pnpm --filter @ironyard/web test pages/Home
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/Home.tsx apps/web/src/pages/Home.spec.tsx
git commit -m "feat(web/home): dynamic empty-state vs redirect to active campaign"
```

---

### Task E5: Wire AppShell into router; delete Nav.tsx

**Files:**
- Modify: `apps/web/src/router.tsx`
- Delete: `apps/web/src/components/Nav.tsx`

- [ ] **Step 1: Update `router.tsx`**

Replace the `rootRoute` component:

```tsx
// apps/web/src/router.tsx
import { Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { AppShell } from './primitives/AppShell';
// ... existing page imports ...

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
```

Remove the `import { Nav } from './components/Nav';` line.

(Keep all child route definitions unchanged in this task — they swap in later phases.)

- [ ] **Step 2: Delete Nav.tsx**

```bash
git rm apps/web/src/components/Nav.tsx
```

- [ ] **Step 3: Run typecheck + tests**

```bash
pnpm --filter @ironyard/web typecheck && pnpm --filter @ironyard/web test
```

Expected: PASS.

- [ ] **Step 4: Manual smoke check**

```bash
pnpm --filter @ironyard/web dev
```

Visit `http://localhost:5173/`. Expect:
- The new TopBar renders, Mode A (no Foes link).
- Home shows the "No active campaign" empty state.
- Click "Campaigns" in Account ▾ → routes to `/campaigns`.

Kill the dev server (`Ctrl-C`) before continuing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/router.tsx
git commit -m "feat(web): swap legacy Nav for AppShell + TopBar"
```

---

## Phase F — Re-theme low-risk routes

These tasks change visual styling only. Run `pnpm --filter @ironyard/web typecheck && pnpm --filter @ironyard/web test` after each to catch accidental structural changes.

### Task F1: CampaignsList re-theme

**Files:**
- Modify: `apps/web/src/pages/CampaignsList.tsx`

- [ ] **Step 1: Read the current page**

```bash
cat apps/web/src/pages/CampaignsList.tsx
```

- [ ] **Step 2: Replace existing color classes with tokens**

Map (apply to every utility class in the file):
- `bg-neutral-950 / 900 / 800` → `bg-ink-0 / bg-ink-1 / bg-ink-2`
- `text-neutral-100 / 200 / 400 / 500` → `text-text / text-text / text-text-dim / text-text-mute`
- `border-neutral-800 / 700` → `border-line / border-line-soft`
- `bg-blue-* / accent / cta` → `bg-accent text-ink-0`
- `rounded-*` → remove (radius is 0)

Wrap each top-level card in `<Section heading="...">` from `primitives` where the page currently does its own card chrome.

- [ ] **Step 3: Typecheck + test**

```bash
pnpm --filter @ironyard/web typecheck && pnpm --filter @ironyard/web test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/CampaignsList.tsx
git commit -m "refactor(web/campaigns-list): re-theme on tokens + Section primitive"
```

---

### Task F2: CharactersList re-theme

Same pattern as F1 against `apps/web/src/pages/CharactersList.tsx`. Use `Sigil` for character monograms if the page currently renders one inline.

- [ ] **Step 1: Read + re-theme**

```bash
cat apps/web/src/pages/CharactersList.tsx
```

Apply the token mapping from F1 step 2. Replace any character avatar element with `<Sigil text={initials(character.name)} />`.

- [ ] **Step 2: Typecheck + test**

```bash
pnpm --filter @ironyard/web typecheck && pnpm --filter @ironyard/web test
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/CharactersList.tsx
git commit -m "refactor(web/characters-list): re-theme on tokens + Sigil/Section primitives"
```

---

### Task F3: MonsterBrowser + MonsterDetail re-theme

**Files:**
- Modify: `apps/web/src/pages/MonsterBrowser.tsx`
- Modify: `apps/web/src/pages/MonsterDetail.tsx`

Same mapping. The browser uses Chips for type/role filters — convert any inline filter pills to `<Chip selected={...}>`. The detail page uses Section primitive for each statblock card.

- [ ] **Step 1: Re-theme MonsterBrowser**
- [ ] **Step 2: Re-theme MonsterDetail**
- [ ] **Step 3: Typecheck + test**

```bash
pnpm --filter @ironyard/web typecheck && pnpm --filter @ironyard/web test
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/MonsterBrowser.tsx apps/web/src/pages/MonsterDetail.tsx
git commit -m "refactor(web/foes): re-theme MonsterBrowser + MonsterDetail on tokens + primitives"
```

---

## Phase G — Re-theme + IA changes

### Task G1: CampaignView re-theme (panel-by-panel)

**Files:**
- Modify: `apps/web/src/pages/CampaignView.tsx` (1214 lines)

This is the largest re-theme. The file has many internal panel components (`SavedTemplatesPanel`, `ActiveDirectorBanner`, `SubmitCharacterPanel`, `PendingCharactersPanel`, `ApprovedRosterPanel`, `OwnerAdminPanel`, `StartSessionPanel`, `ActiveSessionBadge`, etc.). Re-theme each one to use `Section` + token classes. Preserve all structural JSX so the existing handlers and tests remain valid.

- [ ] **Step 1: Map the panels**

```bash
grep -n "^function " apps/web/src/pages/CampaignView.tsx
```

List each internal component.

- [ ] **Step 2: Re-theme top to bottom**

For each component:
- Wrap its returned card-shaped JSX in `<Section heading="..." right={...}>` instead of bespoke `<div class="bg-neutral-900 border ...">`.
- Replace utility colors with tokens per the F1 mapping.
- Replace inline `<button class="...">` with `<Button variant="primary|default|ghost">`.

- [ ] **Step 3: Typecheck + test**

```bash
pnpm --filter @ironyard/web typecheck && pnpm --filter @ironyard/web test
```

Expected: PASS. If any test asserts on a specific structural element you replaced with a `Section`, update the assertion to target the new role / class.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/CampaignView.tsx
git commit -m "refactor(web/campaign-view): re-theme each panel onto Section + token primitives"
```

---

### Task G2: EncounterBuilder re-theme

**Files:**
- Modify: `apps/web/src/pages/EncounterBuilder.tsx` (588 lines)

Same pattern as G1. The builder has step navigation that may benefit from the `Tabs` primitive if it has 2+ steps; otherwise use `Section` + `Button`.

- [ ] **Step 1: Re-theme**
- [ ] **Step 2: Typecheck + test**

```bash
pnpm --filter @ironyard/web typecheck && pnpm --filter @ironyard/web test
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/EncounterBuilder.tsx
git commit -m "refactor(web/encounter-builder): re-theme onto tokens + Section"
```

---

### Task G3: Sheet re-theme + add Tabs

**Files:**
- Modify: `apps/web/src/pages/characters/Sheet.tsx`

- [ ] **Step 1: Read the current sheet**

```bash
cat apps/web/src/pages/characters/Sheet.tsx | head -120
```

Identify the major sections: Overview (header + characteristics + vitals), Abilities, Features, Story, Activity.

- [ ] **Step 2: Add tab state and split content**

Restructure into:

```tsx
import { useState } from 'react';
import { Tabs, Section, type TabItem } from '../../primitives';

const TAB_ITEMS: TabItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'abilities', label: 'Abilities' },
  { id: 'features', label: 'Features' },
  { id: 'story', label: 'Story' },
  { id: 'activity', label: 'Activity' },
];

export function Sheet() {
  const [tab, setTab] = useState('overview');
  return (
    <div className="p-4 max-w-5xl mx-auto flex flex-col gap-4">
      <SheetHeader character={...} />
      <Tabs items={TAB_ITEMS} value={tab} onChange={setTab} />
      <div>
        {tab === 'overview' && <OverviewPanel character={...} />}
        {tab === 'abilities' && <AbilitiesPanel character={...} />}
        {tab === 'features' && <FeaturesPanel character={...} />}
        {tab === 'story' && <StoryPanel character={...} />}
        {tab === 'activity' && <ActivityPanel character={...} />}
      </div>
    </div>
  );
}
```

Extract the existing sheet panels into the local sub-components shown above. If a panel doesn't have content yet (Activity is the most likely empty case), render an empty-state with `<Section heading="Activity"><p className="text-text-mute">No recent activity</p></Section>`.

Re-theme every sub-component onto tokens.

- [ ] **Step 3: Typecheck + test**

```bash
pnpm --filter @ironyard/web typecheck && pnpm --filter @ironyard/web test
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/characters/Sheet.tsx
git commit -m "feat(web/sheet): re-theme + in-page tabs (Overview/Abilities/Features/Story/Activity)"
```

---

### Task G4: Wizard re-theme + split-pane live preview

**Files:**
- Modify: `apps/web/src/pages/characters/Wizard.tsx`

- [ ] **Step 1: Wrap the wizard in SplitPane**

```tsx
import { SplitPane } from '../../primitives';

// inside the component's return:
return (
  <SplitPane
    ratio="1fr 1fr"
    left={<WizardStepBody step={currentStep} {...stepProps} />}
    right={<LivePreviewSheet draft={draft} />}
  />
);
```

- [ ] **Step 2: Create `LivePreviewSheet` as a local component**

Render a compact view that mirrors the sheet's overview panel structure (header with name + ancestry + class, vitals, characteristics). It reads from the same `draft` shape the wizard already maintains.

- [ ] **Step 3: Re-theme all wizard step components**

Apply the token mapping. Use `Section` for each step's content panel, `Button` for navigation (`← Back` / `Save & Continue →`).

- [ ] **Step 4: Typecheck + test**

```bash
pnpm --filter @ironyard/web typecheck && pnpm --filter @ironyard/web test
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/characters/Wizard.tsx
git commit -m "feat(web/wizard): split-pane live preview + re-theme on tokens"
```

---

## Phase H — DirectorCombat replaces CombatRun

The highest-risk slice. Done last so primitives are stable. Behavior tests for OpenActionsList, RespiteConfirm, PushItemModal, etc. must keep passing.

### Task H1: PartyRail

**Files:**
- Create: `apps/web/src/pages/combat/PartyRail.tsx`

- [ ] **Step 1: Write `PartyRail.tsx`**

```tsx
// apps/web/src/pages/combat/PartyRail.tsx
import type { Participant } from '@ironyard/rules';
import { ParticipantRow, Section } from '../../primitives';

export interface PartyRailProps {
  heroes: Participant[];
  activeParticipantId: string | null;
  selectedParticipantId: string | null;
  onSelect: (id: string) => void;
  /** Set of participant ids who've already acted this round. */
  actedIds: Set<string>;
}

export function PartyRail({
  heroes,
  activeParticipantId,
  selectedParticipantId,
  onSelect,
  actedIds,
}: PartyRailProps) {
  const heading = `PARTY · ${heroes.length} HEROES`;
  return (
    <Section heading={heading}>
      <div className="flex flex-col gap-1">
        {heroes.map((h) => (
          <ParticipantRow
            key={h.id}
            sigil={initials(h.displayName ?? h.id)}
            name={h.displayName ?? h.id}
            role={summarizeRole(h)}
            staminaCurrent={h.currentStamina ?? 0}
            staminaMax={h.maxStamina ?? 0}
            active={selectedParticipantId === h.id}
            isTurn={activeParticipantId === h.id}
            acted={actedIds.has(h.id)}
            onSelect={() => onSelect(h.id)}
          />
        ))}
      </div>
    </Section>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2);
}

function summarizeRole(p: Participant): string {
  // Pass 1: derive a short role label from the participant's class/ancestry.
  // Fill with whatever the Participant type currently exposes.
  return [p.level ? `L${p.level}` : '', p.className ?? '', p.ancestry ?? ''].filter(Boolean).join(' · ');
}
```

Adjust the prop reads (`displayName`, `currentStamina`, `maxStamina`, `level`, `className`, `ancestry`) to match the actual `Participant` shape exported from `@ironyard/rules`. If a field doesn't exist, omit that piece — don't invent shape.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/combat/PartyRail.tsx
git commit -m "feat(web/combat): PartyRail — hero list panel"
```

---

### Task H2: EncounterRail

**Files:**
- Create: `apps/web/src/pages/combat/EncounterRail.tsx`

- [ ] **Step 1: Write `EncounterRail.tsx`**

```tsx
// apps/web/src/pages/combat/EncounterRail.tsx
import type { Participant } from '@ironyard/rules';
import { ParticipantRow, Section } from '../../primitives';

export interface EncounterRailProps {
  foes: Participant[];
  defeatedCount: number;
  activeParticipantId: string | null;
  selectedParticipantId: string | null;
  onSelect: (id: string) => void;
}

export function EncounterRail({
  foes,
  defeatedCount,
  activeParticipantId,
  selectedParticipantId,
  onSelect,
}: EncounterRailProps) {
  const heading = `ENCOUNTER · ${foes.length} ACTIVE`;
  const right = `${defeatedCount} defeated`;
  return (
    <Section heading={heading} right={right}>
      <div className="flex flex-col gap-1">
        {foes.map((f) => (
          <ParticipantRow
            key={f.id}
            sigil={initials(f.displayName ?? f.id)}
            name={f.displayName ?? f.id}
            role={summarizeRole(f)}
            staminaCurrent={f.currentStamina ?? 0}
            staminaMax={f.maxStamina ?? 0}
            active={selectedParticipantId === f.id}
            isTurn={activeParticipantId === f.id}
            onSelect={() => onSelect(f.id)}
          />
        ))}
      </div>
    </Section>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2);
}

function summarizeRole(p: Participant): string {
  return [p.level ? `L${p.level}` : '', p.role ?? '', p.ancestry ?? ''].filter(Boolean).join(' · ');
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/combat/EncounterRail.tsx
git commit -m "feat(web/combat): EncounterRail — foe list panel"
```

---

### Task H3: Re-theme DetailPane (existing component) on primitives

**Files:**
- Modify: `apps/web/src/pages/combat/DetailPane.tsx`

- [ ] **Step 1: Apply token mapping**

The existing DetailPane renders the selected participant's stat block + action stack (Main / Maneuver / Move / Triggers). Wrap the major blocks in `Section`, replace utility classes per the F1 mapping, replace inline action buttons with `Button`.

Behavior unchanged — only visuals.

- [ ] **Step 2: Typecheck + test**

```bash
pnpm --filter @ironyard/web typecheck && pnpm --filter @ironyard/web test
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/combat/DetailPane.tsx
git commit -m "refactor(web/combat): re-theme DetailPane onto Section + token primitives"
```

---

### Task H4: Re-theme remaining combat sub-components

**Files:**
- Modify: `apps/web/src/pages/combat/AbilityCard.tsx`
- Modify: `apps/web/src/pages/combat/ConditionChip.tsx`
- Modify: `apps/web/src/pages/combat/OpenActionsList.tsx`
- Modify: `apps/web/src/pages/combat/PlayerSheetPanel.tsx`
- Modify: `apps/web/src/pages/combat/InitiativePanel.tsx`
- Modify: `apps/web/src/pages/combat/ToastStack.tsx`
- Modify: `apps/web/src/pages/combat/RespiteConfirm.tsx`
- Modify: `apps/web/src/pages/combat/inventory/*.tsx`
- Modify: `apps/web/src/pages/director/PushItemModal.tsx`

For each: apply the F1 token mapping; wrap card-shaped JSX in `<Section>`; replace inline modal markup with `<Modal>` from primitives; replace inline toasts with `<Toast>`. Preserve every existing prop API and event handler.

- [ ] **Step 1: Re-theme each file**
- [ ] **Step 2: Run all relevant tests**

```bash
pnpm --filter @ironyard/web test OpenActionsList RespiteConfirm PushItemModal UseConsumableButton SwapKitModal BodySlotConflictChip InventoryPanel
```

Expected: all PASS. If a test asserts on a removed element (e.g. an inline backdrop div replaced by `Modal`), update the assertion to target the new structure — but only if the assertion was testing visual scaffolding, not behavior.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/combat apps/web/src/pages/director
git commit -m "refactor(web/combat): re-theme AbilityCard, ConditionChip, OpenActionsList, modals, etc. onto primitives"
```

---

### Task H5: DirectorCombat top-level component

**Files:**
- Create: `apps/web/src/pages/combat/DirectorCombat.tsx`

- [ ] **Step 1: Read CombatRun to understand wiring**

```bash
cat apps/web/src/pages/CombatRun.tsx | head -160
```

Identify: how it subscribes to the session socket, where it gets `participants`, `encounter`, `activeParticipantId`, `acted` flags, where it renders the action header (round, victories, malice). DirectorCombat keeps this same data plumbing — only the layout changes.

- [ ] **Step 2: Write `DirectorCombat.tsx`**

```tsx
// apps/web/src/pages/combat/DirectorCombat.tsx
import { useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { Pill, SplitPane, Stat } from '../../primitives';
// Reuse the existing CombatRun data hooks/utilities by extracting them.
// In Step 3 you'll factor them out into a shared module.
import {
  useCombatRunState, // existing hook OR new shared util
  computeActedSet,
  // ...
} from './combat-runtime';
import { DetailPane } from './DetailPane';
import { EncounterRail } from './EncounterRail';
import { PartyRail } from './PartyRail';

export function DirectorCombat() {
  const { id: campaignId } = useParams({ from: '/campaigns/$id/play' });
  const {
    participants,
    encounter,
    activeParticipantId,
    malice,
    victories,
    round,
    campaignName,
    sessionLabel,
    encounterLabel,
  } = useCombatRunState(campaignId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const heroes = participants.filter((p) => p.side === 'hero');
  const foes = participants.filter((p) => p.side !== 'hero' && p.alive);
  const defeatedCount = participants.filter((p) => p.side !== 'hero' && !p.alive).length;
  const actedIds = computeActedSet(encounter);

  return (
    <div className="h-full flex flex-col">
      {/* Mode-B campaign top-bar trailing slot is rendered by AppShell -> TopBar.
          DirectorCombat just renders the body here. The breadcrumb / counters
          appear in the AppShell once the active-director signal is wired in
          a follow-up; for Pass 1 they live inline at the top of this page so
          the screen still shows them. */}
      <div className="flex items-center gap-4 px-3.5 h-12 bg-ink-1 border-b border-line">
        <span className="text-xs text-text-dim">
          {campaignName} <span className="text-text-mute">·</span>{' '}
          <b className="text-text">{sessionLabel}</b>{' '}
          <span className="text-text-mute">·</span> {encounterLabel}
        </span>
        <span className="flex-1" />
        <Stat label="Round" value={round} />
        <Stat label="Victories" value={victories} />
        <Pill dotClassName="bg-foe">
          <span className="font-mono uppercase tracking-[0.08em] text-text-mute">
            Malice <b className="text-text font-sans">{malice}</b>
          </span>
        </Pill>
      </div>

      <SplitPane
        ratio="1.18fr 1fr"
        gap={14}
        className="flex-1 p-3.5"
        left={
          <>
            <PartyRail
              heroes={heroes}
              activeParticipantId={activeParticipantId}
              selectedParticipantId={selectedId}
              onSelect={setSelectedId}
              actedIds={actedIds}
            />
            <EncounterRail
              foes={foes}
              defeatedCount={defeatedCount}
              activeParticipantId={activeParticipantId}
              selectedParticipantId={selectedId}
              onSelect={setSelectedId}
            />
          </>
        }
        right={<DetailPane participantId={selectedId ?? activeParticipantId} />}
      />
    </div>
  );
}
```

- [ ] **Step 3: Factor reusable runtime out of CombatRun**

If `CombatRun.tsx` currently inlines hooks for state subscription and computed values, extract them into `apps/web/src/pages/combat/combat-runtime.ts` exporting `useCombatRunState`, `computeActedSet`, etc. (whatever DirectorCombat needs). Update the import in this new component and in the old CombatRun.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @ironyard/web typecheck
```

Expected: PASS. Fix any type mismatches by aligning DirectorCombat's reads with `Participant` and `EncounterPhase` shapes in `@ironyard/rules`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/combat/DirectorCombat.tsx apps/web/src/pages/combat/combat-runtime.ts
git commit -m "feat(web/combat): DirectorCombat top-level component — unified party + encounter + detail"
```

---

### Task H6: Swap router; delete CombatRun

**Files:**
- Modify: `apps/web/src/router.tsx`
- Delete: `apps/web/src/pages/CombatRun.tsx`

- [ ] **Step 1: Update router import**

```tsx
// apps/web/src/router.tsx — replace
import { CombatRun } from './pages/CombatRun';
// with
import { DirectorCombat } from './pages/combat/DirectorCombat';

// and the route:
const combatRunRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/campaigns/$id/play',
  component: DirectorCombat,
});
```

- [ ] **Step 2: Delete CombatRun.tsx**

```bash
git rm apps/web/src/pages/CombatRun.tsx
```

- [ ] **Step 3: Run full test suite + typecheck**

```bash
pnpm --filter @ironyard/web typecheck && pnpm --filter @ironyard/web test
```

Expected: PASS.

- [ ] **Step 4: Manual smoke check**

```bash
pnpm --filter @ironyard/web dev
```

Visit a campaign's combat run page. Expect:
- Mode-B inline header shows campaign · session · encounter, plus Round / Victories / Malice on the right.
- Party rail on the left top, Encounter rail below it.
- Selected participant detail on the right.
- Clicking a participant updates the right pane.

Kill the dev server before committing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/router.tsx
git commit -m "feat(web): route /campaigns/$id/play → DirectorCombat; delete CombatRun.tsx"
```

---

## Phase I — Verification

### Task I1: Full repo verification

**Files:** none

- [ ] **Step 1: Full test suite**

```bash
pnpm test
```

Expected: PASS. The web package's tests must pass; rules and shared should be unaffected.

- [ ] **Step 2: Full typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: PASS. Fix any lint errors that surfaced during the refactor (often unused imports left behind from old `Nav` and `CombatRun` references).

- [ ] **Step 4: Spot-check screenshots**

Open the dev server (`pnpm --filter @ironyard/web dev`) and inspect at two viewports:
- **iPad portrait (810 × 1080)** — use browser devtools responsive mode.
- **iPhone portrait (390 × 844)** — same.

Check each primary route:
- `/` (empty state)
- `/campaigns`
- `/campaigns/:id` (campaign hub — pick one with sessions)
- `/campaigns/:id/play` (DirectorCombat — needs an active encounter; create one via the hub)
- `/characters`
- `/characters/:id` (sheet — try each tab)
- `/characters/new` (wizard — confirm split-pane preview)
- `/foes`
- `/foes/:id`

Note any layout regressions in a follow-up issue or fix inline if minor.

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add <files>
git commit -m "chore(web): lint fixes + minor responsive tweaks from Pass 1 spot-check"
```

---

## Self-review

Spec coverage scan against `docs/superpowers/specs/2026-05-14-phase-5-layer-1-base-pass-1-design.md`:

| Spec section | Covered by |
|---|---|
| Token system (OKLCH ramps, side tones, stamina, accent, packs) | Task A1 |
| Tailwind v4 `@theme` integration | Task A1 |
| ThemeProvider runtime | Task A2 |
| useActiveContext hook | Task A3 |
| Active-context model designed, persistence deferred | Task A3 (URL-inferred); schema deferral documented in spec |
| Three top-bar modes | Tasks E1, E2 |
| Account dropdown (Campaigns / Characters / Sign out) | Task E1 |
| Active-character right-chip (Mode C) | Tasks D3, E2 |
| Director gating semantic | Spec; runtime stubbed in Task E3, real wiring deferred to Pass 2 |
| Dynamic Home (empty-state vs redirect) | Task E4 |
| Primitives — atoms | Tasks B1–B4 |
| Primitives — layout | Tasks C1–C4 |
| Primitives — composites | Tasks D1–D3 |
| Primitives index | Task D4 |
| AppShell wired into router; Nav.tsx deleted | Task E5 |
| Re-theme low-risk routes | Tasks F1–F3 |
| CampaignView re-theme | Task G1 |
| EncounterBuilder re-theme | Task G2 |
| Sheet + tabs | Task G3 |
| Wizard + split-pane preview | Task G4 |
| CombatRun replaced by DirectorCombat | Tasks H1–H6 |
| Density modes (`data-density`) | Task A2 (attribute set by ThemeProvider; consumer styles to be added in Pass 2 — no consumer requires it in Pass 1) |
| Per-row pack-color scope mechanism designed | Task A1 (`.pack-*` classes present); ParticipantRow accepts `pack` prop (Task D2) |
| Tests pass, typecheck clean, lint clean, screenshots checked | Task I1 |

No gaps. Density consumers are intentionally Pass-2.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-14-phase-5-layer-1-base-pass-1.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
