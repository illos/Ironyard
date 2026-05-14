// Unit tests for the session side-effect handlers (StartSession, EndSession,
// UpdateSessionAttendance). Strategy: mock D1 with stubs, capture INSERT and
// UPDATE calls, and verify shape + count. All three are exercised through
// handleSideEffect (the private functions are not exported).

import type { CampaignState } from '@ironyard/rules';
import type { Intent } from '@ironyard/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Captured write records ─────────────────────────────────────────────────

type InsertRecord = { table: string; values: Record<string, unknown> };
type UpdateRecord = { table: string; set: Record<string, unknown> };

const capturedInserts: InsertRecord[] = [];
const capturedUpdates: UpdateRecord[] = [];

// ── Mock DB layer ──────────────────────────────────────────────────────────
//
// The session side-effects use:
//   conn.insert(table).values(...)
//   conn.update(table).set(...).where(...)
//
// We track which "table" object is passed to insert/update so we can
// differentiate sessions writes from campaigns writes. The schema mock
// below assigns string sentinels so we can assert on them.

vi.mock('../src/db', () => ({
  db: () => ({
    insert: (table: { _sentinel: string }) => ({
      values: (values: Record<string, unknown>) => {
        capturedInserts.push({ table: table._sentinel, values });
        return Promise.resolve();
      },
    }),
    update: (table: { _sentinel: string }) => ({
      set: (setArgs: Record<string, unknown>) => {
        const tableName = table._sentinel;
        capturedUpdates.push({ table: tableName, set: setArgs });
        return {
          where: () => Promise.resolve(),
        };
      },
    }),
  }),
}));

// ── Mock DB schema ─────────────────────────────────────────────────────────
//
// Each table object gets a `_sentinel` string so the mock above can identify
// which table a write targets.

