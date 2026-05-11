import { useState } from 'react';
import type { StubAbility } from '../../data/monsterAbilities';
import { TIER_RIGGED_ROLLS, roll2d10 } from '../../lib/rollDice';

type RollArgs = {
  rolls: [number, number];
  source: 'manual' | 'auto';
};

type Props = {
  ability: StubAbility;
  // Disable if no target picked / WS closed / no active turn etc.
  disabled: boolean;
  onRoll: (ability: StubAbility, args: RollArgs) => void;
};

export function AbilityCard({ ability, disabled, onRoll }: Props) {
  const [manualOpen, setManualOpen] = useState(false);

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
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="font-semibold">{ability.name}</h3>
        <span className="text-xs uppercase tracking-wider text-neutral-500">
          {ability.characteristic}
        </span>
      </header>
      <p className="mt-1 text-sm text-neutral-400">{ability.blurb}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm font-mono tabular-nums">
        <div className="rounded-md bg-neutral-950 px-2 py-1.5 border border-neutral-800/60">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">t1</dt>
          <dd className="text-neutral-200">
            {ability.ladder.t1.damage}{' '}
            <span className="text-neutral-500 text-xs">{ability.ladder.t1.damageType}</span>
          </dd>
        </div>
        <div className="rounded-md bg-neutral-950 px-2 py-1.5 border border-neutral-800/60">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">t2</dt>
          <dd className="text-neutral-200">
            {ability.ladder.t2.damage}{' '}
            <span className="text-neutral-500 text-xs">{ability.ladder.t2.damageType}</span>
          </dd>
        </div>
        <div className="rounded-md bg-neutral-950 px-2 py-1.5 border border-neutral-800/60">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">t3</dt>
          <dd className="text-neutral-200">
            {ability.ladder.t3.damage}{' '}
            <span className="text-neutral-500 text-xs">{ability.ladder.t3.damageType}</span>
          </dd>
        </div>
      </dl>
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
