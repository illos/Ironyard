import { Link } from '@tanstack/react-router';
import { useDeleteCharacter } from '../api/mutations';
import { useMe, useMyCharacters } from '../api/queries';

export function CharactersList() {
  const me = useMe();
  const chars = useMyCharacters();
  const deleteCharacter = useDeleteCharacter();

  if (me.isLoading || chars.isLoading) {
    return <main className="mx-auto max-w-3xl p-6 text-neutral-400">Loading…</main>;
  }
  if (!me.data) {
    return (
      <main className="mx-auto max-w-3xl p-6 text-neutral-400">Sign in to view characters.</main>
    );
  }

  const list = chars.data ?? [];

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Characters</h1>
        <Link
          to="/characters/new"
          search={{ code: undefined }}
          className="inline-flex items-center min-h-11 rounded-md bg-neutral-100 text-neutral-900 px-4 font-medium"
        >
          + New character
        </Link>
      </header>

      {list.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No characters yet. Use the button above to start one.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li
              key={c.id}
              className="flex items-stretch gap-2 rounded-md bg-neutral-900/60 hover:bg-neutral-900 border border-neutral-800"
            >
              <Link
                to="/characters/$id"
                params={{ id: c.id }}
                className="flex items-center gap-3 px-4 py-3 min-h-11 flex-1"
              >
                <span className="flex-1 font-medium">{c.name}</span>
                <span className="text-xs text-neutral-500">L{c.data.level}</span>
                {c.data.classId && (
                  <span className="text-xs text-neutral-400 capitalize">{c.data.classId}</span>
                )}
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (
                    !window.confirm(
                      `Delete character "${c.name}"? This permanently removes the character and detaches it from any campaigns.`,
                    )
                  ) {
                    return;
                  }
                  deleteCharacter.mutate(c.id);
                }}
                disabled={deleteCharacter.isPending}
                className="my-2 mr-2 min-h-11 px-3 rounded-md border border-rose-700 text-rose-300 text-xs hover:bg-rose-900/30 disabled:opacity-50"
                aria-label={`Delete ${c.name}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