vi.mock('../src/db/schema', () => ({
  campaignMemberships: { _sentinel: 'campaignMemberships' },
  campaignCharacters: { _sentinel: 'campaignCharacters' },
  characters: { _sentinel: 'characters' },
  encounterTemplates: { _sentinel: 'encounterTemplates' },
  campaigns: { _sentinel: 'campaigns' },
  sessions: { _sentinel: 'sessions' },
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
    currentSessionId: null,
    attendingCharacterIds: [],
    heroTokens: 0,
    ...overrides,
  };
}

const mockEnv = {} as Parameters<typeof handleSideEffect>[2];

// ── handleSideEffect (StartSession) ───────────────────────────────────────

describe('handleSideEffect StartSession', () => {
  beforeEach(() => {
    capturedInserts.length = 0;
    capturedUpdates.length = 0;
  });

  it('inserts a sessions row and updates campaigns.current_session_id', async () => {
    const stateAfter = makeCampaignState({
      currentSessionId: 'session-001',
      attendingCharacterIds: ['char-1', 'char-2'],
      heroTokens: 2,
    });
    const intent = makeIntent('StartSession', {
      name: 'Session 1',
      attendingCharacterIds: ['char-1', 'char-2'],
    });

    await handleSideEffect(intent, 'campaign-123', mockEnv, undefined, stateAfter);

    // One INSERT into sessions
    expect(capturedInserts).toHaveLength(1);
    const ins = capturedInserts[0];
    expect(ins?.table).toBe('sessions');
    expect(ins?.values.id).toBe('session-001');
    expect(ins?.values.campaignId).toBe('campaign-123');
    expect(ins?.values.name).toBe('Session 1');
    expect(ins?.values.startedAt).toBe(1_700_000_000_000);
    expect(ins?.values.heroTokensStart).toBe(2);
    expect(JSON.parse(ins?.values.attendingCharacterIds as string)).toEqual(['char-1', 'char-2']);

    // One UPDATE on campaigns
    expect(capturedUpdates).toHaveLength(1);
    const upd = capturedUpdates[0];
    expect(upd?.table).toBe('campaigns');
    expect(upd?.set.currentSessionId).toBe('session-001');
  });

  it('is a no-op when stateAfter.currentSessionId is null (reducer rejected)', async () => {
    const stateAfter = makeCampaignState({ currentSessionId: null });
    const intent = makeIntent('StartSession', {
      name: 'Session 1',
      attendingCharacterIds: ['char-1'],
    });

    await handleSideEffect(intent, 'campaign-123', mockEnv, undefined, stateAfter);

    expect(capturedInserts).toHaveLength(0);
    expect(capturedUpdates).toHaveLength(0);
  });

  it('is a no-op when stateAfter is omitted', async () => {
    const intent = makeIntent('StartSession', {
      name: 'Session 1',
      attendingCharacterIds: ['char-1'],
    });

    await handleSideEffect(intent, 'campaign-123', mockEnv);

    expect(capturedInserts).toHaveLength(0);
    expect(capturedUpdates).toHaveLength(0);
  });
});

// ── handleSideEffect (EndSession) ─────────────────────────────────────────

describe('handleSideEffect EndSession', () => {
  beforeEach(() => {
    capturedInserts.length = 0;
    capturedUpdates.length = 0;
  });

  it('updates sessions.ended_at + hero_tokens_end, and clears campaigns.current_session_id', async () => {
    const stateBefore = makeCampaignState({
      currentSessionId: 'session-001',
      heroTokens: 3,
    });
    const intent = makeIntent('EndSession', {});

    await handleSideEffect(intent, 'campaign-123', mockEnv, stateBefore);

    expect(capturedInserts).toHaveLength(0);
    expect(capturedUpdates).toHaveLength(2);

    const sessUpd = capturedUpdates.find((u) => u.table === 'sessions');
    expect(sessUpd).toBeDefined();
    expect(sessUpd?.set.endedAt).toBe(1_700_000_000_000);
    expect(sessUpd?.set.heroTokensEnd).toBe(3);

    const campUpd = capturedUpdates.find((u) => u.table === 'campaigns');
    expect(campUpd).toBeDefined();
    expect(campUpd?.set.currentSessionId).toBeNull();
  });

  it('is a no-op when stateBefore.currentSessionId is null', async () => {
    const stateBefore = makeCampaignState({ currentSessionId: null });
    const intent = makeIntent('EndSession', {});

    await handleSideEffect(intent, 'campaign-123', mockEnv, stateBefore);

    expect(capturedUpdates).toHaveLength(0);
  });

  it('is a no-op when stateBefore is omitted', async () => {
    const intent = makeIntent('EndSession', {});

    await handleSideEffect(intent, 'campaign-123', mockEnv);

    expect(capturedUpdates).toHaveLength(0);
  });
});

// ── handleSideEffect (UpdateSessionAttendance) ────────────────────────────

describe('handleSideEffect UpdateSessionAttendance', () => {
  beforeEach(() => {
    capturedInserts.length = 0;
    capturedUpdates.length = 0;
  });

  it('updates sessions.attending_character_ids with post-reducer attendees', async () => {
    const stateAfter = makeCampaignState({
      currentSessionId: 'session-001',
      attendingCharacterIds: ['char-1', 'char-3'], // char-2 removed, char-3 added
    });
    const intent = makeIntent('UpdateSessionAttendance', {
      add: ['char-3'],
      remove: ['char-2'],
    });

    await handleSideEffect(intent, 'campaign-123', mockEnv, undefined, stateAfter);

    expect(capturedInserts).toHaveLength(0);
    expect(capturedUpdates).toHaveLength(1);

    const upd = capturedUpdates[0];
    expect(upd?.table).toBe('sessions');
    expect(JSON.parse(upd?.set.attendingCharacterIds as string)).toEqual(['char-1', 'char-3']);
  });

  it('is a no-op when stateAfter.currentSessionId is null', async () => {
    const stateAfter = makeCampaignState({ currentSessionId: null });
    const intent = makeIntent('UpdateSessionAttendance', { add: ['char-1'], remove: [] });

    await handleSideEffect(intent, 'campaign-123', mockEnv, undefined, stateAfter);

    expect(capturedUpdates).toHaveLength(0);
  });

  it('is a no-op when stateAfter is omitted', async () => {
    const intent = makeIntent('UpdateSessionAttendance', { add: ['char-1'], remove: [] });

    await handleSideEffect(intent, 'campaign-123', mockEnv);

    expect(capturedUpdates).toHaveLength(0);
  });
});
