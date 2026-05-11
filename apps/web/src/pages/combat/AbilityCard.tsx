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
  onRoll: (ability: Ability, args: RollArgs) => void;
};

// Type chip styling — matches the data-layer `AbilityType` enum.
const TYPE_CHIP_STYLE: Record<Ability['type'], string> = {
  action: 'bg-rose-900/40 text-rose-200',
  maneuver: 'bg-sky-900/40 text-sky-200',
  triggered: 'bg-amber-900/40 text-amber-200',
  'free-triggered': 'bg-amber-900/40 text-amber-200',
  villain: 'bg-purple-900/40 text-purple-200',
  trait: 'bg-neutral-800 text-neutral-300',
};

export function AbilityCard({ ability, disabled, onRoll }: Props) {
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
    <article className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="font-semibold">{ability.name}</h3>
          <span
            className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${TYPE_CHIP_STYLE[ability.type]}`}
          >
            {ability.type}
          </span>
          {ability.cost && (
            <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">
              {ability.cost}
            </span>
          )}
        </div>
        <span className="text-xs font-mono tabular-nums text-neutral-500">
          Power Roll {pr.bonus}
        </span>
      </header>
      {ability.keywords.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {ability.keywords.map((k) => (
            <span
              key={k}
              className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-400"
            >
              {k}
            </span>
          ))}
        </div>
      )}
      {(ability.distance || ability.target) && (
        <p className="mt-1 text-xs text-neutral-500">
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
        <p className="mt-2 text-xs text-neutral-400">
          <span className="text-neutral-500 uppercase tracking-wider">Effect</span> {ability.effect}
        </p>
      )}
      <div className="mt-4 flex items-stretch gap-2">
        <button
          type="button"
          onClick={handleAuto}
          disabled={disabled}
          className="flex-1 min-h-14 rounded-md bg-emerald-500 text-neutral-950 px-4 font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-400 active:bg-emerald-600 transition-colors"
        >
          Auto-roll
        </button>
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          disabled={disabled}
          className="min-h-14 min-w-14 px-4 rounded-md border border-neutral-700 bg-neutral-950 text-neutral-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-800 active:bg-neutral-700 transition-colors"
        >
          Manual…
        </button>
      </div>
      {manualOpen && (
        <div className="mt-3 rounded-md border border-neutral-800 bg-neutral-950 p-3 space-y-2">
          <p className="text-xs text-neutral-500">
            Pick a tier and dispatch a manual roll. Source flagged so the log shows the override.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleManual(1)}
              className="min-h-11 rounded-md bg-neutral-900 border border-neutral-800 text-sm font-mono font-medium hover:bg-neutral-800"
            >
              Tier 1
            </button>
            <button
              type="button"
              onClick={() => handleManual(2)}
              className="min-h-11 rounded-md bg-neutral-900 border border-neutral-800 text-sm font-mono font-medium hover:bg-neutral-800"
            >
              Tier 2
            </button>
            <button
              type="button"
              onClick={() => handleManual(3)}
              className="min-h-11 rounded-md bg-neutral-900 border border-neutral-800 text-sm font-mono font-medium hover:bg-neutral-800"
            >
              Tier 3
            </button>
          </div>
        </div>
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
      className="rounded-md bg-neutral-950 border border-neutral-800/60 px-2 py-1.5"
      title={tier.raw}
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider font-mono tabular-nums text-neutral-500 w-12 shrink-0">
          {label}
        </span>
        <span className="font-mono tabular-nums text-neutral-100 shrink-0">
          {hasDamage ? (
            <>
              {tier.damage}{' '}
              <span className="text-neutral-500 text-xs">{tier.damageType ?? 'untyped'}</span>
            </>
          ) : (
            <span className="text-neutral-500 italic text-xs">no damage</span>
          )}
        </span>
        {targetConditions.map((c) => (
          <span
            key={`t-${c.condition}-${c.duration.kind}-${c.note ?? ''}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-amber-900/40 text-amber-200"
            title={`Auto-applied on hit · ${describeDuration(c.duration)}${c.note ? ` · ${c.note}` : ''}`}
          >
            {c.condition}
            <span className="text-amber-400/80 normal-case tracking-normal">
              {durationGlyph(c.duration)}
            </span>
          </span>
        ))}
        {otherConditions.map((c) => (
          <span
            key={`o-${c.condition}-${c.duration.kind}-${c.note ?? ''}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-neutral-800 text-neutral-300"
            title={`Not auto-applied (multi-target / unusual scope)${c.note ? ` · ${c.note}` : ''}`}
          >
            {c.condition}
            <span className="text-neutral-500 normal-case tracking-normal">·manual</span>
          </span>
        ))}
        {tier.effect && (
          <span className="text-xs text-neutral-400 leading-tight">{tier.effect}</span>
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
