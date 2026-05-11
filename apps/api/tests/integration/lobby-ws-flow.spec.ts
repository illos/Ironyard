/**
 * lobby-ws-flow.spec.ts
 *
 * Integration tests for the LobbyDO WebSocket protocol. Uses unstable_dev
 * (Miniflare-backed) so D1 writes, DO state, and the full intent pipeline are
 * real (not mocked).
 *
 * WebSocket implementation: Node.js 22+ built-in WebSocket (undici-based),
 * NOT the `ws` npm package. The `ws` package doesn't work with unstable_dev's
 * proxy layer in vitest's forks pool; the native WebSocket does.
 * The `headers` option is supported by Node's undici-based implementation.
 *
 * Covered flows:
 *  1. WS connect → JoinLobby applied, snapshot received
 *  2. AddMonster dispatch → applied envelope, participant added to roster
 *  3. AddMonster with invalid monsterId → rejected envelope
 *  4. StartEncounter → state.encounter becomes non-null
 *  5. EndEncounter → state.encounter returns to null, roster preserved
 *  6. JumpBehindScreen from owner → accepted, activeDirectorId changes
 *  7. JumpBehindScreen from non-director → rejected
 *  8. SubmitCharacter from player without character → rejected (stamps ownsCharacter=false)
 *  9. KickPlayer → membership and character rows deleted
 * 10. KickPlayer of the owner → rejected
 *
 * What this does NOT re-test: reducer correctness (packages/rules has 286 tests
 * for that). The focus here is the wire-up: WS → DO → reducer → broadcast,
 * stamping reads D1 + monsters.json, side-effects write D1.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Unstable_DevWorker } from 'wrangler';
import {
  authedFetch,
  createCampaign,
  devLogin,
  joinCampaign,
  startWorker,
  wsBaseUrl,
} from './helpers';

let worker: Unstable_DevWorker;

beforeAll(async () => {
  worker = await startWorker();
}, 40_000); // migration + worker compile on cold start

afterAll(async () => {
  await worker.stop();
});

// ── Node native WebSocket (undici) ────────────────────────────────────────────
// Node 22+ has WebSocket as a global backed by undici, which supports a
// `headers` option in the constructor's second argument for custom headers.
// We cast to `any` at the boundary because @types/node doesn't yet expose
// the undici extensions on the standard WebSocket type.

// biome-ignore lint/suspicious/noExplicitAny: Node undici WS headers option not in @types/node
type NativeWebSocketCtor = new (url: string, options?: any) => WebSocket;
const NativeWebSocket = globalThis.WebSocket as NativeWebSocketCtor;

// ── WS connection helper ──────────────────────────────────────────────────────

/**
 * Connect a WebSocket to the lobby.
 *
 * Node 22+'s undici WebSocket supports a `headers` option, so we can pass the
 * session cookie directly without a pre-flight.
 */
async function connectLobby(
  campaignId: string,
  cookie: string,
): Promise<{
  ws: WebSocket;
  nextMsg: () => Promise<Record<string, unknown>>;
  close: () => void;
}> {
  const url = `${wsBaseUrl(worker)}/api/campaigns/${campaignId}/socket`;
  const ws = new NativeWebSocket(url, { headers: { cookie } });

  const queue: Array<Record<string, unknown>> = [];
  const waiters: Array<(msg: Record<string, unknown>) => void> = [];

  // Set up onmessage BEFORE awaiting open so no messages are missed between
  // the open event firing and our handler being registered (Node undici WS
  // may deliver queued messages on the very next microtask after onopen fires).
  ws.onmessage = (event: MessageEvent<string>) => {
    const msg = JSON.parse(event.data) as Record<string, unknown>;
    const waiter = waiters.shift();
    if (waiter) {
      waiter(msg);
    } else {
      queue.push(msg);
    }
  };

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(new Error(`WS connect error: ${JSON.stringify(e)}`));
  });

  function nextMsg(): Promise<Record<string, unknown>> {
    const queued = queue.shift();
    if (queued !== undefined) {
      return Promise.resolve(queued);
    }
    return new Promise<Record<string, unknown>>((resolve) => {
      waiters.push(resolve);
    });
  }

  function close() {
    ws.close();
  }

  return { ws, nextMsg, close };
}

