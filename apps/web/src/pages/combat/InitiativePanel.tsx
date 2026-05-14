import type { Participant } from '@ironyard/shared';
import { HpBar } from '../../primitives/HpBar';

type Props = {
  participants: Participant[];
  turnOrder: string[];
  activeParticipantId: string | null;
  focusedId: string | null;
  onFocus: (id: string) => void;
};

export function InitiativePanel({
  participants,
  turnOrder,
  activeParticipantId,
  focusedId,
  onFocus,
}: Props) {
  // Render in turnOrder when present; otherwise fall back to participant order
  // (matches slice 10's insertion-order default).
  const byId = new Map(participants.map((p) => [p.id, p]));
  const orderedIds = turnOrder.length > 0 ? turnOrder : participants.map((p) => p.id);
  const ordered = orderedIds.map((id) => byId.get(id)).filter((p): p is Participant => !!p);

  return (
    <div className="space-y-2">
      <header className="flex items-baseline justify-between px-1">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-text-dim">
          Initiative
        </h2>
        <span className="text-xs text-text-mute font-mono tabular-nums">{ordered.length}</span>
      </header>
      <ul className="space-y-1.5">
        {ordered.map((p) => {
          const isActive = p.id === activeParticipantId;
          const isFocused = p.id === focusedId;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onFocus(p.id)}
                className={`w-full min-h-14 flex items-center gap-3 px-3 py-2 text-left transition-colors border-l-2 ${
                  isActive
                    ? 'bg-ink-2 border-accent hover:bg-ink-3'
                    : isFocused
                      ? 'bg-ink-2 border-line hover:bg-ink-2'
                      : 'bg-ink-1 border-transparent hover:bg-ink-2 active:bg-ink-2'
                }`}
              >
                <span
                  className={`shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${
                    p.kind === 'monster'
                      ? 'bg-foe text-text'
                      : 'bg-accent text-ink-0'
                  }`}
                  aria-label={p.kind}
                >
                  {p.kind === 'monster' ? 'M' : 'PC'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-medium flex items-center gap-2">
                      {isActive && (
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full bg-accent"
                          aria-label="active turn"
                        />
                      )}
                      {p.name}
                    </p>
                    <p className="shrink-0 text-xs font-mono tabular-nums text-text-dim">
                      {p.currentStamina}/{p.maxStamina}
                    </p>
                  </div>
                  <div className="mt-1.5">
                    <HpBar current={p.currentStamina} max={p.maxStamina} size="sm" />
                  </div>
                </div>
              </button>
            </li>
          );
        })}
        {ordered.length === 0 && (
          <li className="text-sm text-text-mute px-3 py-2">No participants yet.</li>
        )}
      </ul>
    </div>
  );
}
