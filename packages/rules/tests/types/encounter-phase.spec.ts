import { describe, expect, it } from 'vitest';
import type { EncounterPhase } from '../../src/types';

describe('EncounterPhase — slice 2a perEncounterFlags addition', () => {
  it('compiles with perEncounterFlags shape', () => {
    const ep: EncounterPhase = {
      id: 'enc-1',
      currentRound: 1,
      activeParticipantId: null,
      turnState: {},
      malice: { current: 0, lastMaliciousStrikeRound: null },
      firstSide: null,
      currentPickingSide: null,
      actedThisRound: [],
      pendingTriggers: null,
      perEncounterFlags: { perTurn: { heroesActedThisTurn: [] } },
    };
    expect(ep.perEncounterFlags.perTurn.heroesActedThisTurn).toEqual([]);
  });
});
