import { describe, expect, it } from 'vitest';
import { cancelEdgesAndBanes, resolvePowerRoll, tierFromTotal } from '../src/power-roll';

describe('tierFromTotal', () => {
  it('maps ≤11 to t1', () => {
    expect(tierFromTotal(0)).toBe(1);
    expect(tierFromTotal(11)).toBe(1);
  });
  it('maps 12–16 to t2', () => {
    expect(tierFromTotal(12)).toBe(2);
    expect(tierFromTotal(16)).toBe(2);
  });
  it('maps ≥17 to t3', () => {
    expect(tierFromTotal(17)).toBe(3);
    expect(tierFromTotal(50)).toBe(3);
  });
});

describe('cancelEdgesAndBanes (canon §1.4)', () => {
  it('zero / zero stays zero', () => {
    expect(cancelEdgesAndBanes(0, 0)).toEqual({ netEdges: 0, netBanes: 0 });
  });
  it('1 / 1 cancels to none', () => {
    expect(cancelEdgesAndBanes(1, 1)).toEqual({ netEdges: 0, netBanes: 0 });
  });
  it('2+ / 2+ cancels to none', () => {
    expect(cancelEdgesAndBanes(2, 2)).toEqual({ netEdges: 0, netBanes: 0 });
  });
  it('2 edges + 1 bane = one edge', () => {
    expect(cancelEdgesAndBanes(2, 1)).toEqual({ netEdges: 1, netBanes: 0 });
  });
  it('1 edge + 2 banes = one bane', () => {
    expect(cancelEdgesAndBanes(1, 2)).toEqual({ netEdges: 0, netBanes: 1 });
  });
  it('1 edge alone', () => {
    expect(cancelEdgesAndBanes(1, 0)).toEqual({ netEdges: 1, netBanes: 0 });
  });
  it('2 banes alone', () => {
    expect(cancelEdgesAndBanes(0, 2)).toEqual({ netEdges: 0, netBanes: 2 });
  });
});

describe('resolvePowerRoll', () => {
  it('plain roll: 2d10 + characteristic, no edges/banes', () => {
    const r = resolvePowerRoll({ d10: [5, 4], characteristic: 2, edges: 0, banes: 0 });
    expect(r.natural).toBe(9);
    expect(r.total).toBe(11);
    expect(r.tier).toBe(1);
  });

  it('total of 12 lands in t2', () => {
    const r = resolvePowerRoll({ d10: [6, 4], characteristic: 2, edges: 0, banes: 0 });
    expect(r.total).toBe(12);
    expect(r.tier).toBe(2);
  });

  it('single edge adds +2 to total', () => {
    const r = resolvePowerRoll({ d10: [5, 5], characteristic: 0, edges: 1, banes: 0 });
    expect(r.total).toBe(12);
    expect(r.tier).toBe(2);
  });

  it('single bane subtracts 2', () => {
    const r = resolvePowerRoll({ d10: [7, 5], characteristic: 0, edges: 0, banes: 1 });
    expect(r.total).toBe(10);
    expect(r.tier).toBe(1);
  });

  it('double edge bumps tier up after total is computed', () => {
    // total=11 → baseTier=t1 → +1 = t2
    const r = resolvePowerRoll({ d10: [5, 6], characteristic: 0, edges: 2, banes: 0 });
    expect(r.total).toBe(11);
    expect(r.tier).toBe(2);
  });

  it('double edge caps at t3', () => {
    const r = resolvePowerRoll({ d10: [9, 8], characteristic: 0, edges: 2, banes: 0 });
    expect(r.tier).toBe(3); // baseTier=t3 + cap → still t3
  });

  it('double bane drops tier down after total', () => {
    // total=16 → baseTier=t2 → -1 = t1
    const r = resolvePowerRoll({ d10: [8, 8], characteristic: 0, edges: 0, banes: 2 });
    expect(r.total).toBe(16);
    expect(r.tier).toBe(1);
  });

  it('double bane floors at t1', () => {
    const r = resolvePowerRoll({ d10: [2, 1], characteristic: 0, edges: 0, banes: 2 });
    expect(r.tier).toBe(1);
  });

  it('natural 19 forces t3 regardless of total or banes', () => {
    const r = resolvePowerRoll({ d10: [10, 9], characteristic: -5, edges: 0, banes: 2 });
    expect(r.natural).toBe(19);
    expect(r.tier).toBe(3);
  });

  it('natural 20 forces t3', () => {
    const r = resolvePowerRoll({ d10: [10, 10], characteristic: 0, edges: 0, banes: 0 });
    expect(r.natural).toBe(20);
    expect(r.tier).toBe(3);
  });

  it('negative characteristic reduces total', () => {
    const r = resolvePowerRoll({ d10: [5, 5], characteristic: -3, edges: 0, banes: 0 });
    expect(r.total).toBe(7);
    expect(r.tier).toBe(1);
  });

  it('edges and banes cancel before tier modifiers apply', () => {
    // 1 edge + 1 bane → netEdges=0, netBanes=0 → no tier shift
    const r = resolvePowerRoll({ d10: [6, 6], characteristic: 0, edges: 1, banes: 1 });
    expect(r.total).toBe(12);
    expect(r.tier).toBe(2);
  });
});
