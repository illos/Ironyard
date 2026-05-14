import type { Ability, TierOutcome } from '@ironyard/shared';
import { useState } from 'react';
import { TIER_RIGGED_ROLLS, roll2d10 } from '../../lib/rollDice';

type RollArgs = {
  rolls: [number, number];
  source: 'manual' | 'auto';
};

type Props = {
  ability: Ability;
  // Disable if no target picked / WS closed / no active turn etc.
  disabled: boolean;
  /** When true, hides Auto-roll and Manual buttons entirely (read-only view for non-owners). */
  readOnly?: boolean;
  onRoll: (ability: Ability, args: RollArgs) => void;
};

// Type chip styling — matches the data-layer `AbilityType` enum.
const TYPE_CHIP_STYLE: Record<Ability['type'], string> = {
  action: 'bg-foe text-text',
  maneuver: 'bg-accent text-ink-0',
  triggered: 'bg-ink-2 text-accent',
  'free-triggered': 'bg-ink-2 text-accent',
  villain: 'bg-ink-2 text-text',
  trait: 'bg-ink-2 text-text-dim',
};

export function AbilityCard({ ability, disabled, readOnly = false, onRoll }: Props) {
  const [manualOpen, setManualOpen] = useState(false);

  // Defensive guard: only abilities with a powerRoll are rollable. The
  // DetailPane filters these out, but keep the runtime check so future
  // callers can't accidentally feed a trait through.
  if (!ability.powerRoll) {
    return null;
  }
  const pr = ability.powerRoll;

  const handleAuto = () => {
    onRoll(ability, { rolls: roll2d10(), source: 'auto' });
  };

  const handleManual = (tier: 1 | 2 | 3) => {
    const rolls =
      tier === 1 ? TIER_RIGGED_ROLLS.t1 : tier === 2 ? TIER_RIGGED_ROLLS.t2 : TIER_RIGGED_ROLLS.t3;
    onRoll(ability, { rolls, source: 'manual' });
    setManualOpen(false);
  };

  return (
    <article className="border border-line bg-ink-1 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="font-semibold">{ability.name}</h3>
          <span
            className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 ${TYPE_CHIP_STYLE[ability.type]}`}
          >
            {ability.type}
          </span>
          {ability.costLabel && (
            <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 bg-ink-2 text-text-dim">
              {ability.costLabel}
            </span>
          )}
        </div>
        <span className="text-xs font-mono tabular-nums text-text-mute">
          Power Roll {pr.bonus}
        </span>
      </header>
      {ability.keywords.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {ability.keywords.map((k) => (
            <span
              key={k}
              className="text-[10px] px-1.5 py-0.5 bg-ink-0 border border-line text-text-dim"
            >
              {k}
            </span>
          ))}
        </div>
      )}
      {(ability.distance || ability.target) && (
        <p className="mt-1 text-xs text-text-mute">
          {ability.distance && <span className="font-mono">{ability.distance}</span>}
          {ability.distance && ability.target && <span className="px-1">·</span>}
          {ability.target && <span>{ability.target}</span>}
        </p>
      )}
      <ol className="mt-3 space-y-1.5 text-sm" aria-label="tier ladder">
        <TierRow label="≤11" tier={pr.tier1} />
        <TierRow label="12–16" tier={pr.tier2} />
        <TierRow label="17+" tier={pr.tier3} />
      </ol>
      {ability.effect && (
        <p className="mt-2 text-xs text-text-dim">
          <span className="text-text-mute uppercase tracking-wider">Effect</span> {ability.effect}
        </p>
      )}
      {!readOnly && (
        <>
          <div className="mt-4 flex items-stretch gap-2">
            <button
              type="button"
              onClick={handleAuto}
              disabled={disabled}
              className="flex-1 min-h-14 bg-accent text-ink-0 px-4 font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent-strong active:bg-accent-strong transition-colors"
            >
              Auto-roll
            </button>
            <button
              type="button"
              onClick={() => setManualOpen((v) => !v)}
              disabled={disabled}
              className="min-h-14 min-w-14 px-4 border border-line bg-ink-0 text-text-dim font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-ink-2 active:bg-ink-3 transition-colors"
            >
              Manual…
            </button>
          </div>
          {manualOpen && (
            <div className="mt-3 border border-line bg-ink-0 p-3 space-y-2">
              <p className="text-xs text-text-mute">
                Pick a tier and dispatch a manual roll. Source flagged so the log shows the
                override.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleManual(1)}
                  className="min-h-11 bg-ink-1 border border-line text-sm font-mono font-medium hover:bg-ink-2"
                >
                  Tier 1
                </button>
                <button
                  type="button"
                  onClick={() => handleManual(2)}
                  className="min-h-11 bg-ink-1 border border-line text-sm font-mono font-medium hover:bg-ink-2"
                >
                  Tier 2
                </button>
                <button
                  type="button"
                  onClick={() => handleManual(3)}
                  className="min-h-11 bg-ink-1 border border-line text-sm font-mono font-medium hover:bg-ink-2"
                >
                  Tier 3
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </article>
  );
}

// Render a single tier row. Prominent damage on the left; effect text right
// under it. `raw` lives in the title attribute as the always-correct fallback.
function TierRow({ label, tier }: { label: string; tier: TierOutcome }) {
  const hasDamage = tier.damage !== null;
  const targetConditions = tier.conditions.filter((c) => c.scope === 'target');
  const otherConditions = tier.conditions.filter((c) => c.scope === 'other');
  return (
    <li
      className="bg-ink-0 border border-line px-2 py-1.5"
      title={tier.raw}
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider font-mono tabular-nums text-text-mute w-12 shrink-0">
          {label}
        </span>
        <span className="font-mono tabular-nums text-text shrink-0">
          {hasDamage ? (
            <>
              {tier.damage}{' '}
              <span className="text-text-mute text-xs">{tier.damageType ?? 'untyped'}</span>
            </>
          ) : (
            <span className="text-text-mute italic text-xs">no damage</span>
          )}
        </span>
        {targetConditions.map((c) => (
          <span
            key={`t-${c.condition}-${c.duration.kind}-${c.note ?? ''}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-ink-2 text-accent"
            title={`Auto-applied on hit · ${describeDuration(c.duration)}${c.note ? ` · ${c.note}` : ''}`}
          >
            {c.condition}
            <span className="text-accent normal-case tracking-normal">
              {durationGlyph(c.duration)}
            </span>
          </span>
        ))}
        {otherConditions.map((c) => (
          <span
            key={`o-${c.condition}-${c.duration.kind}-${c.note ?? ''}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-ink-2 text-text-dim"
            title={`Not auto-applied (multi-target / unusual scope)${c.note ? ` · ${c.note}` : ''}`}
          >
            {c.condition}
            <span className="text-text-mute normal-case tracking-normal">·manual</span>
          </span>
        ))}
        {tier.effect && (
          <span className="text-xs text-text-dim leading-tight">{tier.effect}</span>
        )}
      </div>
    </li>
  );
}

function durationGlyph(d: TierOutcome['conditions'][number]['duration']): string {
  switch (d.kind) {
    case 'save_ends':
      return 'save';
    case 'EoT':
      return 'EoT';
    case 'until_start_next_turn':
      return 'SoT';
    case 'end_of_encounter':
      return 'EoE';
    case 'trigger':
      return 'trig';
  }
}

function describeDuration(d: TierOutcome['conditions'][number]['duration']): string {
  switch (d.kind) {
    case 'save_ends':
      return 'save ends';
    case 'EoT':
      return 'until end of next turn';
    case 'until_start_next_turn':
      return 'until start of next turn';
    case 'end_of_encounter':
      return 'until end of encounter';
    case 'trigger':
      return d.description;
  }
}
