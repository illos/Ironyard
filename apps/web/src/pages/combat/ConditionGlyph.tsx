import type { ConditionInstance, ConditionType } from '@ironyard/shared';

// Pass 3 Slice 1 (post-shipping): compact glyph treatment for conditions on
// the combat-tracker rails. Each glyph is a small inline SVG rendered inside
// a colored circle ringed by the per-condition palette hue from Pass 2b2a.
// 22px outer / 14px glyph keeps the rail rows compact. Hover-tooltip carries
// the full condition name + duration so the glyph alone never has to do all
// the disambiguation work.

// Tailwind v4 JIT — static class lookups (Pass 2b2a PS #2). Each variant pulls
// the same hue from the cond-* token namespace at three opacities:
// - ring at 50% (visible outline)
// - bg at 14% (soft fill behind the glyph)
// - text at 100% (the glyph stroke colour)
const GLYPH_CLASSES: Record<ConditionType, string> = {
  Bleeding: 'bg-cond-bleed/14 text-cond-bleed ring-cond-bleed/50',
  Dazed: 'bg-cond-daze/14 text-cond-daze ring-cond-daze/50',
  Frightened: 'bg-cond-fright/14 text-cond-fright ring-cond-fright/50',
  Grabbed: 'bg-cond-grab/14 text-cond-grab ring-cond-grab/50',
  Prone: 'bg-cond-prone/14 text-cond-prone ring-cond-prone/50',
  Restrained: 'bg-cond-restr/14 text-cond-restr ring-cond-restr/50',
  Slowed: 'bg-cond-slow/14 text-cond-slow ring-cond-slow/50',
  Taunted: 'bg-cond-taunt/14 text-cond-taunt ring-cond-taunt/50',
  Unconscious: 'bg-neutral-400/14 text-neutral-400 ring-neutral-400/50',
  Weakened: 'bg-cond-weak/14 text-cond-weak ring-cond-weak/50',
};

/** Per-condition Tailwind class set (background tint + text colour + ring). */
export function conditionPaletteClasses(type: ConditionType): string {
  return GLYPH_CLASSES[type];
}

