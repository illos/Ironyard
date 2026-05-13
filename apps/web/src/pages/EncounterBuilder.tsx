import type {
  CharacterResponse,
  EncounterTemplate,
  Monster,
  StartEncounterPayload,
  StartRoundPayload,
} from '@ironyard/shared';
import { IntentTypes, ulid } from '@ironyard/shared';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { buildIntent } from '../api/dispatch';
import { useCreateEncounterTemplate, useDeleteEncounterTemplate } from '../api/mutations';
import {
  useApprovedCharactersFull,
  useCampaign,
  useEncounterTemplates,
  useMe,
  useMonsters,
} from '../api/queries';
import { useSessionSocket } from '../ws/useSessionSocket';

type MonsterPick = { monsterId: string; quantity: number };

export function EncounterBuilder() {
  const { id: sessionId } = useParams({ from: '/campaigns/$id/build' });
  const navigate = useNavigate();
  const me = useMe();
  const session = useCampaign(sessionId);
  const { status, dispatch } = useSessionSocket(sessionId);
  const templates = useEncounterTemplates(sessionId);
  const createTemplate = useCreateEncounterTemplate(sessionId);
  const deleteTemplate = useDeleteEncounterTemplate(sessionId);
  const { data: approvedChars = [], isLoading: approvedLoading } =
    useApprovedCharactersFull(sessionId);

  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<string>>(new Set());
  const [selectedMonsters, setSelectedMonsters] = useState<MonsterPick[]>([]);
  const [didInitChars, setDidInitChars] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // Default-check all approved characters once they load.
  useEffect(() => {
    if (!approvedLoading && approvedChars.length > 0 && !didInitChars) {
      setSelectedCharacterIds(new Set(approvedChars.map((c) => c.id)));
      setDidInitChars(true);
    }
  }, [approvedLoading, approvedChars, didInitChars]);

  const monsters = useMonsters();

  const monsterById = useMemo<Map<string, Monster>>(() => {
    if (!monsters.data) return new Map();
    return new Map(monsters.data.monsters.map((m) => [m.id, m]));
  }, [monsters.data]);

  if (me.isLoading || session.isLoading) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <p className="text-neutral-400">Loading…</p>
      </main>
    );
  }

  if (!me.data) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <p className="text-neutral-400">
          Not signed in.{' '}
          <Link to="/" className="underline">
            Go home
          </Link>
          .
        </p>
      </main>
    );
  }

  if (session.error || !session.data) {
    return (
      <main className="mx-auto max-w-6xl p-6 space-y-2">
        <p className="text-rose-400">
          {(session.error as Error)?.message ?? 'Campaign not found.'}
        </p>
        <Link to="/" className="underline text-neutral-300">
          Back home
        </Link>
      </main>
    );
  }

  const actor = {
    userId: me.data.user.id,
    role: (session.data.isDirector ? 'director' : 'player') as 'director' | 'player',
  };
  const isDirector = session.data.isDirector;
  const wsOpen = status === 'open';

  const totalParticipants =
    selectedCharacterIds.size + selectedMonsters.reduce((s, m) => s + m.quantity, 0);

  const handleAddMonster = (monster: Monster) => {
    setSelectedMonsters((prev) => {
      const existing = prev.find((m) => m.monsterId === monster.id);
      if (existing) {
        return prev.map((m) =>
          m.monsterId === monster.id ? { ...m, quantity: m.quantity + 1 } : m,
        );
      }
      return [...prev, { monsterId: monster.id, quantity: 1 }];
    });
  };

  const handleRemoveMonster = (monsterId: string) => {
    setSelectedMonsters((prev) => prev.filter((m) => m.monsterId !== monsterId));
  };

  const handleToggleCharacter = (charId: string) => {
    setSelectedCharacterIds((prev) => {
      const next = new Set(prev);
      if (next.has(charId)) next.delete(charId);
      else next.add(charId);
      return next;
    });
  };

  const handleLoadTemplate = (template: EncounterTemplate) => {
    // Apply template monster list into local draft state (client-side only —
    // templates are now a UI convenience, no WS intent dispatched).
    setSelectedMonsters((prev) => {
      const next = [...prev];
      for (const entry of template.data.monsters) {
        const existing = next.find((m) => m.monsterId === entry.monsterId);
        if (existing) {
          existing.quantity += entry.quantity;
        } else {
          next.push({ monsterId: entry.monsterId, quantity: entry.quantity });
        }
      }
      return next;
    });
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = templateName.trim();
    if (!name || selectedMonsters.length === 0) return;
    createTemplate.mutate(
      { name, data: { monsters: selectedMonsters } },
      {
        onSuccess: () => {
          setSaveModalOpen(false);
          setTemplateName('');
        },
      },
    );
  };

  const handleStartFight = () => {
    if (totalParticipants === 0 || !wsOpen) return;

    const startPayload: StartEncounterPayload = {
      encounterId: ulid(),
      characterIds: Array.from(selectedCharacterIds),
      monsters: selectedMonsters.filter((m) => m.quantity > 0),
      stampedPcs: [],
      stampedMonsters: [],
    };

    const startOk = dispatch(
      buildIntent({
        campaignId: sessionId,
        type: IntentTypes.StartEncounter,
        payload: startPayload,
        actor,
      }),
    );
    if (!startOk) return;

    const roundOk = dispatch(
      buildIntent({
        campaignId: sessionId,
        type: IntentTypes.StartRound,
        payload: {} as StartRoundPayload,
        actor,
      }),
    );

    if (roundOk) {
      navigate({ to: '/campaigns/$id/play', params: { id: sessionId } });
    }
  };

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6 space-y-5">
      <header className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold">Build encounter</h1>
          <p className="text-xs text-neutral-500 mt-1">
            {session.data.name}
            <span className="ml-2 align-middle">
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  status === 'open'
                    ? 'bg-emerald-900/40 text-emerald-300'
                    : status === 'connecting'
                      ? 'bg-amber-900/40 text-amber-300'
                      : 'bg-rose-900/40 text-rose-300'
                }`}
              >
                {status}
              </span>
            </span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            to="/campaigns/$id"
            params={{ id: sessionId }}
            className="text-sm text-neutral-400 hover:text-neutral-200"
          >
            ← Lobby
          </Link>
          {isDirector && selectedMonsters.length > 0 && (
            <button
              type="button"
              onClick={() => setSaveModalOpen(true)}
              className="min-h-11 rounded-md border border-neutral-700 bg-neutral-900 text-sm px-3 py-2 hover:bg-neutral-800"
            >
              Save as template
            </button>
          )}
          <button
            type="button"
            onClick={handleStartFight}
            disabled={totalParticipants === 0 || !wsOpen}
            className="min-h-11 rounded-md bg-emerald-500 text-neutral-950 px-4 py-2 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start the fight →
          </button>
        </div>
      </header>

      {saveModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-5 w-full max-w-sm space-y-4">
            <h2 className="font-semibold">Save as encounter template</h2>
            <p className="text-xs text-neutral-400">
              Saves the {selectedMonsters.reduce((s, m) => s + m.quantity, 0)} monster(s) in the
              draft.
            </p>
            <form onSubmit={handleSaveTemplate} className="space-y-3">
              <label className="block text-sm text-neutral-300">
                Template name
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Goblin patrol"
                  className="mt-1 w-full min-h-11 rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 outline-none focus:border-neutral-500"
                />
              </label>
              {createTemplate.error && (
                <p className="text-sm text-rose-400">{(createTemplate.error as Error).message}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createTemplate.isPending || !templateName.trim()}
                  className="flex-1 min-h-11 rounded-md bg-neutral-100 text-neutral-900 font-medium disabled:opacity-60"
                >
                  {createTemplate.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSaveModalOpen(false);
                    setTemplateName('');
                  }}
                  className="min-h-11 px-4 rounded-md border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
          <MonsterPicker onAdd={handleAddMonster} />
        </section>

        <section className="lg:col-span-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
          <DraftPreview
            selectedCharacters={approvedChars.filter((c) => selectedCharacterIds.has(c.id))}
            selectedMonsters={selectedMonsters}
            monsterById={monsterById}
            onRemoveMonster={handleRemoveMonster}
          />
        </section>

        <section className="lg:col-span-4 space-y-4">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
            <CharacterChecklist
              characters={approvedChars}
              isLoading={approvedLoading}
              selectedIds={selectedCharacterIds}
              onToggle={handleToggleCharacter}
            />
          </div>
          {isDirector && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <TemplatePicker
                templates={templates.data ?? []}
                isLoading={templates.isLoading}
                onLoad={handleLoadTemplate}
                onDelete={(tid) => deleteTemplate.mutate(tid)}
                disabled={!wsOpen}
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function CharacterChecklist({
  characters,
  isLoading,
  selectedIds,
  onToggle,
}: {
  characters: CharacterResponse[];
  isLoading: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Characters</h2>
      {isLoading && <p className="text-sm text-neutral-400">Loading…</p>}
      {!isLoading && characters.length === 0 && (
        <p className="text-sm text-neutral-500">No approved characters yet.</p>
      )}
      <ul className="space-y-1">
        {characters.map((cr) => {
          const checked = selectedIds.has(cr.id);
          return (
            <li
              key={cr.id}
              className="flex items-center gap-3 rounded-md bg-neutral-900/60 px-3 py-2"
            >
              <input
                type="checkbox"
                id={`char-${cr.id}`}
                checked={checked}
                onChange={() => onToggle(cr.id)}
                className="h-5 w-5 min-w-[20px] rounded accent-emerald-500"
              />
              <label htmlFor={`char-${cr.id}`} className="flex-1 text-sm cursor-pointer">
                {cr.name}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DraftPreview({
  selectedCharacters,
  selectedMonsters,
  monsterById,
  onRemoveMonster,
}: {
  selectedCharacters: CharacterResponse[];
  selectedMonsters: MonsterPick[];
  monsterById: Map<string, Monster>;
  onRemoveMonster: (monsterId: string) => void;
}) {
  const total =
    selectedCharacters.length + selectedMonsters.reduce((s, m) => s + m.quantity, 0);
  return (
    <div className="space-y-3">
      <header className="flex items-baseline justify-between">
        <h2 className="font-semibold">Encounter Draft</h2>
        <span className="text-xs text-neutral-500">
          {total} participant{total !== 1 ? 's' : ''}
        </span>
      </header>

      {total === 0 && (
        <div className="rounded-md border border-dashed border-neutral-800 px-4 py-6 text-center">
          <p className="text-sm text-neutral-400">Empty draft.</p>
          <p className="text-xs text-neutral-500 mt-1">
            Check characters and add monsters to build the encounter.
          </p>
        </div>
      )}

      {selectedCharacters.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-neutral-500 uppercase tracking-wide">PCs</p>
          {selectedCharacters.map((cr) => (
            <div
              key={cr.id}
              className="flex items-center gap-3 rounded-md bg-neutral-900/60 px-3 py-2"
            >
              <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold bg-sky-900/40 text-sky-200">
                PC
              </span>
              <span className="flex-1 text-sm truncate">{cr.name}</span>
            </div>
          ))}
        </div>
      )}

      {selectedMonsters.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-neutral-500 uppercase tracking-wide">Monsters</p>
          {selectedMonsters.map((pick) => {
            const monster = monsterById.get(pick.monsterId);
            return (
              <div
                key={pick.monsterId}
                className="flex items-center gap-3 rounded-md bg-neutral-900/60 px-3 py-2"
              >
                <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold bg-rose-900/40 text-rose-200">
                  M
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{monster?.name ?? pick.monsterId}</p>
                  <p className="text-xs text-neutral-500 font-mono tabular-nums">
                    ×{pick.quantity}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveMonster(pick.monsterId)}
                  className="min-h-11 w-9 flex items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-800 hover:text-rose-400"
                  aria-label={`Remove ${monster?.name ?? pick.monsterId}`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TemplatePicker({
  templates,
  isLoading,
  onLoad,
  onDelete,
  disabled,
}: {
  templates: EncounterTemplate[];
  isLoading: boolean;
  onLoad: (t: EncounterTemplate) => void;
  onDelete: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Saved encounters</h2>
      {isLoading && <p className="text-sm text-neutral-400">Loading…</p>}
      {!isLoading && templates.length === 0 && (
        <p className="text-sm text-neutral-500">
          No saved templates. Build a monster roster and click "Save as template".
        </p>
      )}
      <ul className="space-y-1">
        {templates.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-2 rounded-md bg-neutral-900/60 px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">{t.name}</p>
              <p className="text-xs text-neutral-500">
                {t.data.monsters.reduce((sum, m) => sum + m.quantity, 0)} monsters
              </p>
            </div>
            <button
              type="button"
              onClick={() => onLoad(t)}
              disabled={disabled}
              className="min-h-11 px-3 rounded-md bg-neutral-700 text-sm hover:bg-neutral-600 disabled:opacity-50"
            >
              Load
            </button>
            <button
              type="button"
              onClick={() => onDelete(t.id)}
              className="min-h-11 w-9 flex items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-800 hover:text-rose-400"
              aria-label="Delete template"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MonsterPicker({ onAdd }: { onAdd: (m: Monster) => void }) {
  const monsters = useMonsters();
  const [query, setQuery] = useState('');

  const filtered = useMemo<Monster[]>(() => {
    if (!monsters.data) return [];
    const q = query.trim().toLowerCase();
    const rows = q
      ? monsters.data.monsters.filter((m) => m.name.toLowerCase().includes(q))
      : monsters.data.monsters;
    return [...rows].sort((a, b) => a.name.localeCompare(b.name) || a.level - b.level);
  }, [monsters.data, query]);

  return (
    <div className="space-y-3">
      <header className="flex items-baseline justify-between">
        <h2 className="font-semibold">Monsters</h2>
        {monsters.data && (
          <span className="text-xs text-neutral-500">{monsters.data.count} total</span>
        )}
      </header>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by name"
        className="w-full min-h-11 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:border-neutral-600"
      />
      {monsters.isLoading && <p className="text-neutral-400 text-sm">Loading monsters…</p>}
      {monsters.error && (
        <p className="text-rose-400 text-sm">{(monsters.error as Error).message}</p>
      )}
      {monsters.data && (
        <>
          <p className="text-xs text-neutral-500">
            Showing {filtered.length}
            {filtered.length !== monsters.data.count && ` of ${monsters.data.count}`}
          </p>
          <ul className="space-y-1 max-h-[28rem] overflow-y-auto pr-1">
            {filtered.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onAdd(m)}
                  className="w-full min-h-11 flex items-center justify-between gap-3 rounded-md bg-neutral-900/60 hover:bg-neutral-800 active:bg-neutral-700 px-3 py-2 text-left transition-colors"
                >
                  <span className="truncate">{m.name}</span>
                  <span className="shrink-0 rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs font-mono tabular-nums">
                    L{m.level}
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="text-sm text-neutral-500 px-1 py-2">No matches.</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
