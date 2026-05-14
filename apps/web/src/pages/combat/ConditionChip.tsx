import type { ConditionInstance, ConditionType } from '@ironyard/shared';

// Slice 11: muted-but-distinct backgrounds for the nine canon conditions.
// Per docs/rules-canon.md §3.1; reserved-condition list is closed.
const COLORS: Record<ConditionType, string> = {
  Bleeding: 'bg-foe text-text ring-foe',
  Dazed: 'bg-ink-2 text-text ring-line',
  Frightened: 'bg-ink-2 text-text ring-line',
  Grabbed: 'bg-ink-2 text-text ring-line',
  Prone: 'bg-ink-2 text-text ring-line',
  Restrained: 'bg-ink-2 text-text ring-line',
  Slowed: 'bg-ink-2 text-text ring-line',
  Taunted: 'bg-ink-2 text-text ring-line',
  Weakened: 'bg-ink-2 text-text ring-line',
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
            : 'trigger';

  return (
    <span
      className={`inline-flex items-center gap-2 min-h-11 px-3 py-1 rounded-full text-sm font-medium ring-1 ring-inset select-none ${COLORS[condition.type]}`}
    >
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
