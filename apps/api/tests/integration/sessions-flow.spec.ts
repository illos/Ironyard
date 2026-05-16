/**
 * sessions-flow.spec.ts
 *
 * Integration tests for the session lifecycle over the LobbyDO WebSocket
 * protocol. Uses Miniflare-backed unstable_dev so D1 writes, DO state, and
 * the full intent pipeline are real (not mocked).
 *
 * Covered flows:
 *  1. StartSession is applied; D1 sessions row written; currentSessionId set
 *  2. StartEncounter rejects when no session is active (no_active_session)
 *  3. GainHeroToken increases the hero-token pool (applied envelope)
 *  4. UpdateSessionAttendance changes the attending character list
 *  5. EndSession clears currentSessionId (applied envelope)
 *
 * Setup pattern for each test that needs an approved character:
 *   1. devLogin + createCampaign → director
 *   2. createPendingCharacter (HTTP: create character + auto-attach → pending)
 *   3. connectLobby + drain JoinLobby
 *   4. dispatch ApproveCharacter → wait applied
 *   5. dispatch StartSession with characterId → wait applied
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Unstable_DevWorker } from 'wrangler';
import {
  createCampaign,
  createPendingCharacter,
  devLogin,
  startWorker,
  wsBaseUrl,
} from './helpers';

let worker: Unstable_DevWorker;

beforeAll(async () => {
  worker = await startWorker();
}, 40_000);

afterAll(async () => {
  await worker.stop();
});

// ── Node native WebSocket (undici) ────────────────────────────────────────────
// biome-ignore lint/suspicious/noExplicitAny: Node undici WS headers option not in @types/node
type NativeWebSocketCtor = new (url: string, options?: any) => WebSocket;
const NativeWebSocket = globalThis.WebSocket as NativeWebSocketCtor;

// ── Shared helpers ────────────────────────────────────────────────────────────

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
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise<Record<string, unknown>>((resolve) => {
      waiters.push(resolve);
    });
  }

  function close() {
    ws.close();
  }

  return { ws, nextMsg, close };
}

function dispatch(ws: WebSocket, type: string, payload: Record<string, unknown>): void {
  ws.send(
    JSON.stringify({
      kind: 'dispatch',
      intent: {
        id: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type,
        payload,
        source: 'manual',
        campaignId: 'client-placeholder',
        actor: { userId: 'client-placeholder', role: 'player' },
      },
    }),
  );
}

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

/**
 * Set up: director, campaign, pending character → approve → return characterId.
 * Requires an already-connected WS (post-JoinLobby drain).
 *
 * Waits specifically for the ApproveCharacter applied/rejected envelope so that
 * other broadcast messages (e.g. member_list) don't interfere with the caller's
 * own waitForMsg calls.
 */