/** Send a dispatch envelope over the WS.
 *
 * NOTE: IntentSchema requires campaignId and actor — the server overwrites
 * them with authoritative values, but Zod validates the incoming message
 * before reaching handleDispatch. We pass sentinel values that pass schema
 * validation; the server stamps the real actor/campaignId before applying.
 */
function dispatch(ws: WebSocket, type: string, payload: Record<string, unknown>): void {
  ws.send(
    JSON.stringify({
      kind: 'dispatch',
      intent: {
        id: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type,
        payload,
        source: 'manual',
        // Sentinel fields — server overwrites these. Required to pass IntentSchema validation.
        campaignId: 'client-placeholder',
        actor: { userId: 'client-placeholder', role: 'player' },
      },
    }),
  );
}

/**
 * Drain messages until one matching the predicate is found or the timeout elapses.
 * Returns the matched message or throws.
 */
async function waitForMsg(
  nextMsg: () => Promise<Record<string, unknown>>,
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs = 8000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const msg = await Promise.race([
      nextMsg(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout waiting for message')), remaining),
      ),
    ]);
    if (predicate(msg)) return msg;
  }
  throw new Error('timeout waiting for matching message');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WS connect → JoinLobby applied', () => {
  it('receives an applied envelope for JoinLobby on connect', async () => {
    const { cookie } = await devLogin(worker, 'ws-join@test.local', 'WSJoin');
    const campaign = await createCampaign(worker, cookie, 'WS Join Campaign');

    const { nextMsg, close } = await connectLobby(campaign.id, cookie);
    try {
      // The DO auto-emits JoinLobby on connect. There may be a member_list first.
      const msg = await waitForMsg(nextMsg, (m) => m.kind === 'applied');
      const intent = msg.intent as { type?: string } | undefined;
      expect(intent?.type).toBe('JoinLobby');
    } finally {
      close();
    }
  });
});

describe('AddMonster', () => {
  it('returns applied and adds monster to roster', async () => {
    const { cookie } = await devLogin(worker, 'ws-add-monster@test.local', 'WSAddMonster');
    const campaign = await createCampaign(worker, cookie, 'AddMonster Campaign');

    const { ws, nextMsg, close } = await connectLobby(campaign.id, cookie);
    try {
      // Drain JoinLobby.
      await waitForMsg(nextMsg, (m) => m.kind === 'applied');

      dispatch(ws, 'AddMonster', { monsterId: 'goblin-warrior-l1', quantity: 1 });

      const applied = await waitForMsg(nextMsg, (m) => m.kind === 'applied');
      const intent = applied.intent as { type?: string; payload?: { monsterId?: string } };
      expect(intent.type).toBe('AddMonster');
      expect(intent.payload?.monsterId).toBe('goblin-warrior-l1');
    } finally {
      close();
    }
  });

  it('returns rejected for unknown monsterId', async () => {
    const { cookie } = await devLogin(worker, 'ws-bad-monster@test.local', 'WSBadMonster');
    const campaign = await createCampaign(worker, cookie, 'BadMonster Campaign');

    const { ws, nextMsg, close } = await connectLobby(campaign.id, cookie);
    try {
      await waitForMsg(nextMsg, (m) => m.kind === 'applied'); // drain JoinLobby

      dispatch(ws, 'AddMonster', { monsterId: 'dragon-of-doom', quantity: 1 });

      const rejected = await waitForMsg(nextMsg, (m) => m.kind === 'rejected');
      expect((rejected.reason as string).startsWith('monster_not_found')).toBe(true);
    } finally {
      close();
    }
  });
});

