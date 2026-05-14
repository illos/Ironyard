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
  /** Lower-priority ring shown when this participant is the current attack target.
   *  Suppressed when isTurn is true (turn ring takes precedence). Default false. */
  isTarget?: boolean;
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
  isTarget = false,
  pack,
  onSelect,
}: ParticipantRowProps) {
  const packClass = pack ? `pack-${pack}` : '';
  const turnClass = isTurn ? 'border-pk shadow-[0_0_0_1px_var(--pk,var(--accent))]' : '';
  const activeClass = active && !isTurn ? 'border-pk' : '';
  const targetClass = isTarget && !isTurn ? 'shadow-[0_0_0_1px_var(--accent)]' : '';
  const actedClass = acted ? 'opacity-55' : '';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative grid grid-cols-[32px_1fr_auto_auto_auto_110px] items-center gap-3 px-3 py-2 bg-ink-2 border border-line text-left transition-colors hover:border-pk hover:bg-ink-3 ${packClass} ${turnClass} ${activeClass} ${targetClass} ${actedClass}`}
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
