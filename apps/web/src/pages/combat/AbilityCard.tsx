import type { Ability, Participant, TierOutcome } from '@ironyard/shared';
import { formatAbilityDistance } from '../../lib/format-ability-distance';
import { TIER_RIGGED_ROLLS, roll2d10 } from '../../lib/rollDice';
import { RollOverflowPopover } from './RollOverflowPopover';

type RollArgs = {
  rolls: [number, number];
  source: 'manual' | 'auto';
};

/**
 * Phase 5 Pass 2b2a — type-chip style map. Retained but not rendered by the
 * default card layout; the costLabel folds into the keyword line instead.
 * Kept exported so a future eye-test could restore the chip with a 5-line
 * JSX addition without re-deriving the palette mapping.
 */
export const TYPE_CHIP_STYLE: Record<Ability['type'], string> = {
  action: 'bg-foe text-text',
  maneuver: 'bg-accent text-ink-0',
  triggered: 'bg-ink-2 text-accent',
  'free-triggered': 'bg-ink-2 text-accent',
  villain: 'bg-ink-2 text-text',
  trait: 'bg-ink-2 text-text-dim',
};

type Props = {
  ability: Ability;
  disabled: boolean;
  readOnly?: boolean;
  onRoll: (ability: Ability, args: RollArgs) => void;
  /** Pass-2b2a — when true, render the SET A TARGET prompt + force Roll disabled. */
  targetMissing?: boolean;
  /**
   * Slice 10 / Phase 2b Group A+B (2b.3) — optional acting participant so the
   * card can fold kit melee/ranged distance bonuses into the displayed range
   * for non-signature, non-AoE weapon abilities. When omitted, distance falls
   * back to the raw `ability.distance` string. AoE shapes and signatures are
   * passed through unchanged inside `formatAbilityDistance`.
   */
  participant?: Participant | null;
};

export function AbilityCard({
  ability,
  disabled,
  readOnly = false,
  onRoll,
  targetMissing = false,
  participant = null,
}: Props) {
  if (!ability.powerRoll) return null;
  const pr = ability.powerRoll;

  const handleAuto = () => onRoll(ability, { rolls: roll2d10(), source: 'auto' });
  const handleManual = (tier: 1 | 2 | 3) => {
    const rolls =
      tier === 1 ? TIER_RIGGED_ROLLS.t1 : tier === 2 ? TIER_RIGGED_ROLLS.t2 : TIER_RIGGED_ROLLS.t3;
    onRoll(ability, { rolls, source: 'manual' });
  };

  const keywordsLine = [
    ...ability.keywords,
    ...(ability.costLabel ? [ability.costLabel] : []),
  ].join(' · ');

  const rollDisabled = disabled || targetMissing;

  return (
    <article className="border border-line bg-ink-1 p-3.5 space-y-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{ability.name}</h3>
        {ability.distance && (
          <span className="font-mono text-[11px] text-text-mute">
            {formatAbilityDistance(ability, participant)}
          </span>
        )}
      </header>

      {keywordsLine && (
        <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-text-mute -mt-2">
          {keywordsLine}
        </div>
      )}

      {targetMissing && !readOnly && (
        <div className="border border-dashed border-foe/50 bg-foe/4 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-foe">
          Set a target
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] text-text flex-1">
          2d10 <span className="font-bold">{pr.bonus}</span>
          {ability.targetCharacteristic && (
            <>
              {' '}
              <span className="text-text-mute">·</span>{' '}
              <span className="text-text-dim">vs {ability.targetCharacteristic}</span>
            </>
          )}
        </span>
        {!readOnly && (
          <>
            <button
              type="button"
              onClick={handleAuto}
              disabled={rollDisabled}
              aria-label="Roll 2d10"
              className="font-mono text-[11px] px-3 h-8 bg-text text-ink-0 hover:bg-text-dim disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              Roll
            </button>
            <RollOverflowPopover onPickTier={handleManual} disabled={rollDisabled} />
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1">
        <TierCol label="≤11" tier={pr.tier1} />
        <TierCol label="12–16" tier={pr.tier2} />
        <TierCol label="17+" tier={pr.tier3} />
      </div>

      {ability.effect && (
        <p className="text-xs text-text-dim leading-relaxed">
          <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-text-mute mr-1">
            Effect
          </span>
          {ability.effect}
        </p>
      )}
    </article>
  );
}

function TierCol({ label, tier }: { label: string; tier: TierOutcome }) {
  return (
    <div className="border border-line bg-ink-2 p-2 space-y-1">
      <div className="font-mono text-[10px] text-text-mute">{label}</div>
      <div className="text-xs text-text leading-snug">{renderTierProse(tier)}</div>
    </div>
  );
}

function renderTierProse(tier: TierOutcome): React.ReactNode {
  const parts: React.ReactNode[] = [];
  if (tier.damage !== null) {
    const typed = tier.damageType && tier.damageType !== 'untyped' ? ` ${tier.damageType}` : '';
    parts.push(
      <span key="dmg">
        {tier.damage}
        {typed} damage
      </span>,
    );
  }
  for (const c of tier.conditions) {
    const dur = describeDuration(c.duration);
    const text = `${c.condition}${dur ? ` (${dur})` : ''}`;
    parts.push(
      c.scope === 'target' ? (
        <span key={`c-${c.condition}-${c.scope}`}> · {text}</span>
      ) : (
        <span
          key={`c-${c.condition}-${c.scope}`}
          className="italic text-text-dim"
          title="Not auto-applied"
        >
          {' '}
          · {text}
        </span>
      ),
    );
  }
  if (tier.effect) {
    parts.push(<span key="eff"> · {tier.effect}</span>);
  }
  if (parts.length === 0) {
    return <span className="italic text-text-mute">no effect</span>;
  }
  return <>{parts}</>;
}

function describeDuration(d: TierOutcome['conditions'][number]['duration']): string {
  switch (d.kind) {
    case 'save_ends':
      return 'save';
    case 'EoT':
      return 'EoT';
    case 'until_start_next_turn':
      return 'SoT';
    case 'end_of_encounter':
      return 'EoE';
    case 'manual':
      return 'manual';
    case 'trigger':
      return 'trig';
  }
}
