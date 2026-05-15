import type { Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { derivePickAffordance } from './PickerAffordance';

function pc(id: string, ownerId: string | null): Participant {
  return {
    id, name: id, kind: 'pc', level: 1, currentStamina: 30, maxStamina: 30,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [], weaknesses: [], conditions: [], heroicResources: [],
    extras: [], surges: 0, recoveries: { current: 0, max: 0 }, recoveryValue: 0,
    ownerId, characterId: null,
    weaponDamageBonus: { melee: [0,0,0], ranged: [0,0,0] },
    activeAbilities: [], victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false },
    surprised: false,
  };
}
function monster(id: string): Participant { return { ...pc(id, null), kind: 'monster' }; }

const onPick = () => {};

describe('derivePickAffordance', () => {
  it('returns null if the participant already acted', () => {
    const r = derivePickAffordance({
      participant: pc('alice', 'alice-user'),
      currentPickingSide: 'heroes',
      acted: ['alice'],
      viewerId: 'alice-user',
      isActingAsDirector: false,
      onPick,
    });
    expect(r).toBeNull();
  });

  it("returns self for the viewer's own unacted PC when heroes are picking", () => {
    const r = derivePickAffordance({
      participant: pc('alice', 'alice-user'),
      currentPickingSide: 'heroes',
      acted: [],
      viewerId: 'alice-user',
      isActingAsDirector: false,
      onPick,
    });
    expect(r?.kind).toBe('self');
  });

  it("returns null for another player's PC in player view", () => {
    const r = derivePickAffordance({
      participant: pc('alice', 'alice-user'),
      currentPickingSide: 'heroes',
      acted: [],
      viewerId: 'bob-user',
      isActingAsDirector: false,
      onPick,
    });
    expect(r).toBeNull();
  });

  it("returns other for another player's PC in director view", () => {
    const r = derivePickAffordance({
      participant: pc('alice', 'alice-user'),
      currentPickingSide: 'heroes',
      acted: [],
      viewerId: 'director-user',
      isActingAsDirector: true,
      onPick,
    });
    expect(r?.kind).toBe('other');
  });

  it('returns foe-tap for unacted foes in director view when foes are picking', () => {
    const r = derivePickAffordance({
      participant: monster('goblin'),
      currentPickingSide: 'foes',
      acted: [],
      viewerId: 'director-user',
      isActingAsDirector: true,
      onPick,
    });
    expect(r?.kind).toBe('foe-tap');
  });

  it('returns null for foes in player view', () => {
    const r = derivePickAffordance({
      participant: monster('goblin'),
      currentPickingSide: 'foes',
      acted: [],
      viewerId: 'alice-user',
      isActingAsDirector: false,
      onPick,
    });
    expect(r).toBeNull();
  });

  it('returns null when the participant is on the non-picking side', () => {
    const r = derivePickAffordance({
      participant: pc('alice', 'alice-user'),
      currentPickingSide: 'foes',
      acted: [],
      viewerId: 'alice-user',
      isActingAsDirector: false,
      onPick,
    });
    expect(r).toBeNull();
  });

  it('returns null when currentPickingSide is null', () => {
    const r = derivePickAffordance({
      participant: pc('alice', 'alice-user'),
      currentPickingSide: null,
      acted: [],
      viewerId: 'alice-user',
      isActingAsDirector: false,
      onPick,
    });
    expect(r).toBeNull();
  });
});
