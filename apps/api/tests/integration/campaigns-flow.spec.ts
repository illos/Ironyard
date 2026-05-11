/**
 * campaigns-flow.spec.ts
 *
 * Integration tests for /api/campaigns/* HTTP routes against a real
 * Miniflare-backed worker (via unstable_dev). Covers:
 *  - Campaign creation → owner row written, is_director=1
 *  - Joining a campaign via invite code
 *  - Grant / revoke director permission
 *  - Revoke while target is NOT behind the screen (D1-only path)
 *  - Encounter template CRUD (POST, GET, DELETE)
 *  - GET /characters with status filter
 *
 * What this is NOT testing: reducer correctness (covered by packages/rules),
 * WS protocol (see lobby-ws-flow.spec.ts). Focus is HTTP → D1 wire-up.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Unstable_DevWorker } from 'wrangler';
import { authedFetch, createCampaign, devLogin, joinCampaign, startWorker } from './helpers';

let worker: Unstable_DevWorker;

beforeAll(async () => {
  worker = await startWorker();
}, 30_000); // first start can be slow while Miniflare compiles

afterAll(async () => {
  await worker.stop();
});

// ── Campaign lifecycle ────────────────────────────────────────────────────────

describe('POST /api/campaigns', () => {
  it('creates a campaign and returns isOwner + isDirector', async () => {
    const { cookie } = await devLogin(worker, 'owner@test.local', 'Owner');
    const campaign = await createCampaign(worker, cookie, 'Test Campaign A');

    expect(campaign.id).toBeTruthy();
    expect(campaign.name).toBe('Test Campaign A');
    expect(campaign.inviteCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(campaign.isOwner).toBe(true);
    expect(campaign.isDirector).toBe(true);
  });

  it('rejects when not authenticated', async () => {
    const res = await worker.fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Anon Campaign' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/campaigns/join', () => {
  it('joins as non-director and returns isOwner=false, isDirector=false', async () => {
    const { cookie: ownerCookie } = await devLogin(worker, 'owner2@test.local', 'Owner2');
    const { cookie: playerCookie } = await devLogin(worker, 'player1@test.local', 'Player1');

    const campaign = await createCampaign(worker, ownerCookie, 'Campaign B');
    const joined = await joinCampaign(worker, playerCookie, campaign.inviteCode);

    expect(joined.id).toBe(campaign.id);
    expect(joined.isOwner).toBe(false);
    expect(joined.isDirector).toBe(false);
  });

  it('returns 404 for an invalid invite code', async () => {
    const { cookie } = await devLogin(worker, 'player2@test.local', 'Player2');
    const res = await authedFetch(worker, cookie, '/api/campaigns/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode: 'NOPE00' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/campaigns', () => {
  it('lists campaigns the caller belongs to', async () => {
    const { cookie } = await devLogin(worker, 'lister@test.local', 'Lister');
    await createCampaign(worker, cookie, 'Listed Campaign');

    const res = await authedFetch(worker, cookie, '/api/campaigns');
    expect(res.ok).toBe(true);
    const data = (await res.json()) as Array<{ name: string }>;
    expect(data.some((c) => c.name === 'Listed Campaign')).toBe(true);
  });
});

describe('GET /api/campaigns/:id', () => {
  it('returns metadata including isOwner and activeDirectorId for owner', async () => {
    const { cookie, userId } = await devLogin(worker, 'meta-owner@test.local', 'MetaOwner');
    const campaign = await createCampaign(worker, cookie, 'Meta Campaign');

    const res = await authedFetch(worker, cookie, `/api/campaigns/${campaign.id}`);
    expect(res.ok).toBe(true);
    const data = (await res.json()) as {
      isOwner: boolean;
      isDirector: boolean;
      activeDirectorId: string;
    };
    expect(data.isOwner).toBe(true);
    expect(data.isDirector).toBe(true);
    // Before any WS connects, activeDirectorId falls back to ownerId.
    expect(data.activeDirectorId).toBe(userId);
  });

  it('returns 403 for a non-member', async () => {
    const { cookie: ownerCookie } = await devLogin(worker, 'nfm-owner@test.local', 'NFMOwner');
    const { cookie: strangerCookie } = await devLogin(worker, 'stranger@test.local', 'Stranger');
    const campaign = await createCampaign(worker, ownerCookie, 'Private Campaign');

    const res = await authedFetch(worker, strangerCookie, `/api/campaigns/${campaign.id}`);
    expect(res.status).toBe(403);
  });
});

// ── Director permission grant / revoke ────────────────────────────────────────

describe('POST /api/campaigns/:id/members/:userId/director', () => {
  it('grants director permission to a member (owner only)', async () => {
    const { cookie: ownerCookie } = await devLogin(worker, 'grant-owner@test.local', 'GrantOwner');
    const { cookie: playerCookie, userId: playerId } = await devLogin(
      worker,
      'grant-player@test.local',
      'GrantPlayer',
    );

    const campaign = await createCampaign(worker, ownerCookie, 'Grant Campaign');
    await joinCampaign(worker, playerCookie, campaign.inviteCode);

    const res = await authedFetch(
      worker,
      ownerCookie,
      `/api/campaigns/${campaign.id}/members/${playerId}/director`,
      { method: 'POST' },
    );
    expect(res.ok).toBe(true);

    // Verify: player's campaign detail now shows isDirector=true.
    const meta = await authedFetch(worker, playerCookie, `/api/campaigns/${campaign.id}`);
    const data = (await meta.json()) as { isDirector: boolean };
    expect(data.isDirector).toBe(true);
  });

  it('rejects if caller is not the owner', async () => {
    const { cookie: ownerCookie } = await devLogin(
      worker,
      'grant-owner2@test.local',
      'GrantOwner2',
    );
    const { cookie: dirCookie, userId: dirId } = await devLogin(
      worker,
      'grant-dir@test.local',
      'GrantDir',
    );
    const { cookie: playerCookie, userId: playerId } = await devLogin(
      worker,
      'grant-player2@test.local',
      'GrantPlayer2',
    );

    const campaign = await createCampaign(worker, ownerCookie, 'Grant Campaign 2');
    await joinCampaign(worker, dirCookie, campaign.inviteCode);
    await joinCampaign(worker, playerCookie, campaign.inviteCode);

    // Director tries to grant permission to player — should fail.
    const res = await authedFetch(
      worker,
      dirCookie,
      `/api/campaigns/${campaign.id}/members/${playerId}/director`,
      { method: 'POST' },
    );
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/campaigns/:id/members/:userId/director', () => {
  it('revokes director permission from a member', async () => {
    const { cookie: ownerCookie } = await devLogin(worker, 'rev-owner@test.local', 'RevOwner');
    const { cookie: playerCookie, userId: playerId } = await devLogin(
      worker,
      'rev-player@test.local',
      'RevPlayer',
    );

    const campaign = await createCampaign(worker, ownerCookie, 'Revoke Campaign');
    await joinCampaign(worker, playerCookie, campaign.inviteCode);

    // Grant first.
    await authedFetch(
      worker,
      ownerCookie,
      `/api/campaigns/${campaign.id}/members/${playerId}/director`,
      { method: 'POST' },
    );

    // Then revoke.
    const res = await authedFetch(
      worker,
      ownerCookie,
      `/api/campaigns/${campaign.id}/members/${playerId}/director`,
      { method: 'DELETE' },
    );
    expect(res.ok).toBe(true);

    // Verify: player's campaign detail now shows isDirector=false.
    const meta = await authedFetch(worker, playerCookie, `/api/campaigns/${campaign.id}`);
    const data = (await meta.json()) as { isDirector: boolean };
    expect(data.isDirector).toBe(false);
  });

  it('rejects attempt to revoke the owner themselves', async () => {
    const { cookie: ownerCookie, userId: ownerId } = await devLogin(
      worker,
      'rev-owner-self@test.local',
      'RevOwnerSelf',
    );
    const campaign = await createCampaign(worker, ownerCookie, 'Revoke Self Campaign');

    const res = await authedFetch(
      worker,
      ownerCookie,
      `/api/campaigns/${campaign.id}/members/${ownerId}/director`,
      { method: 'DELETE' },
    );
    expect(res.status).toBe(400);
  });
});

// ── Encounter templates CRUD ──────────────────────────────────────────────────

describe('Encounter template CRUD', () => {
  it('director can create, list, and delete a template', async () => {
    const { cookie: ownerCookie } = await devLogin(worker, 'tmpl-owner@test.local', 'TmplOwner');
    const campaign = await createCampaign(worker, ownerCookie, 'Template Campaign');

    // Create template.
    const createRes = await authedFetch(
      worker,
      ownerCookie,
      `/api/campaigns/${campaign.id}/templates`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Goblin Patrol',
          data: {
            monsters: [{ monsterId: 'goblin-soldier-l1', quantity: 4 }],
            notes: 'Standard patrol',
          },
        }),
      },
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; name: string };
    expect(created.name).toBe('Goblin Patrol');
    expect(created.id).toBeTruthy();

    // List.
    const listRes = await authedFetch(
      worker,
      ownerCookie,
      `/api/campaigns/${campaign.id}/templates`,
    );
    expect(listRes.ok).toBe(true);
    const list = (await listRes.json()) as Array<{ id: string; name: string }>;
    expect(list.some((t) => t.id === created.id)).toBe(true);

    // Delete.
    const deleteRes = await authedFetch(
      worker,
      ownerCookie,
      `/api/campaigns/${campaign.id}/templates/${created.id}`,
      { method: 'DELETE' },
    );
    expect(deleteRes.ok).toBe(true);

    // Verify gone.
    const listRes2 = await authedFetch(
      worker,
      ownerCookie,
      `/api/campaigns/${campaign.id}/templates`,
    );
    const list2 = (await listRes2.json()) as Array<{ id: string }>;
    expect(list2.some((t) => t.id === created.id)).toBe(false);
  });

  it('non-director member cannot create a template', async () => {
    const { cookie: ownerCookie } = await devLogin(worker, 'tmpl-owner2@test.local', 'TmplOwner2');
    const { cookie: playerCookie } = await devLogin(worker, 'tmpl-player@test.local', 'TmplPlayer');

    const campaign = await createCampaign(worker, ownerCookie, 'Template Campaign 2');
    await joinCampaign(worker, playerCookie, campaign.inviteCode);

    const res = await authedFetch(worker, playerCookie, `/api/campaigns/${campaign.id}/templates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Player Template',
        data: { monsters: [{ monsterId: 'goblin-soldier-l1', quantity: 1 }] },
      }),
    });
    expect(res.status).toBe(403);
  });
});

// ── Campaign characters list ──────────────────────────────────────────────────

describe('GET /api/campaigns/:id/characters', () => {
  it('returns empty array for a fresh campaign', async () => {
    const { cookie } = await devLogin(worker, 'chars-owner@test.local', 'CharsOwner');
    const campaign = await createCampaign(worker, cookie, 'Chars Campaign');

    const res = await authedFetch(worker, cookie, `/api/campaigns/${campaign.id}/characters`);
    expect(res.ok).toBe(true);
    const data = (await res.json()) as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it('returns 403 for a non-member', async () => {
    const { cookie: ownerCookie } = await devLogin(
      worker,
      'chars-owner2@test.local',
      'CharsOwner2',
    );
    const { cookie: strangerCookie } = await devLogin(
      worker,
      'chars-stranger@test.local',
      'CharsStranger',
    );
    const campaign = await createCampaign(worker, ownerCookie, 'Chars Campaign 2');

    const res = await authedFetch(
      worker,
      strangerCookie,
      `/api/campaigns/${campaign.id}/characters`,
    );
    expect(res.status).toBe(403);
  });
});
