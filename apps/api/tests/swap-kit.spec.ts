// Unit tests for the SwapKit stamper and side-effect handler.
// Strategy: mock D1 and schema with stubs to test the contract without spinning
// up a real Worker runtime (matching the lobby-do-stampers.spec.ts pattern).

import type { CampaignState } from '@ironyard/rules';
import type { Intent } from '@ironyard/shared';
import { describe, expect, it, vi } from 'vitest';

// ── Mock DB layer ──────────────────────────────────────────────────────────

let mockGetResult: unknown = null;
let lastUpdatedArgs: unknown = null;

vi.mock('../src/db', () => ({
  db: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () => mockGetResult,
        }),
      }),
    }),
    update: () => ({
      set: (args: unknown) => {
        lastUpdatedArgs = args;
        return {
          where: () => Promise.resolve(),
        };
      },
    }),
  }),
}));

// ── Mock DB schema ─────────────────────────────────────────────────────────
vi.mock('../src/db/schema', () => ({
  campaignMemberships: {},
  campaignCharacters: {},
  characters: {},
  encounterTemplates: {},
}));

import { handleSideEffect } from '../src/lobby-do-side-effects';
// ── Import after mocks ─────────────────────────────────────────────────────
import { stampSwapKit } from '../src/lobby-do-stampers';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeIntent(
  type: string,
  payload: Record<string, unknown>,
  actorId = 'user-alice',
): Intent & { timestamp: number } {
  return {
    id: 'test-intent-id',
    campaignId: 'campaign-123',
    actor: { userId: actorId, role: 'player' },
    timestamp: 1_700_000_000_000,
    source: 'manual',
    type,
    payload,
  };
}

function makeCampaignState(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    campaignId: 'campaign-123',
    ownerId: 'user-owner',
    activeDirectorId: 'user-owner',
    seq: 0,
    connectedMembers: [],
    notes: [],
    participants: [],
    encounter: null,
    partyVictories: 0,
    openActions: [],
    currentSessionId: null,
    attendingCharacterIds: [],
    heroTokens: 0,
    ...overrides,
  };
}

const mockEnv = {} as Parameters<typeof stampSwapKit>[2];

// ── stampSwapKit ───────────────────────────────────────────────────────────

describe('stampSwapKit', () => {
  it('stamps ownerId from D1 onto the payload', async () => {
    mockGetResult = { ownerId: 'user-player' };
    const intent = makeIntent('SwapKit', { characterId: 'char-001', newKitId: 'panther' });
    const result = await stampSwapKit(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
    const payload = intent.payload as { ownerId?: string; newKitId?: string };
    expect(payload.ownerId).toBe('user-player');
    expect(payload.newKitId).toBe('panther');
  });

  it('overwrites any client-supplied ownerId with the D1 value', async () => {
    mockGetResult = { ownerId: 'user-real-owner' };
    const intent = makeIntent('SwapKit', {
      characterId: 'char-001',
      newKitId: 'caster',
      ownerId: 'user-attacker', // client-supplied — should be overwritten
    });
    const result = await stampSwapKit(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
    expect((intent.payload as { ownerId?: string }).ownerId).toBe('user-real-owner');
  });

  it('returns character_not_found when no D1 row exists', async () => {
    mockGetResult = null;
    const intent = makeIntent('SwapKit', { characterId: 'char-missing', newKitId: 'kit-x' });
    const result = await stampSwapKit(intent, makeCampaignState(), mockEnv);
    expect(result).toMatch(/^character_not_found/);
  });

  it('returns invalid_payload when characterId is missing', async () => {
    const intent = makeIntent('SwapKit', { newKitId: 'kit-x' });
    const result = await stampSwapKit(intent, makeCampaignState(), mockEnv);
    expect(result).toMatch(/^invalid_payload/);
  });
});

// ── handleSideEffect (SwapKit) ─────────────────────────────────────────────

describe('handleSideEffect SwapKit', () => {
  it('updates characters.data.kitId in D1 on a valid intent', async () => {
    // The character row has a minimal valid CharacterSchema blob.
    mockGetResult = { data: JSON.stringify({ kitId: 'wrecker' }) };
    lastUpdatedArgs = null;

    const intent = makeIntent('SwapKit', {
      characterId: 'char-001',
      newKitId: 'panther',
      ownerId: 'user-player',
    });
    await handleSideEffect(intent, 'campaign-123', mockEnv);

    // The update should have been called with a data field containing the new kitId.
    expect(lastUpdatedArgs).not.toBeNull();
    const args = lastUpdatedArgs as { data?: string; updatedAt?: number };
    expect(args.data).toBeDefined();
    const parsed = JSON.parse(args.data ?? '{}') as { kitId?: string };
    expect(parsed.kitId).toBe('panther');
    expect(args.updatedAt).toBe(1_700_000_000_000);
  });

  it('does nothing when character row is missing', async () => {
    mockGetResult = null;
    lastUpdatedArgs = null;

    const intent = makeIntent('SwapKit', {
      characterId: 'char-missing',
      newKitId: 'panther',
      ownerId: 'user-player',
    });
    await handleSideEffect(intent, 'campaign-123', mockEnv);

    // No update call should have been made.
    expect(lastUpdatedArgs).toBeNull();
  });

  it('does nothing when payload is malformed', async () => {
    mockGetResult = { data: JSON.stringify({}) };
    lastUpdatedArgs = null;

    const intent = makeIntent('SwapKit', {}); // missing characterId and newKitId
    await handleSideEffect(intent, 'campaign-123', mockEnv);

    expect(lastUpdatedArgs).toBeNull();
  });
});
