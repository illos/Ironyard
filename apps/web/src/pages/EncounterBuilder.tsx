import type {
  CharacterResponse,
  EncounterTemplate,
  Monster,
  StartEncounterPayload,
  StartRoundPayload,
} from '@ironyard/shared';
import { IntentTypes, ulid } from '@ironyard/shared';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { buildIntent } from '../api/dispatch';
import { useCreateEncounterTemplate, useDeleteEncounterTemplate } from '../api/mutations';
import {
  useApprovedCharactersFull,
  useCampaign,
  useEncounterTemplates,
  useMe,
  useMonsters,
} from '../api/queries';
import { Button, Chip, Modal, Section, Sigil } from '../primitives';
import { useSessionSocket } from '../ws/useSessionSocket';

type MonsterPick = { monsterId: string; quantity: number };

export function EncounterBuilder() {
  const { id: sessionId } = useParams({ from: '/campaigns/$id/build' });
  const navigate = useNavigate();
  const me = useMe();
  const session = useCampaign(sessionId);
  const { status, dispatch, currentSessionId, attendingCharacterIds } = useSessionSocket(sessionId);
  const templates = useEncounterTemplates(sessionId);
  const createTemplate = useCreateEncounterTemplate(sessionId);
  const deleteTemplate = useDeleteEncounterTemplate(sessionId);
  const { data: approvedChars = [], isLoading: approvedLoading } =
    useApprovedCharactersFull(sessionId);

  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<string>>(
    () => new Set(attendingCharacterIds),
  );
  const [selectedMonsters, setSelectedMonsters] = useState<MonsterPick[]>([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const monsters = useMonsters();

  const monsterById = useMemo<Map<string, Monster>>(() => {
    if (!monsters.data) return new Map();
    return new Map(monsters.data.monsters.map((m) => [m.id, m]));
  }, [monsters.data]);

  if (me.isLoading || session.isLoading) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <p className="text-text-dim">Loading…</p>
      </main>
    );
  }

  if (!me.data) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <p className="text-text-dim">
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
        <p className="text-foe">{(session.error as Error)?.message ?? 'Campaign not found.'}</p>
        <Link to="/" className="underline text-text-dim">
          Back home
        </Link>
      </main>
    );
  }

  if (currentSessionId === null) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Section heading="No active session">
          <p className="text-sm text-text">
            Start a session before building an encounter.{' '}
            <Link to="/campaigns/$id" params={{ id: sessionId }} className="underline text-accent">
              Go to campaign page →
            </Link>
          </p>
        </Section>
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
          <h1 className="text-2xl sm:text-3xl font-semibold text-text">Build encounter</h1>
          <p className="text-xs text-text-mute mt-1">
            {session.data.name}
            <span className="ml-2 align-middle">
              <Chip
                shape="pill"
                size="xs"
                selected={status === 'open'}
                className={
                  status === 'connecting' ? 'text-accent' : status === 'closed' ? 'text-foe' : ''
                }
              >
                {status}
              </Chip>
            </span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            to="/campaigns/$id"
            params={{ id: sessionId }}
            className="text-sm text-text-dim hover:text-text"
          >
            ← Lobby
          </Link>
          {isDirector && selectedMonsters.length > 0 && (
            <Button type="button" onClick={() => setSaveModalOpen(true)} className="min-h-11">
              Save as template
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            onClick={handleStartFight}
            disabled={totalParticipants === 0 || !wsOpen}
            className="min-h-11 px-4"
          >
            Start the fight →
          </Button>
        </div>
      </header>

      <Modal
        open={saveModalOpen}
        onClose={() => {
          setSaveModalOpen(false);
          setTemplateName('');
        }}
        title="Save as encounter template"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSaveModalOpen(false);
                setTemplateName('');
              }}
              className="min-h-11 px-4"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="save-template-form"
              variant="primary"
              disabled={createTemplate.isPending || !templateName.trim()}
              className="min-h-11 px-4"
            >
              {createTemplate.isPending ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <p className="text-xs text-text-mute mb-3">
          Saves the {selectedMonsters.reduce((s, m) => s + m.quantity, 0)} monster(s) in the draft.
        </p>
        <form id="save-template-form" onSubmit={handleSaveTemplate} className="space-y-3">
          <label className="block text-sm text-text-dim">
            Template name
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Goblin patrol"
              className="mt-1 w-full min-h-11 bg-ink-2 border border-line px-3 py-2 outline-none focus:border-accent text-text"
            />
          </label>
          {createTemplate.error && (
            <p className="text-sm text-foe">{(createTemplate.error as Error).message}</p>
          )}
        </form>
      </Modal>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4">
          <Section
            heading="Monsters"
            right={monsters.data ? <span>{monsters.data.count} total</span> : null}
          >
            <MonsterPicker onAdd={handleAddMonster} />
          </Section>
        </div>

        <div className="lg:col-span-4">
          <Section
            heading="Encounter Draft"
            right={
              <span>
                {selectedCharacterIds.size + selectedMonsters.reduce((s, m) => s + m.quantity, 0)}{' '}
                participant
                {selectedCharacterIds.size +
                  selectedMonsters.reduce((s, m) => s + m.quantity, 0) !==
                1
                  ? 's'
                  : ''}
              </span>
            }
          >
            <DraftPreview
              selectedCharacters={approvedChars.filter((c) => selectedCharacterIds.has(c.id))}
              selectedMonsters={selectedMonsters}
              monsterById={monsterById}
              onRemoveMonster={handleRemoveMonster}
            />
          </Section>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <Section heading="Characters">
            <CharacterChecklist
              characters={approvedChars.filter((c) => attendingCharacterIds.includes(c.id))}
              isLoading={approvedLoading}
              selectedIds={selectedCharacterIds}
              onToggle={handleToggleCharacter}
            />
          </Section>
          {isDirector && (
            <Section heading="Saved encounters">
              <TemplatePicker
                templates={templates.data ?? []}
                isLoading={templates.isLoading}
                onLoad={handleLoadTemplate}
                onDelete={(tid) => deleteTemplate.mutate(tid)}
                disabled={!wsOpen}
              />
            </Section>
          )}
        </div>
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
      {isLoading && <p className="text-sm text-text-dim">Loading…</p>}
      {!isLoading && characters.length === 0 && (
        <p className="text-sm text-text-mute">No approved characters yet.</p>
      )}
      <ul className="space-y-1">
        {characters.map((cr) => {
          const checked = selectedIds.has(cr.id);
          return (
            <li
              key={cr.id}
              className="flex items-center gap-3 bg-ink-2 px-3 py-2 border border-line-soft"
            >
              <input
                type="checkbox"
                id={`char-${cr.id}`}
                checked={checked}
                onChange={() => onToggle(cr.id)}
                className="h-5 w-5 min-w-[20px] accent-accent"
              />
              <label htmlFor={`char-${cr.id}`} className="flex-1 text-sm cursor-pointer text-text">
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
  const total = selectedCharacters.length + selectedMonsters.reduce((s, m) => s + m.quantity, 0);
  return (
    <div className="space-y-3">
      {total === 0 && (
        <div className="border border-dashed border-line px-4 py-6 text-center">
          <p className="text-sm text-text-dim">Empty draft.</p>
          <p className="text-xs text-text-mute mt-1">
            Check characters and add monsters to build the encounter.
          </p>
        </div>
      )}

      {selectedCharacters.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-text-mute uppercase tracking-wide">PCs</p>
          {selectedCharacters.map((cr) => (
            <div
              key={cr.id}
              className="flex items-center gap-3 bg-ink-2 px-3 py-2 border border-line-soft"
            >
              <Sigil text={cr.name.slice(0, 2)} size={28} />
              <span className="flex-1 text-sm truncate text-text">{cr.name}</span>
            </div>
          ))}
        </div>
      )}

      {selectedMonsters.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-text-mute uppercase tracking-wide">Monsters</p>
          {selectedMonsters.map((pick) => {
            const monster = monsterById.get(pick.monsterId);
            return (
              <div
                key={pick.monsterId}
                className="flex items-center gap-3 bg-ink-2 px-3 py-2 border border-line-soft"
              >
                <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center text-xs font-semibold bg-ink-3 border border-line text-foe">
                  M
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate text-text">{monster?.name ?? pick.monsterId}</p>
                  <p className="text-xs text-text-mute font-mono tabular-nums">×{pick.quantity}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveMonster(pick.monsterId)}
                  className="min-h-11 w-9 flex items-center justify-center text-text-mute hover:bg-ink-3 hover:text-foe"
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
      {isLoading && <p className="text-sm text-text-dim">Loading…</p>}
      {!isLoading && templates.length === 0 && (
        <p className="text-sm text-text-mute">
          No saved templates. Build a monster roster and click "Save as template".
        </p>
      )}
      <ul className="space-y-1">
        {templates.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-2 bg-ink-2 px-3 py-2 border border-line-soft"
          >
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-text">{t.name}</p>
              <p className="text-xs text-text-mute">
                {t.data.monsters.reduce((sum, m) => sum + m.quantity, 0)} monsters
              </p>
            </div>
            <Button
              type="button"
              onClick={() => onLoad(t)}
              disabled={disabled}
              className="min-h-11 px-3"
            >
              Load
            </Button>
            <button
              type="button"
              onClick={() => onDelete(t.id)}
              className="min-h-11 w-9 flex items-center justify-center text-text-mute hover:bg-ink-3 hover:text-foe"
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
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by name"
        className="w-full min-h-11 bg-ink-2 border border-line px-3 py-2 outline-none focus:border-accent text-text"
      />
      {monsters.isLoading && <p className="text-text-dim text-sm">Loading monsters…</p>}
      {monsters.error && <p className="text-foe text-sm">{(monsters.error as Error).message}</p>}
      {monsters.data && (
        <>
          <p className="text-xs text-text-mute">
            Showing {filtered.length}
            {filtered.length !== monsters.data.count && ` of ${monsters.data.count}`}
          </p>
          <ul className="space-y-1 max-h-[28rem] overflow-y-auto pr-1">
            {filtered.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onAdd(m)}
                  className="w-full min-h-11 flex items-center justify-between gap-3 bg-ink-2 hover:bg-ink-3 active:bg-ink-3 border border-line-soft hover:border-accent px-3 py-2 text-left transition-colors text-text"
                >
                  <span className="truncate">{m.name}</span>
                  <Chip shape="pill" size="xs">
                    L{m.level}
                  </Chip>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="text-sm text-text-mute px-1 py-2">No matches.</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
