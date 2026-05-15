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

// SVG glyph per condition. All 16×16 viewBox; stroke uses `currentColor` so
// the per-condition hue applies via the text-cond-* class on the parent.
// Designed to read at 14px without antialias noise (1.4-1.75 stroke widths).
function GlyphSvg({ type }: { type: ConditionType }) {
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
      // Jagged spike — startled flash, fear bolt.
      return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M9.5 1.5 L 5 8 L 8 8 L 6 14.5 L 11 7 L 8.5 7 Z"
            fill="currentColor"
            opacity="0.9"
          />
        </svg>
      );
    case 'Grabbed':
      // Two opposing brackets — clamp / grip.
      return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M4 3 L 4 13 M 4 3 L 6.5 3 M 4 13 L 6.5 13 M 12 3 L 12 13 M 12 3 L 9.5 3 M 12 13 L 9.5 13"
            fill="none"
            stroke={stroke}
            strokeWidth={sw + 0.25}
            strokeLinecap="round"
          />
        </svg>
      );
    case 'Prone':
      // Horizontal bar with figure on top — body lying.
      return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <circle cx="4" cy="8" r="1.5" fill="currentColor" />
          <path
            d="M 5.5 8 L 12.5 8"
            stroke={stroke}
            strokeWidth={sw + 0.5}
            strokeLinecap="round"
          />
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
      // Chain link pair — bound.
      return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <rect
            x="2.5"
            y="5"
            width="6"
            height="6"
            rx="2"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
          />
          <rect
            x="7.5"
            y="5"
            width="6"
            height="6"
            rx="2"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
          />
        </svg>
      );
    case 'Slowed':
      // Hourglass — time draining.
      return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M 4 2.5 L 12 2.5 L 12 5 L 8 8 L 12 11 L 12 13.5 L 4 13.5 L 4 11 L 8 8 L 4 5 Z"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="miter"
          />
          <path d="M 8 8 L 8 5 L 6 4 L 10 4 Z" fill="currentColor" opacity="0.7" />
        </svg>
      );
    case 'Taunted':
      // Crosshair target — taunt locks attention.
      return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" fill="none" stroke={stroke} strokeWidth={sw} />
          <circle cx="8" cy="8" r="2" fill="currentColor" opacity="0.85" />
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
      // Downward chevron over a bar — strength wilting.
      return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M 4 4 L 8 8 L 12 4"
            fill="none"
            stroke={stroke}
            strokeWidth={sw + 0.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 4 10 L 8 14 L 12 10"
            fill="none"
            stroke={stroke}
            strokeWidth={sw + 0.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.7"
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
      <GlyphSvg type={condition.type} />
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
