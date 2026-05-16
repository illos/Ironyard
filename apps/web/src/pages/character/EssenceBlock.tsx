import { Button } from '../../primitives';

// Pass 3 Slice 2a — Elementalist Essence + Maintenance block.
//
// Renders the hero's current essence resource alongside a per-turn delta
// readout. When the hero is maintaining one or more abilities, lists each
// with a Stop button and warns if next turn's net delta will auto-drop
// maintenance (current + baseGain - totalCost < 0).
//
// Pure presentational — parent (PlayerSheetPanel) owns intent dispatch via
// the onStopMaintain callback.

export type Maint = {
  abilityId: string;
  abilityName: string;
  costPerTurn: number;
};

export interface EssenceBlockProps {
  /** Current essence resource value on the participant. */
  currentEssence: number;
  /** Per-turn essence gain — canon: Elementalist is always +2. */
  baseGainPerTurn: number;
  /** Abilities the hero is currently maintaining (cost is per turn). */
  maintainedAbilities: Maint[];
  /** Called when the player taps a Stop button on a maintained ability. */
  onStopMaintain: (abilityId: string) => void;
}

export function EssenceBlock({
  currentEssence,
  baseGainPerTurn,
  maintainedAbilities,
  onStopMaintain,
}: EssenceBlockProps) {
  const totalMaintCost = maintainedAbilities.reduce((s, m) => s + m.costPerTurn, 0);
  const netDelta = baseGainPerTurn - totalMaintCost;
  const projected = currentEssence + netDelta;
  const willAutoDrop = maintainedAbilities.length > 0 && projected < 0;
  const netStr = `${netDelta >= 0 ? '+' : ''}${netDelta}/turn`;

  return (
    <section aria-label="Essence" className="border border-line bg-ink-1 p-3 space-y-2">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-mute">
          Essence
        </h3>
        <span
          data-testid="essence-value"
          className="font-mono text-2xl font-bold tabular-nums text-text"
        >
          {currentEssence}
        </span>
      </header>

      <p data-testid="essence-footnote" className="text-[11px] text-text-mute leading-snug">
        +{baseGainPerTurn}/turn · +1 first dmg-in-10sq
      </p>

      {maintainedAbilities.length > 0 && (
        <div className="pt-2 border-t border-line-soft space-y-1.5">
          <h4
            data-testid="maintain-heading"
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-mute"
          >
            Maintaining{' '}
            <span
              className={`font-mono tabular-nums ${netDelta < 0 ? 'text-foe' : 'text-text-dim'}`}
            >
              (net {netStr})
            </span>
          </h4>

          <ul className="space-y-1">
            {maintainedAbilities.map((m) => (
              <li key={m.abilityId} className="flex items-center justify-between gap-2 min-h-11">
                <span className="flex-1 min-w-0">
                  <span className="text-sm text-text">{m.abilityName}</span>
                  <span className="ml-2 font-mono text-xs text-text-mute tabular-nums">
                    {m.costPerTurn}/turn
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Stop ${m.abilityName}`}
                  onClick={() => onStopMaintain(m.abilityId)}
                  className="min-h-11"
                >
                  Stop
                </Button>
              </li>
            ))}
          </ul>

          {willAutoDrop && (
            <p
              data-testid="auto-drop-warning"
              className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foe"
            >
              Will auto-drop next turn
            </p>
          )}
        </div>
      )}
    </section>
  );
}
