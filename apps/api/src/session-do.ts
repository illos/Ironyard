import type {
  WebSocket as CFWebSocket,
  DurableObject,
  DurableObjectState,
} from '@cloudflare/workers-types';
import { ClientMsgSchema, type Member, type ServerMsg } from '@ironyard/shared';
import type { Bindings } from './types';

// Phase 0 SessionDO: WebSocket-only. Tracks connected sockets in memory, replies
// to ping with pong, and broadcasts member_joined / member_left so the lobby
// page (item 8) can list connected users in realtime. Intent log persistence,
// snapshot/replay, and server-side rolls land in Phase 1.

const HEADER_USER_ID = 'x-user-id';
const HEADER_USER_DISPLAY_NAME = 'x-user-display-name';

type Attached = { userId: string; displayName: string };

declare const WebSocketPair: { new (): { 0: CFWebSocket; 1: CFWebSocket } };

export class SessionDO implements DurableObject {
  private readonly sockets = new Map<CFWebSocket, Attached>();

  private readonly state: DurableObjectState;
  private readonly env: Bindings;

  constructor(state: DurableObjectState, env: Bindings) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected websocket upgrade', { status: 426 });
    }

    const userId = request.headers.get(HEADER_USER_ID);
    const displayName = request.headers.get(HEADER_USER_DISPLAY_NAME);
    if (!userId || !displayName) {
      return new Response('missing user headers', { status: 401 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const member: Member = { userId, displayName };
    this.sockets.set(server, member);

    // Tell the newcomer who else is here, then announce them to everyone else.
    this.sendTo(server, { kind: 'member_list', members: this.snapshotMembers() });
    this.broadcast({ kind: 'member_joined', member }, server);

    server.addEventListener('message', (event) => {
      this.handleMessage(server, event.data);
    });

    const detach = () => {
      const attached = this.sockets.get(server);
      this.sockets.delete(server);
      if (attached) {
        this.broadcast({ kind: 'member_left', member: attached });
      }
    };
    server.addEventListener('close', detach);
    server.addEventListener('error', detach);

    // biome-ignore lint/suspicious/noExplicitAny: WebSocket-on-Response is a Workers extension TS lib doesn't model
    return new Response(null, { status: 101, webSocket: client } as any);
  }

  private handleMessage(socket: CFWebSocket, raw: ArrayBuffer | string): void {
    let payload: unknown;
    try {
      payload =
        typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return; // malformed JSON — drop silently per wire.ts contract
    }

    const result = ClientMsgSchema.safeParse(payload);
    if (!result.success) return;

    switch (result.data.kind) {
      case 'ping':
        this.sendTo(socket, { kind: 'pong' });
        return;
      case 'sync':
      case 'dispatch':
        // Phase 1 wires the reducer; for now ack-by-doing-nothing is acceptable.
        return;
    }
  }

  private snapshotMembers(): Member[] {
    return Array.from(this.sockets.values());
  }

  private sendTo(socket: CFWebSocket, msg: ServerMsg): void {
    try {
      socket.send(JSON.stringify(msg));
    } catch {
      // socket closed mid-send; cleanup happens via the close listener
    }
  }

  private broadcast(msg: ServerMsg, except?: CFWebSocket): void {
    const data = JSON.stringify(msg);
    for (const socket of this.sockets.keys()) {
      if (socket === except) continue;
      try {
        socket.send(data);
      } catch {
        // ignored
      }
    }
  }
}
