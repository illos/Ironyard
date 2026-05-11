/**
 * Integration tests for POST /api/characters/:id/attach
 *
 * Tests:
 *  - 404 for unknown invite code
 *  - 403 when requester is not the character owner
 *  - Attaches character to campaign and joins membership
 *  - Idempotent on membership (no duplicate row)
 *  - Auto-submits when existing data is complete
 *  - Does NOT auto-submit when data is incomplete
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
    characteristicArray: [2, 2, 1, 1, 0],
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

/** Create a standalone character (no campaign) and return the full response. */
async function createStandaloneCharacter(
  cookie: string,
  name: string,
  extraData?: Record<string, unknown>,
): Promise<CharacterResponse> {
  const res = await authedFetch(worker, cookie, '/api/characters', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, ...(extraData ? { data: extraData } : {}) }),
  });
  if (!res.ok) {
    throw new Error(`createStandaloneCharacter failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<CharacterResponse>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /characters/:id/attach', () => {
  it('returns 404 for an unknown invite code', async () => {
    const { cookie } = await devLogin(worker, 'attach-badcode@test.local', 'AttachBadCode');
    const char = await createStandaloneCharacter(cookie, 'Drifter');

    const res = await authedFetch(worker, cookie, `/api/characters/${char.id}/attach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ campaignCode: 'ZZZZZZ' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('campaign_not_found');
  });

  it('returns 403 if requester is not the character owner', async () => {
    const { cookie: ownerCookie } = await devLogin(worker, 'attach-own@test.local', 'AttachOwner');
    const { cookie: ownerCookieB } = await devLogin(
      worker,
      'attach-campaign-owner@test.local',
      'AttachCampaignOwner',
    );
    const { cookie: strangerCookie } = await devLogin(
      worker,
      'attach-stranger@test.local',
      'AttachStranger',
    );

    const campaign = await createCampaign(worker, ownerCookieB, 'Attach Forbidden Campaign');
    const char = await createStandaloneCharacter(ownerCookie, 'OwnedChar');

    const res = await authedFetch(worker, strangerCookie, `/api/characters/${char.id}/attach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ campaignCode: campaign.inviteCode }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('forbidden');
  });

  it('attaches the character to the campaign and joins membership', async () => {
    const { cookie: ownerCookie } = await devLogin(
      worker,
      'attach-camp-owner@test.local',
      'AttachCampOwner',
    );
    const { cookie: playerCookie, userId: playerId } = await devLogin(
      worker,
      'attach-player@test.local',
      'AttachPlayer',
    );

    const campaign = await createCampaign(worker, ownerCookie, 'Attach Campaign');
    const char = await createStandaloneCharacter(playerCookie, 'Wanderer');

    expect(char.data.campaignId).toBeNull();

    const res = await authedFetch(worker, playerCookie, `/api/characters/${char.id}/attach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ campaignCode: campaign.inviteCode }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as CharacterResponse;
    expect(body.id).toBe(char.id);
    expect(body.data.campaignId).toBe(campaign.id);

    // Player should now be a member of the campaign.
    const campaignRes = await authedFetch(worker, playerCookie, `/api/campaigns/${campaign.id}`);
    expect(campaignRes.status).toBe(200);
    const campaignData = (await campaignRes.json()) as { isOwner: boolean; isDirector: boolean };
    expect(campaignData.isOwner).toBe(false);
    expect(campaignData.isDirector).toBe(false);
  });

  it('is idempotent on membership', async () => {
    const { cookie: ownerCookie } = await devLogin(
      worker,
      'attach-idem-owner@test.local',
      'AttachIdemOwner',
    );
    const { cookie: playerCookie } = await devLogin(
      worker,
      'attach-idem-player@test.local',
      'AttachIdemPlayer',
    );

    const campaign = await createCampaign(worker, ownerCookie, 'Idempotent Campaign');
    const char = await createStandaloneCharacter(playerCookie, 'ReturnerHero');

    // First attach.
    const res1 = await authedFetch(worker, playerCookie, `/api/characters/${char.id}/attach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ campaignCode: campaign.inviteCode }),
    });
    expect(res1.status).toBe(200);

    // Second attach — no error, no duplicate membership row.
    const res2 = await authedFetch(worker, playerCookie, `/api/characters/${char.id}/attach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ campaignCode: campaign.inviteCode }),
    });
    expect(res2.status).toBe(200);
    const body = (await res2.json()) as CharacterResponse;
    expect(body.data.campaignId).toBe(campaign.id);

    // The campaign endpoint should still be accessible (membership not duplicated/broken).
    const campaignRes = await authedFetch(worker, playerCookie, `/api/campaigns/${campaign.id}`);
    expect(campaignRes.status).toBe(200);
  });

  it('auto-submits when existing data is complete', async () => {
    const { cookie: ownerCookie } = await devLogin(
      worker,
      'attach-submit-owner@test.local',
      'AttachSubmitOwner',
    );
    const { cookie: playerCookie } = await devLogin(
      worker,
      'attach-submit-player@test.local',
      'AttachSubmitPlayer',
    );

    const campaign = await createCampaign(worker, ownerCookie, 'Auto-Submit Campaign');
    const completeData = buildCompleteCharacterFixture();

    // Create standalone character with complete data (no campaignCode, so no auto-submit yet).
    const char = await createStandaloneCharacter(playerCookie, 'ReadyHero', completeData);
    expect(char.data.campaignId).toBeNull();
    expect(char.autoSubmitted).toBe(false);

    const res = await authedFetch(worker, playerCookie, `/api/characters/${char.id}/attach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ campaignCode: campaign.inviteCode }),
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
    expect(campaignChars.some((cc) => cc.characterId === char.id)).toBe(true);
    const found = campaignChars.find((cc) => cc.characterId === char.id);
    expect(found?.status).toBe('pending');
  });

  it('does not auto-submit when data is incomplete', async () => {
    const { cookie: ownerCookie } = await devLogin(
      worker,
      'attach-nosub-owner@test.local',
      'AttachNoSubOwner',
    );
    const { cookie: playerCookie } = await devLogin(
      worker,
      'attach-nosub-player@test.local',
      'AttachNoSubPlayer',
    );

    const campaign = await createCampaign(worker, ownerCookie, 'No-Submit Campaign');

    // Standalone character with name only — data is incomplete (no ancestry, class, etc.).
    const char = await createStandaloneCharacter(playerCookie, 'IncompleteHero');
    expect(char.data.campaignId).toBeNull();

    const res = await authedFetch(worker, playerCookie, `/api/characters/${char.id}/attach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ campaignCode: campaign.inviteCode }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as CharacterResponse;
    expect(body.autoSubmitted).toBe(false);
    expect(body.data.campaignId).toBe(campaign.id);

    // No campaign_characters row should exist.
    const campaignCharsRes = await authedFetch(
      worker,
      ownerCookie,
      `/api/campaigns/${campaign.id}/characters?status=pending`,
    );
    expect(campaignCharsRes.status).toBe(200);
    const campaignChars = (await campaignCharsRes.json()) as Array<{ characterId: string }>;
    expect(campaignChars.some((cc) => cc.characterId === char.id)).toBe(false);
  });
});
