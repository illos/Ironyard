import type { Monster } from '@ironyard/shared';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useMonsters } from '../api/queries';

type SortKey = 'name' | 'level';

export function MonsterBrowser() {
  const monsters = useMonsters();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');

  const filtered = useMemo<Monster[]>(() => {
    if (!monsters.data) return [];
    const q = query.trim().toLowerCase();
    const rows = q
      ? monsters.data.monsters.filter((m) => m.name.toLowerCase().includes(q))
      : monsters.data.monsters;
    const sorted = [...rows];
    if (sortKey === 'level') {
      sorted.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name) || a.level - b.level);
    }
    return sorted;
  }, [monsters.data, query, sortKey]);

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-5">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">Foes</h1>
          {monsters.data && (
            <p className="text-sm text-neutral-400 mt-1">
              {monsters.data.count} monsters · data version{' '}
              <span className="font-mono">{monsters.data.version}</span>
            </p>
          )}
        </div>
        <Link to="/" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← Home
        </Link>
      </header>

      {monsters.isLoading && <p className="text-neutral-400">Loading monsters…</p>}

      {monsters.error && (
        <p className="text-rose-400">
          {(monsters.error as Error).message} —{' '}
          <span className="text-neutral-500">
            run <code className="font-mono">pnpm --filter @ironyard/data build:data</code> to
            regenerate the ingest.
          </span>
        </p>
      )}

      {monsters.data && (
        <>
          <div className="flex gap-2 items-stretch">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name"
              className="flex-1 min-h-11 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:border-neutral-600"
            />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="min-h-11 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:border-neutral-600"
              aria-label="Sort"
            >
              <option value="name">Sort: name</option>
              <option value="level">Sort: level</option>
            </select>
          </div>

          <p className="text-xs text-neutral-500">
            Showing {filtered.length}
            {filtered.length !== monsters.data.count && ` of ${monsters.data.count}`}
          </p>

          <ul className="space-y-1">
            {filtered.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-md bg-neutral-900/60 px-3 py-3"
              >
                <span className="truncate">{m.name}</span>
                <span className="shrink-0 rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs font-mono tabular-nums">
                  L{m.level}
                </span>
              </li>
            ))}
            {filtered.length === 0 && <li className="text-sm text-neutral-500">No matches.</li>}
          </ul>

          <p className="text-xs text-neutral-600">
            Phase 1 slice 9 — id, name, and level only. Stamina, immunities, abilities, and the rest
            land when the ingest extends.
          </p>
        </>
      )}
    </main>
  );
}
