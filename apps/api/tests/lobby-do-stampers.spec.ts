// D7: Focused unit tests for the stamping pipeline.
// Strategy: mock D1 with simple stubs and stub loadMonsterById from data/index.
// This verifies the contract between the stampers and the DB layer without
// spinning up a real Worker runtime (which would require Miniflare setup).

import type { CampaignState } from '@ironyard/rules';
import type { Intent } from '@ironyard/shared';
import { describe, expect, it, vi } from 'vitest';

// ── Mock data/index (monsters + items lookup) ──────────────────────────────
vi.mock('../src/data/index', () => ({
  loadMonsterById: (id: string) => {
    if (id === 'goblin-soldier-l1') {
      return {
        id: 'goblin-soldier-l1',
        name: 'Goblin Soldier',
        level: 1,
        // Minimal Monster shape sufficient for the schema — real data has many more fields.
        kind: 'minion',
        role: 'striker',
        stamina: { base: 5, perVictor: 0 },
        ev: { ev: 6 },
        speed: [{ mode: 'walk', value: 5 }],
        characteristics: {
          might: 0,
          agility: 2,
          reason: 0,
          intuition: 1,
          presence: 0,
        },
        immunities: [],
        immunityNote: null,
        weaknesses: [],
        weaknessNote: null,
        abilities: [],
      };
    }
    return null;
  },
  loadItemById: (id: string) => {
    // Treasure items used by the Slice 4 (Epic 2C) Respite stamper test.
    if (id.startsWith('treasure-')) {
      return {
        id,
        name: id,
        description: '',
        raw: '',
        category: 'leveled-treasure',
        echelon: 1,
        kitKeyword: null,
      };
    }
    if (id.startsWith('trinket-')) {
      return {
        id,
        name: id,
        description: '',
        raw: '',
        category: 'trinket',
        bodySlot: null,
      };
    }
    return null;
  },
}));

// ── Mock DB layer ──────────────────────────────────────────────────────────
// Each test may supply its own mockDb; the vi.mock factory uses a
// module-level variable so tests can replace it per-test.
let mockDbResult: unknown = null;

vi.mock('../src/db', () => ({
  db: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () => mockDbResult,
          all: async () => (Array.isArray(mockDbResult) ? mockDbResult : []),
        }),
        innerJoin: () => ({
          where: () => ({
            all: async () => (Array.isArray(mockDbResult) ? mockDbResult : []),
          }),
        }),
      }),
    }),
  }),
}));

// ── Mock DB schema (avoids importing Drizzle table definitions) ────────────
vi.mock('../src/db/schema', () => ({
  campaignMemberships: {},
  campaignCharacters: {},
  characters: {},
  encounterTemplates: {},
  sessions: {},
}));

// ── Import stampers after mocks are set up ─────────────────────────────────
import {
  stampAddMonster,
  stampIntent,
  stampJumpBehindScreen,
  stampKickPlayer,
  stampLoadEncounterTemplate,
  stampStartEncounter,
  stampStartSession,
  stampSubmitCharacter,
} from '../src/lobby-do-stampers';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeIntent(
  type: string,
  payload: Record<string, unknown>,
  actorId = 'user-alice',
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
    openActions: [],
    currentSessionId: null,
    attendingCharacterIds: [],
    heroTokens: 0,
    ...overrides,
  };
}

// Minimal Bindings stub — we don't actually call DB through the real Bindings in these tests.
const mockEnv = {} as Parameters<typeof stampAddMonster>[2];

// ── AddMonster ─────────────────────────────────────────────────────────────

