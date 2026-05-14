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
import { buildIntent } from '../../api/dispatch';
import { useCampaign, useMe, useMonsters } from '../../api/queries';
import { useIsActingAsDirector } from '../../lib/active-director';
import { describeIntent, findLatestUndoable } from '../../lib/intentDescribe';
import { Button, SplitPane } from '../../primitives';
import { InlineHeader } from './combat-header/InlineHeader';
import { isParticipantEntry, useSessionSocket } from '../../ws/useSessionSocket';
import { DetailPane } from './detail';
import { EncounterRail } from './EncounterRail';
import { OpenActionsList } from './OpenActionsList';
import { PartyRail } from './PartyRail';
import { PlayerSheetPanel } from './PlayerSheetPanel';
import { type Toast, ToastStack } from './ToastStack';

const TOAST_DISMISS_MS = 6000;
const MAX_TOASTS = 3;

/**
 * DirectorCombat — unified replacement for CombatRun.tsx (Phase 5 H5).
 *
 * Same WS-mirror wiring as CombatRun, but the layout is the Mode-B inline
 * header + SplitPane (party + encounter rails on the left, DetailPane on
 * the right). Sub-features (toasts, OpenActionsList, PlayerSheetPanel) are
 * rendered below the split, the same affordances CombatRun owned but with
 * the rethemed primitives.
 *
 * H6 will swap the router to point /campaigns/$id/play here and delete
 * CombatRun.tsx; this file is what lands on the page when that happens.
 */
