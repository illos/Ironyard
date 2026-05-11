import type { Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyDamageStep } from '../src/damage';

function makeTarget(over: Partial<Participant> = {}): Participant {
  return {
    id: 'p_1',
    name: 'Target',
    kind: 'monster',
    level: 1,
    currentStamina: 20,
    maxStamina: 20,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [],
    weaknesses: [],
    conditions: [],
    heroicResources: [],
    extras: [],
    surges: 0,
    recoveries: { current: 0, max: 0 },
    recoveryValue: 0,
    ownerId: null,
    characterId: null,
    ...over,
  };
}

describe('applyDamageStep', () => {
  it('untyped damage applies straight to stamina', () => {
    const r = applyDamageStep(makeTarget(), 5, 'untyped');
    expect(r.delivered).toBe(5);
    expect(r.before).toBe(20);
    expect(r.after).toBe(15);
    expect(r.newParticipant.currentStamina).toBe(15);
  });

  it('matching weakness adds to incoming damage', () => {
    const t = makeTarget({ weaknesses: [{ type: 'fire', value: 3 }] });
    const r = applyDamageStep(t, 5, 'fire');
    expect(r.delivered).toBe(8);
    expect(r.after).toBe(12);
  });

  it('non-matching weakness is ignored', () => {
    const t = makeTarget({ weaknesses: [{ type: 'fire', value: 3 }] });
    const r = applyDamageStep(t, 5, 'cold');
    expect(r.delivered).toBe(5);
  });

  it('matching immunity subtracts from incoming damage (post-weakness)', () => {
    const t = makeTarget({ immunities: [{ type: 'poison', value: 2 }] });
    const r = applyDamageStep(t, 5, 'poison');
    expect(r.delivered).toBe(3);
    expect(r.after).toBe(17);
  });

  it('immunity ≥ damage zeroes it out (floors at 0)', () => {
    const t = makeTarget({ immunities: [{ type: 'fire', value: 10 }] });
    const r = applyDamageStep(t, 5, 'fire');
    expect(r.delivered).toBe(0);
    expect(r.after).toBe(20); // untouched
  });

  it('weakness and immunity stack arithmetically (weakness first, then immunity)', () => {
    const t = makeTarget({
      weaknesses: [{ type: 'fire', value: 4 }],
      immunities: [{ type: 'fire', value: 2 }],
    });
    const r = applyDamageStep(t, 5, 'fire');
    expect(r.delivered).toBe(7); // 5 + 4 - 2
    expect(r.after).toBe(13);
  });

  it('stamina floors at 0; overkill does not go negative', () => {
    const t = makeTarget({ currentStamina: 3 });
    const r = applyDamageStep(t, 10, 'untyped');
    expect(r.delivered).toBe(10);
    expect(r.after).toBe(0);
  });

  it('zero damage is a no-op', () => {
    const r = applyDamageStep(makeTarget(), 0, 'untyped');
    expect(r.delivered).toBe(0);
    expect(r.after).toBe(20);
  });

  it('multiple weakness entries for the same type sum', () => {
    const t = makeTarget({
      weaknesses: [
        { type: 'fire', value: 2 },
        { type: 'fire', value: 3 },
      ],
    });
    const r = applyDamageStep(t, 1, 'fire');
    expect(r.delivered).toBe(6); // 1 + 2 + 3
  });

  it('returns a new participant object — input is not mutated', () => {
    const t = makeTarget();
    const before = JSON.stringify(t);
    applyDamageStep(t, 5, 'untyped');
    expect(JSON.stringify(t)).toBe(before);
  });
});