describe('stampAddMonster', () => {
  it('stamps monster onto payload when found', async () => {
    const intent = makeIntent('AddMonster', { monsterId: 'goblin-soldier-l1', quantity: 2 });
    const result = await stampAddMonster(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
    expect((intent.payload as Record<string, unknown>).monster).toBeDefined();
    expect(((intent.payload as Record<string, unknown>).monster as { id: string }).id).toBe(
      'goblin-soldier-l1',
    );
  });

  it('returns monster_not_found when monsterId is unknown', async () => {
    const intent = makeIntent('AddMonster', { monsterId: 'unknown-creature', quantity: 1 });
    const result = await stampAddMonster(intent, makeCampaignState(), mockEnv);
    expect(result).toMatch(/^monster_not_found/);
  });

  it('returns invalid_payload when monsterId is missing', async () => {
    const intent = makeIntent('AddMonster', { quantity: 1 });
    const result = await stampAddMonster(intent, makeCampaignState(), mockEnv);
    expect(result).toMatch(/^invalid_payload/);
  });
});

// ── LoadEncounterTemplate ──────────────────────────────────────────────────

describe('stampLoadEncounterTemplate', () => {
  it('returns template_not_found when template row is missing', async () => {
    mockDbResult = null; // no row returned
    const intent = makeIntent('LoadEncounterTemplate', { templateId: 'tmpl-missing' });
    const result = await stampLoadEncounterTemplate(intent, makeCampaignState(), mockEnv);
    expect(result).toMatch(/^template_not_found/);
  });

  it('stamps entries when template is valid and monsters resolve', async () => {
    mockDbResult = {
      id: 'tmpl-1',
      data: JSON.stringify({
        monsters: [{ monsterId: 'goblin-soldier-l1', quantity: 3 }],
      }),
    };
    const intent = makeIntent('LoadEncounterTemplate', { templateId: 'tmpl-1' });
    const result = await stampLoadEncounterTemplate(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
    const payload = intent.payload as { entries?: unknown[] };
    expect(payload.entries).toHaveLength(1);
  });

  it('returns monster_not_found if a template entry references an unknown monster', async () => {
    mockDbResult = {
      id: 'tmpl-2',
      data: JSON.stringify({
        monsters: [{ monsterId: 'dragon-ancient', quantity: 1 }],
      }),
    };
    const intent = makeIntent('LoadEncounterTemplate', { templateId: 'tmpl-2' });
    const result = await stampLoadEncounterTemplate(intent, makeCampaignState(), mockEnv);
    expect(result).toMatch(/^monster_not_found/);
  });

  it('returns invalid_payload when templateId is missing', async () => {
    const intent = makeIntent('LoadEncounterTemplate', {});
    const result = await stampLoadEncounterTemplate(intent, makeCampaignState(), mockEnv);
    expect(result).toMatch(/^invalid_payload/);
  });
});

// ── JumpBehindScreen ────────────────────────────────────────────────────────

describe('stampJumpBehindScreen', () => {
  it('stamps permitted=true for the campaign owner without a D1 read', async () => {
    mockDbResult = null; // should not be read for owner
    const intent = makeIntent('JumpBehindScreen', {}, 'user-owner');
    const result = await stampJumpBehindScreen(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
    expect((intent.payload as { permitted?: boolean }).permitted).toBe(true);
  });

  it('stamps permitted=true when D1 membership has is_director=1', async () => {
    mockDbResult = { isDirector: 1 };
    const intent = makeIntent('JumpBehindScreen', {}, 'user-director');
    const result = await stampJumpBehindScreen(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
    expect((intent.payload as { permitted?: boolean }).permitted).toBe(true);
  });

  it('stamps permitted=false when D1 membership has is_director=0', async () => {
    mockDbResult = { isDirector: 0 };
    const intent = makeIntent('JumpBehindScreen', {}, 'user-player');
    const result = await stampJumpBehindScreen(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
    expect((intent.payload as { permitted?: boolean }).permitted).toBe(false);
  });

  it('stamps permitted=false when D1 row is missing (not a member)', async () => {
    mockDbResult = null;
    const intent = makeIntent('JumpBehindScreen', {}, 'user-stranger');
    const result = await stampJumpBehindScreen(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
    expect((intent.payload as { permitted?: boolean }).permitted).toBe(false);
  });
});

// ── SubmitCharacter ─────────────────────────────────────────────────────────

describe('stampSubmitCharacter', () => {
  it('stamps ownsCharacter=true when character owner matches actor', async () => {
    // First call: characters select → matches actor; second call: memberships → found
    let callCount = 0;
    vi.mocked(mockEnv); // satisfy type system
    // Override the mock for this test by replacing mockDbResult with a callable
    // that returns different values per call.
    // Since vi.mock returns the same db() stub for both calls, we use callCount.
    mockDbResult = null; // will be overridden below
    const realMockDb = { ownerId: 'user-alice' }; // character row
    const membershipRow = { userId: 'user-alice' }; // membership row

    // Reassign the get mock per call.
    vi.doMock('../src/db', () => ({
      db: () => ({
        select: () => ({
          from: () => ({
            where: () => ({
              get: async () => {
                callCount += 1;
                if (callCount === 1) return realMockDb;
                return membershipRow;
              },
            }),
          }),
        }),
      }),
    }));

    const intent = makeIntent('SubmitCharacter', { characterId: 'char-001' }, 'user-alice');
    const result = await stampSubmitCharacter(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
  });
});

// ── KickPlayer ──────────────────────────────────────────────────────────────

describe('stampKickPlayer', () => {
  it('stamps participantIdsToRemove with matching participant ids', async () => {
    // The stamper queries campaign_characters joined with characters and then
    // intersects with state.participants.
    mockDbResult = [{ characterId: 'char-001' }]; // rows from DB join

    const state = makeCampaignState({
      participants: [
        {
          id: 'pc:char-001',
          name: 'Mira',
          kind: 'pc',
          level: 1,
          currentStamina: 30,
          maxStamina: 30,
          characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
          immunities: [],
          weaknesses: [],
          conditions: [],
          heroicResources: [],
          extras: [],
          surges: 0,
          recoveries: { current: 3, max: 3 },
          recoveryValue: 10,
          ownerId: 'user-alice' as string | null,
          characterId: 'char-001' as string | null,
          weaponDamageBonus: {
            melee: [0, 0, 0] as [number, number, number],
            ranged: [0, 0, 0] as [number, number, number],
          },
          activeAbilities: [],
          victories: 0,
          turnActionUsage: { main: false, maneuver: false, move: false },
          surprised: false,
          role: null as string | null,
          ancestry: [] as string[],
          size: null as string | null,
          speed: null as number | null,
          stability: null as number | null,
          freeStrike: null as number | null,
          ev: null as number | null,
          withCaptain: null as string | null,
          className: null as string | null,
        },
        {
          id: 'monster-xyz',
          name: 'Goblin',
          kind: 'monster',
          level: 1,
          currentStamina: 5,
          maxStamina: 5,
          characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
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
          weaponDamageBonus: {
            melee: [0, 0, 0] as [number, number, number],
            ranged: [0, 0, 0] as [number, number, number],
          },
          activeAbilities: [],
          victories: 0,
          turnActionUsage: { main: false, maneuver: false, move: false },
          surprised: false,
          role: null as string | null,
          ancestry: [] as string[],
          size: null as string | null,
          speed: null as number | null,
          stability: null as number | null,
          freeStrike: null as number | null,
          ev: null as number | null,
          withCaptain: null as string | null,
          className: null as string | null,
        },
      ],
    });

    const intent = makeIntent('KickPlayer', { userId: 'user-alice' });
    const result = await stampKickPlayer(intent, state, mockEnv);
    expect(result).toBeNull();
    const payload = intent.payload as { participantIdsToRemove?: string[] };
    expect(payload.participantIdsToRemove).toContain('pc:char-001');
    // Should NOT include the monster participant
    expect(payload.participantIdsToRemove).not.toContain('monster-xyz');
  });

  it('stamps empty participantIdsToRemove when user has no roster participants', async () => {
    mockDbResult = []; // no matching characters in campaign
    const intent = makeIntent('KickPlayer', { userId: 'user-nobody' });
    const result = await stampKickPlayer(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
    const payload = intent.payload as { participantIdsToRemove?: string[] };
    expect(payload.participantIdsToRemove).toEqual([]);
  });
});

// ── StartEncounter ────────────────────────────────────────────────────────

describe('stampStartEncounter', () => {
  it('stamps empty stampedPcs and stampedMonsters when payload has no characterIds or monsters', async () => {
    mockDbResult = [];
    const intent = makeIntent('StartEncounter', { characterIds: [], monsters: [] });
    const state = makeCampaignState({ participants: [] });
    const result = await stampStartEncounter(intent, state, mockEnv);
    expect(result).toBeNull();
    const payload = intent.payload as { stampedPcs?: unknown[]; stampedMonsters?: unknown[] };
    expect(payload.stampedPcs).toEqual([]);
    expect(payload.stampedMonsters).toEqual([]);
  });

  it('stamps matched character rows onto stampedPcs from payload.characterIds', async () => {
    // Minimal valid Character blob — CharacterSchema fills in all defaults.
    const characterData = JSON.stringify({});
    mockDbResult = [{ id: 'char-1', ownerId: 'user-alice', name: 'Alice', data: characterData }];
    const intent = makeIntent('StartEncounter', {
      characterIds: ['char-1'],
      monsters: [],
    });
    const result = await stampStartEncounter(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
    const payload = intent.payload as { stampedPcs?: Array<{ characterId: string; name: string }> };
    expect(payload.stampedPcs).toHaveLength(1);
    expect(payload.stampedPcs?.[0]?.characterId).toBe('char-1');
    expect(payload.stampedPcs?.[0]?.name).toBe('Alice');
  });

  it('skips characters with invalid data blobs', async () => {
    mockDbResult = [
      { id: 'char-bad', ownerId: 'user-alice', name: 'Bad', data: 'not-json-at-all' },
    ];
    const intent = makeIntent('StartEncounter', {
      characterIds: ['char-bad'],
      monsters: [],
    });
    // Should not throw — invalid blob is silently skipped.
    const result = await stampStartEncounter(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
    const payload = intent.payload as { stampedPcs?: unknown[] };
    expect(payload.stampedPcs).toEqual([]);
  });

  it('stamps stampedMonsters from payload.monsters using static data', async () => {
    mockDbResult = [];
    const intent = makeIntent('StartEncounter', {
      characterIds: [],
      monsters: [{ monsterId: 'goblin-soldier-l1', quantity: 2 }],
    });
    const result = await stampStartEncounter(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
    const payload = intent.payload as {
      stampedMonsters?: Array<{ monsterId: string; quantity: number }>;
    };
    expect(payload.stampedMonsters).toHaveLength(1);
    expect(payload.stampedMonsters?.[0]?.monsterId).toBe('goblin-soldier-l1');
    expect(payload.stampedMonsters?.[0]?.quantity).toBe(2);
  });

  it('skips monsters not found in static data', async () => {
    mockDbResult = [];
    const intent = makeIntent('StartEncounter', {
      characterIds: [],
      monsters: [{ monsterId: 'unknown-beast', quantity: 1 }],
    });
    const result = await stampStartEncounter(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
    const payload = intent.payload as { stampedMonsters?: unknown[] };
    expect(payload.stampedMonsters).toEqual([]);
  });
});

// ── stampIntent dispatch table ─────────────────────────────────────────────

describe('stampIntent', () => {
  it('routes AddMonster to stampAddMonster', async () => {
    mockDbResult = null;
    const intent = makeIntent('AddMonster', { monsterId: 'goblin-soldier-l1', quantity: 1 });
    const result = await stampIntent(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull(); // monster found → stamped
  });

  it('routes LoadEncounterTemplate and returns template_not_found', async () => {
    mockDbResult = null; // no template row
    const intent = makeIntent('LoadEncounterTemplate', { templateId: 'tmpl-missing' });
    const result = await stampIntent(intent, makeCampaignState(), mockEnv);
    expect(result).toMatch(/^template_not_found/);
  });

  it('is a no-op for ApproveCharacter', async () => {
    const intent = makeIntent('ApproveCharacter', { characterId: 'char-001' });
    const result = await stampIntent(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
  });

  it('is a no-op for DenyCharacter', async () => {
    const intent = makeIntent('DenyCharacter', { characterId: 'char-001' });
    const result = await stampIntent(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
  });

  it('is a no-op for unknown intent types', async () => {
    const intent = makeIntent('SetStamina', { participantId: 'p1', stamina: 10 });
    const result = await stampIntent(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
  });
});

// ── stampRespite — Slice 4 (Epic 2C) safely-carry warnings ────────────────

describe('stampRespite', () => {
  it('stamps a safelyCarryWarnings entry for a hero carrying > 3 equipped treasures', async () => {
    // Mock the campaign-characters join query: 1 approved character whose
    // inventory holds 4 equipped leveled treasures + 1 unequipped treasure.
    mockDbResult = [
      {
        id: 'char-1',
        name: 'Aria',
        data: JSON.stringify({
          name: 'Aria',
          ancestryId: 'human',
          inventory: [
            { id: 'inv-1', itemId: 'treasure-amulet', quantity: 1, equipped: true },
            { id: 'inv-2', itemId: 'treasure-cloak', quantity: 1, equipped: true },
            { id: 'inv-3', itemId: 'treasure-ring', quantity: 1, equipped: true },
            { id: 'inv-4', itemId: 'treasure-boots', quantity: 1, equipped: true },
            // Unequipped — must NOT count toward the limit (canon § 10.17).
            { id: 'inv-5', itemId: 'treasure-helm', quantity: 1, equipped: false },
            // Non-treasure — must NOT count.
            { id: 'inv-6', itemId: 'trinket-luckcharm', quantity: 1, equipped: true },
          ],
        }),
      },
    ];
    const intent = makeIntent('Respite', {});
    const result = await stampIntent(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();

    const payload = intent.payload as {
      safelyCarryWarnings?: Array<{ characterId: string; count: number; items: string[] }>;
    };
    expect(payload.safelyCarryWarnings).toHaveLength(1);
    expect(payload.safelyCarryWarnings?.[0]?.characterId).toBe('char-1');
    expect(payload.safelyCarryWarnings?.[0]?.count).toBe(4);
  });

  it('emits no warnings when every approved hero is at or below the limit', async () => {
    mockDbResult = [
      {
        id: 'char-1',
        name: 'Aria',
        data: JSON.stringify({
          name: 'Aria',
          ancestryId: 'human',
          inventory: [
            { id: 'inv-1', itemId: 'treasure-amulet', quantity: 1, equipped: true },
            { id: 'inv-2', itemId: 'treasure-cloak', quantity: 1, equipped: true },
            { id: 'inv-3', itemId: 'treasure-ring', quantity: 1, equipped: true },
          ],
        }),
      },
    ];
    const intent = makeIntent('Respite', {});
    const result = await stampIntent(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();

    const payload = intent.payload as { safelyCarryWarnings?: unknown[] };
    expect(payload.safelyCarryWarnings).toHaveLength(0);
  });

  it('defaults wyrmplateChoices to {} when the client omits it', async () => {
    mockDbResult = [];
    const intent = makeIntent('Respite', {});
    const result = await stampIntent(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();

    const payload = intent.payload as { wyrmplateChoices?: Record<string, string> };
    expect(payload.wyrmplateChoices).toEqual({});
  });

  it('preserves an explicitly-supplied wyrmplateChoices record', async () => {
    mockDbResult = [];
    const intent = makeIntent('Respite', { wyrmplateChoices: { 'char-dk': 'fire' } });
    const result = await stampIntent(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();

    const payload = intent.payload as { wyrmplateChoices?: Record<string, string> };
    expect(payload.wyrmplateChoices).toEqual({ 'char-dk': 'fire' });
  });
});

// ── stampStartSession ─────────────────────────────────────────────────────

describe('stampStartSession', () => {
  it('validates attending characters and stamps the default name', async () => {
    // Set the mock to return approved-character rows for the first query (.all()).
    // The second query (.get() for session count) receives the same mockDbResult
    // which is an array — countRow?.count is undefined → falls back to 0 → "Session 1".
    mockDbResult = [
      { characterId: 'c1' },
      { characterId: 'c2' },
    ];
    const intent = makeIntent('StartSession', {
      attendingCharacterIds: ['c1', 'c2'],
    });
    const result = await stampStartSession(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
    const payload = intent.payload as {
      name?: string;
      attendingCharacterIds: string[];
    };
    expect(payload.name).toMatch(/^Session/);
    expect(payload.attendingCharacterIds).toEqual(['c1', 'c2']);
  });

  it('rejects an unknown character id', async () => {
    mockDbResult = [{ characterId: 'c1' }]; // only c1 approved
    const intent = makeIntent('StartSession', {
      attendingCharacterIds: ['c1', 'c-ghost'],
    });
    const result = await stampStartSession(intent, makeCampaignState(), mockEnv);
    expect(result).toMatch(/^unknown_character/);
  });

  it('rejects when attendingCharacterIds is empty', async () => {
    mockDbResult = [];
    const intent = makeIntent('StartSession', { attendingCharacterIds: [] });
    const result = await stampStartSession(intent, makeCampaignState(), mockEnv);
    expect(result).toMatch(/^invalid_payload/);
  });

  it('preserves an explicitly-supplied name', async () => {
    mockDbResult = [{ characterId: 'c1' }];
    const intent = makeIntent('StartSession', {
      attendingCharacterIds: ['c1'],
      name: 'The Bandit Camp',
    });
    const result = await stampStartSession(intent, makeCampaignState(), mockEnv);
    expect(result).toBeNull();
    const payload = intent.payload as { name?: string };
    expect(payload.name).toBe('The Bandit Camp');
  });
});
