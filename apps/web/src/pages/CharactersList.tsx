import { Link } from '@tanstack/react-router';
import { useDeleteCharacter } from '../api/mutations';
import { useMe, useMyCharacters } from '../api/queries';
import { Button, Section, Sigil } from '../primitives';

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2);
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function CharactersList() {
  const me = useMe();
  const chars = useMyCharacters();
  const deleteCharacter = useDeleteCharacter();

  if (me.isLoading || chars.isLoading) {
    return <main className="mx-auto max-w-3xl p-6 text-text-dim">Loading…</main>;
  }
  if (!me.data) {
    return <main className="mx-auto max-w-3xl p-6 text-text-dim">Sign in to view characters.</main>;
  }

  const list = chars.data ?? [];

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-text">Characters</h1>
        <Link
          to="/characters/new"
          search={{ code: undefined }}
          className="inline-flex items-center min-h-11 bg-accent text-ink-0 border border-accent-strong hover:bg-accent-strong px-4 font-semibold"
        >
          + New character
        </Link>
      </header>

      <Section heading="My Characters">
        {list.length === 0 ? (
          <p className="text-sm text-text-mute">
            No characters yet. Use the button above to start one.
          </p>
        ) : (
          <ul className="space-y-2">
            {list.map((c) => (
              <li
                key={c.id}
                className="flex items-stretch gap-2 bg-ink-2 hover:bg-ink-3 border border-line"
              >
                <Link
                  to="/characters/$id"
                  params={{ id: c.id }}
                  className="flex items-center gap-3 px-4 py-3 min-h-11 flex-1 text-text"
                >
                  <Sigil text={initials(c.name)} />
                  <span className="flex-1 font-medium">{c.name}</span>
                  <span className="text-xs text-text-mute">L{c.data.level}</span>
                  {c.data.classId && (
                    <span className="text-xs text-text-dim capitalize">{c.data.classId}</span>
                  )}
                </Link>
                <Button
                  type="button"
                  size="sm"
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
                  className="my-2 mr-2 min-h-11 text-foe border-foe hover:bg-ink-3 disabled:opacity-50"
                  aria-label={`Delete ${c.name}`}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}
