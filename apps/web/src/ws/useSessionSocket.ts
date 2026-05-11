import {
  type ApplyDamagePayload,
  type ApplyHealPayload,
  type BringCharacterIntoEncounterPayload,
  type ConditionInstance,
  type EndTurnPayload,
  type GainMalicePayload,
  type GainResourcePayload,
  type Intent,
  IntentTypes,
  type MaliceState,
  type Member,
  type Participant,
  type RemoveConditionPayload,
  type ResourceRef,
  type RollPowerPayload,
  ServerMsgSchema,
  type SetConditionPayload,
  type SetResourcePayload,
  type SetStaminaPayload,
  type SpendMalicePayload,
  type SpendRecoveryPayload,
  type SpendResourcePayload,
  type SpendSurgePayload,
  type StartEncounterPayload,
  type StartTurnPayload,
} from '@ironyard/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export type ActiveEncounter = {
  encounterId: string;
  participants: Participant[];
  // Slice 11 mirror additions — surface the live turn state for the play screen.
  currentRound: number | null;
  turnOrder: string[];
  activeParticipantId: string | null;
  // Slice 7 mirror addition — Director's Malice (canon §5.5).
  malice: MaliceState;
};

// Compact intent-log entry. Just enough for the play screen to drive toasts,
// the Undo header button, and the per-toast Undo affordance. The full intent
// log lives in D1; this is the slice-11-scoped mirror.
export type MirrorIntent = {
  id: string;
  seq: number;
  type: string;
  payload: unknown;
  actor: Intent['actor'];
  source: Intent['source'];
  causedBy?: string;
  voided: boolean;
};

