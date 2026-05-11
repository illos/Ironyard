// Unit tests for the Respite side-effect handler.
// Strategy: mock D1 with stubs to verify the XP-write contract without spinning
// up a real Worker runtime (matching the swap-kit.spec.ts pattern).

import type { CampaignState } from '@ironyard/rules';
import type { Intent } from '@ironyard/shared';
import { describe, expect, it, vi } from 'vitest';

// ── Mock DB layer ──────────────────────────────────────────────────────────
//
// sideEffectRespite does N sequential get → update pairs (one per PC).
// We track the sequence of .get() calls and .set() calls so assertions can
// verify per-character XP increments.

type MockRow = { data: string } | null;

const mockGetResults: MockRow[] = [];
const capturedUpdates: { data: string; updatedAt: number }[] = [];

vi.mock('../src/db', () => ({
  db: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () => mockGetResults.shift() ?? null,
        }),
      }),
    }),
    update: () => ({
      set: (args: unknown) => {
        capturedUpdates.push(args as { data: string; updatedAt: number });
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

// ── Import after mocks ─────────────────────────────────────────────────────
import { handleSideEffect } from '../src/lobby-do-side-effects';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeIntent(
  type: string,
  payload: Record<string, unknown>,
  actorId = 'user-owner',
): Intent & { timestamp: number } {
  return {
    id: 'test-intent-id',
    campaignId: 'campaign-123',
    actor: { userId: actorId, role: 'director' },
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
    ...overrides,
  };
}

function makePcParticipant(id: string) {
  return {
    id,
    name: `Hero ${id}`,
    kind: 'pc' as const,
    level: 1,
    currentStamina: 20,
    maxStamina: 20,
    characteristics: { might: 2, agility: 1, reason: 0, intuition: 0, presence: 0 },
    immunities: [],
    weaknesses: [],
    conditions: [],
    heroicResources: [],
    extras: [],
    surges: 0,
    recoveries: { current: 3, max: 8 },
    recoveryValue: 10,
    ownerId: null as string | null,
    characterId: null as string | null,
  };
}

const mockEnv = {} as Parameters<typeof handleSideEffect>[2];

// ── handleSideEffect (Respite) ─────────────────────────────────────────────

describe('handleSideEffect Respite', () => {
  it('increments xp for each PC character by partyVictories (3 PCs, 2 victories)', async () => {
    // stateBefore: 3 PCs, partyVictories = 2
    const stateBefore = makeCampaignState({
      partyVictories: 2,
      participants: [
        makePcParticipant('pc:char-1'),
        makePcParticipant('pc:char-2'),
        makePcParticipant('pc:char-3'),
      ],
    });

    // Queue D1 rows for each PC (current xp = 0 → should become 2)
    mockGetResults.push(
      { data: JSON.stringify({ xp: 0 }) },
      { data: JSON.stringify({ xp: 5 }) }, // char-2 already has some XP
      { data: JSON.stringify({ xp: 0 }) },
    );
    capturedUpdates.length = 0;

    const intent = makeIntent('Respite', {});
    await handleSideEffect(intent, 'campaign-123', mockEnv, stateBefore);

    // Should have written 3 updates
    expect(capturedUpdates).toHaveLength(3);

    const xp1 = (JSON.parse(capturedUpdates[0]?.data ?? '{}') as { xp?: number }).xp;
    const xp2 = (JSON.parse(capturedUpdates[1]?.data ?? '{}') as { xp?: number }).xp;
    const xp3 = (JSON.parse(capturedUpdates[2]?.data ?? '{}') as { xp?: number }).xp;

    expect(xp1).toBe(2); // 0 + 2
    expect(xp2).toBe(7); // 5 + 2
    expect(xp3).toBe(2); // 0 + 2
  });

  it('does not write to D1 when partyVictories === 0', async () => {
    const stateBefore = makeCampaignState({
      partyVictories: 0,
      participants: [makePcParticipant('pc:char-1')],
    });

    capturedUpdates.length = 0;

    const intent = makeIntent('Respite', {});
    await handleSideEffect(intent, 'campaign-123', mockEnv, stateBefore);

    // Zero victories → no D1 writes
    expect(capturedUpdates).toHaveLength(0);
  });

  it('skips missing character rows gracefully', async () => {
    const stateBefore = makeCampaignState({
      partyVictories: 3,
      participants: [makePcParticipant('pc:char-missing')],
    });

    // D1 returns null for this character
    mockGetResults.push(null);
    capturedUpdates.length = 0;

    const intent = makeIntent('Respite', {});
    await handleSideEffect(intent, 'campaign-123', mockEnv, stateBefore);

    // No update for a missing row
    expect(capturedUpdates).toHaveLength(0);
  });

  it('does not touch monster participants — only PCs are written', async () => {
    const stateBefore = makeCampaignState({
      partyVictories: 1,
      participants: [
        makePcParticipant('pc:char-1'),
        // Monster — must NOT generate a D1 write
        {
          id: 'monster:goblin-1',
          name: 'Goblin',
          kind: 'monster' as const,
          level: 1,
          currentStamina: 20,
          maxStamina: 20,
          characteristics: { might: 0, agility: 1, reason: -1, intuition: 0, presence: -1 },
          immunities: [],
          weaknesses: [],
          conditions: [],
          heroicResources: [],
          extras: [],
          surges: 0,
          recoveries: { current: 0, max: 0 },
          recoveryValue: 0,
          ownerId: null as string | null,
          characterId: null as string | null,
        },
      ],
    });

    mockGetResults.push({ data: JSON.stringify({ xp: 0 }) }); // only for char-1
    capturedUpdates.length = 0;

    const intent = makeIntent('Respite', {});
    await handleSideEffect(intent, 'campaign-123', mockEnv, stateBefore);

    // Only 1 write for the PC, none for the monster
    expect(capturedUpdates).toHaveLength(1);
  });

  it('is a no-op when stateBefore is omitted (non-hybrid call site)', async () => {
    capturedUpdates.length = 0;

    const intent = makeIntent('Respite', {});
    // Calling without stateBefore — simulates a caller that does not pass it
    await handleSideEffect(intent, 'campaign-123', mockEnv);

    expect(capturedUpdates).toHaveLength(0);
  });

  it('strips the pc: prefix from participant id to get the D1 character id', async () => {
    const stateBefore = makeCampaignState({
      partyVictories: 1,
      participants: [makePcParticipant('pc:char-alpha')],
    });

    mockGetResults.push({ data: JSON.stringify({ xp: 10 }) });
    capturedUpdates.length = 0;

    const intent = makeIntent('Respite', {});
    await handleSideEffect(intent, 'campaign-123', mockEnv, stateBefore);

    expect(capturedUpdates).toHaveLength(1);
    const parsed = JSON.parse(capturedUpdates[0]?.data ?? '{}') as { xp?: number };
    expect(parsed.xp).toBe(11); // 10 + 1
  });
});
