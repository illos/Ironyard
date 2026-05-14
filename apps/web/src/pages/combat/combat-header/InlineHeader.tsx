import { Link } from '@tanstack/react-router';
import { Button, Pill, Stat } from '../../../primitives';

// ──────────────────────────────────────────────────────────────────────────
// InlineHeader — Mode-B style breadcrumb + Round/Victories/Malice +
// turn-control buttons. Single component drives both the live and pre-round
// renderings so the layout stays consistent across encounter states.
// ──────────────────────────────────────────────────────────────────────────

export type InlineHeaderProps = {
  campaignName: string;
  sessionLabel: string | null;
  encounterLabel: string | null;
  round: number | null;
  victories: number;
  malice: number | null;
  campaignId: string;
  status: 'connecting' | 'open' | 'closed';
  canUndo: boolean;
  isAtTurnEnd: boolean;
  hasEncounter: boolean;
  onStartRound: () => void;
  onEndTurn: () => void;
  onEndRound: () => void;
  onUndo: () => void;
  onMaliceGain: () => void;
  onMaliceSpend: () => void;
  onEndEncounter: () => void;
};

export function InlineHeader({
  campaignName,
  sessionLabel,
  encounterLabel,
  round,
  victories,
  malice,
  campaignId,
  status,
  canUndo,
  isAtTurnEnd,
  hasEncounter,
  onStartRound,
  onEndTurn,
  onEndRound,
  onUndo,
  onMaliceGain,
  onMaliceSpend,
  onEndEncounter,
}: InlineHeaderProps) {
  const wsClosed = status !== 'open';
  return (
    <div className="flex items-center gap-4 px-3.5 h-12 bg-ink-1 border-b border-line">
      <Link
        to="/campaigns/$id"
        params={{ id: campaignId }}
        className="font-mono uppercase tracking-[0.08em] text-[11px] text-text-mute hover:text-text"
        title="Back to lobby"
      >
        ← Lobby
      </Link>
      <span className="text-xs text-text-dim">
        {campaignName} <span className="text-text-mute">·</span>{' '}
        <b className="text-text">{sessionLabel ?? 'Session'}</b>{' '}
        <span className="text-text-mute">·</span> {encounterLabel ?? 'Encounter'}
      </span>
      <span className="flex-1" />
      <Stat label="Round" value={round ?? '—'} />
      <Stat label="Victories" value={victories} />
      {malice !== null && (
        <Pill dotClassName="bg-foe">
          <button
            type="button"
            onClick={onMaliceSpend}
            disabled={wsClosed}
            className="px-1.5 text-foe hover:text-text disabled:opacity-40"
            aria-label="Spend 1 Malice"
          >
            −
          </button>
          <span className="font-mono uppercase tracking-[0.08em] text-text-mute">
            Malice <b className="text-text font-sans">{malice}</b>
          </span>
          <button
            type="button"
            onClick={onMaliceGain}
            disabled={wsClosed}
            className="px-1.5 text-foe hover:text-text disabled:opacity-40"
            aria-label="Gain 1 Malice"
          >
            +
          </button>
        </Pill>
      )}
      <Button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        size="sm"
        className="min-h-9"
      >
        Undo
      </Button>
      {hasEncounter && (
        <Button
          type="button"
          onClick={onEndEncounter}
          disabled={wsClosed}
          size="sm"
          variant="ghost"
          className="min-h-9"
          title="End the encounter and reset encounter-scoped resources"
        >
          End encounter
        </Button>
      )}
      {hasEncounter && round !== null && !isAtTurnEnd && (
        <Button
          type="button"
          onClick={onEndTurn}
          disabled={wsClosed}
          variant="primary"
          size="sm"
          className="min-h-9"
        >
          End turn
        </Button>
      )}
      {hasEncounter && round !== null && isAtTurnEnd && (
        <Button
          type="button"
          onClick={onEndRound}
          disabled={wsClosed}
          variant="primary"
          size="sm"
          className="min-h-9"
        >
          End round
        </Button>
      )}
      {hasEncounter && round !== null && isAtTurnEnd && (
        <Button
          type="button"
          onClick={onStartRound}
          disabled={wsClosed}
          variant="primary"
          size="sm"
          className="min-h-9"
        >
          Start round {(round ?? 0) + 1}
        </Button>
      )}
    </div>
  );
}