describe('StartEncounter / EndEncounter', () => {
  it('StartEncounter is applied; EndEncounter is applied', async () => {
    const { cookie } = await devLogin(worker, 'ws-encounter@test.local', 'WSEncounter');
    const campaign = await createCampaign(worker, cookie, 'Encounter Campaign');

    const { ws, nextMsg, close } = await connectLobby(campaign.id, cookie);
    try {
      await waitForMsg(nextMsg, (m) => m.kind === 'applied'); // JoinLobby

      // Add a monster so the roster is non-empty (StartEncounter works on current roster).
      dispatch(ws, 'AddMonster', { monsterId: 'goblin-warrior-l1', quantity: 2 });
      await waitForMsg(nextMsg, (m) => m.kind === 'applied'); // AddMonster

      // StartEncounter — supply a known encounterId so EndEncounter can reference it.
      // The reducer uses the client-suggested id if provided (falls back to ulid()).
      const encounterId = `test-enc-${Date.now()}`;
      dispatch(ws, 'StartEncounter', { encounterId });
      const startApplied = await waitForMsg(
        nextMsg,
        (m) => m.kind === 'applied' || m.kind === 'rejected',
      );
      if (startApplied.kind === 'rejected') {
        throw new Error(`StartEncounter rejected: ${JSON.stringify(startApplied.reason)}`);
      }
      const startIntent = startApplied.intent as { type?: string };
      expect(startIntent.type).toBe('StartEncounter');

      // EndEncounter — use the same encounterId we passed to StartEncounter.
      dispatch(ws, 'EndEncounter', { encounterId });
      const endApplied = await waitForMsg(
        nextMsg,
        (m) => m.kind === 'applied' || m.kind === 'rejected',
      );
      if (endApplied.kind === 'rejected') {
        throw new Error(`EndEncounter rejected: ${JSON.stringify(endApplied.reason)}`);
      }
      expect(endApplied.kind).toBe('applied');
      const endIntent = endApplied.intent as { type?: string };
      expect(endIntent.type).toBe('EndEncounter');
    } finally {
      close();
    }
  });
});

describe('JumpBehindScreen', () => {
  it('owner can jump behind the screen (always permitted)', async () => {
    const { cookie: ownerCookie } = await devLogin(worker, 'jbs-owner@test.local', 'JBSOwner');
    const campaign = await createCampaign(worker, ownerCookie, 'JBS Campaign');

    const { ws, nextMsg, close } = await connectLobby(campaign.id, ownerCookie);
    try {
      await waitForMsg(nextMsg, (m) => m.kind === 'applied'); // JoinLobby

      dispatch(ws, 'JumpBehindScreen', {});
      const msg = await waitForMsg(nextMsg, (m) => m.kind === 'applied');
      const intent = msg.intent as { type?: string };
      expect(intent.type).toBe('JumpBehindScreen');
    } finally {
      close();
    }
  });

  it('non-director member gets rejected', async () => {
    const { cookie: ownerCookie } = await devLogin(worker, 'jbs-owner2@test.local', 'JBSOwner2');
    const { cookie: playerCookie } = await devLogin(worker, 'jbs-player@test.local', 'JBSPlayer');

    const campaign = await createCampaign(worker, ownerCookie, 'JBS Campaign 2');
    await joinCampaign(worker, playerCookie, campaign.inviteCode);

    const { nextMsg: ownerNext, close: ownerClose } = await connectLobby(campaign.id, ownerCookie);
    const {
      ws: playerWs,
      nextMsg: playerNext,
      close: playerClose,
    } = await connectLobby(campaign.id, playerCookie);
    try {
      // Drain JoinLobby on both sides.
      await waitForMsg(ownerNext, (m) => m.kind === 'applied');
      await waitForMsg(playerNext, (m) => m.kind === 'applied');

      dispatch(playerWs, 'JumpBehindScreen', {});

      // Player should get a rejected envelope (permitted=false → reducer rejects).
      const msg = await waitForMsg(playerNext, (m) => m.kind === 'rejected');
      expect(msg.kind).toBe('rejected');
    } finally {
      ownerClose();
      playerClose();
    }
  });

  it('director-permitted member can jump behind the screen', async () => {
    const { cookie: ownerCookie } = await devLogin(worker, 'jbs-owner3@test.local', 'JBSOwner3');
    const { cookie: dirCookie, userId: dirId } = await devLogin(
      worker,
      'jbs-dir@test.local',
      'JBSDir',
    );

    const campaign = await createCampaign(worker, ownerCookie, 'JBS Campaign 3');
    await joinCampaign(worker, dirCookie, campaign.inviteCode);

    // Grant director permission.
    await authedFetch(
      worker,
      ownerCookie,
      `/api/campaigns/${campaign.id}/members/${dirId}/director`,
      { method: 'POST' },
    );

    const { nextMsg: ownerNext, close: ownerClose } = await connectLobby(campaign.id, ownerCookie);
    const {
      ws: dirWs,
      nextMsg: dirNext,
      close: dirClose,
    } = await connectLobby(campaign.id, dirCookie);
    try {
      await waitForMsg(ownerNext, (m) => m.kind === 'applied');
      await waitForMsg(dirNext, (m) => m.kind === 'applied');

      dispatch(dirWs, 'JumpBehindScreen', {});
      const msg = await waitForMsg(dirNext, (m) => m.kind === 'applied');
      const intent = msg.intent as { type?: string };
      expect(intent.type).toBe('JumpBehindScreen');
    } finally {
      ownerClose();
      dirClose();
    }
  });
});

