import {
  type Ability,
  type Characteristic,
  type ConditionApplicationDispatch,
  type DamageType,
  type EndRoundPayload,
  type EndTurnPayload,
  type GainResourcePayload,
  type Intent,
  IntentTypes,
  type Monster,
  type Participant,
  type RemoveConditionPayload,
  type RollPowerPayload,
  type SetConditionPayload,
  type SetResourcePayload,
  type SetStaminaPayload,
  type SpendRecoveryPayload,
  type SpendResourcePayload,
  type SpendSurgePayload,
  type StartRoundPayload,
  type TierOutcome,
  type UndoPayload,
  ulid,
} from '@ironyard/shared';
import { Link, useParams } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildIntent } from '../api/dispatch';
import { useCampaign, useMe, useMonsters } from '../api/queries';
import { describeIntent, findLatestUndoable } from '../lib/intentDescribe';
import { type MirrorIntent, isParticipantEntry, useSessionSocket } from '../ws/useSessionSocket';
import { DetailPane } from './combat/DetailPane';
import { InitiativePanel } from './combat/InitiativePanel';
import { OpenActionsList } from './combat/OpenActionsList';
import { PlayerSheetPanel } from './combat/PlayerSheetPanel';
import { type Toast, ToastStack } from './combat/ToastStack';

const TOAST_DISMISS_MS = 6000;
const MAX_TOASTS = 3;

