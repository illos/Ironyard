import type {
  BringCharacterIntoEncounterPayload,
  Characteristics,
  Monster,
  Participant,
  StartEncounterPayload,
  StartRoundPayload,
} from '@ironyard/shared';
import { IntentTypes, ulid } from '@ironyard/shared';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { buildIntent } from '../api/dispatch';
import { useMe, useMonsters, useSession } from '../api/queries';
import { useSessionSocket } from '../ws/useSessionSocket';

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
  const { id: sessionId } = useParams({ from: '/sessions/$id/build' });
  const navigate = useNavigate();
  const me = useMe();
  const session = useSession(sessionId);
  const { status, activeEncounter, dispatch } = useSessionSocket(sessionId);

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
        <p className="text-rose-400">{(session.error as Error)?.message ?? 'Session not found.'}</p>
        <Link to="/" className="underline text-neutral-300">
          Back home
        </Link>
      </main>
    );
  }

  const actor = { userId: me.data.user.id, role: session.data.role };
  const participants = activeEncounter?.participants ?? [];

  const handleAddMonster = (monster: Monster) => {
    // Auto-number duplicates by counting existing instances of this monster id.
    const sameKindCount = participants.filter((p) =>
      p.id.startsWith(`${monster.id}-instance-`),
    ).length;
    const nextCount = sameKindCount + 1;
    // TODO: replace placeholder stamina + characteristics + resistances once
    // the monster data ingest extends past id/name/level (see slice 2 notes).
    const participant: Participant = {
      id: `${monster.id}-instance-${nextCount}`,
      name: nextCount > 1 ? `${monster.name} ${nextCount}` : monster.name,
      kind: 'monster',
      // Slice 6: `level` powers Bleeding 1d6+level. Read from the monster data
      // here once it's available; for now mirror the level the source carries.
      level: monster.level,
      currentStamina: 20,
      maxStamina: 20,
      characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
      immunities: [],
      weaknesses: [],
      conditions: [],
      // Slice 7: monsters don't have heroic resources or recoveries; surges
      // are not part of the monster surface. Director's Malice lives on the
      // encounter, not on participants. Leave everything zero/empty.
      heroicResources: [],
      extras: [],
      surges: 0,
      recoveries: { current: 0, max: 0 },
      recoveryValue: 0,
    };

    if (!activeEncounter) {
      const startPayload: StartEncounterPayload = { encounterId: ulid() };
      dispatch(
        buildIntent({
          sessionId,
          type: IntentTypes.StartEncounter,
          payload: startPayload,
          actor,
        }),
      );
    }

    const bringPayload: BringCharacterIntoEncounterPayload = { participant };
    dispatch(
      buildIntent({
        sessionId,
        type: IntentTypes.BringCharacterIntoEncounter,
        payload: bringPayload,
        actor,
      }),
    );
  };

  const handleAddPc = (participant: Participant) => {
    if (!activeEncounter) {
      const startPayload: StartEncounterPayload = { encounterId: ulid() };
      dispatch(
        buildIntent({
          sessionId,
          type: IntentTypes.StartEncounter,
          payload: startPayload,
          actor,
        }),
      );
    }
    const bringPayload: BringCharacterIntoEncounterPayload = { participant };
    dispatch(
      buildIntent({
        sessionId,
        type: IntentTypes.BringCharacterIntoEncounter,
        payload: bringPayload,
        actor,
      }),
    );
  };

  const handleStartFight = () => {
    if (!activeEncounter || participants.length === 0) return;
    const payload: StartRoundPayload = {};
    const ok = dispatch(
      buildIntent({
        sessionId,
        type: IntentTypes.StartRound,
        payload,
        actor,
      }),
    );
    if (ok) {
      // Slice 11: land on the play screen instead of the lobby once the fight
      // begins. The lobby keeps a "Continue in play screen" link for re-entry.
      navigate({ to: '/sessions/$id/play', params: { id: sessionId } });
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
            to="/sessions/$id"
            params={{ id: sessionId }}
            className="text-sm text-neutral-400 hover:text-neutral-200"
          >
            ← Lobby
          </Link>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
          <MonsterPicker onAdd={handleAddMonster} />
        </section>

        <section className="lg:col-span-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
          <EncounterList participants={participants} hasEncounter={activeEncounter !== null} />
        </section>

        <section className="lg:col-span-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
          <QuickPcForm onAdd={handleAddPc} disabled={status !== 'open'} />
        </section>
      </div>
    </main>
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
  participants: Participant[];
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
        {participants.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-md bg-neutral-900/60 px-3 py-2">
            <span
              className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                p.kind === 'monster' ? 'bg-rose-900/40 text-rose-200' : 'bg-sky-900/40 text-sky-200'
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
        ))}
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
      // Slice 6: PC quick-stat blocks default to level 1; full sheet (Phase 2)
      // will replace this with the character's actual level.
      level: 1,
      currentStamina: maxStamina,
      maxStamina,
      characteristics,
      immunities: [],
      weaknesses: [],
      conditions: [],
      // Slice 7: quick-stat PCs start without a heroic resource pool — Phase 2
      // character sheet builds it from class + Reason. Recoveries / surges /
      // recoveryValue default to zero here; the director or character sheet
      // sets them via SetResource / direct SetStat overrides.
      heroicResources: [],
      extras: [],
      surges: 0,
      recoveries: { current: 0, max: 0 },
      recoveryValue: 0,
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
