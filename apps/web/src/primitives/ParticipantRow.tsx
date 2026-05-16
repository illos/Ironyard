import type { Participant, StaminaState, TargetingRelationKind } from '@ironyard/shared';
import type { ReactNode } from 'react';
import { CLASS_RELATION_KIND } from '../lib/class-relation-kind';
import type { Pack } from '../theme/ThemeProvider';
import { Button } from './Button';
import { HpBar } from './HpBar';
import { Sigil } from './Sigil';
import { StaminaStateTag } from './StaminaStateTag';

/** Affordance shown on the row when a pick action is available. */
export type PickAffordance =
  | { kind: 'self'; onClick: () => void; label: string }
  | { kind: 'other'; onClick: () => void; label: string }
  | { kind: 'foe-tap'; onClick: () => void }
  | null;

// ── Targeting-relation chip helpers (Pass 3 Slice 2b) ────────────────────────

/**
 * The inbound chip label prefix for each relation kind.
 * Full chip text: `${INBOUND_PHRASE[kind]} ${sourceName}`
 */
const INBOUND_PHRASE: Record<TargetingRelationKind, string> = {
  judged: 'Judged by',
  marked: 'Marked by',
  nullField: 'In Null Field of',
};

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
  /** Targeting state for the reticle button.
   *  - `index === null` → not targeted; reticle is idle (neutral)
   *  - `index === N` → targeted; reticle pulses red and shows the target number
   *  Forward-compat with multi-target: when an ability hits up to K creatures,
   *  it consumes targets in `index` order (1..K). Today only [0] is used. */
  target?: { index: number | null; onToggle: () => void };
  /** Per-character pack scope. Pass 1: pass undefined and the global accent applies. */
  pack?: Pack;
  onSelect?: () => void;
  /** Contextual pick affordance for zipper-initiative target selection. */
  pickAffordance?: PickAffordance;
  /** Pass 3 Slice 1 — canon §2.7-2.9 stamina state.
   *  Defaults to 'healthy' (no tag shown, no name decoration). */
  staminaState?: StaminaState;
  // ── Pass 3 Slice 2b — targeting-relation chips ──────────────────────────────
  /** The id of the participant this row represents.
   *  Required for relation chips; ignored when allParticipants is not provided. */
  thisParticipantId?: string;
  /** Full roster of participants (for computing inbound + outbound chips).
   *  Optional for backward compat — callers that don't pass it get no chips. */
  allParticipants?: Participant[];
  /** The current viewer's user id. Used to determine which sources they own. */
  viewerUserId?: string | null;
  /** True when the viewer is the active director (can edit any source's relations). */
  isActingAsDirector?: boolean;
  /**
   * Called when the viewer taps an outbound toggle chip.
   * Signature: (sourceId, relationKind, targetId, present)
   *   - present=true  → add targetId to source's relation
   *   - present=false → remove targetId from source's relation
   * Task 16 will wire the actual dispatch; Task 15 only accepts the callback.
   */
  onToggleRelation?: (
    sourceId: string,
    relationKind: TargetingRelationKind,
    targetId: string,
    present: boolean,
  ) => void;
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
  target,
  pack,
  onSelect,
  pickAffordance,
  staminaState = 'healthy',
  thisParticipantId,
  allParticipants,
  viewerUserId,
  isActingAsDirector = false,
  onToggleRelation,
}: ParticipantRowProps) {
  const hasActed = acted || isActed;

  // ── Targeting-relation chips (Pass 3 Slice 2b) ────────────────────────────
  // Computed only when allParticipants + thisParticipantId are provided.
  // No chips at all for callers that don't opt in.

  /** Inbound: (source, kind) pairs where source.targetingRelations[kind] includes thisParticipantId */
  const inboundChips: Array<{ label: string; key: string }> = [];
  /** Outbound: (source, kind) pairs the viewer can edit (they own source OR are director) */
  const outboundChips: Array<{
    sourceId: string;
    sourceName: string;
    kind: TargetingRelationKind;
    isSet: boolean;
    key: string;
  }> = [];

  if (allParticipants && thisParticipantId) {
    for (const p of allParticipants) {
      // Skip the row participant itself — no self-loops
      if (p.id === thisParticipantId) continue;
      const relationKind = p.className ? CLASS_RELATION_KIND[p.className.toLowerCase()] : undefined;

      if (!relationKind) continue;

      const relationArray = p.targetingRelations[relationKind];
      const isSet = relationArray.includes(thisParticipantId);

      // Inbound: visible to everyone
      if (isSet) {
        inboundChips.push({
          label: `${INBOUND_PHRASE[relationKind]} ${p.name}`,
          key: `inbound-${p.id}-${relationKind}`,
        });
      }

      // Outbound: only for viewer who owns source OR is active director
      const viewerOwnsSource = viewerUserId != null && p.ownerId === viewerUserId;
      if (viewerOwnsSource || isActingAsDirector) {
        outboundChips.push({
          sourceId: p.id,
          sourceName: p.name,
          kind: relationKind,
          isSet,
          key: `outbound-${p.id}-${relationKind}`,
        });
      }
    }
  }
  const isTargeted = target?.index != null;
  // Tailwind v4 JIT: static class lookups — no template interpolation (Pass 2b2a PS #2).
  const DEAD_NAME_CLASS = 'line-through opacity-60';
  const ALIVE_NAME_CLASS = '';
  const nameDeadClass = staminaState === 'dead' ? DEAD_NAME_CLASS : ALIVE_NAME_CLASS;
  const packClass = pack ? `pack-${pack}` : '';
  // Active-turn row gets the pulsing accent ring (keyframes in styles.css).
  // border-pk keeps a static edge so the row still reads at the pulse's nadir.
  const turnClass = isTurn ? 'border-pk turn-pulse' : '';
  const activeClass = active && !isTurn ? 'border-pk' : '';
  // self-pick gets a subtle hero-tone outline (lower priority than isTurn)
  const selfPickClass =
    !isTurn && pickAffordance?.kind === 'self' ? 'shadow-[0_0_0_1px_var(--color-hero)]' : '';
  const actedClass = hasActed ? 'opacity-55' : '';

  // foe-tap makes the whole row clickable
  const isFoeTap = pickAffordance?.kind === 'foe-tap';
  const foeTapClass = isFoeTap ? 'cursor-pointer' : '';
  const handleClick = isFoeTap
    ? (pickAffordance as { kind: 'foe-tap'; onClick: () => void }).onClick
    : onSelect;

  return (
    // Div + role="button" instead of <button> so the row can contain nested
    // interactive elements (pick-affordance Button, reticle target button)
    // without violating HTML's no-button-in-button rule.
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && handleClick) {
          e.preventDefault();
          handleClick();
        }
      }}
      className={`relative grid grid-cols-[32px_1fr_auto_auto_auto_140px_28px] items-center gap-3 px-3 py-2 bg-ink-2 border border-line text-left transition-colors hover:border-pk hover:bg-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${packClass} ${turnClass} ${activeClass} ${selfPickClass} ${actedClass} ${foeTapClass}`}
    >
      <Sigil text={sigil} />
      <span className="flex flex-col min-w-0 gap-0.5">
        <span
          className={`text-sm font-semibold tracking-tight truncate ${nameDeadClass}`}
          title={typeof name === 'string' ? name : undefined}
        >
          {name}
        </span>
        {role && (
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute truncate">
            {role}
          </span>
        )}
        {staminaState !== 'healthy' && <StaminaStateTag state={staminaState} />}
        {/* Inbound chips (P4) — visible to all viewers */}
        {inboundChips.length > 0 && (
          <span className="flex flex-wrap gap-0.5 mt-0.5">
            {inboundChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 border border-accent text-accent bg-ink-1"
              >
                {chip.label}
              </span>
            ))}
          </span>
        )}
        {/* Outbound chips (P2) — visible only to source owner or active director */}
        {outboundChips.length > 0 && (
          <span className="flex flex-wrap gap-0.5 mt-0.5">
            {outboundChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                aria-label={`toggle ${chip.kind} from ${chip.sourceName}`}
                aria-pressed={chip.isSet}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleRelation?.(chip.sourceId, chip.kind, thisParticipantId!, !chip.isSet);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleRelation?.(chip.sourceId, chip.kind, thisParticipantId!, !chip.isSet);
                  }
                }}
                className={`inline-flex items-center font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 border transition-colors cursor-pointer ${
                  chip.isSet
                    ? 'border-hero text-hero bg-ink-3'
                    : 'border-line text-text-mute bg-ink-1 hover:border-hero hover:text-hero'
                }`}
              >
                {chip.sourceName}
              </button>
            ))}
          </span>
        )}
      </span>
      <span className="flex gap-0.5">{conditions}</span>
      <span className="flex flex-col items-end gap-0.5">{resource}</span>
      <span className="flex flex-col items-end gap-0.5 tabular text-sm">{recoveries}</span>
      <span className="block w-[140px]">
        <HpBar current={staminaCurrent} max={staminaMax} variant="inline" />
      </span>

      {/* Reticle target button — always present; pulses red + shows index when targeted */}
      {target && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            target.onToggle();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              target.onToggle();
            }
          }}
          className={`relative inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors cursor-pointer ${
            isTargeted
              ? 'border-foe text-foe target-pulse'
              : 'border-line text-text-mute hover:border-foe hover:text-foe'
          }`}
          title={isTargeted ? `Target ${target.index}` : 'Set as target'}
          aria-label={isTargeted ? `Untarget (target ${target.index})` : 'Target this creature'}
          aria-pressed={isTargeted}
        >
          {/* Crosshair — small SVG so the icon scales cleanly. */}
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
            <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.25" />
            <line x1="8" y1="1" x2="8" y2="4" stroke="currentColor" strokeWidth="1.25" />
            <line x1="8" y1="12" x2="8" y2="15" stroke="currentColor" strokeWidth="1.25" />
            <line x1="1" y1="8" x2="4" y2="8" stroke="currentColor" strokeWidth="1.25" />
            <line x1="12" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.25" />
          </svg>
          {isTargeted && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-foe text-ink-0 font-mono text-[9px] leading-[14px] text-center">
              {target.index}
            </span>
          )}
        </span>
      )}

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
    </div>
  );
}
