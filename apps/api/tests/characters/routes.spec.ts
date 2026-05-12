/**
 * Integration tests for /api/characters routes.
 *
 * Tests:
 *  - POST blank (draft character, no campaign)
 *  - POST with campaignCode (membership join + campaignId set)
 *  - POST with campaignCode + complete data (auto-submit via LobbyDO)
 *  - GET /:id access by campaign member (non-owner)
 *  - PUT /:id owner-only guard
 *  - DELETE /:id owner-only guard
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Unstable_DevWorker } from 'wrangler';
import { authedFetch, createCampaign, devLogin, startWorker } from '../integration/helpers';

let worker: Unstable_DevWorker;

beforeAll(async () => {
  worker = await startWorker();
}, 30_000);

afterAll(async () => {
  await worker.stop();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** A CompleteCharacter fixture: satisfies CompleteCharacterSchema. Level 1, all required fields. */
function buildCompleteCharacterFixture() {
  return {
    level: 1,
    xp: 0,
    details: {},
    ancestryId: 'human',
    ancestryChoices: { traitIds: [] },
    culture: {
      customName: '',
      environment: 'urban' as const,
      organization: 'communal' as const,
      upbringing: 'martial' as const,
      environmentSkill: 'athletics',
      organizationSkill: 'persuade',
      upbringingSkill: 'endure',
      language: 'Variac',
    },
    careerId: 'soldier',
    careerChoices: {
      skills: [],
      languages: [],
      incitingIncidentId: 'battle',
      perkId: null,
    },
    classId: 'fury',
    characteristicArray: [2, -1, -1],
    characteristicSlots: { agility: 2, reason: -1, intuition: -1 },
    subclassId: null,
    levelChoices: {
      '1': { abilityIds: [], subclassAbilityIds: [], perkId: null, skillId: null },
    },
    kitId: null,
    complicationId: null,
    campaignId: null,
  };
}

interface CharacterResponse {
  id: string;
  ownerId: string;
  name: string;
  data: {
    campaignId: string | null;
    [key: string]: unknown;
  };
  createdAt: number;
  updatedAt: number;
  autoSubmitted?: boolean;
}

// ── POST /api/characters ──────────────────────────────────────────────────────

