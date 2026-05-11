import {
  type BringCharacterIntoEncounterPayload,
  IntentTypes,
  type Member,
  type Participant,
  ServerMsgSchema,
  type StartEncounterPayload,
} from '@ironyard/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export type ActiveEncounter = {
  encounterId: string;
  participants: Participant[];
};

// Slice-10 mini-reducer. Reflects ONLY StartEncounter +
// BringCharacterIntoEncounter so the builder UI can read `activeEncounter`
// reactively. The real client-side reducer (a peer of @ironyard/rules'
// applyIntent) lands in a later slice; do not extend this beyond what the
// builder needs.
function reflect(
  prev: ActiveEncounter | null,
  type: string,
  payload: unknown,
): ActiveEncounter | null {
  if (type === IntentTypes.StartEncounter) {
    const { encounterId } = payload as StartEncounterPayload;
    return { encounterId, participants: [] };
  }
  if (type === IntentTypes.BringCharacterIntoEncounter && prev) {
    const { participant } = payload as BringCharacterIntoEncounterPayload;
    if (prev.participants.some((p) => p.id === participant.id)) return prev;
    return { ...prev, participants: [...prev.participants, participant] };
  }
  return prev;
}

export function useSessionSocket(sessionId: string | undefined) {
  const [members, setMembers] = useState<Member[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [activeEncounter, setActiveEncounter] = useState<ActiveEncounter | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/api/sessions/${sessionId}/socket`);
    wsRef.current = ws;
    setStatus('connecting');
    setActiveEncounter(null);

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

  return { members, status, activeEncounter, dispatch };
}
