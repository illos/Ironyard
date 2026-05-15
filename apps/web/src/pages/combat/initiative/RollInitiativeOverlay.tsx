import { useMemo, useState } from 'react';
import type { Participant } from '@ironyard/shared';

type Side = 'heroes' | 'foes';

type Props = {
  participants: Participant[];
  isActingAsDirector: boolean;
  onRoll: (payload: { winner: Side; surprised: string[]; rolledD10?: number }) => void;
};

function rollD10(): number {
  return 1 + Math.floor(Math.random() * 10);
}

function sideOf(p: Participant): Side {
  return p.kind === 'pc' ? 'heroes' : 'foes';
}

export function RollInitiativeOverlay({ participants, isActingAsDirector, onRoll }: Props) {
  const [surprised, setSurprised] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'default' | 'pick-manual' | 'reveal'>('default');
  const [rolledValue, setRolledValue] = useState<number | null>(null);

  const counts = useMemo(() => {
    let heroes = 0, foes = 0;
    for (const p of participants) {
      if (sideOf(p) === 'heroes') heroes++;
      else foes++;
    }
    return { heroes, foes };
  }, [participants]);

  // Compute auto-pick prediction live.
  const autoPick: Side | null = useMemo(() => {
    const heroSurp = participants
      .filter((p) => sideOf(p) === 'heroes')
      .every((p) => surprised.has(p.id) || p.surprised);
    const foeSurp = participants
      .filter((p) => sideOf(p) === 'foes')
      .every((p) => surprised.has(p.id) || p.surprised);
    const anyHeroes = counts.heroes > 0;
    const anyFoes = counts.foes > 0;
    if (anyHeroes && heroSurp && !(anyFoes && foeSurp)) return 'foes';
    if (anyFoes && foeSurp && !(anyHeroes && heroSurp)) return 'heroes';
    return null;
  }, [participants, surprised, counts]);

  function toggleSurprised(id: string) {
    setSurprised((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function send(winner: Side, rolledD10?: number) {
    onRoll({ winner, surprised: [...surprised], rolledD10 });
  }

  function onRollClick() {
    if (autoPick) {
      // Surprise auto-pick — skip d10, send directly.
      send(autoPick);
      return;
    }
    const d10 = rollD10();
    setRolledValue(d10);
    setMode('reveal');
  }

  // === Render ===
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-ink-0/80 backdrop-blur-sm"
      role="dialog"
      aria-label="Roll initiative"
    >
      <div className="w-full max-w-md bg-ink-1 border border-line p-6 flex flex-col gap-4">
        <h2 className="font-mono uppercase text-lg tracking-wider">Roll Initiative</h2>
        <div className="text-text-dim text-sm">
          {counts.heroes} HEROES · {counts.foes} FOES
        </div>
        {surprised.size > 0 && (
          <div className="font-mono uppercase text-xs text-foe">
            {surprised.size} surprised
          </div>
        )}
        {autoPick && (
          <div className="font-mono uppercase text-xs text-accent">
            Auto-pick: {autoPick} (one side fully surprised)
          </div>
        )}

        {mode === 'default' && (
          <>
            <button
              type="button"
              className="bg-accent text-ink-0 px-4 py-3 font-mono uppercase tracking-wider"
              onClick={onRollClick}
            >
              Roll d10
            </button>
            <button
              type="button"
              className="font-mono uppercase text-xs text-text-mute hover:text-accent"
              onClick={() => setMode('pick-manual')}
            >
              Pick manually →
            </button>
          </>
        )}

        {mode === 'pick-manual' && (
          <>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 bg-hero text-ink-0 px-4 py-3 font-mono uppercase"
                onClick={() => send('heroes')}
                disabled={autoPick !== null && autoPick !== 'heroes'}
              >
                Players first
              </button>
              <button
                type="button"
                className="flex-1 bg-foe text-ink-0 px-4 py-3 font-mono uppercase"
                onClick={() => send('foes')}
                disabled={autoPick !== null && autoPick !== 'foes'}
              >
                Director first
              </button>
            </div>
            <button
              type="button"
              className="font-mono uppercase text-xs text-text-mute hover:text-accent"
              onClick={() => setMode('default')}
            >
              ← Back to roll
            </button>
          </>
        )}

        {mode === 'reveal' && rolledValue !== null && (
          <>
            <div className="text-6xl font-mono text-accent text-center my-4">{rolledValue}</div>
            <div className="text-text-dim text-sm text-center">
              {rolledValue >= 6 ? 'Players choose first' : 'Director chooses first'}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 bg-hero text-ink-0 px-4 py-3 font-mono uppercase"
                onClick={() => send('heroes', rolledValue)}
              >
                Players first
              </button>
              <button
                type="button"
                className="flex-1 bg-foe text-ink-0 px-4 py-3 font-mono uppercase"
                onClick={() => send('foes', rolledValue)}
              >
                Director first
              </button>
            </div>
          </>
        )}

        {isActingAsDirector && (
          <div className="border-t border-line-soft pt-4 flex flex-col gap-2">
            <div className="font-mono uppercase text-xs text-text-mute">Tap rows behind to mark surprised</div>
            {participants.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={surprised.has(p.id) || p.surprised}
                  disabled={p.surprised}
                  onChange={() => toggleSurprised(p.id)}
                />
                <span>{p.name}</span>
                <span className="font-mono uppercase text-xs text-text-mute">
                  ({sideOf(p)})
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
