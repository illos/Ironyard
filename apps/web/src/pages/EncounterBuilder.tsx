import type {
  AddMonsterPayload,
  Characteristics,
  EncounterTemplate,
  Monster,
  Participant,
  StartEncounterPayload,
  StartRoundPayload,
} from '@ironyard/shared';
import { IntentTypes, ulid } from '@ironyard/shared';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { buildIntent } from '../api/dispatch';
import { useCreateEncounterTemplate, useDeleteEncounterTemplate } from '../api/mutations';
import { useCampaign, useEncounterTemplates, useMe, useMonsters } from '../api/queries';
import { type RosterEntry, isParticipantEntry, useSessionSocket } from '../ws/useSessionSocket';

const CHARACTERISTIC_KEYS = ['might', 'agility', 'reason', 'intuition', 'presence'] as const;

type QuickPcForm = {
  name: string;
  maxStamina: string;
  characteristics: Record<(typeof CHARACTERISTIC_KEYS)[number], string>;
};

const EMPTY_PC_FORM: QuickPcForm = {
  name: '',
  maxStamina: '20',
  characteristics: { might: '0', agility: '0', reason: '0', intuition: '0', presence: '0' },
};

export function EncounterBuilder() {
  const { id: sessionId } = useParams({ from: '/campaigns/$id/build' });
  const navigate = useNavigate();
  const me = useMe();
  const session = useCampaign(sessionId);
  const { status, activeEncounter, dispatch } = useSessionSocket(sessionId);
  const templates = useEncounterTemplates(sessionId);
  const createTemplate = useCreateEncounterTemplate(sessionId);
  const deleteTemplate = useDeleteEncounterTemplate(sessionId);

  // Save-as-template modal state
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');

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
  const participants: RosterEntry[] = activeEncounter?.participants ?? [];
  const monsterParticipants = participants.filter(
    (p): p is Participant => isParticipantEntry(p) && p.kind === 'monster',
  );
  const isDirector = session.data.isDirector;

  const handleAddMonster = (monster: Monster) => {
    if (!activeEncounter) {
      const startPayload: StartEncounterPayload = { encounterId: ulid(), stampedPcs: [] };
      dispatch(
        buildIntent({
          campaignId: sessionId,
          type: IntentTypes.StartEncounter,
          payload: startPayload,
          actor,
        }),
      );
    }

    // DO stamps the full monster blob from static data by monsterId.
    const addPayload: AddMonsterPayload = {
      monsterId: monster.id,
      quantity: 1,
      // monster stamped by DO — cast satisfies schema; DO overwrites before reducer
      monster,
    };
    dispatch(
      buildIntent({
        campaignId: sessionId,
        type: IntentTypes.AddMonster,
        payload: addPayload,
        actor,
      }),
    );
  };

  // Prototype: QuickPcForm creates an ad-hoc participant for playtesting.
  // Phase 5 UI overhaul will replace this with a proper character-link flow.
  // For now, route through AddMonster (DO stamps the monster blob, but we also
  // include the participant shape directly so the optimistic mirror works).
  const handleAddPc = (participant: Participant) => {
    if (!activeEncounter) {
      const startPayload: StartEncounterPayload = { encounterId: ulid(), stampedPcs: [] };
      dispatch(
        buildIntent({
          campaignId: sessionId,
          type: IntentTypes.StartEncounter,
          payload: startPayload,
          actor,
        }),
      );
    }
    // Prototype: add the quick-PC as a participant via AddMonster.
    // The DO stamps the monster blob from static data; since there's no
    // "quick PC" intent, we synthesise a minimal monster shape here.
    const addPayload: AddMonsterPayload = {
      monsterId: participant.id,
      quantity: 1,
      nameOverride: participant.name,
      // Synthesised monster shape — prototype only. DO will attempt to look
      // up by monsterId; if not found it will reject (harmless for dev use).
      monster: {
        id: participant.id,
        name: participant.name,
        level: participant.level,
        roles: [],
        ancestry: [],
        ev: { ev: 0 },
        stamina: { base: participant.maxStamina },
        speed: 5,
        movement: [],
        size: '1M',
        stability: 0,
        freeStrike: 3,
        characteristics: participant.characteristics,
        immunities: participant.immunities,
        weaknesses: participant.weaknesses,
        abilities: [],
      },
    };
    dispatch(
      buildIntent({
        campaignId: sessionId,
        type: IntentTypes.AddMonster,
        payload: addPayload,
        actor,
      }),
    );
  };

  const handleStartFight = () => {
    if (!activeEncounter || participants.length === 0) return;
    const payload: StartRoundPayload = {};
    const ok = dispatch(
      buildIntent({
        campaignId: sessionId,
        type: IntentTypes.StartRound,
        payload,
        actor,
      }),
    );
    if (ok) {
      navigate({ to: '/campaigns/$id/play', params: { id: sessionId } });
    }
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = templateName.trim();
    if (!name || monsterParticipants.length === 0) return;

    // Build monster entries by grouping by base monsterId
    const grouped = new Map<string, number>();
    for (const p of monsterParticipants) {
      const base = p.id.replace(/-instance-\d+$/, '');
      grouped.set(base, (grouped.get(base) ?? 0) + 1);
    }
    const monsters = Array.from(grouped.entries()).map(([monsterId, quantity]) => ({
      monsterId,
      quantity,
    }));

    createTemplate.mutate(
      { name, data: { monsters } },
      {
        onSuccess: () => {
          setSaveModalOpen(false);
          setTemplateName('');
        },
      },
    );
  };

  const handleLoadTemplate = (template: EncounterTemplate) => {
    dispatch(
      buildIntent({
        campaignId: sessionId,
        type: IntentTypes.LoadEncounterTemplate,
        payload: { templateId: template.id },
        actor,
      }),
    );
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
          {isDirector && monsterParticipants.length > 0 && (
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
            disabled={!activeEncounter || participants.length === 0 || status !== 'open'}
            className="min-h-11 rounded-md bg-emerald-500 text-neutral-950 px-4 py-2 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start the fight
          </button>
        </div>
      </header>

      {/* Save-as-template modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-5 w-full max-w-sm space-y-4">
            <h2 className="font-semibold">Save as encounter template</h2>
            <p className="text-xs text-neutral-400">
              Saves the {monsterParticipants.length} monster
              {monsterParticipants.length === 1 ? '' : 's'} currently in the roster.
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
          <EncounterList participants={participants} hasEncounter={activeEncounter !== null} />
        </section>

        <section className="lg:col-span-4 space-y-4">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
            <QuickPcForm onAdd={handleAddPc} disabled={status !== 'open'} />
          </div>
          {isDirector && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <TemplatePicker
                templates={templates.data ?? []}
                isLoading={templates.isLoading}
                onLoad={handleLoadTemplate}
                onDelete={(tid) => deleteTemplate.mutate(tid)}
                disabled={status !== 'open'}
              />
            </div>
          )}
        </section>
      </div>
    </main>
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
          No saved templates. Build a roster and click "Save as template".
        </p>
      )}
      <ul className="space-y-1">
        {templates.map((t) => (
          <li key={t.id} className="flex items-center gap-2 rounded-md bg-neutral-900/60 px-3 py-2">
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

function EncounterList({
  participants,
  hasEncounter,
}: {
  participants: RosterEntry[];
  hasEncounter: boolean;
}) {
  return (
    <div className="space-y-3">
      <header className="flex items-baseline justify-between">
        <h2 className="font-semibold">Encounter</h2>
        <span className="text-xs text-neutral-500">
          {participants.length} participant{participants.length === 1 ? '' : 's'}
        </span>
      </header>

      {!hasEncounter && participants.length === 0 && (
        <div className="rounded-md border border-dashed border-neutral-800 px-4 py-6 text-center">
          <p className="text-sm text-neutral-400">No encounter yet.</p>
          <p className="text-xs text-neutral-500 mt-1">
            Add a monster or quick-PC to start. The encounter is created on the first add.
          </p>
        </div>
      )}

      {hasEncounter && participants.length === 0 && (
        <p className="text-sm text-neutral-500">
          Encounter started. Add monsters or PCs to fill the roster.
        </p>
      )}

      <ul className="space-y-2">
        {participants.map((p) => {
          if (p.kind === 'pc-placeholder') {
            // pc-placeholder — appears between BringCharacterIntoEncounter and
            // StartEncounter. No stat block until StartEncounter materializes
            // the character from D1; just show the id stub + a hint label.
            return (
              <li
                key={`pcph-${p.characterId}`}
                className="flex items-center gap-3 rounded-md bg-neutral-900/60 px-3 py-2"
              >
                <span
                  className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold bg-sky-900/40 text-sky-200"
                  aria-label="pc placeholder"
                >
                  PC
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium font-mono text-neutral-300">
                    {p.characterId.slice(0, 8)}…
                  </p>
                  <p className="text-xs text-neutral-500">
                    Waiting for Start the fight to materialize
                  </p>
                </div>
              </li>
            );
          }
          return (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-md bg-neutral-900/60 px-3 py-2"
            >
              <span
                className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                  p.kind === 'monster'
                    ? 'bg-rose-900/40 text-rose-200'
                    : 'bg-sky-900/40 text-sky-200'
                }`}
                aria-label={p.kind}
              >
                {p.kind === 'monster' ? 'M' : 'PC'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{p.name}</p>
                <p className="text-xs text-neutral-500 font-mono tabular-nums">
                  {p.currentStamina}/{p.maxStamina} stamina
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function QuickPcForm({
  onAdd,
  disabled,
}: {
  onAdd: (p: Participant) => void;
  disabled: boolean;
}) {
  const [form, setForm] = useState<QuickPcForm>(EMPTY_PC_FORM);
  const [error, setError] = useState<string | null>(null);

  const setChar = (key: (typeof CHARACTERISTIC_KEYS)[number], value: string) => {
    setForm((prev) => ({
      ...prev,
      characteristics: { ...prev.characteristics, [key]: value },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const name = form.name.trim();
    if (!name) {
      setError('Name is required.');
      return;
    }
    const maxStamina = Number.parseInt(form.maxStamina, 10);
    if (!Number.isInteger(maxStamina) || maxStamina < 1) {
      setError('Max stamina must be at least 1.');
      return;
    }

    const characteristics = {} as Characteristics;
    for (const key of CHARACTERISTIC_KEYS) {
      const raw = form.characteristics[key];
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isInteger(parsed) || parsed < -5 || parsed > 5) {
        setError(`${key} must be a whole number from −5 to +5.`);
        return;
      }
      characteristics[key] = parsed;
    }

    const participant: Participant = {
      id: `pc-${ulid()}`,
      name,
      kind: 'pc',
      level: 1,
      currentStamina: maxStamina,
      maxStamina,
      characteristics,
      immunities: [],
      weaknesses: [],
      conditions: [],
      heroicResources: [],
      extras: [],
      surges: 0,
      recoveries: { current: 0, max: 0 },
      recoveryValue: 0,
      ownerId: null,
      characterId: null,
      weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
    };

    onAdd(participant);
    setForm(EMPTY_PC_FORM);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h2 className="font-semibold">Quick PC</h2>
      <label className="block text-sm text-neutral-300">
        Name
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          className="mt-1 w-full min-h-11 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:border-neutral-600"
          placeholder="Korren the Bold"
        />
      </label>
      <label className="block text-sm text-neutral-300">
        Max stamina
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={form.maxStamina}
          onChange={(e) => setForm((p) => ({ ...p, maxStamina: e.target.value }))}
          className="mt-1 w-full min-h-11 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:border-neutral-600 font-mono tabular-nums"
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm text-neutral-300">Characteristics (−5 to +5)</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CHARACTERISTIC_KEYS.map((key) => (
            <label key={key} className="block text-xs text-neutral-400 capitalize">
              {key}
              <input
                type="number"
                inputMode="numeric"
                min={-5}
                max={5}
                value={form.characteristics[key]}
                onChange={(e) => setChar(key, e.target.value)}
                className="mt-1 w-full min-h-11 rounded-md bg-neutral-900 border border-neutral-800 px-2 py-2 outline-none focus:border-neutral-600 font-mono tabular-nums text-base text-neutral-100"
              />
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <button
        type="submit"
        disabled={disabled}
        className="w-full min-h-11 rounded-md bg-neutral-100 text-neutral-900 px-4 py-2 font-medium disabled:opacity-60"
      >
        Bring in
      </button>
    </form>
  );
}
