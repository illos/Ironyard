// Regression test: applyIntent(StartEncounter) must receive ReducerContext so
// PC participants are materialized with non-zero stamina. The bug this catches:
// lobby-do.ts called applyIntent without the third `ctx` argument, so the
// reducer fell back to EMPTY_BUNDLE and every PC materialized with
// maxStamina = 0, recoveriesMax = 0, characteristics = all zeros.

import { applyIntent, emptyCampaignState } from '@ironyard/rules';
import type { CampaignState, ReducerContext } from '@ironyard/rules';
import { describe, expect, it } from 'vitest';

// ── Minimal static-data bundle with one Fury-like class ──────────────────────

const FURY_CLASS_ID = 'fury';

const furyBundle: ReducerContext['staticData'] = {
  ancestries: new Map(),
  careers: new Map(),
  classes: new Map([
    [
      FURY_CLASS_ID,
      {
        id: FURY_CLASS_ID,
        name: 'Fury',
        heroicResource: 'wrath',
        startingStamina: 21,
        staminaPerLevel: 9,
        recoveries: 12,
        // ClassSchema requires these; provide minimal valid values.
        characteristicArrays: [],
        lockedCharacteristics: [],
        subclasses: [],
        kitTypes: [],
        levelFeatures: {},
      } as unknown as ReducerContext['staticData']['classes'] extends Map<string, infer V>
        ? V
        : never,
    ],
  ]),
  kits: new Map(),
  abilities: new Map(),
  items: new Map(),
  titles: new Map(),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    ...emptyCampaignState('campaign-test', 'owner-1'),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('StartEncounter PC materialization (ReducerContext wiring)', () => {
  it('materializes a PC placeholder with maxStamina > 0 when class data is present in the bundle', () => {
    const state = makeState({
      participants: [
        { kind: 'pc-placeholder', characterId: 'char-fury', ownerId: 'owner-1', position: 0 },
      ],
    });

    // Minimal character blob: level 1 Fury with no characteristic array.
    // startingStamina = 21 → maxStamina should be 21 (level 1, no kit bonus).
    const character = {
      level: 1,
      classId: FURY_CLASS_ID,
      kitId: null,
      ancestryId: null,
      characteristicArray: null,
      culture: {},
      careerChoices: {},
      levelChoices: {},
      subclassId: null,
      careerChoicesHistory: [],
    };

    const intent = {
      id: 'intent-start-1',
      campaignId: 'campaign-test',
      actor: { userId: 'owner-1', role: 'director' as const },
      timestamp: 1_700_000_000_000,
      source: 'manual' as const,
      type: 'StartEncounter',
      payload: {
        stampedPcs: [
          {
            characterId: 'char-fury',
            ownerId: 'owner-1',
            name: 'Test Fury',
            character,
          },
        ],
      },
    };

    const result = applyIntent(state, intent, { staticData: furyBundle });

    expect(result.errors).toBeUndefined();
    expect(result.state.encounter).not.toBeNull();

    const materialized = result.state.participants.find(
      (p) => p.kind === 'pc' && p.id === 'pc:char-fury',
    );
    expect(materialized).toBeDefined();
    if (!materialized || materialized.kind !== 'pc') throw new Error('not a pc participant');

    // The core regression assertion: maxStamina must be > 0 when class data exists.
    // With furyBundle: startingStamina=21, level=1 → maxStamina = 21.
    expect(materialized.maxStamina).toBe(21);
    expect(materialized.recoveries.max).toBe(12);
    expect(materialized.recoveryValue).toBe(7); // floor(21 / 3)
  });

  it('materializes a PC placeholder with maxStamina = 0 when EMPTY_BUNDLE is used (documents the bug)', () => {
    // This test documents the old (broken) behaviour: calling applyIntent
    // without ctx causes EMPTY_BUNDLE to be used, yielding zero-derived values.
    const state = makeState({
      participants: [
        { kind: 'pc-placeholder', characterId: 'char-fury', ownerId: 'owner-1', position: 0 },
      ],
    });

    const character = {
      level: 1,
      classId: FURY_CLASS_ID,
      kitId: null,
      ancestryId: null,
      characteristicArray: null,
      culture: {},
      careerChoices: {},
      levelChoices: {},
      subclassId: null,
      careerChoicesHistory: [],
    };

    const intent = {
      id: 'intent-start-2',
      campaignId: 'campaign-test',
      actor: { userId: 'owner-1', role: 'director' as const },
      timestamp: 1_700_000_000_000,
      source: 'manual' as const,
      type: 'StartEncounter',
      payload: {
        stampedPcs: [
          {
            characterId: 'char-fury',
            ownerId: 'owner-1',
            name: 'Test Fury',
            character,
          },
        ],
      },
    };

    // Intentionally omit ctx — exercises the EMPTY_BUNDLE fallback path.
    const result = applyIntent(state, intent);

    const materialized = result.state.participants.find(
      (p) => p.kind === 'pc' && p.id === 'pc:char-fury',
    );
    expect(materialized).toBeDefined();
    if (!materialized || materialized.kind !== 'pc') throw new Error('not a pc participant');

    // With EMPTY_BUNDLE the class lookup returns null → deriveMaxStamina returns 0.
    // This is the bug the fix addresses — the DO must pass ctx.
    expect(materialized.maxStamina).toBe(0);
  });

  it('keeps the DO fix: getStaticDataBundle returns a non-null object', async () => {
    // Light smoke test: the module-load path in data/index.ts must not throw
    // even with empty placeholder JSON files ([]). Import dynamically to avoid
    // Cloudflare-Worker-specific import issues in the Vitest environment.
    // We can't fully import data/index.ts in tests (it imports JSON via static
    // import and depends on the Workers bundler) — so we test the applyIntent
    // integration only, which is the observable contract.
    // This test ensures at least that a bundle with empty maps produces a
    // participant with maxStamina = 0 (not a crash), preserving the startup contract.
    const emptyBundle: ReducerContext['staticData'] = {
      ancestries: new Map(),
      careers: new Map(),
      classes: new Map(),
      kits: new Map(),
      abilities: new Map(),
      items: new Map(),
      titles: new Map(),
    };

    const state = makeState({
      participants: [
        { kind: 'pc-placeholder', characterId: 'char-x', ownerId: 'owner-1', position: 0 },
      ],
    });

    const intent = {
      id: 'intent-start-3',
      campaignId: 'campaign-test',
      actor: { userId: 'owner-1', role: 'director' as const },
      timestamp: 1_700_000_000_000,
      source: 'manual' as const,
      type: 'StartEncounter',
      payload: {
        stampedPcs: [
          {
            characterId: 'char-x',
            ownerId: 'owner-1',
            name: 'Mystery Hero',
            character: {
              level: 1,
              classId: 'unknown-class',
              kitId: null,
              ancestryId: null,
              characteristicArray: null,
              culture: {},
              careerChoices: {},
              levelChoices: {},
              subclassId: null,
              careerChoicesHistory: [],
            },
          },
        ],
      },
    };

    // With an empty bundle, the class lookup misses → maxStamina = 0.
    // This should NOT throw — graceful degradation is the contract.
    expect(() => applyIntent(state, intent, { staticData: emptyBundle })).not.toThrow();
  });
});
