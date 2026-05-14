import type { Monster } from '@ironyard/shared';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useMonsters } from '../api/queries';
import { Chip, Section } from '../primitives';

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
          <h1 className="text-3xl font-semibold text-text">Foes</h1>
          {monsters.data && (
            <p className="text-sm text-text-dim mt-1">
              {monsters.data.count} monsters · data version{' '}
              <span className="font-mono">{monsters.data.version}</span>
            </p>
          )}
        </div>
        <Link to="/" className="text-sm text-text-dim hover:text-text">
          ← Home
        </Link>
      </header>

      {monsters.isLoading && <p className="text-text-dim">Loading monsters…</p>}

      {monsters.error && (
        <p className="text-foe">
          {(monsters.error as Error).message} —{' '}
          <span className="text-text-mute">
            run <code className="font-mono">pnpm --filter @ironyard/data build:data</code> to
            regenerate the ingest.
          </span>
        </p>
      )}

      {monsters.data && (
        <Section heading="Browse">
          <div className="flex gap-2 items-stretch">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name"
              className="flex-1 min-h-11 bg-ink-2 border border-line text-text px-3 py-2 outline-none focus:border-accent"
            />
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Sort">
              <button
                type="button"
                role="radio"
                aria-checked={sortKey === 'name'}
                onClick={() => setSortKey('name')}
                className="min-h-11"
              >
                <Chip selected={sortKey === 'name'}>Name</Chip>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={sortKey === 'level'}
                onClick={() => setSortKey('level')}
                className="min-h-11"
              >
                <Chip selected={sortKey === 'level'}>Level</Chip>
              </button>
            </div>
          </div>

          <p className="mt-3 text-xs text-text-mute">
            Showing {filtered.length}
            {filtered.length !== monsters.data.count && ` of ${monsters.data.count}`}
          </p>

          <ul className="mt-3 space-y-1">
            {filtered.map((m) => (
              <li key={m.id}>
                <Link
                  to="/foes/$id"
                  params={{ id: m.id }}
                  className="flex items-center justify-between gap-3 bg-ink-2 hover:bg-ink-3 border border-line px-3 py-3 min-h-11 text-text"
                >
                  <span className="truncate flex-1">
                    <span className="font-medium">{m.name}</span>
                    {m.roles.length > 0 && (
                      <span className="ml-2 text-xs text-text-dim">{m.roles.join(' · ')}</span>
                    )}
                  </span>
                  <Chip shape="pill" size="xs" className="shrink-0 font-mono tabular-nums">
                    L{m.level}
                  </Chip>
                </Link>
              </li>
            ))}
            {filtered.length === 0 && <li className="text-sm text-text-mute">No matches.</li>}
          </ul>
        </Section>
      )}
    </main>
  );
}
