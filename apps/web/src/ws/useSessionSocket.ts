import {
  type AddMonsterPayload,
  type AdjustVictoriesPayload,
  type ApplyDamagePayload,
  type ApplyHealPayload,
  type ConditionInstance,
  type EndTurnPayload,
  type GainHeroTokenPayload,
  type GainMalicePayload,
  type GainResourcePayload,
  type Intent,
  IntentTypes,
  type LoadEncounterTemplatePayload,
  type MaliceState,
  type MarkActionUsedPayload,
  type MarkSurprisedPayload,
  type Member,
  type Monster,
  type OpenAction,
  type Participant,
  type PickNextActorPayload,
  type RemoveConditionPayload,
  type RemoveParticipantPayload,
  type ResourceRef,
  type RollInitiativePayload,
  type RollPowerPayload,
  ServerMsgSchema,
  type SetConditionPayload,
  type SetResourcePayload,
  type SetStaminaPayload,
  type SpendHeroTokenPayload,
  type SpendMalicePayload,
  type SpendRecoveryPayload,
  type SpendResourcePayload,
  type SpendSurgePayload,
  type StartEncounterPayload,
  type StartSessionPayload,
  type StartTurnPayload,
  type UpdateSessionAttendancePayload,
  ulid,
} from '@ironyard/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

// Character-mutating intents whose `applied` envelope should invalidate the
// `['character', id]` TanStack Query — the D1-backed character row is the
// source of truth for fields the WS mirror doesn't carry (kitId, inventory,
// equipped flags, max stamina derivation). Keeping this set narrow avoids
// over-invalidating; future intents (UseConsumable, PushItem, Respite that
// touches Wyrmplate, etc.) get added when they ship.
const CHARACTER_MUTATING_INTENTS: ReadonlySet<string> = new Set<string>([
  IntentTypes.EquipItem,
  IntentTypes.UnequipItem,
  IntentTypes.SwapKit,
  IntentTypes.UseConsumable,
  IntentTypes.PushItem,
  IntentTypes.Respite,
]);

// Intents that write to the campaign_characters D1 table (pending/approved
// roster). Invalidate the campaign-characters query cache on applied so the
// lobby screens reflect the DO side-effect without a manual page refresh.
const CAMPAIGN_MEMBERSHIP_INTENTS: ReadonlySet<string> = new Set<string>([
  IntentTypes.SubmitCharacter,
  IntentTypes.ApproveCharacter,
  IntentTypes.DenyCharacter,
  IntentTypes.RemoveApprovedCharacter,
]);

// Payload shape we duck-type-check for a character id to invalidate. Most
// character-mutating intents key on `characterId`; PushItem (Epic 2C Slice 3)
// uses `targetCharacterId` because it's director-initiated against another
// user's character — we fall back to that field when `characterId` is absent.
function characterIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as { characterId?: unknown; targetCharacterId?: unknown };
  const id = obj.characterId ?? obj.targetCharacterId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export type RosterEntry = Participant;

export function isParticipantEntry(e: RosterEntry): e is Participant {
  return e.kind === 'pc' || e.kind === 'monster';
}

