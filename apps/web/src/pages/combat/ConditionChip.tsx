import type { ConditionInstance, ConditionType } from '@ironyard/shared';

// Slice 11: muted-but-distinct backgrounds for the nine canon conditions.
// Per docs/rules-canon.md §3.1; reserved-condition list is closed.
const COLORS: Record<ConditionType, string> = {
  Bleeding: 'bg-rose-900/40 text-rose-100 ring-rose-700/40',
  Dazed: 'bg-indigo-900/40 text-indigo-100 ring-indigo-700/40',
  Frightened: 'bg-violet-900/40 text-violet-100 ring-violet-700/40',
  Grabbed: 'bg-amber-900/40 text-amber-100 ring-amber-700/40',
  Prone: 'bg-stone-800 text-stone-100 ring-stone-600/40',
  Restrained: 'bg-orange-900/40 text-orange-100 ring-orange-700/40',
  Slowed: 'bg-sky-900/40 text-sky-100 ring-sky-700/40',
  Taunted: 'bg-fuchsia-900/40 text-fuchsia-100 ring-fuchsia-700/40',
  Weakened: 'bg-slate-800 text-slate-100 ring-slate-600/40',
};

type Props = {
  condition: ConditionInstance;
  onRemove: () => void;
};

export function ConditionChip({ condition, onRemove }: Props) {
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
    </span>
  );
}
