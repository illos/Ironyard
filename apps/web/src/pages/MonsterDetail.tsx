import type { Ability, Monster } from '@ironyard/shared';
import { Link, useParams } from '@tanstack/react-router';
import { useMonsters } from '../api/queries';

const CHARACTERISTIC_ORDER = [
  'might',
  'agility',
  'reason',
  'intuition',
  'presence',
] as const;

export function MonsterDetail() {
  const { id } = useParams({ from: '/foes/$id' });
  const monsters = useMonsters();

  if (monsters.isLoading) {
    return <main className="mx-auto max-w-4xl p-6 text-neutral-400">Loading…</main>;
  }
  if (monsters.error) {
    return (
      <main className="mx-auto max-w-4xl p-6 text-rose-400">
        {(monsters.error as Error).message}
      </main>
    );
  }
  const monster = monsters.data?.monsters.find((m) => m.id === id);
  if (!monster) {
    return (
      <main className="mx-auto max-w-4xl p-6 space-y-3">
        <p className="text-rose-400">Monster not found.</p>
        <Link to="/foes" className="text-sm text-neutral-400 hover:text-neutral-200 underline">
          ← Back to foes
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-4">
      <StatblockHeader monster={monster} />
      <StatsStrip monster={monster} />
      <ResistanceRow monster={monster} />
      <Characteristics monster={monster} />
      {monster.abilities.length > 0 && <Abilities abilities={monster.abilities} />}
      <BackLink />
    </main>
  );
}

function BackLink() {
  return (
    <div className="pt-2">
      <Link to="/foes" className="text-sm text-neutral-400 hover:text-neutral-200 underline">
        ← Back to foes
      </Link>
    </div>
  );
}

// ── Header (name | level + role) + sub-header (ancestry | EV) ────────────────

function StatblockHeader({ monster }: { monster: Monster }) {
  const evLabel =
    monster.ev.eliteEv !== undefined
      ? `EV ${monster.ev.ev} / elite ${monster.ev.eliteEv}`
      : `EV ${monster.ev.ev}`;
  const evNote = monster.ev.note ? ` ${monster.ev.note}` : '';

  // "Level 10 Minion Artillery" — published format puts level + each role token.
  const roleLine = `Level ${monster.level}${monster.roles.length > 0 ? ` ${monster.roles.join(' ')}` : ''}`;

  return (
    <header className="space-y-1 border-b border-neutral-800 pb-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">{monster.name}</h1>
        <p className="text-sm text-neutral-300 font-medium">{roleLine}</p>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-3 text-xs text-neutral-400">
        <p>{monster.ancestry.length > 0 ? monster.ancestry.join(', ') : '—'}</p>
        <p>
          {evLabel}
          {evNote}
        </p>
      </div>
    </header>
  );
}

// ── 5-box stats strip (Size | Speed | Stamina | Stability | Free Strike) ─────

function StatsStrip({ monster }: { monster: Monster }) {
  const cells: Array<[string, React.ReactNode]> = [
    ['Size', monster.size],
    ['Speed', monster.speed],
    ['Stamina', monster.stamina.base],
    ['Stability', monster.stability],
    ['Free Strike', monster.freeStrike],
  ];
  return (
    <dl className="grid grid-cols-5 gap-2 text-center">
      {cells.map(([label, value]) => (
        <div
          key={label}
          className="rounded-md bg-neutral-900/60 border border-neutral-800 px-2 py-3"
        >
          <dd className="font-mono tabular-nums text-2xl">{value}</dd>
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500 mt-1">{label}</dt>
        </div>
      ))}
    </dl>
  );
}

// ── Immunity / Weakness / Movement / With Captain row ────────────────────────

function ResistanceRow({ monster }: { monster: Monster }) {
  const immunityText =
    monster.immunities.length > 0
      ? monster.immunities.map((r) => `${r.type} ${r.value}`).join(', ')
      : monster.immunityNote
        ? monster.immunityNote
        : '—';
  const weaknessText =
    monster.weaknesses.length > 0
      ? monster.weaknesses.map((r) => `${r.type} ${r.value}`).join(', ')
      : monster.weaknessNote
        ? monster.weaknessNote
        : '—';
  const movementText = monster.movement.length > 0 ? monster.movement.join(', ') : '—';
  const withCaptainText = monster.withCaptain ?? '—';
  if (monster.stamina.withCaptain !== undefined && !monster.withCaptain) {
    // Edge case: stamina has captain bump but no narrative line. Synthesize.
    // (Most statblocks carry one or the other.)
  }
  return (
    <div className="rounded-md bg-neutral-900/40 border border-neutral-800 p-3 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        <Pair label="Immunity" value={immunityText} />
        <Pair label="Weakness" value={weaknessText} />
        <Pair label="Movement" value={movementText} />
        <Pair label="With Captain" value={withCaptainText} />
      </div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs uppercase tracking-wider text-neutral-500 w-28 flex-shrink-0">
        {label}
      </span>
      <span className="text-neutral-200">{value}</span>
    </div>
  );
}

// ── Characteristics (5 inline values) ────────────────────────────────────────

function Characteristics({ monster }: { monster: Monster }) {
  return (
    <dl className="grid grid-cols-5 gap-2 text-center">
      {CHARACTERISTIC_ORDER.map((ch) => {
        const v = monster.characteristics[ch];
        return (
          <div
            key={ch}
            className="rounded-md bg-neutral-900/60 border border-neutral-800 px-2 py-2"
          >
            <dt className="text-[10px] uppercase tracking-wider text-neutral-500">{ch}</dt>
            <dd className="font-mono tabular-nums text-xl mt-0.5">
              {v > 0 ? `+${v}` : v}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

// ── Abilities (one card per ability) ─────────────────────────────────────────

function Abilities({ abilities }: { abilities: Ability[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm uppercase tracking-wider text-neutral-400">Abilities</h2>
      <ul className="space-y-3">
        {abilities.map((a, idx) => (
          <AbilityRow key={`${a.id ?? a.name}-${idx}`} ability={a} />
        ))}
      </ul>
    </section>
  );
}

function AbilityRow({ ability: a }: { ability: Ability }) {
  // Header row matches the published layout: name + power-roll bonus on left;
  // ability type / cost label on right (e.g. "Signature Ability", "3 Malice").
  const bonus = a.powerRoll?.bonus;
  const rightLabel = a.costLabel ?? a.type;
  return (
    <li className="rounded-md border border-neutral-800 bg-neutral-900/40 p-3 space-y-1">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-neutral-100">
          {a.name}
          {bonus && (
            <span className="ml-2 font-mono text-xs text-neutral-400">2d10 {bonus}</span>
          )}
        </h3>
        <span className="text-xs text-neutral-400 uppercase tracking-wider">{rightLabel}</span>
      </header>
      {(a.keywords && a.keywords.length > 0) || a.distance || a.target ? (
        <p className="text-xs text-neutral-500">
          {a.keywords && a.keywords.length > 0 && (
            <span className="mr-2">{a.keywords.join(' · ')}</span>
          )}
          {a.distance && <span className="mr-2">📏 {a.distance}</span>}
          {a.target && <span>🎯 {a.target}</span>}
        </p>
      ) : null}
      {a.powerRoll && (
        <div className="text-xs font-mono text-neutral-300 space-y-0.5 mt-1">
          <div>
            <span className="text-neutral-500 mr-2">≤11</span>
            {a.powerRoll.tier1.raw}
          </div>
          <div>
            <span className="text-neutral-500 mr-2">12-16</span>
            {a.powerRoll.tier2.raw}
          </div>
          <div>
            <span className="text-neutral-500 mr-2">17+</span>
            {a.powerRoll.tier3.raw}
          </div>
        </div>
      )}
      {a.effect && <p className="text-sm text-neutral-300 whitespace-pre-wrap">{a.effect}</p>}
      {a.trigger && (
        <p className="text-xs text-neutral-400">
          <span className="uppercase tracking-wider text-neutral-500 mr-1">Trigger:</span>
          {a.trigger}
        </p>
      )}
    </li>
  );
}