export type ActiveEncounter = {
  encounterId: string;
  participants: RosterEntry[];
  currentRound: number | null;
  activeParticipantId: string | null;
  firstSide: 'heroes' | 'foes' | null;
  currentPickingSide: 'heroes' | 'foes' | null;
  actedThisRound: string[];
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
      activeParticipantId: null,
      firstSide: null,
      currentPickingSide: null,
      actedThisRound: [],
      malice: { current: 0, lastMaliciousStrikeRound: null },
    };
  }
  if (type === IntentTypes.EndEncounter) {
    return null;
  }
  if (!prev) return prev;

  if (type === IntentTypes.AddMonster) {
    // The DO stamps the full Monster blob onto the payload before broadcast;
    // we synthesize Participants matching the reducer's behaviour (see
    // packages/rules/src/intents/add-monster.ts `participantFromMonster`).
    const { quantity, nameOverride, monster } = payload as AddMonsterPayload;
    const baseName = nameOverride ?? monster.name;
    // Mirror the reducer's ID convention so CombatRun can reverse-look up
    // monster abilities by stripping `-instance-N` from the participant id.
    const existingCount = prev.participants.filter(
      (p) => isParticipantEntry(p) && p.id.startsWith(`${monster.id}-instance-`),
    ).length;
    const newParticipants: Participant[] = Array.from({ length: quantity }).map((_, i) => {
      const suffix = quantity > 1 ? ` ${i + 1}` : '';
      return participantFromMonsterClient(monster, {
        id: `${monster.id}-instance-${existingCount + i + 1}`,
        name: `${baseName}${suffix}`,
      });
    });
    return { ...prev, participants: [...prev.participants, ...newParticipants] };
  }

  if (type === IntentTypes.LoadEncounterTemplate) {
    // LoadEncounterTemplate is a fan-out intent: the reducer emits a derived
    // AddMonster per entry. The DO re-feeds those derived intents and the
    // socket receives one `applied` envelope per AddMonster, which the
    // AddMonster branch above handles. So the mirror has nothing to do here.
    // (Acknowledge the payload for type-checking.)
    void (payload as LoadEncounterTemplatePayload);
    return prev;
  }

  if (type === IntentTypes.RemoveParticipant) {
    const { participantId } = payload as RemoveParticipantPayload;
    return {
      ...prev,
      participants: prev.participants.filter(
        (p) => !isParticipantEntry(p) || p.id !== participantId,
      ),
    };
  }

  if (type === IntentTypes.StartRound) {
    const next = (prev.currentRound ?? 0) + 1;
    return {
      ...prev,
      currentRound: next,
      currentPickingSide: prev.firstSide,
      actedThisRound: [],
      activeParticipantId: null,
      // Mirror engine's per-round slot reset (see applyStartRound) so the
      // Turn-flow UI doesn't render stale "used" pips on round 2+ before
      // each participant's own StartTurn fires.
      participants: prev.participants.map((p) =>
        isParticipantEntry(p)
          ? { ...p, turnActionUsage: { main: false, maneuver: false, move: false } }
          : p,
      ),
    };
  }

  if (type === IntentTypes.EndRound) {
    const wasRoundOne = prev.currentRound === 1;
    return {
      ...prev,
      activeParticipantId: null,
      participants: wasRoundOne
        ? prev.participants.map((p) =>
            isParticipantEntry(p) && p.surprised ? { ...p, surprised: false } : p,
          )
        : prev.participants,
    };
  }

  if (type === IntentTypes.StartTurn) {
    const { participantId } = payload as StartTurnPayload;
    return { ...prev, activeParticipantId: participantId };
  }

  if (type === IntentTypes.EndTurn) {
    void (payload as EndTurnPayload);
    // The ending participant joins actedThisRound here (canon § 4.1 — they're
    // "done" when their turn ends). Then derive next picking side from the
    // updated acted set + side membership.
    const endingId = prev.activeParticipantId;
    const nextActed =
      endingId && !prev.actedThisRound.includes(endingId)
        ? [...prev.actedThisRound, endingId]
        : prev.actedThisRound;
    const acted = new Set(nextActed);
    let unactedHeroes = 0;
    let unactedFoes = 0;
    for (const p of prev.participants) {
      if (!isParticipantEntry(p) || acted.has(p.id)) continue;
      if (p.kind === 'pc') unactedHeroes++;
      else unactedFoes++;
    }
    let next: 'heroes' | 'foes' | null;
    if (unactedHeroes === 0 && unactedFoes === 0) next = null;
    else if (unactedHeroes === 0) next = 'foes';
    else if (unactedFoes === 0) next = 'heroes';
    else next = prev.currentPickingSide === 'heroes' ? 'foes' : 'heroes';
    return {
      ...prev,
      activeParticipantId: null,
      actedThisRound: nextActed,
      currentPickingSide: next,
    };
  }

  if (type === IntentTypes.RollInitiative) {
    const { winner, surprised } = payload as RollInitiativePayload;
    return {
      ...prev,
      firstSide: winner,
      currentPickingSide: winner,
      actedThisRound: [],
      participants: prev.participants.map((p) =>
        isParticipantEntry(p) && surprised.includes(p.id) ? { ...p, surprised: true } : p,
      ),
    };
  }

  if (type === IntentTypes.PickNextActor) {
    const { participantId } = payload as PickNextActorPayload;
    return {
      ...prev,
      activeParticipantId: participantId,
    };
  }

  if (type === IntentTypes.MarkSurprised) {
    const { participantId, surprised } = payload as MarkSurprisedPayload;
    return {
      ...prev,
      participants: prev.participants.map((p) =>
        isParticipantEntry(p) && p.id === participantId ? { ...p, surprised } : p,
      ),
    };
  }

  if (type === IntentTypes.ApplyDamage) {
    const { targetId, amount } = payload as ApplyDamagePayload;
    return {
      ...prev,
      participants: prev.participants.map((p) =>
        isParticipantEntry(p) && p.id === targetId
          ? { ...p, currentStamina: Math.max(0, p.currentStamina - amount) }
          : p,
      ),
    };
  }

  if (type === IntentTypes.SetCondition) {
    const data = payload as SetConditionPayload;
    return {
      ...prev,
      participants: prev.participants.map((p) => {
        if (!isParticipantEntry(p) || p.id !== data.targetId) return p;
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
        isParticipantEntry(p) && p.id === data.targetId
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
        if (!isParticipantEntry(p) || p.id !== participantId) return p;
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
        isParticipantEntry(p) && p.id === targetId
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
        isParticipantEntry(p) && p.id === participantId
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
        isParticipantEntry(p) && p.id === participantId
          ? { ...p, surges: Math.max(0, p.surges - count) }
          : p,
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
      participants: prev.participants.map((p) =>
        isParticipantEntry(p) ? applyResourceMirror(p, type, payload) : p,
      ),
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

  if (type === IntentTypes.AdjustVictories) {
    const { delta } = payload as AdjustVictoriesPayload;
    return {
      ...prev,
      participants: prev.participants.map((p) =>
        isParticipantEntry(p) && p.kind === 'pc'
          ? { ...p, victories: Math.max(0, (p.victories ?? 0) + delta) }
          : p,
      ),
    };
  }

  if (type === IntentTypes.MarkActionUsed) {
    const { participantId, slot, used } = payload as MarkActionUsedPayload;
    return {
      ...prev,
      participants: prev.participants.map((p) => {
        if (!isParticipantEntry(p) || p.id !== participantId) return p;
        const usage = p.turnActionUsage ?? { main: false, maneuver: false, move: false };
        return { ...p, turnActionUsage: { ...usage, [slot]: used } };
      }),
    };
  }

  // RollPower advances state seq in the engine but produces no participant
  // mutation on its own — its derived ApplyDamage is what moves HP. Toast
  // attribution leans on the parent RollPower being in the intent log though,
  // so we record it (handled outside this function in the caller).
  void (payload as RollPowerPayload | undefined);

  return prev;
}

// Mirror of `participantFromMonster` in packages/rules/src/intents/add-monster.ts.
// The DO stamps the full Monster blob onto the AddMonster payload before
// broadcasting `applied`; the client constructs the participant locally with a
// fresh ulid (one per quantity unit) so the optimistic mirror picks up the new
// rows immediately. The server's authoritative ids will replace these on the
// next snapshot — toasts and HP edits within the same connection lifetime
// don't survive the swap, but for builder-grade actions (add/remove monsters)
// this is fine: the builder list re-renders from `participants` on every applied.
function participantFromMonsterClient(
  monster: Monster,
  opts: { id: string; name: string },
): Participant {
  return {
    id: opts.id,
    name: opts.name,
    kind: 'monster',
    level: monster.level,
    currentStamina: monster.stamina.base,
    maxStamina: monster.stamina.base,
    characteristics: monster.characteristics,
    immunities: monster.immunities,
    weaknesses: monster.weaknesses,
    conditions: [],
    heroicResources: [],
    extras: [],
    surges: 0,
    recoveries: { current: 0, max: 0 },
    recoveryValue: 0,
    ownerId: null,
    characterId: null,
    weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
    activeAbilities: [],
    victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false },
    surprised: false,
    role: monster.roles[0] ?? null,
    ancestry: monster.ancestry,
    size: monster.size,
    speed: monster.speed,
    stability: monster.stability,
    freeStrike: monster.freeStrike,
    ev: monster.ev.ev,
    withCaptain: null,
    className: null,
  };
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
//
// New CampaignState shape: participants are at the top level, encounter is a
// separate phase object (or null when no encounter is active).
function snapshotToEncounter(state: unknown): ActiveEncounter | null {
  if (!state || typeof state !== 'object') return null;
  const s = state as {
    encounter?: unknown;
    participants?: RosterEntry[];
  };

  const topParticipants = Array.isArray(s.participants)
    ? (s.participants as RosterEntry[]).filter(
        (p): p is Participant => p.kind === 'pc' || p.kind === 'monster',
      )
    : null;

  const e = s.encounter;
  if (!e || typeof e !== 'object') return null;

  const enc = e as {
    id?: string;
    participants?: RosterEntry[];
    currentRound?: number | null;
    activeParticipantId?: string | null;
    firstSide?: 'heroes' | 'foes' | null;
    currentPickingSide?: 'heroes' | 'foes' | null;
    actedThisRound?: string[];
    malice?: MaliceState;
  };

  if (typeof enc.id !== 'string') return null;

  const participants = topParticipants ?? enc.participants ?? [];

  return {
    encounterId: enc.id,
    participants,
    currentRound: enc.currentRound ?? null,
    activeParticipantId: enc.activeParticipantId ?? null,
    firstSide: enc.firstSide ?? null,
    currentPickingSide: enc.currentPickingSide ?? null,
    actedThisRound: enc.actedThisRound ?? [],
    malice: enc.malice ?? { current: 0, lastMaliciousStrikeRound: null },
  };
}

export function useSessionSocket(sessionId: string | undefined) {
  const qc = useQueryClient();
  const [members, setMembers] = useState<Member[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [activeEncounter, setActiveEncounter] = useState<ActiveEncounter | null>(null);
  const [intentLog, setIntentLog] = useState<MirrorIntent[]>([]);
  const [lastSeq, setLastSeq] = useState<number>(0);
  // Mirror of state.activeDirectorId — updated on every JumpBehindScreen applied
  // and replaced wholesale on snapshot. `null` until the first signal arrives;
  // callers should fall back to the HTTP-fetched campaign metadata.
  const [activeDirectorId, setActiveDirectorId] = useState<string | null>(null);
  // Session + hero-token mirror (Epic 2E). Populated from StartSession applied
  // envelopes and snapshot state; reset on EndSession and campaign change.
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [attendingCharacterIds, setAttendingCharacterIds] = useState<string[]>([]);
  const [heroTokens, setHeroTokens] = useState<number>(0);
  // Phase 2b.0 — lobby-visible Open Actions queue (claim or auto-expire).
  const [openActions, setOpenActions] = useState<OpenAction[]>([]);
  // Last server-side rejection. The DO emits `kind: 'rejected'` envelopes when
  // an intent fails stamper validation or reducer preconditions; the UI reads
  // this so callers can surface the reason instead of silently swallowing it.
  const [lastRejection, setLastRejection] = useState<{
    intentId: string;
    reason: string;
  } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Vite's http-proxy can't reliably hold a WebSocket upgrade against
    // wrangler's dev server, so in dev we bypass the proxy and talk to the
    // API worker directly.
    const host =
      window.location.port === '5173' ? `${window.location.hostname}:8787` : window.location.host;

    // Defer socket creation so React 18 StrictMode's discarded first mount
    // cancels the connection before it actually opens, rather than firing a
    // doomed handshake that logs a noisy "closed before established" error.
    let ws: WebSocket | null = null;
    let cancelled = false;
    const connectTimer = setTimeout(() => {
      if (cancelled) return;
      ws = new WebSocket(`${proto}//${host}/api/campaigns/${sessionId}/socket`);
      wsRef.current = ws;
      setStatus('connecting');
      setActiveEncounter(null);
      setIntentLog([]);
      setLastSeq(0);
      setActiveDirectorId(null);
      setCurrentSessionId(null);
      setAttendingCharacterIds([]);
      setHeroTokens(0);
      setOpenActions([]);
      setLastRejection(null);
      wireSocket(ws);
    }, 0);

    function wireSocket(socket: WebSocket) {
      socket.onopen = () => {
        setStatus('open');
        // The DO sends a `snapshot` on connect with the authoritative campaign
        // state (participants, encounter phase, etc.). No sync needed — the
        // snapshot populates activeEncounter correctly and new intents arrive
        // as `applied` envelopes from this point forward.
      };
      // Only flip status when this specific socket is the live one — a stale
      // close from a discarded StrictMode socket otherwise clobbers a healthy
      // `connecting`/`open` status on the live socket.
      socket.onclose = () => {
        if (wsRef.current === socket) setStatus('closed');
      };
      socket.onerror = () => {
        if (wsRef.current === socket) setStatus('closed');
      };

      socket.onmessage = (event) => {
        let raw: unknown;
        try {
          raw = JSON.parse(event.data);
        } catch {
          return;
        }
        const result = ServerMsgSchema.safeParse(raw);
        if (!result.success) return;
        const msg = result.data;
        if (msg.kind === 'rejected') {
          // Surface server-side rejection so the UI can display the reason
          // (e.g. "session_already_active", "unknown_character"). Without
          // this branch the rejection was silently dropped and the action
          // appeared to do nothing.
          setLastRejection({ intentId: msg.intentId, reason: msg.reason });
          return;
        }
        if (msg.kind === 'member_list') {
          // Deduplicate by userId — in dev StrictMode two sockets may briefly
          // be open at once, causing the same user to appear in the list twice.
          const seen = new Set<string>();
          setMembers(msg.members.filter((m) => (seen.has(m.userId) ? false : seen.add(m.userId))));
        } else if (msg.kind === 'member_joined') {
          setMembers((prev) => {
            const without = prev.filter((m) => m.userId !== msg.member.userId);
            return [...without, msg.member];
          });
        } else if (msg.kind === 'member_left') {
          setMembers((prev) => prev.filter((m) => m.userId !== msg.member.userId));
        } else if (msg.kind === 'applied') {
          setActiveEncounter((prev) => reflect(prev, msg.intent.type, msg.intent.payload));
          // JumpBehindScreen mutates state.activeDirectorId; mirror it locally so
          // the banner updates without a round-trip to the HTTP metadata endpoint.
          if (msg.intent.type === IntentTypes.JumpBehindScreen) {
            setActiveDirectorId(msg.intent.actor.userId);
          }
          // Session + hero-token intent mirrors (Epic 2E).
          if (msg.intent.type === IntentTypes.StartSession) {
            const payload = msg.intent.payload as StartSessionPayload;
            // Client-suggested sessionId is on the payload (see Task 3 schema,
            // used to keep optimistic mirror in sync without a snapshot round-trip).
            // The CampaignView dispatch site (Task 15) generates it ahead of dispatch.
            if (payload.sessionId) {
              setCurrentSessionId(payload.sessionId);
            }
            setAttendingCharacterIds(payload.attendingCharacterIds);
            const tokens = payload.heroTokens ?? payload.attendingCharacterIds.length;
            setHeroTokens(tokens);
          }
          if (msg.intent.type === IntentTypes.EndSession) {
            setCurrentSessionId(null);
            setAttendingCharacterIds([]);
            // heroTokens left as-is; the next StartSession overwrites
          }
          if (msg.intent.type === IntentTypes.UpdateSessionAttendance) {
            const payload = msg.intent.payload as UpdateSessionAttendancePayload;
            setAttendingCharacterIds((prev) => {
              const removeSet = new Set(payload.remove ?? []);
              const next = prev.filter((id) => !removeSet.has(id));
              for (const id of payload.add ?? []) if (!next.includes(id)) next.push(id);
              return next;
            });
          }
          if (msg.intent.type === IntentTypes.GainHeroToken) {
            const payload = msg.intent.payload as GainHeroTokenPayload;
            setHeroTokens((prev) => prev + payload.amount);
          }
          if (msg.intent.type === IntentTypes.SpendHeroToken) {
            const payload = msg.intent.payload as SpendHeroTokenPayload;
            setHeroTokens((prev) => Math.max(0, prev - payload.amount));
            // surge_burst / regain_stamina derived intents flow through their own reflect cases
          }
          // OpenAction mirror (Phase 2b.0). RaiseOpenAction is server-only so
          // we never see its envelope on the dispatch path; it only arrives
          // via snapshot — snapshot replay handles the recovery case.
          if (msg.intent.type === IntentTypes.ClaimOpenAction) {
            const payload = msg.intent.payload as { openActionId?: string };
            if (payload.openActionId) {
              setOpenActions((prev) => prev.filter((o) => o.id !== payload.openActionId));
            }
          }
          if (msg.intent.type === IntentTypes.EndRound) {
            // EndRound expires OAs whose expiresAtRound matches the round
            // being ended. Read currentRound from the closed-over
            // activeEncounter state.
            const round = activeEncounter?.currentRound;
            if (round !== null && round !== undefined) {
              setOpenActions((prev) =>
                prev.filter((o) => o.expiresAtRound === null || o.expiresAtRound !== round),
              );
            }
          }
          if (msg.intent.type === IntentTypes.EndEncounter) {
            setOpenActions([]);
          }
          // Membership-changing intents (Submit/Approve/Deny/Remove) write to
          // the campaign_characters D1 table. Invalidate so the pending and
          // approved lists re-fetch the authoritative state rather than racing
          // against the async DO side-effect.
          if (CAMPAIGN_MEMBERSHIP_INTENTS.has(msg.intent.type)) {
            qc.invalidateQueries({ queryKey: ['campaign-characters'] });
          }
          // Character-mutating intents (Equip/Unequip/SwapKit, more later) write
          // to the D1 character row via reducer side-effects. The WS mirror only
          // tracks combat-side state (HP, conditions, resources); fields like
          // kitId, inventory, and equipped flags live on the character query.
          // Invalidate so the sheet re-derives runtime values.
          //
          // Respite is the broad-stroke case — it can touch every PC in the
          // lobby (XP increment) plus any number of off-roster Dragon Knight
          // characters (Wyrmplate damage-type pick), so we invalidate the
          // entire character query keyspace rather than picking ids out of
          // the payload. Every other character-mutating intent keys on a
          // single character.
          if (msg.intent.type === IntentTypes.Respite) {
            qc.invalidateQueries({ queryKey: ['character'] });
          } else if (CHARACTER_MUTATING_INTENTS.has(msg.intent.type)) {
            const characterId = characterIdFromPayload(msg.intent.payload);
            if (characterId) {
              qc.invalidateQueries({ queryKey: ['character', characterId] });
            }
          }
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
          // Pull activeDirectorId off the snapshot when present.
          const s = msg.state as
            | {
                activeDirectorId?: unknown;
                currentSessionId?: unknown;
                attendingCharacterIds?: unknown;
                heroTokens?: unknown;
                openActions?: unknown;
              }
            | undefined;
          if (s && typeof s.activeDirectorId === 'string') {
            setActiveDirectorId(s.activeDirectorId);
          }
          // Session + hero-token fields from snapshot (Epic 2E).
          if (s) {
            setCurrentSessionId(typeof s.currentSessionId === 'string' ? s.currentSessionId : null);
            setAttendingCharacterIds(
              Array.isArray(s.attendingCharacterIds)
                ? (s.attendingCharacterIds as string[]).filter((id) => typeof id === 'string')
                : [],
            );
            setHeroTokens(typeof s.heroTokens === 'number' ? s.heroTokens : 0);
            setOpenActions(Array.isArray(s.openActions) ? (s.openActions as OpenAction[]) : []);
          }
          // The intent log can't be perfectly reconstructed from a snapshot,
          // but we can mark everything past the snapshot seq as voided so the
          // Undo button + toasts don't try to undo a now-voided intent.
          setIntentLog((prev) => prev.map((i) => (i.seq > msg.seq ? { ...i, voided: true } : i)));
        }
      };
    }

    return () => {
      cancelled = true;
      clearTimeout(connectTimer);
      if (ws) {
        if (wsRef.current === ws) wsRef.current = null;
        ws.close();
      }
    };
  }, [sessionId, qc]);

  const dispatch = useCallback((intent: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    // Clear any prior rejection so callers can distinguish a fresh failure
    // from a stale one.
    setLastRejection(null);
    ws.send(JSON.stringify({ kind: 'dispatch', intent }));
    return true;
  }, []);

  return {
    members,
    status,
    activeEncounter,
    dispatch,
    intentLog,
    lastSeq,
    activeDirectorId,
    currentSessionId,
    attendingCharacterIds,
    heroTokens,
    openActions,
    lastRejection,
  };
}