// Slice-11 mini-reducer. Reflects the intent types the combat run screen needs
// to display HP, conditions, and turn state. The real client-side reducer
// (a peer of @ironyard/rules' applyIntent) lands in a later slice; do not
// extend this beyond what the combat screen needs. Server-side `snapshot`
// envelopes (sent after Undo) replace the mirror wholesale — this function
// only handles incremental `applied` envelopes.
function reflect(
  prev: ActiveEncounter | null,
  type: string,
  payload: unknown,
): ActiveEncounter | null {
  if (type === IntentTypes.StartEncounter) {
    const { encounterId } = payload as StartEncounterPayload;
    // The reducer generates the canonical id; client-side mirror uses the
    // optimistic suggestion if present, otherwise empty until the snapshot
    // catches up.
    return {
      encounterId: encounterId ?? '',
      participants: [],
      currentRound: null,
      turnOrder: [],
      activeParticipantId: null,
      malice: { current: 0, lastMaliciousStrikeRound: null },
    };
  }
  if (type === IntentTypes.EndEncounter) {
    return null;
  }
  if (!prev) return prev;

  if (type === IntentTypes.BringCharacterIntoEncounter) {
    const { participant } = payload as BringCharacterIntoEncounterPayload;
    if (prev.participants.some((p) => p.id === participant.id)) return prev;
    return {
      ...prev,
      participants: [...prev.participants, participant],
      // Default insertion-order initiative when no SetInitiative has run.
      turnOrder: prev.turnOrder.includes(participant.id)
        ? prev.turnOrder
        : [...prev.turnOrder, participant.id],
    };
  }

  if (type === IntentTypes.StartRound) {
    const next = (prev.currentRound ?? 0) + 1;
    return {
      ...prev,
      currentRound: next,
      activeParticipantId: prev.turnOrder[0] ?? null,
    };
  }

  if (type === IntentTypes.EndRound) {
    return {
      ...prev,
      activeParticipantId: null,
    };
  }

  if (type === IntentTypes.StartTurn) {
    const { participantId } = payload as StartTurnPayload;
    return { ...prev, activeParticipantId: participantId };
  }

  if (type === IntentTypes.EndTurn) {
    // EndTurn payload is empty per the schema; advance to next in turnOrder.
    void (payload as EndTurnPayload);
    const idx =
      prev.activeParticipantId === null ? -1 : prev.turnOrder.indexOf(prev.activeParticipantId);
    const nextId = idx >= 0 && idx + 1 < prev.turnOrder.length ? prev.turnOrder[idx + 1] : null;
    return { ...prev, activeParticipantId: nextId ?? null };
  }

  if (type === IntentTypes.ApplyDamage) {
    const { targetId, amount } = payload as ApplyDamagePayload;
    return {
      ...prev,
      participants: prev.participants.map((p) =>
        p.id === targetId ? { ...p, currentStamina: Math.max(0, p.currentStamina - amount) } : p,
      ),
    };
  }

  if (type === IntentTypes.SetCondition) {
    const data = payload as SetConditionPayload;
    return {
      ...prev,
      participants: prev.participants.map((p) => {
        if (p.id !== data.targetId) return p;
        // Idempotent on same {type, source.id}, otherwise append. The real
        // reducer enforces canon §3.4 stacking; the mirror just deduplicates.
        const exists = p.conditions.some(
          (c) => c.type === data.condition && c.source.id === data.source.id,
        );
        if (exists) return p;
        const newCondition: ConditionInstance = {
          type: data.condition,
          source: data.source,
          duration: data.duration,
          appliedAtSeq: 0,
          removable: true,
        };
        return { ...p, conditions: [...p.conditions, newCondition] };
      }),
    };
  }

  if (type === IntentTypes.RemoveCondition) {
    const data = payload as RemoveConditionPayload;
    return {
      ...prev,
      participants: prev.participants.map((p) =>
        p.id === data.targetId
          ? { ...p, conditions: p.conditions.filter((c) => c.type !== data.condition) }
          : p,
      ),
    };
  }

  if (type === IntentTypes.SetStamina) {
    const { participantId, currentStamina, maxStamina } = payload as SetStaminaPayload;
    return {
      ...prev,
      participants: prev.participants.map((p) => {
        if (p.id !== participantId) return p;
        const nextMax = maxStamina ?? p.maxStamina;
        const nextCurrent = currentStamina ?? Math.min(p.currentStamina, nextMax);
        return { ...p, currentStamina: nextCurrent, maxStamina: nextMax };
      }),
    };
  }

  if (type === IntentTypes.ApplyHeal) {
    const { targetId, amount } = payload as ApplyHealPayload;
    return {
      ...prev,
      participants: prev.participants.map((p) =>
        p.id === targetId
          ? { ...p, currentStamina: Math.min(p.maxStamina, p.currentStamina + amount) }
          : p,
      ),
    };
  }

  if (type === IntentTypes.SpendRecovery) {
    const { participantId } = payload as SpendRecoveryPayload;
    // Only decrement recoveries.current here; the engine emits a derived
    // ApplyHeal for the actual HP restoration which the ApplyHeal branch
    // handles when it arrives in the broadcast stream.
    return {
      ...prev,
      participants: prev.participants.map((p) =>
        p.id === participantId
          ? {
              ...p,
              recoveries: { ...p.recoveries, current: Math.max(0, p.recoveries.current - 1) },
            }
          : p,
      ),
    };
  }

  if (type === IntentTypes.SpendSurge) {
    const { participantId, count } = payload as SpendSurgePayload;
    return {
      ...prev,
      participants: prev.participants.map((p) =>
        p.id === participantId ? { ...p, surges: Math.max(0, p.surges - count) } : p,
      ),
    };
  }

  if (
    type === IntentTypes.GainResource ||
    type === IntentTypes.SpendResource ||
    type === IntentTypes.SetResource
  ) {
    return {
      ...prev,
      participants: prev.participants.map((p) => applyResourceMirror(p, type, payload)),
    };
  }

  if (type === IntentTypes.GainMalice) {
    const { amount } = payload as GainMalicePayload;
    return {
      ...prev,
      malice: { ...prev.malice, current: prev.malice.current + amount },
    };
  }

  if (type === IntentTypes.SpendMalice) {
    const { amount } = payload as SpendMalicePayload;
    return {
      ...prev,
      malice: { ...prev.malice, current: prev.malice.current - amount },
    };
  }

  // RollPower advances state seq in the engine but produces no participant
  // mutation on its own — its derived ApplyDamage is what moves HP. Toast
  // attribution leans on the parent RollPower being in the intent log though,
  // so we record it (handled outside this function in the caller).
  void (payload as RollPowerPayload | undefined);

  return prev;
}

