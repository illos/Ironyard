import type {
  WebSocket as CFWebSocket,
  DurableObject,
  DurableObjectState,
} from '@cloudflare/workers-types';
import { type CampaignState, applyIntent, emptyCampaignState } from '@ironyard/rules';
import { ClientMsgSchema, type Intent, type Member, type ServerMsg, ulid } from '@ironyard/shared';
import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from './db';
import {
  campaignMemberships,
  campaignSnapshots,
  campaigns,
  intents as intentsTable,
  sessions,
} from './db/schema';
import { getStaticDataBundle } from './data';
import { buildServerStampedIntent } from './lobby-do-build-intent';
import { handleSideEffect } from './lobby-do-side-effects';
import { stampIntent } from './lobby-do-stampers';
import type { Bindings } from './types';

// LobbyDO: per-campaign authoritative state machine. Phase 1 slice 1 wires
// the reducer in via @ironyard/rules, persists each applied intent to D1, and
// replays from D1 on cold start. The Phase 0 lobby envelopes (member_*) stay
// alongside the new `applied` envelopes so the web app keeps working without
// changes — they'll be retired in a later slice once the client runs the
// reducer locally.

const HEADER_USER_ID = 'x-user-id';
const HEADER_USER_DISPLAY_NAME = 'x-user-display-name';
// x-user-role is no longer read from the client-forwarded headers; role is
// derived from campaign_memberships.is_director during WS upgrade (D5).
const HEADER_CAMPAIGN_ID = 'x-campaign-id';

const SNAPSHOT_EVERY = 50;
const SNAPSHOT_INTERVAL_MS = 30_000;

type Role = 'director' | 'player';
type Attached = { userId: string; displayName: string; role: Role };

declare const WebSocketPair: { new (): { 0: CFWebSocket; 1: CFWebSocket } };

export class LobbyDO implements DurableObject {
  private readonly sockets = new Map<CFWebSocket, Attached>();
  private readonly state: DurableObjectState;
  private readonly env: Bindings;

  private campaignState: CampaignState | null = null;
  private campaignId = '';
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