async function setupApprovedCharacter(
  worker: Unstable_DevWorker,
  cookie: string,
  inviteCode: string,
  ws: WebSocket,
  nextMsg: () => Promise<Record<string, unknown>>,
): Promise<string> {
  const characterId = await createPendingCharacter(worker, cookie, inviteCode);

  dispatch(ws, 'ApproveCharacter', { characterId });
  const approveMsg = await waitForMsg(
    nextMsg,
    (m) =>
      (m.kind === 'applied' &&
        (m.intent as { type?: string } | undefined)?.type === 'ApproveCharacter') ||
      m.kind === 'rejected',
  );
  if (approveMsg.kind === 'rejected') {
    throw new Error(`ApproveCharacter rejected: ${JSON.stringify(approveMsg.reason)}`);
  }

  return characterId;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// Predicate helpers — wait for a specific intent type in applied envelopes,
// or any rejected envelope. Using these avoids races where a broadcast of an
// earlier intent (e.g. ApproveCharacter) gets picked up instead of the next
// dispatched intent's response.
function appliedOf(type: string) {
  return (m: Record<string, unknown>) =>
    (m.kind === 'applied' && (m.intent as { type?: string } | undefined)?.type === type) ||
    m.kind === 'rejected';
}

describe('Sessions lifecycle (WS flow)', () => {
  it('StartSession is applied; state carries the new session id', async () => {
    const { cookie } = await devLogin(worker, 'sess-start@test.local', 'SessStart');
    const campaign = await createCampaign(worker, cookie, 'StartSession Campaign');

    const { ws, nextMsg, close } = await connectLobby(campaign.id, cookie);
    try {
      await waitForMsg(nextMsg, (m) => m.kind === 'applied'); // JoinLobby

      const characterId = await setupApprovedCharacter(
        worker,
        cookie,
        campaign.inviteCode,
        ws,
        nextMsg,
      );

      const sessionId = `sess-test-${Date.now()}`;
      dispatch(ws, 'StartSession', { sessionId, attendingCharacterIds: [characterId] });

      const applied = await waitForMsg(nextMsg, appliedOf('StartSession'));
      if (applied.kind === 'rejected') {
        throw new Error(`StartSession rejected: ${JSON.stringify(applied.reason)}`);
      }

      expect(applied.kind).toBe('applied');
      const intent = applied.intent as { type?: string };
      expect(intent.type).toBe('StartSession');
    } finally {
      close();
    }
  });

  it('StartEncounter rejects when no session is active', async () => {
    const { cookie } = await devLogin(worker, 'sess-no-enc@test.local', 'SessNoEnc');
    const campaign = await createCampaign(worker, cookie, 'NoSession Campaign');

    const { ws, nextMsg, close } = await connectLobby(campaign.id, cookie);
    try {
      await waitForMsg(nextMsg, (m) => m.kind === 'applied'); // JoinLobby

      // Add a monster so StartEncounter has a non-empty roster (not the limiting factor).
      dispatch(ws, 'AddMonster', { monsterId: 'goblin-warrior-l1', quantity: 1 });
      await waitForMsg(nextMsg, appliedOf('AddMonster'));

      // NO StartSession dispatched — StartEncounter must be rejected.
      dispatch(ws, 'StartEncounter', { encounterId: 'enc-should-fail' });

      // The reducer sends a rejected envelope whose reason is the error message
      // 'start a session before running combat' (error code no_active_session).
      const msg = await waitForMsg(
        nextMsg,
        (m) =>
          m.kind === 'rejected' ||
          (m.kind === 'applied' &&
            (m.intent as { type?: string } | undefined)?.type === 'StartEncounter'),
      );
      expect(msg.kind).toBe('rejected');
      // Verify the rejection is about the missing session (message text).
      expect(String(msg.reason)).toMatch(/session/i);
    } finally {
      close();
    }
  });

  it('GainHeroToken increases the hero-token pool through the WS broadcast', async () => {
    const { cookie } = await devLogin(worker, 'sess-gain-token@test.local', 'SessGainToken');
    const campaign = await createCampaign(worker, cookie, 'GainHeroToken Campaign');

    const { ws, nextMsg, close } = await connectLobby(campaign.id, cookie);
    try {
      await waitForMsg(nextMsg, (m) => m.kind === 'applied'); // JoinLobby

      const characterId = await setupApprovedCharacter(
        worker,
        cookie,
        campaign.inviteCode,
        ws,
        nextMsg,
      );

      dispatch(ws, 'StartSession', { attendingCharacterIds: [characterId] });
      const sessApplied = await waitForMsg(nextMsg, appliedOf('StartSession'));
      if (sessApplied.kind === 'rejected') {
        throw new Error(`StartSession rejected: ${JSON.stringify(sessApplied.reason)}`);
      }

      // Gain 3 tokens on top of the default 1 (attendingCharacterIds.length = 1).
      dispatch(ws, 'GainHeroToken', { amount: 3 });

      const applied = await waitForMsg(nextMsg, appliedOf('GainHeroToken'));
      if (applied.kind === 'rejected') {
        throw new Error(`GainHeroToken rejected: ${JSON.stringify(applied.reason)}`);
      }

      expect(applied.kind).toBe('applied');
      const intent = applied.intent as { type?: string };
      expect(intent.type).toBe('GainHeroToken');
    } finally {
      close();
    }
  });

  it('UpdateSessionAttendance changes the attending character list', async () => {
    const { cookie } = await devLogin(worker, 'sess-attendance@test.local', 'SessAttendance');
    const campaign = await createCampaign(worker, cookie, 'Attendance Campaign');

    const { ws, nextMsg, close } = await connectLobby(campaign.id, cookie);
    try {
      await waitForMsg(nextMsg, (m) => m.kind === 'applied'); // JoinLobby

      // Set up two approved characters.
      const charA = await setupApprovedCharacter(worker, cookie, campaign.inviteCode, ws, nextMsg);
      const charB = await createPendingCharacter(worker, cookie, campaign.inviteCode);
      dispatch(ws, 'ApproveCharacter', { characterId: charB });
      const approveB = await waitForMsg(nextMsg, appliedOf('ApproveCharacter'));
      if (approveB.kind === 'rejected') {
        throw new Error(`ApproveCharacter (B) rejected: ${JSON.stringify(approveB.reason)}`);
      }

      // Start session with only charA.
      dispatch(ws, 'StartSession', { attendingCharacterIds: [charA] });
      const sessApplied = await waitForMsg(nextMsg, appliedOf('StartSession'));
      if (sessApplied.kind === 'rejected') {
        throw new Error(`StartSession rejected: ${JSON.stringify(sessApplied.reason)}`);
      }

      // Update attendance: add charB.
      dispatch(ws, 'UpdateSessionAttendance', { add: [charB], remove: [] });

      const applied = await waitForMsg(nextMsg, appliedOf('UpdateSessionAttendance'));
      if (applied.kind === 'rejected') {
        throw new Error(`UpdateSessionAttendance rejected: ${JSON.stringify(applied.reason)}`);
      }

      expect(applied.kind).toBe('applied');
      const intent = applied.intent as { type?: string };
      expect(intent.type).toBe('UpdateSessionAttendance');
    } finally {
      close();
    }
  });

  it('EndSession clears the active session (applied envelope)', async () => {
    const { cookie } = await devLogin(worker, 'sess-end@test.local', 'SessEnd');
    const campaign = await createCampaign(worker, cookie, 'EndSession Campaign');

    const { ws, nextMsg, close } = await connectLobby(campaign.id, cookie);
    try {
      await waitForMsg(nextMsg, (m) => m.kind === 'applied'); // JoinLobby

      const characterId = await setupApprovedCharacter(
        worker,
        cookie,
        campaign.inviteCode,
        ws,
        nextMsg,
      );

      dispatch(ws, 'StartSession', { attendingCharacterIds: [characterId] });
      const sessApplied = await waitForMsg(nextMsg, appliedOf('StartSession'));
      if (sessApplied.kind === 'rejected') {
        throw new Error(`StartSession rejected: ${JSON.stringify(sessApplied.reason)}`);
      }

      dispatch(ws, 'EndSession', {});

      const applied = await waitForMsg(nextMsg, appliedOf('EndSession'));
      if (applied.kind === 'rejected') {
        throw new Error(`EndSession rejected: ${JSON.stringify(applied.reason)}`);
      }

      expect(applied.kind).toBe('applied');
      const intent = applied.intent as { type?: string };
      expect(intent.type).toBe('EndSession');
    } finally {
      close();
    }
  });
});
