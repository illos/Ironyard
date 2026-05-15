import type { ReactNode } from 'react';
import type { Pack } from '../theme/ThemeProvider';
import { Button } from './Button';
import { HpBar } from './HpBar';
import { Sigil } from './Sigil';

/** Affordance shown on the row when a pick action is available. */
export type PickAffordance =
  | { kind: 'self'; onClick: () => void; label: string }
  | { kind: 'other'; onClick: () => void; label: string }
  | { kind: 'foe-tap'; onClick: () => void }
  | null;

export interface ParticipantRowProps {
  sigil: string;
  name: ReactNode;
  role?: ReactNode;
  conditions?: ReactNode; // pre-rendered ConditionChip[] etc.
  resource?: ReactNode; // pre-rendered Pip rows etc.
  recoveries?: ReactNode;
  staminaCurrent: number;
  staminaMax: number;
  active?: boolean; // selected for detail pane
  isTurn?: boolean; // currently the acting participant
  /** @deprecated prefer isActed */
  acted?: boolean; // turn already used this round
  /** True when this participant has already taken their turn this round. */
  isActed?: boolean;
  /** True when this participant is surprised (cannot act on first round). */
  isSurprised?: boolean;
  /** Lower-priority ring shown when this participant is the current attack target.
   *  Suppressed when isTurn is true (turn ring takes precedence). Default false. */
  isTarget?: boolean;
  /** Per-character pack scope. Pass 1: pass undefined and the global accent applies. */
  pack?: Pack;
  onSelect?: () => void;
  /** Contextual pick affordance for zipper-initiative target selection. */
  pickAffordance?: PickAffordance;
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
  isActed = false,
  isSurprised = false,
  isTarget = false,
  pack,
  onSelect,
  pickAffordance,
}: ParticipantRowProps) {
  const hasActed = acted || isActed;
  const packClass = pack ? `pack-${pack}` : '';
  // Active-turn row gets the pulsing accent ring (keyframes in styles.css).
  // border-pk keeps a static edge so the row still reads at the pulse's nadir.
  const turnClass = isTurn ? 'border-pk turn-pulse' : '';
  const activeClass = active && !isTurn ? 'border-pk' : '';
  const targetClass = isTarget && !isTurn ? 'shadow-[0_0_0_1px_var(--accent)]' : '';
  // self-pick gets a subtle hero-tone outline (lower priority than isTurn / isTarget)
  const selfPickClass =
    !isTurn && !isTarget && pickAffordance?.kind === 'self'
      ? 'shadow-[0_0_0_1px_var(--color-hero)]'
      : '';
  const actedClass = hasActed ? 'opacity-55' : '';

  // foe-tap makes the whole row clickable
  const isFoeTap = pickAffordance?.kind === 'foe-tap';
  const foeTapClass = isFoeTap ? 'cursor-pointer' : '';
  const handleClick = isFoeTap
    ? (pickAffordance as { kind: 'foe-tap'; onClick: () => void }).onClick
    : onSelect;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`relative grid grid-cols-[32px_1fr_auto_auto_auto_110px] items-center gap-3 px-3 py-2 bg-ink-2 border border-line text-left transition-colors hover:border-pk hover:bg-ink-3 ${packClass} ${turnClass} ${activeClass} ${targetClass} ${selfPickClass} ${actedClass} ${foeTapClass}`}
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

      {/* Meta badges — ACTED and SURPRISED */}
      {hasActed && (
        <span className="absolute top-1.5 right-2 font-mono text-[8px] tracking-[0.16em] text-text-mute bg-ink-1 px-1.5 border border-line-soft">
          ACTED
        </span>
      )}
      {isSurprised && !hasActed && (
        <span className="absolute top-1.5 right-2 font-mono text-[8px] tracking-[0.16em] text-foe bg-ink-1 px-1.5 border border-line-soft">
          SURPRISED
        </span>
      )}

      {/* Pick affordance — self (primary button) or other (ghost link) */}
      {pickAffordance?.kind === 'self' && (
        <span className="absolute bottom-1.5 right-2">
          <Button
            variant="primary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              pickAffordance.onClick();
            }}
          >
            {pickAffordance.label}
          </Button>
        </span>
      )}
      {pickAffordance?.kind === 'other' && (
        <span className="absolute bottom-1.5 right-2">
          <button
            type="button"
            className="text-xs text-text-mute hover:text-accent transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              pickAffordance.onClick();
            }}
          >
            {pickAffordance.label}
          </button>
        </span>
      )}
    </button>
  );
}