export function CombatRun() {
  const { id: sessionId } = useParams({ from: '/campaigns/$id/play' });
  const me = useMe();
  const session = useCampaign(sessionId);
  const monsters = useMonsters();
  const {
    status,
    activeEncounter,
    dispatch,
    intentLog,
    activeDirectorId,
    openActions,
  } = useSessionSocket(sessionId);

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Track the seq of the last intent we already turned into a toast — anything
  // newer becomes a toast on its applied envelope.
  const [lastToastedSeq, setLastToastedSeq] = useState<number>(0);
  // Snapshot of participants right before each intent applies, so derived
  // ApplyDamage toasts can read the target's name even though the live
  // participant list has already been mutated by the time the effect runs.
  const [participantSnapshotBefore, setParticipantSnapshotBefore] = useState<Participant[]>([]);

  // Auto-focus the active participant when round changes.
  useEffect(() => {
    if (!activeEncounter) {
      setFocusedId(null);
      return;
    }
    if (!focusedId && activeEncounter.activeParticipantId) {
      setFocusedId(activeEncounter.activeParticipantId);
    } else if (!focusedId) {
      // CombatRun runs after StartEncounter, so any roster entry of interest
      // is a materialized Participant — placeholders should be gone. Skip
      // any stragglers when defaulting the focus target.
      const firstParticipant = activeEncounter.participants.find(isParticipantEntry);
      if (firstParticipant) setFocusedId(firstParticipant.id);
    }
  }, [activeEncounter, focusedId]);

  // Drain new intents from the mirror log into toasts. We walk forward from
  // lastToastedSeq, render attribution against the participants snapshot we
  // captured before the next-newest intent applied, and bump the cursor.
  useEffect(() => {
    if (intentLog.length === 0) return;
    const newEntries = intentLog.filter((i) => i.seq > lastToastedSeq);
    if (newEntries.length === 0) return;
    const additions: Toast[] = [];
    for (const entry of newEntries) {
      // Only toast types worth seeing. JoinSession / LeaveSession spam the
      // log on every connect and never need an undo affordance.
      if (entry.type === IntentTypes.JoinLobby) continue;
      if (entry.type === IntentTypes.LeaveLobby) continue;
      // Derived intents inherit attribution from their parent — surface the
      // parent's text but make Undo target the parent id (the DO voids the
      // whole chain via the parent).
      const parent = entry.causedBy ? intentLog.find((i) => i.id === entry.causedBy) : undefined;
      const text = describeIntent({
        intent: entry,
        participantsBefore: participantSnapshotBefore,
        parent,
      });
      const isDerived = !!entry.causedBy;
      const undoTarget = isDerived ? entry.causedBy : entry.id;
      // Skip undo for round/turn lifecycle - lifecycle undo is fragile and
      // the player can just dispatch the inverse intent (End Round / Start
      // Round) themselves. Hides the affordance for those toasts.
      const undoSafe =
        entry.type === IntentTypes.RollPower ||
        entry.type === IntentTypes.ApplyDamage ||
        entry.type === IntentTypes.SetCondition ||
        entry.type === IntentTypes.RemoveCondition;
      additions.push({
        id: `toast-${entry.seq}-${entry.id}`,
        text,
        undoTargetId: undoSafe ? undoTarget : undefined,
        undone: entry.voided,
      });
    }
    if (additions.length === 0) {
      setLastToastedSeq(newEntries[newEntries.length - 1]?.seq ?? lastToastedSeq);
      return;
    }
    setToasts((prev) => {
      const next = [...prev, ...additions];
      // Cap stack length, FIFO.
      return next.slice(-MAX_TOASTS);
    });
    setLastToastedSeq(newEntries[newEntries.length - 1]?.seq ?? lastToastedSeq);
    // Capture the post-apply snapshot for the NEXT round of attribution. The
    // current participants list is what the next intent should see as "before"
    // since it'll have already applied (we capture in effect, not render).
    // Snapshot only actual Participants — placeholder entries don't carry the
    // fields toast attribution needs (id, name, currentStamina, …).
    setParticipantSnapshotBefore((activeEncounter?.participants ?? []).filter(isParticipantEntry));
  }, [intentLog, lastToastedSeq, participantSnapshotBefore, activeEncounter]);

  // Auto-dismiss toasts.
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, TOAST_DISMISS_MS),
    );
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [toasts]);

  // When a snapshot rolls in from an Undo, mark matching toasts as undone so
  // their Undo button greys out instead of leaving the affordance live.
  useEffect(() => {
    const voidedIds = new Set(intentLog.filter((i) => i.voided).map((i) => i.id));
    setToasts((prev) =>
      prev.map((t) =>
        t.undoTargetId && voidedIds.has(t.undoTargetId) ? { ...t, undone: true } : t,
      ),
    );
  }, [intentLog]);

  // Shared lookup: participant id → full Monster record. The combat run needs
  // both the level (for the type chip in DetailPane) and the abilities list
  // (for the rollable ladder in AbilityCard). We build the full-monster map
  // here and derive the level-only map from it so the two never drift.
  const monsterByParticipantId = useMemo(() => {
    const map = new Map<string, Monster>();
    if (!monsters.data || !activeEncounter) return map;
    for (const p of activeEncounter.participants) {
      if (!isParticipantEntry(p) || p.kind !== 'monster') continue;
      // Participant ids look like `${monsterId}-instance-N` per slice 10.
      const base = p.id.replace(/-instance-\d+$/, '');
      const m = monsters.data.monsters.find((mm) => mm.id === base);
      if (m) map.set(p.id, m);
    }
    return map;
  }, [monsters.data, activeEncounter]);

  const monsterLevelById = useMemo(() => {
    const map = new Map<string, number>();
    for (const [pid, m] of monsterByParticipantId) {
      map.set(pid, m.level);
    }
    return map;
  }, [monsterByParticipantId]);

  const handleFocus = useCallback((id: string) => setFocusedId(id), []);

  // Header guards — handle loading / unauthenticated / no-session error before
  // touching dispatch helpers.
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
  // CombatRun assumes a materialized roster. Filter out any stray pc-placeholders
  // (they're cleared by StartEncounter, but the type system can't prove that).
  const participants: Participant[] = (activeEncounter?.participants ?? []).filter(
    isParticipantEntry,
  );
  const focused = participants.find((p) => p.id === focusedId) ?? null;
  const isAtTurnEnd =
    !!activeEncounter &&
    activeEncounter.currentRound !== null &&
    activeEncounter.activeParticipantId === null;
  const undoable = findLatestUndoable(intentLog);

  const send = (type: string, payload: unknown): boolean =>
    dispatch(buildIntent({ campaignId: sessionId, type, payload, actor }));

  const handleStartRound = () => {
    const payload: StartRoundPayload = {};
    send(IntentTypes.StartRound, payload);
  };

  const handleEndTurn = () => {
    const payload: EndTurnPayload = {};
    send(IntentTypes.EndTurn, payload);
  };

  const handleEndRound = () => {
    const payload: EndRoundPayload = {};
    send(IntentTypes.EndRound, payload);
  };

  const handleUndoHeader = () => {
    if (!undoable) return;
    const payload: UndoPayload = { intentId: undoable.id };
    send(IntentTypes.Undo, payload);
  };

  const handleToastUndo = (intentId: string) => {
    const payload: UndoPayload = { intentId };
    send(IntentTypes.Undo, payload);
  };

  const handleToastDismiss = (toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  };

  const dispatchRoll = (args: {
    ability: Ability;
    attacker: Participant;
    target: Participant;
    rolls: [number, number];
    source: 'manual' | 'auto';
  }) => {
    // Capture "before" snapshot for the upcoming attribution.
    setParticipantSnapshotBefore(participants);
    if (!args.ability.powerRoll) return; // guarded upstream by AbilityCard filter
    const characteristic = characteristicForAbility(args.ability);
    const ladder = buildLadder(args.ability.powerRoll, args.attacker.id);
    const payload: RollPowerPayload = {
      // Slugify the ability name so RollPower payloads have a stable id even
      // though data doesn't ship one. Same monster + same ability ⇒ same id.
      abilityId: abilityIdFor(args.attacker, args.ability),
      attackerId: args.attacker.id,
      targetIds: [args.target.id],
      characteristic,
      edges: 0,
      banes: 0,
      rolls: { d10: args.rolls },
      ladder,
      // Slice 6 / Epic 2C § 10.8: keywords drive the kit weapon-damage-bonus
      // fold. The engine looks for Weapon + Melee/Ranged on these.
      abilityKeywords: args.ability.keywords ?? [],
    };
    // The DO override of `source` is always 'manual' regardless of what we
    // send (see session-do.ts handleDispatch). To preserve manual-vs-auto
    // attribution we encode it in the abilityId tag for now.
    // TODO: lobby for the DO to honour client `source`, or extend the wire
    // protocol with a `source: 'manual' | 'auto'` field independent of trust.
    const intent: Intent = buildIntent({
      campaignId: sessionId,
      type: IntentTypes.RollPower,
      payload,
      actor,
    });
    if (args.source === 'manual') {
      intent.source = 'manual';
    } else {
      intent.source = 'auto';
    }
    dispatch(intent);
  };

  const dispatchSetCondition = (payload: SetConditionPayload) => {
    setParticipantSnapshotBefore(participants);
    send(IntentTypes.SetCondition, payload);
  };

  const dispatchRemoveCondition = (payload: RemoveConditionPayload) => {
    setParticipantSnapshotBefore(participants);
    send(IntentTypes.RemoveCondition, payload);
  };

  const dispatchSetStamina = (payload: SetStaminaPayload) => {
    setParticipantSnapshotBefore(participants);
    send(IntentTypes.SetStamina, payload);
  };

  const dispatchGainResource = (payload: GainResourcePayload) => {
    setParticipantSnapshotBefore(participants);
    send(IntentTypes.GainResource, payload);
  };
  const dispatchSpendResource = (payload: SpendResourcePayload) => {
    setParticipantSnapshotBefore(participants);
    send(IntentTypes.SpendResource, payload);
  };
  const dispatchSetResource = (payload: SetResourcePayload) => {
    setParticipantSnapshotBefore(participants);
    send(IntentTypes.SetResource, payload);
  };
  const dispatchSpendSurge = (payload: SpendSurgePayload) => {
    setParticipantSnapshotBefore(participants);
    send(IntentTypes.SpendSurge, payload);
  };
  const dispatchSpendRecovery = (payload: SpendRecoveryPayload) => {
    setParticipantSnapshotBefore(participants);
    send(IntentTypes.SpendRecovery, payload);
  };
  const dispatchGainMalice = (amount: number) => {
    setParticipantSnapshotBefore(participants);
    send(IntentTypes.GainMalice, { amount });
  };
  const dispatchSpendMalice = (amount: number) => {
    setParticipantSnapshotBefore(participants);
    send(IntentTypes.SpendMalice, { amount });
  };
  const handleEndEncounter = () => {
    if (!activeEncounter) return;
    setParticipantSnapshotBefore(participants);
    send(IntentTypes.EndEncounter, { encounterId: activeEncounter.encounterId });
  };

  const wsClosed = status !== 'open';
  const disabled = wsClosed;

  return (
    <main className="min-h-screen px-3 sm:px-4 lg:px-6 py-3 sm:py-4 max-w-[1600px] mx-auto">
      <Header
        sessionName={session.data.name}
        status={status}
        currentRound={activeEncounter?.currentRound ?? null}
        hasEncounter={!!activeEncounter}
        isAtTurnEnd={isAtTurnEnd}
        canUndo={!!undoable && !wsClosed}
        malice={activeEncounter?.malice.current ?? null}
        sessionId={sessionId}
        onStartRound={handleStartRound}
        onEndTurn={handleEndTurn}
        onEndRound={handleEndRound}
        onUndo={handleUndoHeader}
        onMaliceGain={() => dispatchGainMalice(1)}
        onMaliceSpend={() => dispatchSpendMalice(1)}
        onEndEncounter={handleEndEncounter}
      />

      {!activeEncounter && (
        <section className="mt-6 rounded-lg border border-dashed border-neutral-800 p-6 text-center">
          <p className="text-sm text-neutral-300">No encounter yet.</p>
          <p className="text-xs text-neutral-500 mt-1">
            Build one first —{' '}
            <Link
              to="/campaigns/$id/build"
              params={{ id: sessionId }}
              className="underline text-neutral-300 hover:text-neutral-100"
            >
              Build encounter
            </Link>
            .
          </p>
        </section>
      )}

      {activeEncounter && activeEncounter.currentRound === null && (
        <section className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-neutral-300">Encounter built, round not started.</p>
            <p className="text-xs text-neutral-500 mt-1">
              {activeEncounter.participants.length} participant
              {activeEncounter.participants.length === 1 ? '' : 's'}.
            </p>
          </div>
          <button
            type="button"
            onClick={handleStartRound}
            disabled={wsClosed}
            className="min-h-11 rounded-md bg-emerald-500 text-neutral-950 px-4 font-semibold disabled:opacity-50"
          >
            Start round 1
          </button>
        </section>
      )}

      {activeEncounter && activeEncounter.currentRound !== null && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4">
          <aside className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 lg:sticky lg:top-3 lg:h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <InitiativePanel
              participants={participants}
              turnOrder={activeEncounter.turnOrder}
              activeParticipantId={activeEncounter.activeParticipantId}
              focusedId={focusedId}
              onFocus={handleFocus}
            />
          </aside>
          <div className="space-y-4">
            <section className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <DetailPane
                focused={focused}
                participants={participants}
                monsterLevelById={monsterLevelById}
                monsterByParticipantId={monsterByParticipantId}
                disabled={disabled}
                dispatchRoll={dispatchRoll}
                dispatchSetCondition={dispatchSetCondition}
                dispatchRemoveCondition={dispatchRemoveCondition}
                dispatchSetStamina={dispatchSetStamina}
                dispatchGainResource={dispatchGainResource}
                dispatchSpendResource={dispatchSpendResource}
                dispatchSetResource={dispatchSetResource}
                dispatchSpendSurge={dispatchSpendSurge}
                dispatchSpendRecovery={dispatchSpendRecovery}
              />
            </section>
            {/* PlayerSheetPanel: renders for the player who owns a PC participant;
                returns null for directors and viewers without a materialized PC. */}
            <PlayerSheetPanel campaignId={sessionId} />
            {/* OpenActionsList: lobby-visible queue of rule-driven prompts a
                player or director may claim (Phase 2b.0). Visible in 2b.0 with
                no consumers; 2b.0.1 wires the spatial-trigger + pray-to-the-gods
                raisers. */}
            <section className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <OpenActionsList
                openActions={openActions}
                currentUserId={me.data?.user.id ?? ''}
                activeDirectorId={activeDirectorId ?? session.data?.activeDirectorId ?? ''}
                participantOwnerLookup={(pid) => {
                  const p = activeEncounter?.participants.find(
                    (entry) => isParticipantEntry(entry) && entry.id === pid,
                  );
                  return p && isParticipantEntry(p) ? p.ownerId : null;
                }}
                onClaim={(id) =>
                  dispatch({
                    id: ulid(),
                    type: IntentTypes.ClaimOpenAction,
                    payload: { openActionId: id },
                  })
                }
              />
            </section>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts} onUndo={handleToastUndo} onDismiss={handleToastDismiss} />
    </main>
  );
}