describe('POST /api/characters', () => {
  it('creates a draft character without campaignCode', async () => {
    const { cookie } = await devLogin(worker, 'char-create-draft@test.local', 'DraftUser');
    const res = await authedFetch(worker, cookie, '/api/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ash' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as CharacterResponse;
    expect(body.name).toBe('Ash');
    expect(body.id).toBeTruthy();
    expect(body.ownerId).toBeTruthy();
    expect(body.data.campaignId).toBeNull();
    expect(body.autoSubmitted).toBe(false);
  });

  it('returns 401 without auth', async () => {
    const res = await worker.fetch('/api/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ghost' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a missing name', async () => {
    const { cookie } = await devLogin(worker, 'char-badreq@test.local', 'BadReq');
    const res = await authedFetch(worker, cookie, '/api/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/characters with campaignCode', () => {
  it('joins the campaign membership and sets campaignId on the character', async () => {
    const { cookie: ownerCookie } = await devLogin(
      worker,
      'char-code-owner@test.local',
      'CodeOwner',
    );
    const { cookie: playerCookie, userId: playerId } = await devLogin(
      worker,
      'char-code-player@test.local',
      'CodePlayer',
    );

    const campaign = await createCampaign(worker, ownerCookie, 'Code Campaign');

    const res = await authedFetch(worker, playerCookie, '/api/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ash', campaignCode: campaign.inviteCode }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as CharacterResponse;
    expect(body.data.campaignId).toBe(campaign.id);
    expect(body.autoSubmitted).toBe(false);

    // Verify the player is now a member of the campaign.
    const campaignRes = await authedFetch(worker, playerCookie, `/api/campaigns/${campaign.id}`);
    expect(campaignRes.status).toBe(200);
    const campaignData = (await campaignRes.json()) as { isOwner: boolean; isDirector: boolean };
    expect(campaignData.isOwner).toBe(false);
    expect(campaignData.isDirector).toBe(false);

    // Calling again with the same code should be idempotent (no duplicate membership).
    const res2 = await authedFetch(worker, playerCookie, '/api/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ash2', campaignCode: campaign.inviteCode }),
    });
    expect(res2.status).toBe(200);
  });

  it('returns 404 for an unknown campaign code', async () => {
    const { cookie } = await devLogin(worker, 'char-badcode@test.local', 'BadCode');
    const res = await authedFetch(worker, cookie, '/api/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ash', campaignCode: 'ZZZZZZ' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('campaign_not_found');
  });
});

describe('POST /api/characters with campaignCode + complete data (auto-submit)', () => {
  it('auto-submits and returns autoSubmitted=true', async () => {
    const { cookie: ownerCookie } = await devLogin(
      worker,
      'char-submit-owner@test.local',
      'SubmitOwner',
    );
    const { cookie: playerCookie } = await devLogin(
      worker,
      'char-submit-player@test.local',
      'SubmitPlayer',
    );

    const campaign = await createCampaign(worker, ownerCookie, 'Submit Campaign');
    const completeData = buildCompleteCharacterFixture();

    const res = await authedFetch(worker, playerCookie, '/api/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Kaia',
        campaignCode: campaign.inviteCode,
        data: completeData,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as CharacterResponse;
    expect(body.autoSubmitted).toBe(true);

    // The campaign_characters row should exist with status 'pending'.
    const campaignCharsRes = await authedFetch(
      worker,
      ownerCookie,
      `/api/campaigns/${campaign.id}/characters?status=pending`,
    );
    expect(campaignCharsRes.status).toBe(200);
    const campaignChars = (await campaignCharsRes.json()) as Array<{
      characterId: string;
      status: string;
    }>;
    expect(campaignChars.some((cc) => cc.characterId === body.id)).toBe(true);
    const found = campaignChars.find((cc) => cc.characterId === body.id);
    expect(found?.status).toBe('pending');
  });
});

// ── GET /api/characters ───────────────────────────────────────────────────────

describe('GET /api/characters', () => {
  it("returns only the caller's characters", async () => {
    const { cookie: a } = await devLogin(worker, 'list-a@test.local', 'ListA');
    const { cookie: b } = await devLogin(worker, 'list-b@test.local', 'ListB');

    // Create one char each.
    await authedFetch(worker, a, '/api/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'CharA' }),
    });
    await authedFetch(worker, b, '/api/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'CharB' }),
    });

    const res = await authedFetch(worker, a, '/api/characters');
    expect(res.ok).toBe(true);
    const list = (await res.json()) as CharacterResponse[];
    expect(list.every((c) => c.ownerId !== undefined)).toBe(true);
    expect(list.some((c) => c.name === 'CharA')).toBe(true);
    expect(list.some((c) => c.name === 'CharB')).toBe(false);
  });
});

// ── GET /api/characters/:id ───────────────────────────────────────────────────

describe('GET /api/characters/:id', () => {
  it('returns the character to its owner', async () => {
    const { cookie } = await devLogin(worker, 'get-owner@test.local', 'GetOwner');
    const createRes = await authedFetch(worker, cookie, '/api/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Solo' }),
    });
    const created = (await createRes.json()) as CharacterResponse;

    const res = await authedFetch(worker, cookie, `/api/characters/${created.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as CharacterResponse;
    expect(body.id).toBe(created.id);
    expect(body.name).toBe('Solo');
  });

  it('allows a campaign member to see a character that belongs to the campaign', async () => {
    const { cookie: ownerCookie } = await devLogin(
      worker,
      'get-cmp-owner@test.local',
      'GetCmpOwner',
    );
    const { cookie: playerCookie } = await devLogin(
      worker,
      'get-cmp-player@test.local',
      'GetCmpPlayer',
    );
    const { cookie: memberCookie } = await devLogin(
      worker,
      'get-cmp-member@test.local',
      'GetCmpMember',
    );

    const campaign = await createCampaign(worker, ownerCookie, 'Member View Campaign');

    // Player creates their character in the campaign.
    const createRes = await authedFetch(worker, playerCookie, '/api/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'CampaignHero', campaignCode: campaign.inviteCode }),
    });
    const created = (await createRes.json()) as CharacterResponse;
    expect(created.data.campaignId).toBe(campaign.id);

    // Another campaign member (the owner) should be able to see the character.
    const res = await authedFetch(worker, ownerCookie, `/api/characters/${created.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as CharacterResponse;
    expect(body.id).toBe(created.id);

    // A third user who joins the campaign can also see it.
    await authedFetch(worker, memberCookie, '/api/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'OtherHero', campaignCode: campaign.inviteCode }),
    });
    const memberRes = await authedFetch(worker, memberCookie, `/api/characters/${created.id}`);
    expect(memberRes.status).toBe(200);
  });

  it('returns 403 for a non-member viewing a campaign character', async () => {
    const { cookie: ownerCookie } = await devLogin(
      worker,
      'get-forbid-owner@test.local',
      'ForbidOwner',
    );
    const { cookie: playerCookie } = await devLogin(
      worker,
      'get-forbid-player@test.local',
      'ForbidPlayer',
    );
    const { cookie: strangerCookie } = await devLogin(
      worker,
      'get-forbid-stranger@test.local',
      'ForbidStranger',
    );

    const campaign = await createCampaign(worker, ownerCookie, 'Forbid Campaign');

    const createRes = await authedFetch(worker, playerCookie, '/api/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Private', campaignCode: campaign.inviteCode }),
    });
    const created = (await createRes.json()) as CharacterResponse;

    // Stranger is not a member.
    const res = await authedFetch(worker, strangerCookie, `/api/characters/${created.id}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent character', async () => {
    const { cookie } = await devLogin(worker, 'get-404@test.local', 'Get404');
    const res = await authedFetch(worker, cookie, '/api/characters/NOTREAL');
    expect(res.status).toBe(404);
  });
});

// ── PUT /api/characters/:id ───────────────────────────────────────────────────

describe('PUT /api/characters/:id', () => {
  it('allows the owner to update name and data', async () => {
    const { cookie } = await devLogin(worker, 'put-owner@test.local', 'PutOwner');
    const createRes = await authedFetch(worker, cookie, '/api/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'OldName' }),
    });
    const created = (await createRes.json()) as CharacterResponse;

    const putRes = await authedFetch(worker, cookie, `/api/characters/${created.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'NewName' }),
    });
    expect(putRes.status).toBe(200);
    const updated = (await putRes.json()) as CharacterResponse;
    expect(updated.name).toBe('NewName');
    expect(updated.id).toBe(created.id);
  });

  it('returns 403 when a non-owner tries to update', async () => {
    const { cookie: ownerCookie } = await devLogin(worker, 'put-own2@test.local', 'PutOwn2');
    const { cookie: otherCookie } = await devLogin(worker, 'put-other@test.local', 'PutOther');

    const createRes = await authedFetch(worker, ownerCookie, '/api/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Protected' }),
    });
    const created = (await createRes.json()) as CharacterResponse;

    const putRes = await authedFetch(worker, otherCookie, `/api/characters/${created.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Stolen' }),
    });
    expect(putRes.status).toBe(403);
  });

  it('returns 404 for a nonexistent character', async () => {
    const { cookie } = await devLogin(worker, 'put-404@test.local', 'Put404');
    const res = await authedFetch(worker, cookie, '/api/characters/FAKE', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    });
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/characters/:id ────────────────────────────────────────────────

describe('DELETE /api/characters/:id', () => {
  it('allows the owner to delete their character', async () => {
    const { cookie } = await devLogin(worker, 'del-owner@test.local', 'DelOwner');
    const createRes = await authedFetch(worker, cookie, '/api/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'ToDelete' }),
    });
    const created = (await createRes.json()) as CharacterResponse;

    const deleteRes = await authedFetch(worker, cookie, `/api/characters/${created.id}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);
    const body = (await deleteRes.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    // Character should be gone.
    const getRes = await authedFetch(worker, cookie, `/api/characters/${created.id}`);
    expect(getRes.status).toBe(404);
  });

  it('returns 403 when a non-owner tries to delete', async () => {
    const { cookie: ownerCookie } = await devLogin(worker, 'del-own2@test.local', 'DelOwn2');
    const { cookie: otherCookie } = await devLogin(worker, 'del-other@test.local', 'DelOther');

    const createRes = await authedFetch(worker, ownerCookie, '/api/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Mine' }),
    });
    const created = (await createRes.json()) as CharacterResponse;

    const deleteRes = await authedFetch(worker, otherCookie, `/api/characters/${created.id}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(403);
  });

  it('returns 404 for a nonexistent character', async () => {
    const { cookie } = await devLogin(worker, 'del-404@test.local', 'Del404');
    const res = await authedFetch(worker, cookie, '/api/characters/FAKE', {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });
});