  private async load(campaignId: string) {
    const conn = db(this.env.DB);
    const snapshot = await conn
      .select()
      .from(campaignSnapshots)
      .where(eq(campaignSnapshots.campaignId, campaignId))
      .get();

    let state: CampaignState;
    let fromSeq = 0;
    if (snapshot) {
      state = JSON.parse(snapshot.state) as CampaignState;
      // Forward-compat: fill defaults for participant fields added after this
      // snapshot was persisted (e.g. Q17 Bucket A `activeAbilities`).
      state.participants = state.participants.map((p) =>
        p.activeAbilities === undefined ? { ...p, activeAbilities: [] } : p,
      );
      // Forward-compat: 2b.0 added openActions field. Old snapshots won't have it.
      if (state.openActions === undefined) {
        state.openActions = [];
      }
      fromSeq = snapshot.seq;
      this.lastSnapshotSeq = snapshot.seq;
      this.lastSnapshotAt = snapshot.savedAt;
    } else {
      // D5: fetch the campaign owner so fresh state has ownerId + activeDirectorId
      // FIXME(phase-c): emptyCampaignState second arg (ownerId) lands when Phase C merges.
      // Until then, the call below may produce a type error on the signature.
      const campaign = await conn
        .select({ ownerId: campaigns.ownerId })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .get();
      const ownerId = campaign?.ownerId ?? campaignId; // fallback: use campaignId as sentinel
      state = emptyCampaignState(campaignId, ownerId);
    }

    // Replay non-voided rows only — voided intents are the bookkeeping that
    // makes Undo cheap (skip them and the reducer reproduces the post-undo state).
    const rows = await conn
      .select()
      .from(intentsTable)
      .where(
        and(
          eq(intentsTable.campaignId, campaignId),
          gt(intentsTable.seq, fromSeq),
          eq(intentsTable.voided, 0),
        ),
      )
      .orderBy(intentsTable.seq)
      .all();

    for (const row of rows) {
      const intent = JSON.parse(row.payload) as Intent & { timestamp: number };
      state = applyIntent(state, intent, { staticData: getStaticDataBundle() }).state;
    }

    // The reducer increments state.seq per non-voided apply, so it under-counts
    // when voided rows are skipped. Re-base from the max persisted seq (voided
    // included) so the DO assigns the right next-seq for new dispatches.
    const maxRow = await conn
      .select({ seq: intentsTable.seq })
      .from(intentsTable)
      .where(eq(intentsTable.campaignId, campaignId))
      .orderBy(desc(intentsTable.seq))
      .limit(1)
      .get();
    state = { ...state, seq: maxRow ? maxRow.seq : fromSeq };

    // After replay, connectedMembers reflects historical events, not current
    // sockets (which are all gone on cold start). Clear it; reconnecting
    // clients will re-emit JoinLobby via the WS connect path.
    state = { ...state, connectedMembers: [] };

    // Forward-compat: load active session data from D1 so the in-memory
    // state mirrors the persisted session row. Covers both the snapshot and
    // empty-state branches since the replay may not include a StartSession
    // intent (pre-2E snapshots) or may have diverged from D1.
    const campaignRow = await conn
      .select({ currentSessionId: campaigns.currentSessionId })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .get();
    const currentSessionId = campaignRow?.currentSessionId ?? null;
    if (currentSessionId) {
      const sessionRow = await conn
        .select()
        .from(sessions)
        .where(eq(sessions.id, currentSessionId))
        .get();
      if (sessionRow) {
        state.currentSessionId = currentSessionId;
        state.attendingCharacterIds = JSON.parse(sessionRow.attendingCharacterIds) as string[];
        // heroTokens stays at whatever the snapshot/replay produced — that's
        // the live mutable pool. The D1 row only stores hero_tokens_start.
      } else {
        // Orphan currentSessionId pointer — clear it.
        state.currentSessionId = null;
        state.attendingCharacterIds = [];
      }
    }

    this.campaignId = campaignId;
    this.campaignState = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // D6.3: /revoke-director — called by the revoke HTTP route after it updates
    // campaign_memberships.is_director = 0. If the revoked user is currently the
    // active director, emit a synthetic JumpBehindScreen from the owner so the
    // screen moves back atomically and all clients are broadcast the change.
    if (url.pathname === '/revoke-director' && request.method === 'POST') {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ ok: false, error: 'invalid json' }), { status: 400 });
      }
      const revokedUserId =
        body && typeof body === 'object' && 'revokedUserId' in body
          ? (body as { revokedUserId: unknown }).revokedUserId
          : null;
      if (typeof revokedUserId !== 'string') {
        return new Response(JSON.stringify({ ok: false, error: 'revokedUserId required' }), {
          status: 400,
        });
      }

      // Only emit the synthetic intent if the revoked user is currently behind the screen.
      if (this.campaignState && this.campaignState.activeDirectorId === revokedUserId) {
        const state = this.campaignState;
        const synthetic: Intent & { timestamp: number } = {
          id: ulid(),
          campaignId: state.campaignId,
          actor: { userId: state.ownerId, role: 'director' },
          timestamp: Date.now(),
          source: 'server', // synthetic, emitted by the DO on behalf of the owner — distinct from 'auto' (engine-derived) and 'manual' (user)
          type: 'JumpBehindScreen',
          payload: { permitted: true },
        };
        void this.serialize(() => this.applyAndBroadcast(synthetic));
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    // /server-dispatch — accepts server-originated intents (from HTTP route
    // handlers) and runs them through the normal intent pipeline. The caller
    // must supply { type, actor: { userId }, payload, source: 'server' }.
    if (url.pathname === '/server-dispatch' && request.method === 'POST') {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ ok: false, error: 'invalid json' }), { status: 400 });
      }
      if (
        !body ||
        typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).type !== 'string' ||
        typeof (body as Record<string, unknown>).actor !== 'object' ||
        typeof ((body as Record<string, unknown>).actor as Record<string, unknown>).userId !==
          'string'
      ) {
        return new Response(
          JSON.stringify({ ok: false, error: 'type and actor.userId required' }),
          { status: 400 },
        );
      }
      const typedBody = body as {
        type: string;
        actor: { userId: string };
        payload: Record<string, unknown>;
        source?: string;
      };

      // Ensure the DO is initialised before dispatching. server-dispatch callers
      // must supply campaignId in the actor context; we derive it from the DO name.
      // The campaignId is already baked into the DO at idFromName() time — we can
      // read it from the in-flight state after load().
      if (!this.campaignState) {
        // The DO wasn't warm — we need a campaignId to load. We look it up from
        // the request URL query param or fall back to the body's payload.campaignId.
        const qCampaignId =
          url.searchParams.get('campaignId') ??
          (typeof typedBody.payload?.campaignId === 'string' ? typedBody.payload.campaignId : null);
        if (!qCampaignId) {
          return new Response(
            JSON.stringify({ ok: false, error: 'DO not initialised; pass campaignId' }),
            { status: 400 },
          );
        }
        await this.state.blockConcurrencyWhile(() => this.load(qCampaignId));
      }

      const intent: Intent & { timestamp: number } = {
        id: ulid(),
        campaignId: this.campaignId,
        actor: { userId: typedBody.actor.userId, role: 'player' as const },
        timestamp: Date.now(),
        source: (typedBody.source as 'server') ?? 'server',
        type: typedBody.type,
        payload: typedBody.payload ?? {},
      };

      // Run the stamping pipeline — same as the WS handleDispatch path.
      // Stampers mutate intent.payload in-place and may return a rejection reason.
      if (this.campaignState) {
        const stampRejection = await stampIntent(intent, this.campaignState, this.env);
        if (stampRejection !== null) {
          return new Response(JSON.stringify({ ok: false, error: stampRejection }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          });
        }
      }

      let dispatchError: string | null = null;
      await this.serialize(async () => {
        if (!this.campaignState) return;
        const stateBefore = this.campaignState;
        const result = applyIntent(this.campaignState, intent, { staticData: getStaticDataBundle() });
        if (result.errors && result.errors.length > 0) {
          dispatchError = result.errors.map((e) => e.message).join('; ');
          return;
        }
        this.campaignState = result.state;
        const seq = result.state.seq;
        const conn = db(this.env.DB);
        await conn.insert(intentsTable).values({
          id: intent.id,
          campaignId: this.campaignId,
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
        await handleSideEffect(intent, this.campaignId, this.env, stateBefore, this.campaignState);
        for (const derived of result.derived) {
          const stampedDerived: Intent & { timestamp: number } = {
            ...derived,
            id: ulid(),
            campaignId: this.campaignId,
            timestamp: Date.now(),
          };
          await this._applyOne(stampedDerived);
        }
      });

      if (dispatchError) {
        return new Response(JSON.stringify({ ok: false, error: dispatchError }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected websocket upgrade', { status: 426 });
    }

    const userId = request.headers.get(HEADER_USER_ID);
    const displayName = request.headers.get(HEADER_USER_DISPLAY_NAME);
    const campaignId = request.headers.get(HEADER_CAMPAIGN_ID);
    if (!userId || !displayName || !campaignId) {
      return new Response('missing user headers', { status: 401 });
    }

    // D5: derive role from DB membership instead of trusting the x-user-role header.
    // The routes.ts socket handler already validated membership before forwarding;
    // we re-query here so the actor role stamped onto intents is authoritative.
    const conn = db(this.env.DB);
    const membership = await conn
      .select({ isDirector: campaignMemberships.isDirector })
      .from(campaignMemberships)
      .where(
        and(eq(campaignMemberships.campaignId, campaignId), eq(campaignMemberships.userId, userId)),
      )
      .get();
    // If no membership row exists the user was removed after the HTTP auth check;
    // reject the upgrade.
    if (!membership) {
      return new Response('not a member', { status: 403 });
    }
    const role: Role = membership.isDirector === 1 ? 'director' : 'player';

    // Cold-start load. blockConcurrencyWhile prevents handler races during init.
    if (!this.campaignState || this.campaignId !== campaignId) {
      await this.state.blockConcurrencyWhile(() => this.load(campaignId));
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const attached: Attached = { userId, displayName, role };
    this.sockets.set(server, attached);

    // Send current state snapshot so the connecting client gets authoritative
    // participant/encounter data immediately without replaying all intents.
    if (this.campaignState) {
      this.sendTo(server, {
        kind: 'snapshot',
        state: this.campaignState,
        seq: this.campaignState.seq,
      });
    }

    // Phase 0 lobby envelopes — kept for web app compatibility this slice.
    this.sendTo(server, { kind: 'member_list', members: this.snapshotMembers() });
    this.broadcastExcept({ kind: 'member_joined', member: { userId, displayName } }, server);

    // Auto-emit JoinLobby through the full pipeline (validate → persist → broadcast applied).
    void this.serialize(() =>
      this.applyAndBroadcast({
        id: ulid(),
        campaignId: this.campaignId,
        actor: { userId, role },
        timestamp: Date.now(),
        source: 'auto',
        type: 'JoinLobby',
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
          campaignId: this.campaignId,
          actor: { userId: att.userId, role: att.role },
          timestamp: Date.now(),
          source: 'auto',
          type: 'LeaveLobby',
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
  // DO (campaign lifecycle) or by the reducer as derived intents (apply damage).
  // D6.4: confirmed names post-rename (JoinSession/LeaveSession → JoinLobby/LeaveLobby).
  private readonly SERVER_ONLY_INTENTS = new Set(['JoinLobby', 'LeaveLobby', 'ApplyDamage']);

  private async handleDispatch(socket: CFWebSocket, clientIntent: Intent) {
    const attached = this.sockets.get(socket);
    if (!attached || !this.campaignState) return;

    if (this.SERVER_ONLY_INTENTS.has(clientIntent.type)) {
      this.sendTo(socket, {
        kind: 'rejected',
        intentId: clientIntent.id,
        reason: `permission: ${clientIntent.type} is server-only`,
      });
      return;
    }

    // Server-stamp actor + timestamp + campaignId. Client-supplied id is
    // preserved (it's the dedupe key). `source` is preserved from the client
    // — slice 11's "rolled auto vs typed manually" attribution depends on
    // honoring the client-supplied value.
    const intent: Intent & { timestamp: number } = buildServerStampedIntent(
      clientIntent,
      attached,
      this.campaignId,
      Date.now(),
    );

    if (intent.type === 'Undo') {
      await this.handleUndoDispatch(socket, intent);
      return;
    }

    // D6.1: Stamping pipeline — runs before applyAndBroadcast.
    // Stampers may mutate intent.payload (adding server-derived fields) or
    // return a rejection reason if server-side validation fails.
    if (this.campaignState) {
      const stampRejection = await stampIntent(intent, this.campaignState, this.env);
      if (stampRejection !== null) {
        this.sendTo(socket, {
          kind: 'rejected',
          intentId: intent.id,
          reason: stampRejection,
        });
        return;
      }
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
      .where(eq(intentsTable.campaignId, this.campaignId))
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
    await conn.delete(campaignSnapshots).where(eq(campaignSnapshots.campaignId, this.campaignId));
    this.lastSnapshotSeq = 0;
    this.lastSnapshotAt = 0;

    // Reload the in-memory state from D1 (skipping voided rows) and broadcast
    // a fresh snapshot so all clients converge.
    await this.load(this.campaignId);
    if (this.campaignState) {
      this.broadcast({
        kind: 'snapshot',
        state: this.campaignState,
        seq: this.campaignState.seq,
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
    if (!this.campaignState) return;

    // Capture state before the reducer runs — needed by hybrid side-effects
    // (e.g. Respite reads stateBefore.partyVictories before it is drained to 0).
    const stateBefore = this.campaignState;

    const result = applyIntent(this.campaignState, intent, { staticData: getStaticDataBundle() });
    if (result.errors && result.errors.length > 0) {
      const reason = result.errors.map((e) => e.message).join('; ');
      if (originSocket) {
        this.sendTo(originSocket, { kind: 'rejected', intentId: intent.id, reason });
      }
      return;
    }

    this.campaignState = result.state;
    const seq = result.state.seq;

    const conn = db(this.env.DB);
    await conn.insert(intentsTable).values({
      id: intent.id,
      campaignId: this.campaignId,
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

    // D6.2 / Phase F: Post-reducer D1 side-effect writes. Failures are logged
    // but do not re-throw — in-memory state has advanced, recovery is re-dispatch.
    // `stateBefore` is passed for hybrid intents (Respite) that need pre-reducer
    // state; non-hybrid side-effects ignore it.
    await handleSideEffect(intent, this.campaignId, this.env, stateBefore, this.campaignState);

    // Derived intents inherit campaignId and run through the same pipeline. They
    // get their own ids/timestamps and a fresh seq. Recursive cascades stay
    // bounded — slice 3's derived is one ApplyDamage per target, no further chain.
    for (const derived of result.derived) {
      const stampedDerived: Intent & { timestamp: number } = {
        ...derived,
        id: ulid(),
        campaignId: this.campaignId,
        timestamp: Date.now(),
      };
      await this._applyOne(stampedDerived);
    }
  }

  private async handleSync(socket: CFWebSocket, sinceSeq: number) {
    if (!this.campaignId) return;
    const conn = db(this.env.DB);
    const rows = await conn
      .select()
      .from(intentsTable)
      .where(and(eq(intentsTable.campaignId, this.campaignId), gt(intentsTable.seq, sinceSeq)))
      .orderBy(intentsTable.seq)
      .all();

    for (const row of rows) {
      const intent = JSON.parse(row.payload) as Intent;
      this.sendTo(socket, { kind: 'applied', intent, seq: row.seq });
    }
  }

  private async persistSnapshot(now: number) {
    if (!this.campaignState) return;
    const conn = db(this.env.DB);
    const stateJson = JSON.stringify(this.campaignState);
    const seq = this.campaignState.seq;
    await conn
      .insert(campaignSnapshots)
      .values({
        campaignId: this.campaignId,
        state: stateJson,
        seq,
        savedAt: now,
      })
      .onConflictDoUpdate({
        target: campaignSnapshots.campaignId,
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