// Slice 7 mirror helper. Mutates the heroic / extras resource arrays on a
// single participant for Gain / Spend / SetResource. The engine validates
// floors and maxes; the mirror tracks the resulting value optimistically. The
// reducer remains the source of truth — if these diverge, the next `snapshot`
// envelope replaces the mirror wholesale.
function applyResourceMirror(p: Participant, type: string, payload: unknown): Participant {
  if (type === IntentTypes.GainResource) {
    const { participantId, name, amount } = payload as GainResourcePayload;
    if (p.id !== participantId) return p;
    return adjustResource(p, name, (instance) => {
      const next = instance.value + amount;
      const capped = instance.max !== undefined ? Math.min(next, instance.max) : next;
      return Math.max(instance.floor, capped);
    });
  }
  if (type === IntentTypes.SpendResource) {
    const { participantId, name, amount } = payload as SpendResourcePayload;
    if (p.id !== participantId) return p;
    return adjustResource(p, name, (instance) => Math.max(instance.floor, instance.value - amount));
  }
  if (type === IntentTypes.SetResource) {
    const { participantId, name, value, initialize } = payload as SetResourcePayload;
    if (p.id !== participantId) return p;
    return upsertResource(p, name, value, initialize);
  }
  return p;
}

function adjustHeroicValue(
  p: Participant,
  name: Participant['heroicResources'][number]['name'],
  computeValue: (instance: Participant['heroicResources'][number]) => number,
): Participant {
  return {
    ...p,
    heroicResources: p.heroicResources.map((r) =>
      r.name === name ? { ...r, value: computeValue(r) } : r,
    ),
  };
}

function adjustExtraValue(
  p: Participant,
  name: string,
  computeValue: (instance: Participant['extras'][number]) => number,
): Participant {
  return {
    ...p,
    extras: p.extras.map((r) => (r.name === name ? { ...r, value: computeValue(r) } : r)),
  };
}

function adjustResource(
  p: Participant,
  ref: ResourceRef,
  computeValue: (instance: { value: number; max?: number; floor: number }) => number,
): Participant {
  if (typeof ref === 'string') return adjustHeroicValue(p, ref, computeValue);
  return adjustExtraValue(p, ref.extra, computeValue);
}

function upsertResource(
  p: Participant,
  ref: ResourceRef,
  value: number,
  initialize?: { max?: number; floor?: number },
): Participant {
  if (typeof ref === 'string') {
    if (p.heroicResources.some((r) => r.name === ref)) {
      return adjustHeroicValue(p, ref, () => value);
    }
    return {
      ...p,
      heroicResources: [
        ...p.heroicResources,
        { name: ref, value, max: initialize?.max, floor: initialize?.floor ?? 0 },
      ],
    };
  }
  const name = ref.extra;
  if (p.extras.some((r) => r.name === name)) {
    return adjustExtraValue(p, name, () => value);
  }
  return {
    ...p,
    extras: [...p.extras, { name, value, max: initialize?.max, floor: initialize?.floor ?? 0 }],
  };
}

