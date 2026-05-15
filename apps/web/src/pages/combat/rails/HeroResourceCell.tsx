import type { Participant } from '@ironyard/shared';
import { capitalize } from './rail-utils';

export interface HeroResourceCellProps {
  participant: Participant;
}

const PIP_COUNT = 8;

/**
 * Phase 5 Pass 2b2a — heroic-resource readout for the PartyRail row.
 * Shows the resource display name + an 8-pip row + an optional +N overflow
 * numeric when the value exceeds 8.
 *
 * Pip color reads `var(--pk, var(--accent))` — the per-row pack-class scope
 * (set by ParticipantRow's `pack` prop) overrides --pk when Layer 2 ships
 * color-pack persistence. Until then every PC's pips use the global accent.
 *
 * Resource names are stored lowercase (enum) and capitalized for display.
 */
export function HeroResourceCell({ participant }: HeroResourceCellProps) {
  const resource = participant.heroicResources[0];
  if (!resource) return null;

  const filled = Math.min(resource.value, PIP_COUNT);
  const overflow = Math.max(0, resource.value - PIP_COUNT);
  const displayName = capitalize(resource.name);

  return (
    <div className="flex flex-col items-end gap-1 leading-none">
      <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-text-mute">
        {displayName}
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
