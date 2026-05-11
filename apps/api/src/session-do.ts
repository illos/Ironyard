import type {
  WebSocket as CFWebSocket,
  DurableObject,
  DurableObjectState,
} from '@cloudflare/workers-types';
import { type SessionState, applyIntent, emptySessionState } from '@ironyard/rules';
import { ClientMsgSchema, type Intent, type Member, type ServerMsg, ulid } from '@ironyard/shared';
import { and, eq, gt } from 'drizzle-orm';
import { db } from './db';
import { intents as intentsTable, sessionSnapshots } from './db/schema';
import type { Bindings } from './types';

// SessionDO: per-session authoritative state machine. Phase 1 slice 1 wires
// the reducer in via @ironyard/rules, persists each applied intent to D1, and
// replays from D1 on cold start. The Phase 0 lobby envelopes (member_*) stay
// alongside the new `applied` envelopes so the web app keeps working without
// changes — they'll be retired in a later slice once the client runs the
// reducer locally.

const HEADER_USER_ID = 'x-user-id';
const HEADER_USER_DISPLAY_NAME = 'x-user-display-name';
const HEADER_USER_ROLE = 'x-user-role';
const HEADER_SESSION_ID = 'x-session-id';

const SNAPSHOT_EVERY = 50;
const SNAPSHOT_INTERVAL_MS = 30_000;

type Role = 'director' | 'player';
type Attached = { userId: string; displayName: string; role: Role };

declare const WebSocketPair: { new (): { 0: CFWebSocket; 1: CFWebSocket } };

export class SessionDO implements DurableObject {
  private readonly sockets = new Map<CFWebSocket, Attached>();
  private readonly state: DurableObjectState;
  private readonly env: Bindings;

  private sessionState: SessionState | null = null;
  private sessionId = '';
  private lastSnapshotSeq = 0;
  private lastSnapshotAt = 0;

  // Serializes dispatch operations so applyIntent + D1 write + broadcast happen
  // in order. Errors are swallowed so a single failure can't poison the queue.
  private opQueue: Promise<void> = Promise.resolve();

  constructor(state: DurableObjectState, env: Bindings) {
    this.state = state;
    this.env = env;
  }

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.opQueue.then(fn);
    this.opQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async load(sessionId: string) {
    const conn = db(this.env.DB);
    const snapshot = await conn
      .select()
      .from(sessionSnapshots)
      .where(eq(sessionSnapshots.sessionId, sessionId))
      .get();

    let state: SessionState;
    let fromSeq = 0;
    if (snapshot) {
      state = JSON.parse(snapshot.state) as SessionState;
      fromSeq = snapshot.seq;
      this.lastSnapshotSeq = snapshot.seq;
      this.lastSnapshotAt = snapshot.savedAt;
    } else {
      state = emptySessionState(sessionId);
    }

    const rows = await conn
      .select()
      .from(intentsTable)
      .where(and(eq(intentsTable.sessionId, sessionId), gt(intentsTable.seq, fromSeq)))
      .orderBy(intentsTable.seq)
      .all();

    for (const row of rows) {
      const intent = JSON.parse(row.payload) as Intent & { timestamp: number };
      state = applyIntent(state, intent).state;
    }

    // After replay, connectedMembers reflects historical events, not current
    // sockets (which are all gone on cold start). Clear it; reconnecting
    // clients will re-emit JoinSession via the WS connect path.
    state = { ...state, connectedMembers: [] };

    this.sessionId = sessionId;
    this.sessionState = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected websocket upgrade', { status: 426 });
    }

    const userId = request.headers.get(HEADER_USER_ID);
    const displayName = request.headers.get(HEADER_USER_DISPLAY_NAME);
    const roleHeader = request.headers.get(HEADER_USER_ROLE);
    const sessionId = request.headers.get(HEADER_SESSION_ID);
    if (
      !userId ||
      !displayName ||
      !sessionId ||
      (roleHeader !== 'director' && roleHeader !== 'player')
    ) {
      return new Response('missing or invalid user headers', { status: 401 });
    }
    const role: Role = roleHeader;

    // Cold-start load. blockConcurrencyWhile prevents handler races during init.
    if (!this.sessionState || this.sessionId !== sessionId) {
      await this.state.blockConcurrencyWhile(() => this.load(sessionId));
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const attached: Attached = { userId, displayName, role };
    this.sockets.set(server, attached);

    // Phase 0 lobby envelopes — kept for web app compatibility this slice.
    this.sendTo(server, { kind: 'member_list', members: this.snapshotMembers() });
    this.broadcastExcept({ kind: 'member_joined', member: { userId, displayName } }, server);

    // Auto-emit JoinSession through the full pipeline (validate → persist → broadcast applied).
    void this.serialize(() =>
      this.applyAndBroadcast({
        id: ulid(),
        sessionId: this.sessionId,
        actor: { userId, role },
        timestamp: Date.now(),
        source: 'auto',
        type: 'JoinSession',
        payload: { userId, displayName },
      }),
    );

    server.addEventListener('message', (event) => {
      void this.handleMessage(server, event.data);
    });

    const detach = () => {
      const att = this.sockets.get(server);
      if (!att) return;
      this.sockets.delete(server);
      this.broadcast({
        kind: 'member_left',
        member: { userId: att.userId, displayName: att.displayName },
      });
      void this.serialize(() =>
        this.applyAndBroadcast({
          id: ulid(),
          sessionId: this.sessionId,
          actor: { userId: att.userId, role: att.role },
          timestamp: Date.now(),
          source: 'auto',
          type: 'LeaveSession',
          payload: { userId: att.userId },
        }),
      );
    };
    server.addEventListener('close', detach);
    server.addEventListener('error', detach);

    // biome-ignore lint/suspicious/noExplicitAny: WebSocket-on-Response is a Workers extension TS lib doesn't model
    return new Response(null, { status: 101, webSocket: client } as any);
  }