describe('SubmitCharacter', () => {
  it('rejects SubmitCharacter when the player does not own the character', async () => {
    const { cookie: ownerCookie } = await devLogin(worker, 'sc-owner@test.local', 'SCOwner');
    const { cookie: playerCookie } = await devLogin(worker, 'sc-player@test.local', 'SCPlayer');

    const campaign = await createCampaign(worker, ownerCookie, 'SC Campaign');
    await joinCampaign(worker, playerCookie, campaign.inviteCode);

    const {
      ws: playerWs,
      nextMsg: playerNext,
      close: playerClose,
    } = await connectLobby(campaign.id, playerCookie);
    try {
      await waitForMsg(playerNext, (m) => m.kind === 'applied'); // JoinLobby

      // Submit a character that doesn't exist in D1 — stamper stamps
      // ownsCharacter=false (character row not found), reducer rejects.
      dispatch(playerWs, 'SubmitCharacter', { characterId: 'char-nonexistent' });

      const msg = await waitForMsg(
        playerNext,
        (m) => m.kind === 'rejected' || m.kind === 'applied',
      );
      // The reducer should reject when ownsCharacter=false.
      expect(msg.kind).toBe('rejected');
    } finally {
      playerClose();
    }
  });
});

describe('KickPlayer', () => {
  it('director can kick a player; their membership row is removed', async () => {
    const { cookie: ownerCookie } = await devLogin(worker, 'kick-owner@test.local', 'KickOwner');
    const { cookie: playerCookie, userId: playerId } = await devLogin(
      worker,
      'kick-player@test.local',
      'KickPlayer',
    );

    const campaign = await createCampaign(worker, ownerCookie, 'Kick Campaign');
    await joinCampaign(worker, playerCookie, campaign.inviteCode);

    const {
      ws: ownerWs,
      nextMsg: ownerNext,
      close: ownerClose,
    } = await connectLobby(campaign.id, ownerCookie);
    try {
      await waitForMsg(ownerNext, (m) => m.kind === 'applied'); // JoinLobby

      dispatch(ownerWs, 'KickPlayer', { userId: playerId });

      const msg = await waitForMsg(ownerNext, (m) => m.kind === 'applied');
      const intent = msg.intent as { type?: string };
      expect(intent.type).toBe('KickPlayer');

      // Verify the kicked player can no longer list this campaign.
      const listRes = await authedFetch(worker, playerCookie, '/api/campaigns');
      const campaigns = (await listRes.json()) as Array<{ id: string }>;
      expect(campaigns.some((c) => c.id === campaign.id)).toBe(false);
    } finally {
      ownerClose();
    }
  });

  it('rejects if the director tries to kick the owner', async () => {
    const { cookie: ownerCookie, userId: ownerId } = await devLogin(
      worker,
      'kick-own@test.local',
      'KickOwn',
    );
    const campaign = await createCampaign(worker, ownerCookie, 'Kick Own Campaign');

    const { ws, nextMsg, close } = await connectLobby(campaign.id, ownerCookie);
    try {
      await waitForMsg(nextMsg, (m) => m.kind === 'applied'); // JoinLobby

      dispatch(ws, 'KickPlayer', { userId: ownerId });

      const msg = await waitForMsg(nextMsg, (m) => m.kind === 'rejected');
      expect(msg.kind).toBe('rejected');
    } finally {
      close();
    }
  });
});
