import { Link } from '@tanstack/react-router';
import { Button, Stat } from '../../../primitives';
import { MalicePill } from './MalicePill';
import { VictoriesPill } from './VictoriesPill';

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
  isActingAsDirector: boolean;
  /** Player-side affordances — true when the player's own PC has the active turn. */
  isPlayerActiveTurn: boolean;
  /** Display name of whoever currently has the active turn; null between turns. */
  activeParticipantName: string | null;
  /** When initiative is being picked and no turn is active, which side is currently choosing. */
  pickingSide?: 'heroes' | 'foes' | null;
  onStartRound: () => void;
  onEndTurn: () => void;
  onEndRound: () => void;
  onUndo: () => void;
  onMaliceGain: () => void;
  onMaliceSpend: () => void;
  onEndEncounter: () => void;
  onVictoriesGain: () => void;
  onVictoriesSpend: () => void;
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
  isActingAsDirector,
  isPlayerActiveTurn,
  activeParticipantName,
  pickingSide,
  onStartRound,
  onEndTurn,
  onEndRound,
  onUndo,
  onMaliceGain,
  onMaliceSpend,
  onEndEncounter,
  onVictoriesGain,
  onVictoriesSpend,
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
      <VictoriesPill
        victories={victories}
        editable={isActingAsDirector}
        disabled={wsClosed}
        onIncrement={onVictoriesGain}
        onDecrement={onVictoriesSpend}
      />
      {malice !== null && (
        <MalicePill
          malice={malice}
          editable={isActingAsDirector}
          onGain={onMaliceGain}
          onSpend={onMaliceSpend}
          disabled={wsClosed}
        />
      )}
      {isActingAsDirector && (
        <Button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          size="sm"
          className="min-h-9"
        >
          Undo
        </Button>
      )}
      {isActingAsDirector && hasEncounter && (
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
      {/* Picking-side pill — shown when no turn is active and initiative is being chosen */}
      {activeParticipantName === null && pickingSide && (
        <span
          className={`font-mono uppercase tracking-[0.08em] text-[10px] px-3 py-1 rounded ${
            pickingSide === 'heroes' ? 'text-hero' : 'text-foe'
          }`}
        >
          {pickingSide === 'heroes' ? 'HEROES PICK' : 'DIRECTOR PICKS'}
        </span>
      )}
      {isActingAsDirector && hasEncounter && round !== null && !isAtTurnEnd && (
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
      {!isActingAsDirector && hasEncounter && round !== null && !isAtTurnEnd && (
        isPlayerActiveTurn ? (
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
        ) : (
          <span className="font-mono uppercase tracking-[0.08em] text-[10px] text-text-mute">
            {activeParticipantName ?? '—'}<span className="text-text-mute/70">'s turn</span>
          </span>
        )
      )}
      {isActingAsDirector && hasEncounter && round !== null && isAtTurnEnd && (
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
      {isActingAsDirector && hasEncounter && round !== null && isAtTurnEnd && (
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