export function DirectorCombat() {
  const { id: campaignId } = useParams({ from: '/campaigns/$id/play' });
  const me = useMe();
  const campaign = useCampaign(campaignId);
  const monsters = useMonsters();
  const {
    status,
    activeEncounter,
    dispatch,
    intentLog,
    activeDirectorId,
    openActions,
  } = useSessionSocket(campaignId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastToastedSeq, setLastToastedSeq] = useState<number>(0);
  const [participantSnapshotBefore, setParticipantSnapshotBefore] = useState<Participant[]>([]);

  // Auto-select the active participant when the round starts; pick the first
  // available participant otherwise. Same behaviour as CombatRun.handleFocus
  // defaults.
  useEffect(() => {
    if (!activeEncounter) {
      setSelectedId(null);
      return;
    }
    if (!selectedId && activeEncounter.activeParticipantId) {
      setSelectedId(activeEncounter.activeParticipantId);
    } else if (!selectedId) {
      const firstParticipant = activeEncounter.participants.find(isParticipantEntry);
      if (firstParticipant) setSelectedId(firstParticipant.id);
    }
  }, [activeEncounter, selectedId]);

  // Toast attribution — port verbatim from CombatRun. Walk forward from
  // lastToastedSeq, render the parent intent's text against the snapshot
  // captured before the next-newest intent applied, append to the stack.
  useEffect(() => {
    if (intentLog.length === 0) return;
    const newEntries = intentLog.filter((i) => i.seq > lastToastedSeq);
    if (newEntries.length === 0) return;
    const additions: Toast[] = [];
    for (const entry of newEntries) {
      if (entry.type === IntentTypes.JoinLobby) continue;
      if (entry.type === IntentTypes.LeaveLobby) continue;
      const parent = entry.causedBy ? intentLog.find((i) => i.id === entry.causedBy) : undefined;
      const text = describeIntent({
        intent: entry,
        participantsBefore: participantSnapshotBefore,
        parent,
      });
      const isDerived = !!entry.causedBy;
      const undoTarget = isDerived ? entry.causedBy : entry.id;
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
      return next.slice(-MAX_TOASTS);
    });
    setLastToastedSeq(newEntries[newEntries.length - 1]?.seq ?? lastToastedSeq);
    setParticipantSnapshotBefore((activeEncounter?.participants ?? []).filter(isParticipantEntry));
  }, [intentLog, lastToastedSeq, participantSnapshotBefore, activeEncounter]);

  // Auto-dismiss toasts after TOAST_DISMISS_MS.
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

  // Mark toasts for an undone intent as undone (greys out the Undo button).
  useEffect(() => {
    const voidedIds = new Set(intentLog.filter((i) => i.voided).map((i) => i.id));
    setToasts((prev) =>
      prev.map((t) =>
        t.undoTargetId && voidedIds.has(t.undoTargetId) ? { ...t, undone: true } : t,
      ),
    );
  }, [intentLog]);

  // participant id → full Monster record (level for DetailPane chip, ability
  // list for the rollable ladder). Mirrors CombatRun.
  const monsterByParticipantId = useMemo(() => {
    const map = new Map<string, Monster>();
    if (!monsters.data || !activeEncounter) return map;
    for (const p of activeEncounter.participants) {
      if (!isParticipantEntry(p) || p.kind !== 'monster') continue;
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

  const handleSelect = useCallback((id: string) => setSelectedId(id), []);

  // Anyone whose turnOrder position is BEFORE the active participant has acted
  // this round. Falls back to "nobody has acted" when there's no active
  // participant (between rounds, or before round 1 starts).
  //
  // Must live ABOVE the guard-return block below — Rules of Hooks: every render
  // path must call the same hooks in the same order.
  const actedIds = useMemo(() => {
    const ids = new Set<string>();
    if (!activeEncounter) return ids;
    const { turnOrder, activeParticipantId } = activeEncounter;
    if (!activeParticipantId) return ids;
    const idx = turnOrder.indexOf(activeParticipantId);
    if (idx <= 0) return ids;
    for (let i = 0; i < idx; i++) ids.add(turnOrder[i]!);
    return ids;
  }, [activeEncounter]);

  // Phase 5 Pass 2a — role-asymmetric rendering.
  // Must live ABOVE guard-returns (Rules of Hooks).
  const isActingAsDirector = useIsActingAsDirector(campaignId);
  const viewerRole: 'director' | 'player' = isActingAsDirector ? 'director' : 'player';
  const selfParticipantId = useMemo(() => {
    return (
      (activeEncounter?.participants ?? []).find(
        (p) => isParticipantEntry(p) && p.kind === 'pc' && 'ownerId' in p && p.ownerId === me.data?.user.id,
      )?.id ?? null
    );
  }, [activeEncounter, me.data?.user.id]);
  const [targetParticipantId, setTargetParticipantId] = useState<string | null>(null);
  // setTargetParticipantId is wired in Task 23; referenced here to satisfy
  // the linter. The state IS consumed via the prop passed to the rails.
  void setTargetParticipantId;

  // ── header guards ─────────────────────────────────────────────────────────
  if (me.isLoading || campaign.isLoading) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <p className="text-text-mute">Loading…</p>
      </main>
    );
  }
  if (!me.data) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <p className="text-text-mute">
          Not signed in.{' '}
          <Link to="/" className="underline">
            Go home
          </Link>
          .
        </p>
      </main>
    );
  }
  if (campaign.error || !campaign.data) {
    return (
      <main className="mx-auto max-w-6xl p-6 space-y-2">
        <p className="text-foe">
          {(campaign.error as Error)?.message ?? 'Campaign not found.'}
        </p>
        <Link to="/" className="underline text-text-dim">
          Back home
        </Link>
      </main>
    );
  }

  const actor = {
    userId: me.data.user.id,
    role: (campaign.data.isDirector ? 'director' : 'player') as 'director' | 'player',
  };
  const participants: Participant[] = (activeEncounter?.participants ?? []).filter(
    isParticipantEntry,
  );
  const heroes = participants.filter((p) => p.kind === 'pc');
  const liveFoes = participants.filter((p) => p.kind === 'monster' && p.currentStamina > 0);
  const defeatedCount = participants.filter(
    (p) => p.kind === 'monster' && p.currentStamina <= 0,
  ).length;

  const round = activeEncounter?.currentRound ?? 0;
  const malice = activeEncounter?.malice.current ?? 0;
  // Victories aren't tracked on the encounter — we surface the party total,
  // which is what the Director cares about for canonical Respite math.
  const victories = heroes.reduce((sum, p) => sum + (p.victories ?? 0), 0);

  const focused = participants.find((p) => p.id === selectedId) ?? null;
  const isAtTurnEnd =
    !!activeEncounter &&
    activeEncounter.currentRound !== null &&
    activeEncounter.activeParticipantId === null;
  const undoable = findLatestUndoable(intentLog);
  const wsClosed = status !== 'open';
  const disabled = wsClosed;

  // Header breadcrumb labels. We have campaign name; session/encounter labels
  // aren't materialized as friendly strings on the WS mirror, so we fall back
  // to the encounter id chunk (e.g. "enc_…").
  const campaignName = campaign.data.name;
  // No session label is plumbed through; once Epic 2E names sessions, swap to
  // the live label.
  const sessionLabel: string | null = null;
  const encounterLabel = activeEncounter?.encounterId
    ? truncateId(activeEncounter.encounterId)
    : null;

  const send = (type: string, payload: unknown): boolean =>
    dispatch(buildIntent({ campaignId, type, payload, actor }));

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
    setParticipantSnapshotBefore(participants);
    if (!args.ability.powerRoll) return;
    const characteristic = characteristicForAbility(args.ability);
    const ladder = buildLadder(args.ability.powerRoll, args.attacker.id);
    const payload: RollPowerPayload = {
      abilityId: abilityIdFor(args.attacker, args.ability),
      attackerId: args.attacker.id,
      targetIds: [args.target.id],
      characteristic,
      edges: 0,
      banes: 0,
      rolls: { d10: args.rolls },
      ladder,
      abilityKeywords: args.ability.keywords ?? [],
      abilityType: args.ability.type,
    };
    const intent: Intent = buildIntent({
      campaignId,
      type: IntentTypes.RollPower,
      payload,
      actor,
    });
    intent.source = args.source === 'manual' ? 'manual' : 'auto';
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

  // ── empty / pre-round states (no SplitPane yet) ───────────────────────────
  if (!activeEncounter) {
    return (
      <main className="min-h-screen px-3 sm:px-4 lg:px-6 py-3 sm:py-4 max-w-[1600px] mx-auto">
        <InlineHeader
          campaignName={campaignName}
          sessionLabel={sessionLabel}
          encounterLabel={null}
          round={null}
          victories={victories}
          malice={null}
          campaignId={campaignId}
          status={status}
          canUndo={false}
          isAtTurnEnd={false}
          hasEncounter={false}
          onStartRound={handleStartRound}
          onEndTurn={handleEndTurn}
          onEndRound={handleEndRound}
          onUndo={handleUndoHeader}
          onMaliceGain={() => dispatchGainMalice(1)}
          onMaliceSpend={() => dispatchSpendMalice(1)}
          onEndEncounter={handleEndEncounter}
        />
        <section className="mt-6 border border-dashed border-line p-6 text-center">
          <p className="text-sm text-text-dim">No encounter yet.</p>
          <p className="text-xs text-text-mute mt-1">
            Build one first —{' '}
            <Link
              to="/campaigns/$id/build"
              params={{ id: campaignId }}
              className="underline text-text-dim hover:text-text"
            >
              Build encounter
            </Link>
            .
          </p>
        </section>
        <ToastStack toasts={toasts} onUndo={handleToastUndo} onDismiss={handleToastDismiss} />
      </main>
    );
  }

  if (activeEncounter.currentRound === null) {
    return (
      <main className="min-h-screen px-3 sm:px-4 lg:px-6 py-3 sm:py-4 max-w-[1600px] mx-auto">
        <InlineHeader
          campaignName={campaignName}
          sessionLabel={sessionLabel}
          encounterLabel={encounterLabel}
          round={null}
          victories={victories}
          malice={malice}
          campaignId={campaignId}
          status={status}
          canUndo={!!undoable && !wsClosed}
          isAtTurnEnd={false}
          hasEncounter={true}
          onStartRound={handleStartRound}
          onEndTurn={handleEndTurn}
          onEndRound={handleEndRound}
          onUndo={handleUndoHeader}
          onMaliceGain={() => dispatchGainMalice(1)}
          onMaliceSpend={() => dispatchSpendMalice(1)}
          onEndEncounter={handleEndEncounter}
        />
        <section className="mt-6 border border-line bg-ink-1 p-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-text-dim">Encounter built, round not started.</p>
            <p className="text-xs text-text-mute mt-1">
              {activeEncounter.participants.length} participant
              {activeEncounter.participants.length === 1 ? '' : 's'}.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            onClick={handleStartRound}
            disabled={wsClosed}
            className="min-h-11 px-4"
          >
            Start round 1
          </Button>
        </section>
        <ToastStack toasts={toasts} onUndo={handleToastUndo} onDismiss={handleToastDismiss} />
      </main>
    );
  }

  // ── live encounter — SplitPane layout ─────────────────────────────────────
  // Layout note: main is min-h-screen, NOT h-screen, so the below-fold
  // PlayerSheetPanel + OpenActionsList can extend the page and scroll the
  // window naturally. The SplitPane gets a min-h so the rails always have
  // room even when the below-fold panels are tall.
  return (
    <main className="min-h-screen flex flex-col">
      <InlineHeader
        campaignName={campaignName}
        sessionLabel={sessionLabel}
        encounterLabel={encounterLabel}
        round={round}
        victories={victories}
        malice={malice}
        campaignId={campaignId}
        status={status}
        canUndo={!!undoable && !wsClosed}
        isAtTurnEnd={isAtTurnEnd}
        hasEncounter={true}
        onStartRound={handleStartRound}
        onEndTurn={handleEndTurn}
        onEndRound={handleEndRound}
        onUndo={handleUndoHeader}
        onMaliceGain={() => dispatchGainMalice(1)}
        onMaliceSpend={() => dispatchSpendMalice(1)}
        onEndEncounter={handleEndEncounter}
      />

      <SplitPane
        ratio="1.18fr 1fr"
        gap={14}
        className="min-h-[calc(100vh-3rem)] p-3.5"
        left={
          <>
            <PartyRail
              heroes={heroes}
              activeParticipantId={activeEncounter.activeParticipantId}
              selectedParticipantId={selectedId}
              onSelect={handleSelect}
              actedIds={actedIds}
              viewerRole={viewerRole}
              selfParticipantId={selfParticipantId}
              targetParticipantId={targetParticipantId}
            />
            <EncounterRail
              foes={liveFoes}
              defeatedCount={defeatedCount}
              activeParticipantId={activeEncounter.activeParticipantId}
              selectedParticipantId={selectedId}
              onSelect={handleSelect}
              viewerRole={viewerRole}
              selfParticipantId={selfParticipantId}
              targetParticipantId={targetParticipantId}
            />
          </>
        }
        right={
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
        }
      />

      {/* Below-fold panels: player sheet (for owning player) and open-actions
          queue. These don't fit the rails/detail SplitPane but CombatRun
          rendered them in-flow, so we keep them visible to preserve parity. */}
      <div className="px-3.5 pb-3.5 space-y-3">
        <PlayerSheetPanel campaignId={campaignId} />
        <section className="border border-line bg-ink-1 p-3.5">
          <OpenActionsList
            openActions={openActions}
            currentUserId={me.data.user.id}
            activeDirectorId={activeDirectorId ?? campaign.data.activeDirectorId ?? ''}
            participantOwnerLookup={(pid) => {
              const p = activeEncounter.participants.find(
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

      <ToastStack toasts={toasts} onUndo={handleToastUndo} onDismiss={handleToastDismiss} />
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Ability → RollPower helpers (ported verbatim from CombatRun)
// ──────────────────────────────────────────────────────────────────────────

function abilityIdFor(attacker: Participant, ability: Ability): string {
  const slug = ability.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = attacker.id.replace(/-instance-\d+$/, '');
  return `${base}:${slug}`;
}

function characteristicForAbility(_ability: Ability): Characteristic {
  return 'might';
}

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

// Friendly truncation for the encounter id breadcrumb. Encounter ids are
// long ULIDs; show only the last 6 chars so the breadcrumb stays scannable.
function truncateId(id: string): string {
  return id.length > 8 ? `…${id.slice(-6)}` : id;
}
