import { describe, expect, it } from 'vitest';
import { HEROIC_RESOURCE_NAMES } from '@ironyard/shared';
import { HEROIC_RESOURCES, resolveFloor } from '../src/heroic-resources';

describe('HEROIC_RESOURCES table', () => {
  it('has an entry for every HeroicResourceName', () => {
    for (const name of HEROIC_RESOURCE_NAMES) {
      expect(HEROIC_RESOURCES[name]).toBeDefined();
      expect(HEROIC_RESOURCES[name].name).toBe(name);
    }
  });

  it('Censor (wrath) gains +2 flat per turn', () => {
    expect(HEROIC_RESOURCES.wrath.baseGain.onTurnStart).toEqual({ kind: 'flat', amount: 2 });
  });

  it('Conduit (piety) rolls 1d3 per turn', () => {
    expect(HEROIC_RESOURCES.piety.baseGain.onTurnStart).toEqual({ kind: 'd3' });
  });

  it('Talent (clarity) has a negative-floor formula', () => {
    expect(HEROIC_RESOURCES.clarity.floor).toEqual({ formula: 'negative_one_plus_reason' });
  });

  it('all other resources floor at 0', () => {
    for (const name of HEROIC_RESOURCE_NAMES) {
      if (name === 'clarity') continue;
      expect(HEROIC_RESOURCES[name].floor).toBe(0);
    }
  });

  it('every resource preloads from victories on encounter start', () => {
    for (const name of HEROIC_RESOURCE_NAMES) {
      expect(HEROIC_RESOURCES[name].baseGain.onEncounterStart).toBe('victories');
    }
  });
});

describe('resolveFloor', () => {
  it('returns 0 for a numeric floor', () => {
    expect(resolveFloor(0, { reason: 2 })).toBe(0);
  });

  it('returns -(1 + reason) for the clarity formula', () => {
    expect(
      resolveFloor(
        { formula: 'negative_one_plus_reason' },
        { reason: 2 },
      ),
    ).toBe(-3);
  });

  it('returns -1 when reason is 0', () => {
    expect(
      resolveFloor(
        { formula: 'negative_one_plus_reason' },
        { reason: 0 },
      ),
    ).toBe(-1);
  });
});