  private async handleMessage(socket: CFWebSocket, raw: ArrayBuffer | string) {
    let payload: unknown;
    try {
      payload =
        typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return;
    }
    const parsed = ClientMsgSchema.safeParse(payload);
    if (!parsed.success) return;

    const msg = parsed.data;
    switch (msg.kind) {
      case 'ping':
        this.sendTo(socket, { kind: 'pong' });
        return;
      case 'sync': {
        const sinceSeq = msg.sinceSeq;
        await this.serialize(() => this.handleSync(socket, sinceSeq));
        return;
      }
      case 'dispatch': {
        const intent = msg.intent;
        await this.serialize(() => this.handleDispatch(socket, intent));
        return;
      }
    }
  }

  private async handleDispatch(socket: CFWebSocket, clientIntent: Intent) {
    const attached = this.sockets.get(socket);
    if (!attached || !this.sessionState) return;

    // Session-lifecycle intents are auto-emitted by the DO only.
    if (clientIntent.type === 'JoinSession' || clientIntent.type === 'LeaveSession') {
      this.sendTo(socket, {
        kind: 'rejected',
        intentId: clientIntent.id,
        reason: 'permission: session-lifecycle intents are server-only',
      });
      return;
    }

    // Override actor + timestamp + sessionId + source. Client-supplied id is preserved
    // (it's the dedupe key) but everything that could be spoofed is server-stamped.
    const intent: Intent & { timestamp: number } = {
      ...clientIntent,
      actor: { userId: attached.userId, role: attached.role },
      timestamp: Date.now(),
      sessionId: this.sessionId,
      source: 'manual',
    };

    await this.applyAndBroadcast(intent, socket);
  }

  private async applyAndBroadcast(
    intent: Intent & { timestamp: number },
    originSocket?: CFWebSocket,
  ) {
    if (!this.sessionState) return;

    const result = applyIntent(this.sessionState, intent);
    if (result.errors && result.errors.length > 0) {
      const reason = result.errors.map((e) => e.message).join('; ');
      if (originSocket) {
        this.sendTo(originSocket, { kind: 'rejected', intentId: intent.id, reason });
      }
      return;
    }

    this.sessionState = result.state;
    const seq = result.state.seq;

    const conn = db(this.env.DB);
    await conn.insert(intentsTable).values({
      id: intent.id,
      sessionId: this.sessionId,
      seq,
      actorId: intent.actor.userId,
      payload: JSON.stringify(intent),
      voided: 0,
      createdAt: intent.timestamp,
    });

    const now = Date.now();
    if (
      seq - this.lastSnapshotSeq >= SNAPSHOT_EVERY ||
      now - this.lastSnapshotAt >= SNAPSHOT_INTERVAL_MS
    ) {
      await this.persistSnapshot(now);
    }

    this.broadcast({ kind: 'applied', intent, seq });
  }

  private async handleSync(socket: CFWebSocket, sinceSeq: number) {
    if (!this.sessionId) return;
    const conn = db(this.env.DB);
    const rows = await conn
      .select()
      .from(intentsTable)
      .where(and(eq(intentsTable.sessionId, this.sessionId), gt(intentsTable.seq, sinceSeq)))
      .orderBy(intentsTable.seq)
      .all();

    for (const row of rows) {
      const intent = JSON.parse(row.payload) as Intent;
      this.sendTo(socket, { kind: 'applied', intent, seq: row.seq });
    }
  }

  private async persistSnapshot(now: number) {
    if (!this.sessionState) return;
    const conn = db(this.env.DB);
    const stateJson = JSON.stringify(this.sessionState);
    const seq = this.sessionState.seq;
    await conn
      .insert(sessionSnapshots)
      .values({
        sessionId: this.sessionId,
        state: stateJson,
        seq,
        savedAt: now,
      })
      .onConflictDoUpdate({
        target: sessionSnapshots.sessionId,
        set: { state: stateJson, seq, savedAt: now },
      });
    this.lastSnapshotSeq = seq;
    this.lastSnapshotAt = now;
  }

  private snapshotMembers(): Member[] {
    return Array.from(this.sockets.values()).map((a) => ({
      userId: a.userId,
      displayName: a.displayName,
    }));
  }

  private sendTo(socket: CFWebSocket, msg: ServerMsg) {
    try {
      socket.send(JSON.stringify(msg));
    } catch {
      // socket closed mid-send; cleanup happens via the close listener
    }
  }

  private broadcast(msg: ServerMsg) {
    const data = JSON.stringify(msg);
    for (const socket of this.sockets.keys()) {
      try {
        socket.send(data);
      } catch {
        // ignored
      }
    }
  }

  private broadcastExcept(msg: ServerMsg, except: CFWebSocket) {
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