// SVG glyph per condition. All 16×16 viewBox; stroke uses `currentColor` so
// the per-condition hue applies via the text-cond-* class on the parent.
// Designed to read at 14px without antialias noise (1.4-1.75 stroke widths).
// Exported so the conditions picker can render the same glyphs on its
// chooser buttons (eye-test 2026-05-15).
export function ConditionGlyphSvg({ type }: { type: ConditionType }) {
  const stroke = 'currentColor';
  const sw = 1.5;
  switch (type) {
    case 'Bleeding':
      // Falling droplet — teardrop with a pointed apex, rounded base.
      return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M8 2 C 5 6, 4 9, 4 11 C 4 13.2, 5.8 14.5, 8 14.5 C 10.2 14.5, 12 13.2, 12 11 C 12 9, 11 6, 8 2 Z"
            fill="currentColor"
            opacity="0.85"
          />
        </svg>
      );
    case 'Dazed':
      // Spiral — confusion / "stars circling head" idea, single arc.
      return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M 8 8 m -5 0 a 5 5 0 1 0 10 0 a 3.5 3.5 0 1 0 -7 0 a 2 2 0 1 0 4 0"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinecap="round"
          />
        </svg>
      );
    case 'Frightened':
      // Exclamation mark — bold vertical bar over a separated dot.
      return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M 6.75 2 L 9.25 2 L 8.85 9.5 L 7.15 9.5 Z" fill="currentColor" />
          <circle cx="8" cy="12.5" r="1.4" fill="currentColor" />
        </svg>
      );
    case 'Grabbed':
      // Anchor — ring up top, stock crossbar, vertical shank, curved arms
      // with horn tips. Reads as "anchored / held in place".
      return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <g fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round">
            {/* Ring */}
            <circle cx="8" cy="2.75" r="1.4" />
            {/* Stock (horizontal crossbar) */}
            <path d="M 5.25 5.5 L 10.75 5.5" />
            {/* Shank (vertical) */}
            <path d="M 8 4 L 8 13" />
            {/* Curved arms with hooked tips */}
            <path d="M 3 10 Q 3 13 8 13 Q 13 13 13 10" />
            <path d="M 3 10 L 2 9.5" />
            <path d="M 13 10 L 14 9.5" />
          </g>
        </svg>
      );
    case 'Prone':
      // Horizontal bar with figure on top — body lying.
      return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <circle cx="4" cy="8" r="1.5" fill="currentColor" />
          <path d="M 5.5 8 L 12.5 8" stroke={stroke} strokeWidth={sw + 0.5} strokeLinecap="round" />
          <path
            d="M 2 12 L 14 12"
            stroke={stroke}
            strokeWidth={sw - 0.2}
            strokeLinecap="round"
            opacity="0.55"
          />
        </svg>
      );
    case 'Restrained':
      // Padlock — bound. Filled body with a stroked shackle on top.
      return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          {/* Shackle */}
          <path
            d="M 5 8 L 5 5.5 Q 5 3 8 3 Q 11 3 11 5.5 L 11 8"
            fill="none"
            stroke={stroke}
            strokeWidth={sw + 0.4}
            strokeLinecap="round"
          />
          {/* Body */}
          <rect x="3" y="7.5" width="10" height="7" rx="1.25" fill="currentColor" />
          {/* Keyhole */}
          <circle cx="8" cy="10.25" r="1" fill="var(--color-bg, #1a1a1a)" />
          <path
            d="M 8 10.5 L 8 12.5"
            stroke="var(--color-bg, #1a1a1a)"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'Slowed':
      // Analog clock — circle face with two hands; minute pointing right,
      // hour pointing up. Reads clearer than the hourglass at 14px.
      return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" fill="none" stroke={stroke} strokeWidth={sw} />
          {/* Hour hand — up */}
          <path d="M 8 8 L 8 4.5" stroke={stroke} strokeWidth={sw + 0.25} strokeLinecap="round" />
          {/* Minute hand — right */}
          <path d="M 8 8 L 11 8" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          {/* Center pivot */}
          <circle cx="8" cy="8" r="0.9" fill="currentColor" />
        </svg>
      );
    case 'Taunted':
      // Crossed swords — provocation / "fight me".
      return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <g stroke={stroke} strokeLinecap="round" fill="none">
            {/* Sword 1 — blade tip top-left, hilt bottom-right */}
            <path d="M 2.5 2.5 L 11 11" strokeWidth={sw + 0.1} />
            <path d="M 11 11 L 13.5 13.5" strokeWidth={sw + 1.1} />
            {/* Crossguard 1 */}
            <path d="M 10 12.5 L 12.5 10" strokeWidth={sw + 0.25} />
            {/* Sword 2 — blade tip top-right, hilt bottom-left */}
            <path d="M 13.5 2.5 L 5 11" strokeWidth={sw + 0.1} />
            <path d="M 5 11 L 2.5 13.5" strokeWidth={sw + 1.1} />
            {/* Crossguard 2 */}
            <path d="M 3.5 10 L 6 12.5" strokeWidth={sw + 0.25} />
          </g>
        </svg>
      );
    case 'Unconscious':
      // Stacked Z's — sleeping.
      return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M 4 5 L 8 5 L 4 9 L 8 9 M 8 9 L 11 9 L 8 12 L 11 12"
            fill="none"
            stroke={stroke}
            strokeWidth={sw + 0.25}
            strokeLinejoin="miter"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'Weakened':
      // Cracked heart — heart silhouette split by a jagged zig-zag down the
      // middle. Reads as "broken / weakened".
      return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M 8 14
               C 4.5 11, 1.5 9, 1.5 5.75
               C 1.5 4, 2.75 2.75, 4.5 2.75
               C 6 2.75, 7.25 3.75, 8 5
               C 8.75 3.75, 10 2.75, 11.5 2.75
               C 13.25 2.75, 14.5 4, 14.5 5.75
               C 14.5 9, 11.5 11, 8 14 Z"
            fill="currentColor"
          />
          {/* Zig-zag crack down the middle, knocked out in the bg colour */}
          <path
            d="M 8 3.75 L 6.5 6 L 8.75 8 L 6.75 10 L 8.5 12 L 8 13.75"
            fill="none"
            stroke="var(--color-bg, #1a1a1a)"
            strokeWidth="1.3"
            strokeLinejoin="miter"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

function durationSuffix(cond: ConditionInstance): string {
  switch (cond.duration.kind) {
    case 'EoT':
      return ' · EoT';
    case 'save_ends':
      return ' · save ends';
    case 'until_start_next_turn':
      return ' · until next turn';
    case 'end_of_encounter':
      return ' · EoE';
    case 'manual':
      return '';
    default:
      return ' · trigger';
  }
}

export interface ConditionGlyphProps {
  condition: ConditionInstance;
}

export function ConditionGlyph({ condition }: ConditionGlyphProps) {
  const title = `${condition.type}${durationSuffix(condition)}`;
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex h-[22px] w-[22px] items-center justify-center rounded-full ring-1 ring-inset ${GLYPH_CLASSES[condition.type]}`}
    >
      <ConditionGlyphSvg type={condition.type} />
    </span>
  );
}

export interface ConditionGlyphsProps {
  conditions: ConditionInstance[];
}

/** Compact glyph cluster for participant-row condition slots. */
export function ConditionGlyphs({ conditions }: ConditionGlyphsProps) {
  if (conditions.length === 0) return null;
  return (
    <span className="flex items-center gap-0.5">
      {conditions.map((c, i) => (
        // Engine-generated conditions ship `appliedAtSeq: 0` (Pass 3 Slice 1
        // PS#2), so seq+type alone may collide. Index-suffix the key for
        // unique React reconciliation.
        <ConditionGlyph key={`${c.type}-${c.appliedAtSeq}-${i}`} condition={c} />
      ))}
    </span>
  );
}
