import type { ConditionInstance, ConditionType } from '@ironyard/shared';
import { ConditionGlyphSvg } from './ConditionGlyph';

// Phase 5 Pass 2b2a — nine distinct hues per condition (categorical palette).
// Maps each ConditionType to its token-bound Tailwind classes.
// Pass 3 Slice 1: Unconscious added (engine-managed KO condition).
const COLORS: Record<ConditionType, string> = {
  Bleeding: 'bg-cond-bleed/14  text-cond-bleed  ring-cond-bleed/50',
  Dazed: 'bg-cond-daze/14   text-cond-daze   ring-cond-daze/50',
  Frightened: 'bg-cond-fright/14 text-cond-fright ring-cond-fright/50',
  Grabbed: 'bg-cond-grab/14   text-cond-grab   ring-cond-grab/50',
  Prone: 'bg-cond-prone/14  text-cond-prone  ring-cond-prone/50',
  Restrained: 'bg-cond-restr/14  text-cond-restr  ring-cond-restr/50',
  Slowed: 'bg-cond-slow/14   text-cond-slow   ring-cond-slow/50',
  Taunted: 'bg-cond-taunt/14  text-cond-taunt  ring-cond-taunt/50',
  Unconscious: 'bg-neutral-400/14 text-neutral-400 ring-neutral-400/50',
  Weakened: 'bg-cond-weak/14   text-cond-weak   ring-cond-weak/50',
};

type Props = {
  condition: ConditionInstance;
  onRemove: () => void;
  /** When false the × remove button is hidden; the chip itself still renders. Defaults true. */
  removable?: boolean;
};

export function ConditionChip({ condition, onRemove, removable = true }: Props) {
  const durationLabel =
    condition.duration.kind === 'EoT'
      ? 'EoT'
      : condition.duration.kind === 'save_ends'
        ? 'save ends'
        : condition.duration.kind === 'until_start_next_turn'
          ? 'until next turn'
          : condition.duration.kind === 'end_of_encounter'
            ? 'EoE'
            : condition.duration.kind === 'manual'
              ? 'manual'
              : 'trigger';

  return (
    <span
      className={`inline-flex items-center gap-2 min-h-11 px-3 py-1 rounded-full text-sm font-medium ring-1 ring-inset select-none ${COLORS[condition.type]}`}
    >
      <ConditionGlyphSvg type={condition.type} />
      <span>{condition.type}</span>
      <span className="text-xs opacity-70 font-mono tabular-nums">{durationLabel}</span>
      {removable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${condition.type}`}
          className="ml-1 -mr-1 inline-flex items-center justify-center w-6 h-6 rounded-full hover:bg-black/30 active:bg-black/40 transition-colors"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </span>
  );
}
