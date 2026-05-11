import type {
  WebSocket as CFWebSocket,
  DurableObject,
  DurableObjectState,
} from '@cloudflare/workers-types';
import { type SessionState, applyIntent, emptySessionState } from '@ironyard/rules';
import { ClientMsgSchema, type Intent, type Member, type ServerMsg, ulid } from '@ironyard/shared';
import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from './db';
import { intents as intentsTable, sessionSnapshots } from './db/schema';
import { buildServerStampedIntent } from './session-do-build-intent';
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

    // Replay non-voided rows only — voided intents are the bookkeeping that
    // makes Undo cheap (skip them and the reducer reproduces the post-undo state).
    const rows = await conn
      .select()
      .from(intentsTable)
      .where(
        and(
          eq(intentsTable.sessionId, sessionId),
          gt(intentsTable.seq, fromSeq),
          eq(intentsTable.voided, 0),
        ),
      )
      .orderBy(intentsTable.seq)
      .all();

    for (const row of rows) {
      const intent = JSON.parse(row.payload) as Intent & { timestamp: number };
      state = applyIntent(state, intent).state;
    }

    // The reducer increments state.seq per non-voided apply, so it under-counts
    // when voided rows are skipped. Re-base from the max persisted seq (voided
    // included) so the DO assigns the right next-seq for new dispatches.
    const maxRow = await conn
      .select({ seq: intentsTable.seq })
      .from(intentsTable)
      .where(eq(intentsTable.sessionId, sessionId))
      .orderBy(desc(intentsTable.seq))
      .limit(1)
      .get();
    state = { ...state, seq: maxRow ? maxRow.seq : fromSeq };

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

  // Intents the client can never dispatch directly. These are emitted by the
  // DO (session lifecycle) or by the reducer as derived intents (apply damage).
  private readonly SERVER_ONLY_INTENTS = new Set(['JoinSession', 'LeaveSession', 'ApplyDamage']);

  private async handleDispatch(socket: CFWebSocket, clientIntent: Intent) {
    const attached = this.sockets.get(socket);
    if (!attached || !this.sessionState) return;

    if (this.SERVER_ONLY_INTENTS.has(clientIntent.type)) {
      this.sendTo(socket, {
        kind: 'rejected',
        intentId: clientIntent.id,
        reason: `permission: ${clientIntent.type} is server-only`,
      });
      return;
    }

    // Server-stamp actor + timestamp + sessionId. Client-supplied id is
    // preserved (it's the dedupe key). `source` is preserved from the client
    // — slice 11's "rolled auto vs typed manually" attribution depends on
    // honoring the client-supplied value.
    const intent: Intent & { timestamp: number } = buildServerStampedIntent(
      clientIntent,
      attached,
      this.sessionId,
      Date.now(),
    );

    if (intent.type === 'Undo') {
      await this.handleUndoDispatch(socket, intent);
      return;
    }

    await this.applyAndBroadcast(intent, socket);
  }

  // Undo: validate target, void target + derived chain in D1, persist the Undo
  // intent, then reload state from D1 (replaying non-voided rows) and broadcast
  // a snapshot. The snapshot row is dropped so the next load() replays from
  // seq 0 — accurate but cheap-enough at Phase 1's intent volumes.
  private async handleUndoDispatch(socket: CFWebSocket, intent: Intent & { timestamp: number }) {
    const payload = intent.payload as { intentId?: unknown };
    const targetId =
      typeof payload?.intentId === 'string' && payload.intentId ? payload.intentId : null;
    if (!targetId) {
      this.sendTo(socket, {
        kind: 'rejected',
        intentId: intent.id,
        reason: 'invalid_payload: intentId required',
      });
      return;
    }

    const conn = db(this.env.DB);
    const allRows = await conn
      .select()
      .from(intentsTable)
      .where(eq(intentsTable.sessionId, this.sessionId))
      .all();

    const target = allRows.find((r) => r.id === targetId);
    if (!target) {
      this.sendTo(socket, {
        kind: 'rejected',
        intentId: intent.id,
        reason: 'target intent not found',
      });
      return;
    }
    if (target.voided) {
      this.sendTo(socket, {
        kind: 'rejected',
        intentId: intent.id,
        reason: 'target already voided',
      });
      return;
    }

    // Round boundary: undo only intents since the most recent non-voided EndRound.
    let lastEndRoundSeq = 0;
    for (const row of allRows) {
      if (row.voided) continue;
      const p = JSON.parse(row.payload) as { type?: string };
      if (p.type === 'EndRound' && row.seq > lastEndRoundSeq) {
        lastEndRoundSeq = row.seq;
      }
    }
    if (target.seq <= lastEndRoundSeq) {
      this.sendTo(socket, {
        kind: 'rejected',
        intentId: intent.id,
        reason: 'target is committed (past EndRound boundary)',
      });
      return;
    }

    // Find derived chain.
    const derived = allRows.filter((r) => {
      if (r.voided) return false;
      const p = JSON.parse(r.payload) as { causedBy?: string };
      return p.causedBy === targetId;
    });

    const idsToVoid = [target.id, ...derived.map((r) => r.id)];
    for (const id of idsToVoid) {
      await conn.update(intentsTable).set({ voided: 1 }).where(eq(intentsTable.id, id));
    }

    // Apply the Undo intent through the normal pipeline so it gets persisted +
    // broadcast as `applied`. The reducer treats it as a seq-advance + log
    // entry (the real state revert happens in the reload below). Note that
    // _applyOne may emit a stale snapshot (with the about-to-be-voided state)
    // if the cadence fires — we drop it after this call returns.
    await this._applyOne(intent, socket);

    // Drop any snapshot row — _applyOne may have just written a stale one
    // (captured the still-voided-in-memory state), and an earlier-still
    // snapshot would also have included voided intents' effects. Replaying
    // from seq 0 with voided rows skipped is correct and cheap at Phase 1
    // volumes; later slices can do finer-grained snapshot invalidation.
    await conn.delete(sessionSnapshots).where(eq(sessionSnapshots.sessionId, this.sessionId));
    this.lastSnapshotSeq = 0;
    this.lastSnapshotAt = 0;

    // Reload the in-memory state from D1 (skipping voided rows) and broadcast
    // a fresh snapshot so all clients converge.
    await this.load(this.sessionId);
    if (this.sessionState) {
      this.broadcast({
        kind: 'snapshot',
        state: this.sessionState,
        seq: this.sessionState.seq,
      });
    }
  }

  // Public entry — wraps the recursive _applyOne so derived-intent cascades all
  // run inside the same serialized op. Calling serialize() from inside _applyOne
  // would deadlock the queue.
  private async applyAndBroadcast(
    intent: Intent & { timestamp: number },
    originSocket?: CFWebSocket,
  ) {
    await this._applyOne(intent, originSocket);
  }

  private async _applyOne(intent: Intent & { timestamp: number }, originSocket?: CFWebSocket) {
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

    // Derived intents inherit sessionId and run through the same pipeline. They
    // get their own ids/timestamps and a fresh seq. Recursive cascades stay
    // bounded — slice 3's derived is one ApplyDamage per target, no further chain.
    for (const derived of result.derived) {
      const stampedDerived: Intent & { timestamp: number } = {
        ...derived,
        id: ulid(),
        sessionId: this.sessionId,
        timestamp: Date.now(),
      };
      await this._applyOne(stampedDerived);
    }
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
