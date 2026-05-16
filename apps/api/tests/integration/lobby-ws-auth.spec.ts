/**
 * lobby-ws-auth.spec.ts
 *
 * Closes two authorization gaps at the WebSocket dispatch boundary of
 * `LobbyDO`:
 *
 *   Gap 1 — `SERVER_ONLY_INTENTS` enforcement.
 *     The lobby's local set listed only protocol/derivation intents
 *     (`JoinLobby`, `LeaveLobby`, `ApplyDamage`, `RaiseOpenAction`). The
 *     shared `@ironyard/shared` set lists every engine-derived intent the
 *     reducer may emit (e.g. `TroubadourAutoRevive`, `StaminaTransitioned`,
 *     `ExecuteTrigger`). Closing the gap unions the two so the lobby rejects
 *     a client trying to inject any engine-derived intent.
 *
 *   Gap 2 — per-intent `canDispatch` authorization.
 *     `packages/rules/src/permissions.ts` exports `canDispatch(intent, actor,
 *     state)` which today gates `StartMaintenance` / `StopMaintenance` on
 *     "owner of the PC or active director". The lobby never called it.
 *     Closing the gap calls `canDispatch` between the `SERVER_ONLY` check and
 *     the stamping pipeline.
 *
 * What this file does NOT test: the reducer's own validation (already covered
 * in packages/rules). The focus here is the WS auth boundary.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Unstable_DevWorker } from 'wrangler';
import {
  createCampaign,
  createPendingCharacter,
  devLogin,
  joinCampaign,
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

// ── WS helpers (duplicated from lobby-ws-flow.spec.ts to keep the auth suite
// independent — they're small enough not to extract just yet). ────────────────

// biome-ignore lint/suspicious/noExplicitAny: Node undici WS headers option not in @types/node
type NativeWebSocketCtor = new (url: string, options?: any) => WebSocket;
const NativeWebSocket = globalThis.WebSocket as NativeWebSocketCtor;

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
    return new Promise<Record<string, unknown>>((resolve) => waiters.push(resolve));
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

function appliedOf(type: string) {
  return (m: Record<string, unknown>) =>
    (m.kind === 'applied' && (m.intent as { type?: string } | undefined)?.type === type) ||
    m.kind === 'rejected';
}

async function setupApprovedCharacter(
  cookie: string,
  inviteCode: string,
  ws: WebSocket,
  nextMsg: () => Promise<Record<string, unknown>>,
): Promise<string> {
  const characterId = await createPendingCharacter(worker, cookie, inviteCode);
  dispatch(ws, 'ApproveCharacter', { characterId });
  const approved = await waitForMsg(nextMsg, appliedOf('ApproveCharacter'));
  if (approved.kind === 'rejected') {
    throw new Error(`ApproveCharacter rejected: ${JSON.stringify(approved.reason)}`);
  }
  return characterId;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Gap 1 — shared SERVER_ONLY_INTENTS are enforced at the WS boundary', () => {
  it('rejects TroubadourAutoRevive from the client (engine-derived only)', async () => {
    // Pre-fix: the lobby's local SERVER_ONLY set did not include
    // TroubadourAutoRevive, so a client could inject it and force a downed
    // hero's stamina to 1. Post-fix: the union with the shared set blocks it.
    const { cookie } = await devLogin(worker, 'auth-trev@test.local', 'AuthTRev');
    const campaign = await createCampaign(worker, cookie, 'AuthTRev Campaign');

    const { ws, nextMsg, close } = await connectLobby(campaign.id, cookie);
    try {
      await waitForMsg(nextMsg, (m) => m.kind === 'applied'); // JoinLobby

      dispatch(ws, 'TroubadourAutoRevive', { participantId: 'pc:whatever' });

      const rejected = await waitForMsg(nextMsg, (m) => m.kind === 'rejected');
      expect(rejected.kind).toBe('rejected');
      // The exact reason format from lobby-do.ts:
      //   `permission: ${type} is server-only`
      expect(String(rejected.reason)).toMatch(/server-only/);
      expect(String(rejected.reason)).toMatch(/TroubadourAutoRevive/);
    } finally {
      close();
    }
  });

  it('regression: ApplyDamage is still rejected (was in the local set)', async () => {
    // Closing Gap 1 unions the shared set with the local set. ApplyDamage
    // was already in BOTH lists; this test ensures it stays blocked.
    const { cookie } = await devLogin(worker, 'auth-ad@test.local', 'AuthAD');
    const campaign = await createCampaign(worker, cookie, 'AuthAD Campaign');

    const { ws, nextMsg, close } = await connectLobby(campaign.id, cookie);
    try {
      await waitForMsg(nextMsg, (m) => m.kind === 'applied'); // JoinLobby

      dispatch(ws, 'ApplyDamage', { participantId: 'pc:whatever', amount: 5 });

      const rejected = await waitForMsg(nextMsg, (m) => m.kind === 'rejected');
      expect(rejected.kind).toBe('rejected');
      expect(String(rejected.reason)).toMatch(/server-only/);
      expect(String(rejected.reason)).toMatch(/ApplyDamage/);
    } finally {
      close();
    }
  });
});

describe('Gap 2 — canDispatch gates per-intent authorization', () => {
  it('rejects StartMaintenance from a non-owner non-director with "permission" reason', async () => {
    // Player has no character of their own and is not the director. canDispatch
    // can't find a matching owner-or-director path, so it returns false and the
    // lobby short-circuits with a "permission: ... not allowed for actor" reason
    // BEFORE the engine ever sees the intent.
    //
    // Pre-fix (Gap 2 open): this would have been forwarded to the reducer and
    // rejected with the engine's "participant_not_found" reason, not a
    // "permission" reason. The text discriminates "auth gate vs engine gate".
    const { cookie: ownerCookie } = await devLogin(
      worker,
      'auth-perm-owner@test.local',
      'AuthPermOwner',
    );
    const { cookie: playerCookie } = await devLogin(
      worker,
      'auth-perm-player@test.local',
      'AuthPermPlayer',
    );

    const campaign = await createCampaign(worker, ownerCookie, 'AuthPerm Campaign');
    await joinCampaign(worker, playerCookie, campaign.inviteCode);

    const { close: ownerClose } = await connectLobby(campaign.id, ownerCookie);
    const {
      ws: playerWs,
      nextMsg: playerNext,
      close: playerClose,
    } = await connectLobby(campaign.id, playerCookie);
    try {
      await waitForMsg(playerNext, (m) => m.kind === 'applied'); // JoinLobby

      // Some-other-PC id; this player owns nothing and is not the director.
      dispatch(playerWs, 'StartMaintenance', {
        participantId: 'pc:char-not-mine',
        abilityId: 'fire-aspect',
        costPerTurn: 1,
      });

      const rejected = await waitForMsg(playerNext, (m) => m.kind === 'rejected');
      expect(rejected.kind).toBe('rejected');
      expect(String(rejected.reason)).toMatch(/permission/);
      expect(String(rejected.reason)).toMatch(/StartMaintenance/);
      expect(String(rejected.reason)).toMatch(/not allowed for actor/);
    } finally {
      ownerClose();
      playerClose();
    }
  });

  it('lets the PC owner past the canDispatch gate (regression for the owner path)', async () => {
    // The owner of the PC dispatches StartMaintenance for their own
    // participant. canDispatch sees isOwner=true and returns true; the
    // intent reaches the reducer. The reducer itself may still reject (the
    // fixture character is a "fury", not an Elementalist, so it'll fail
    // the not_elementalist check) — but the rejection reason must NOT come
    // from the auth layer (must NOT match /permission/).
    const { cookie } = await devLogin(worker, 'auth-own@test.local', 'AuthOwn');
    const campaign = await createCampaign(worker, cookie, 'AuthOwn Campaign');

    const { ws, nextMsg, close } = await connectLobby(campaign.id, cookie);
    try {
      await waitForMsg(nextMsg, (m) => m.kind === 'applied'); // JoinLobby

      const characterId = await setupApprovedCharacter(cookie, campaign.inviteCode, ws, nextMsg);

      // StartSession then StartEncounter — PCs are materialized as
      // participants only during StartEncounter (pc:${characterId}).
      dispatch(ws, 'StartSession', { attendingCharacterIds: [characterId] });
      const sessApplied = await waitForMsg(nextMsg, appliedOf('StartSession'));
      if (sessApplied.kind === 'rejected') {
        throw new Error(`StartSession rejected: ${JSON.stringify(sessApplied.reason)}`);
      }

      dispatch(ws, 'AddMonster', { monsterId: 'goblin-warrior-l1', quantity: 1 });
      const addApplied = await waitForMsg(nextMsg, appliedOf('AddMonster'));
      if (addApplied.kind === 'rejected') {
        throw new Error(`AddMonster rejected: ${JSON.stringify(addApplied.reason)}`);
      }

      const encounterId = `enc-auth-${Date.now()}`;
      // characterIds is mandatory if we expect PCs in the encounter — the DO
      // stamper resolves these to stampedPcs which the reducer then
      // materializes into pc:${characterId} participants.
      dispatch(ws, 'StartEncounter', { encounterId, characterIds: [characterId] });
      const encApplied = await waitForMsg(nextMsg, appliedOf('StartEncounter'));
      if (encApplied.kind === 'rejected') {
        throw new Error(`StartEncounter rejected: ${JSON.stringify(encApplied.reason)}`);
      }

      // Owner dispatching for their own PC. canDispatch must let it through;
      // the reducer will then reject (fury isn't an Elementalist) but with a
      // non-permission reason. Either way, we MUST NOT see /permission/.
      dispatch(ws, 'StartMaintenance', {
        participantId: `pc:${characterId}`,
        abilityId: 'fire-aspect',
        costPerTurn: 1,
      });

      const msg = await waitForMsg(nextMsg, appliedOf('StartMaintenance'));
      // Whether applied or rejected, the rejection (if any) must be from
      // the reducer, not from the auth gate.
      if (msg.kind === 'rejected') {
        expect(String(msg.reason)).not.toMatch(/permission/);
      } else {
        expect(msg.kind).toBe('applied');
      }
    } finally {
      close();
    }
  });

  it('lets the active director past the canDispatch gate (regression for the director path)', async () => {
    // Two members: owner (always active director by default) and a player
    // whose PC will be the target. The owner dispatches StartMaintenance
    // against the player's PC — canDispatch must permit it because
    // actor.userId === state.activeDirectorId (owner is the active director).
    const { cookie: ownerCookie } = await devLogin(
      worker,
      'auth-dir-owner@test.local',
      'AuthDirOwner',
    );
    const { cookie: playerCookie } = await devLogin(
      worker,
      'auth-dir-player@test.local',
      'AuthDirPlayer',
    );

    const campaign = await createCampaign(worker, ownerCookie, 'AuthDir Campaign');
    await joinCampaign(worker, playerCookie, campaign.inviteCode);

    const {
      ws: ownerWs,
      nextMsg: ownerNext,
      close: ownerClose,
    } = await connectLobby(campaign.id, ownerCookie);
    const { close: playerClose } = await connectLobby(campaign.id, playerCookie);
    try {
      await waitForMsg(ownerNext, (m) => m.kind === 'applied'); // JoinLobby (owner)

      // Player's character — created by the player, approved by the owner
      // over the owner's WS.
      const characterId = await createPendingCharacter(worker, playerCookie, campaign.inviteCode);
      dispatch(ownerWs, 'ApproveCharacter', { characterId });
      const approved = await waitForMsg(ownerNext, appliedOf('ApproveCharacter'));
      if (approved.kind === 'rejected') {
        throw new Error(`ApproveCharacter rejected: ${JSON.stringify(approved.reason)}`);
      }

      dispatch(ownerWs, 'StartSession', { attendingCharacterIds: [characterId] });
      const sess = await waitForMsg(ownerNext, appliedOf('StartSession'));
      if (sess.kind === 'rejected') {
        throw new Error(`StartSession rejected: ${JSON.stringify(sess.reason)}`);
      }

      dispatch(ownerWs, 'AddMonster', { monsterId: 'goblin-warrior-l1', quantity: 1 });
      const add = await waitForMsg(ownerNext, appliedOf('AddMonster'));
      if (add.kind === 'rejected') {
        throw new Error(`AddMonster rejected: ${JSON.stringify(add.reason)}`);
      }

      const encounterId = `enc-authdir-${Date.now()}`;
      dispatch(ownerWs, 'StartEncounter', { encounterId, characterIds: [characterId] });
      const enc = await waitForMsg(ownerNext, appliedOf('StartEncounter'));
      if (enc.kind === 'rejected') {
        throw new Error(`StartEncounter rejected: ${JSON.stringify(enc.reason)}`);
      }

      // Director (owner) targets the player's PC.
      dispatch(ownerWs, 'StartMaintenance', {
        participantId: `pc:${characterId}`,
        abilityId: 'fire-aspect',
        costPerTurn: 1,
      });

      const msg = await waitForMsg(ownerNext, appliedOf('StartMaintenance'));
      if (msg.kind === 'rejected') {
        // Reducer-level rejection is OK (not Elementalist). Auth-level is not.
        expect(String(msg.reason)).not.toMatch(/permission/);
      } else {
        expect(msg.kind).toBe('applied');
      }
    } finally {
      ownerClose();
      playerClose();
    }
  });
});