// Coerce a server-broadcast snapshot (`unknown` on the wire per wire.ts) into
// an ActiveEncounter, with light shape validation. Returns null on any shape
// mismatch — caller treats null as "no encounter to restore."
function snapshotToEncounter(state: unknown): ActiveEncounter | null {
  if (!state || typeof state !== 'object') return null;
  const s = state as { encounter?: unknown };
  const e = s.encounter;
  if (!e || typeof e !== 'object') return null;
  const enc = e as {
    id?: string;
    participants?: Participant[];
    currentRound?: number | null;
    turnOrder?: string[];
    activeParticipantId?: string | null;
    malice?: MaliceState;
  };
  if (typeof enc.id !== 'string' || !Array.isArray(enc.participants)) return null;
  return {
    encounterId: enc.id,
    participants: enc.participants,
    currentRound: enc.currentRound ?? null,
    turnOrder: enc.turnOrder ?? [],
    activeParticipantId: enc.activeParticipantId ?? null,
    malice: enc.malice ?? { current: 0, lastMaliciousStrikeRound: null },
  };
}

export function useSessionSocket(sessionId: string | undefined) {
  const [members, setMembers] = useState<Member[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [activeEncounter, setActiveEncounter] = useState<ActiveEncounter | null>(null);
  const [intentLog, setIntentLog] = useState<MirrorIntent[]>([]);
  const [lastSeq, setLastSeq] = useState<number>(0);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/api/campaigns/${sessionId}/socket`);
    wsRef.current = ws;
    setStatus('connecting');
    setActiveEncounter(null);
    setIntentLog([]);
    setLastSeq(0);

    ws.onopen = () => {
      setStatus('open');
      // Replay the intent log so the page reflects pre-existing encounter state
      // (e.g. after a page reload). The DO streams matching `applied` envelopes
      // which feed the mini-reducer below.
      ws.send(JSON.stringify({ kind: 'sync', sinceSeq: 0 }));
    };
    ws.onclose = () => setStatus('closed');
    ws.onerror = () => setStatus('closed');

    ws.onmessage = (event) => {
      let raw: unknown;
      try {
        raw = JSON.parse(event.data);
      } catch {
        return;
      }
      const result = ServerMsgSchema.safeParse(raw);
      if (!result.success) return;
      const msg = result.data;
      if (msg.kind === 'member_list') {
        setMembers(msg.members);
      } else if (msg.kind === 'member_joined') {
        setMembers((prev) => {
          const without = prev.filter((m) => m.userId !== msg.member.userId);
          return [...without, msg.member];
        });
      } else if (msg.kind === 'member_left') {
        setMembers((prev) => prev.filter((m) => m.userId !== msg.member.userId));
      } else if (msg.kind === 'applied') {
        setActiveEncounter((prev) => reflect(prev, msg.intent.type, msg.intent.payload));
        setIntentLog((prev) => [
          ...prev,
          {
            id: msg.intent.id,
            seq: msg.seq,
            type: msg.intent.type,
            payload: msg.intent.payload,
            actor: msg.intent.actor,
            source: msg.intent.source,
            causedBy: msg.intent.causedBy,
            voided: false,
          },
        ]);
        setLastSeq(msg.seq);
      } else if (msg.kind === 'snapshot') {
        // Sent after Undo (and possibly future server-pushed resets). Replace
        // the mirror wholesale rather than reconciling per-intent.
        setActiveEncounter(snapshotToEncounter(msg.state));
        setLastSeq(msg.seq);
        // The intent log can't be perfectly reconstructed from a snapshot,
        // but we can mark everything past the snapshot seq as voided so the
        // Undo button + toasts don't try to undo a now-voided intent.
        setIntentLog((prev) => prev.map((i) => (i.seq > msg.seq ? { ...i, voided: true } : i)));
      }
    };

    return () => {
      wsRef.current = null;
      ws.close();
    };
  }, [sessionId]);

  const dispatch = useCallback((intent: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ kind: 'dispatch', intent }));
    return true;
  }, []);

  return { members, status, activeEncounter, dispatch, intentLog, lastSeq };
}