type HeaderProps = {
  sessionName: string;
  sessionId: string;
  status: 'connecting' | 'open' | 'closed';
  currentRound: number | null;
  hasEncounter: boolean;
  isAtTurnEnd: boolean;
  canUndo: boolean;
  malice: number | null;
  onStartRound: () => void;
  onEndTurn: () => void;
  onEndRound: () => void;
  onUndo: () => void;
  onMaliceGain: () => void;
  onMaliceSpend: () => void;
  onEndEncounter: () => void;
};

function Header({
  sessionName,
  sessionId,
  status,
  currentRound,
  hasEncounter,
  isAtTurnEnd,
  canUndo,
  malice,
  onStartRound,
  onEndTurn,
  onEndRound,
  onUndo,
  onMaliceGain,
  onMaliceSpend,
  onEndEncounter,
}: HeaderProps) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-3">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold">Play</h1>
        <p className="text-xs text-neutral-500 mt-1">
          {sessionName}
          {currentRound !== null && (
            <span className="ml-2 text-neutral-300 font-mono tabular-nums">
              Round {currentRound}
            </span>
          )}
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
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/campaigns/$id"
          params={{ id: sessionId }}
          className="text-sm text-neutral-400 hover:text-neutral-200 min-h-11 px-2 inline-flex items-center"
        >
          ← Lobby
        </Link>
        {hasEncounter && malice !== null && (
          <div className="inline-flex items-center rounded-md border border-rose-900/60 bg-rose-950/40 overflow-hidden">
            <button
              type="button"
              onClick={onMaliceSpend}
              disabled={status !== 'open'}
              className="min-h-11 w-9 text-rose-200 hover:bg-rose-900/40 disabled:opacity-40"
              aria-label="Spend 1 Malice"
            >
              −
            </button>
            <span className="px-2 text-sm tabular-nums font-mono text-rose-100">
              Malice <span className="font-semibold">{malice}</span>
            </span>
            <button
              type="button"
              onClick={onMaliceGain}
              disabled={status !== 'open'}
              className="min-h-11 w-9 text-rose-200 hover:bg-rose-900/40 disabled:opacity-40"
              aria-label="Gain 1 Malice"
            >
              +
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="min-h-11 px-4 rounded-md border border-neutral-700 bg-neutral-900 text-sm font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Undo
        </button>
        {hasEncounter && (
          <button
            type="button"
            onClick={onEndEncounter}
            disabled={status !== 'open'}
            className="min-h-11 px-3 rounded-md border border-neutral-700 bg-neutral-900 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
            title="End the encounter and reset encounter-scoped resources"
          >
            End encounter
          </button>
        )}
        {hasEncounter && currentRound !== null && !isAtTurnEnd && (
          <button
            type="button"
            onClick={onEndTurn}
            disabled={status !== 'open'}
            className="min-h-11 px-4 rounded-md bg-neutral-100 text-neutral-900 font-semibold hover:bg-white disabled:opacity-50"
          >
            End turn
          </button>
        )}
        {hasEncounter && currentRound !== null && isAtTurnEnd && (
          <button
            type="button"
            onClick={onEndRound}
            disabled={status !== 'open'}
            className="min-h-11 px-4 rounded-md bg-amber-500 text-neutral-950 font-semibold hover:bg-amber-400 disabled:opacity-50"
          >
            End round
          </button>
        )}
        {hasEncounter && currentRound !== null && isAtTurnEnd && (
          <button
            type="button"
            onClick={onStartRound}
            disabled={status !== 'open'}
            className="min-h-11 px-4 rounded-md bg-emerald-500 text-neutral-950 font-semibold hover:bg-emerald-400 disabled:opacity-50"
          >
            Start round {(currentRound ?? 0) + 1}
          </button>
        )}
      </div>
    </header>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Ability → RollPower helpers
// ──────────────────────────────────────────────────────────────────────────

// Build a stable ability id from the attacker + ability. The data layer
// doesn't ship a per-ability id today (each monster's abilities are keyed by
// name only); pairing with the participant base id gives us uniqueness across
// monsters that happen to share an ability name.
function abilityIdFor(attacker: Participant, ability: Ability): string {
  const slug = ability.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = attacker.id.replace(/-instance-\d+$/, '');
  return `${base}:${slug}`;
}

// Derive the rolling characteristic from the ability's PowerRoll.bonus. The
// data layer currently captures the bonus as a signed integer string ("+2",
// "-1") only — the source column header indicates the characteristic but the
// parser doesn't preserve it yet. Default to Might per the original stub;
// when the data layer extension adds an explicit characteristic field, swap
// this for `ability.powerRoll?.characteristic ?? 'might'`.
function characteristicForAbility(_ability: Ability): Characteristic {
  return 'might';
}

// Convert a parsed TierOutcome into the wire ladder shape RollPower expects.
// Tiers without parseable damage (e.g. "Pull 4; I < 3 frightened") send
// damage:0 so the engine applies no stamina change — the director reads the
// effect text from the toast and dispatches a follow-up SetCondition if the
// rules call for it.
function tierEffectFromOutcome(
  tier: TierOutcome,
  attackerId: string,
): {
  damage: number;
  damageType: DamageType;
  conditions: ConditionApplicationDispatch[];
} {
  const damage = tier.damage === null ? 0 : tier.damage;
  const damageType = tier.damage === null ? 'untyped' : (tier.damageType ?? 'untyped');
  // Filter parser output to `scope === 'target'` and rewrite the
  // `until_start_next_turn` placeholder ownerId to the attacker's id so the
  // engine anchors the duration to a real participant (canon §3.2).
  const conditions: ConditionApplicationDispatch[] = tier.conditions
    .filter((c) => c.scope === 'target')
    .map((c) => ({
      condition: c.condition,
      duration:
        c.duration.kind === 'until_start_next_turn'
          ? { kind: 'until_start_next_turn', ownerId: attackerId }
          : c.duration,
    }));
  return { damage, damageType, conditions };
}

function buildLadder(pr: NonNullable<Ability['powerRoll']>, attackerId: string) {
  return {
    t1: tierEffectFromOutcome(pr.tier1, attackerId),
    t2: tierEffectFromOutcome(pr.tier2, attackerId),
    t3: tierEffectFromOutcome(pr.tier3, attackerId),
  };
}

// Suppress unused — keep MirrorIntent in scope so consumers importing the
// page module pick up the type re-exports they need.
export type { MirrorIntent };
