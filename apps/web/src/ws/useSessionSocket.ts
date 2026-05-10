import { type Member, ServerMsgSchema } from '@ironyard/shared';
import { useEffect, useRef, useState } from 'react';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export function useSessionSocket(sessionId: string | undefined) {
  const [members, setMembers] = useState<Member[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/api/sessions/${sessionId}/socket`);
    wsRef.current = ws;
    setStatus('connecting');

    ws.onopen = () => setStatus('open');
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
      }
    };

    return () => {
      wsRef.current = null;
      ws.close();
    };
  }, [sessionId]);

  return { members, status };
}
