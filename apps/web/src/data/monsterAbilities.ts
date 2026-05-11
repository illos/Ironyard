import type { Characteristic, DamageType } from '@ironyard/shared';

// Slice 11 placeholder ability table. The slice-2 monster ingest ships
// id/name/level only — abilities, EV, characteristics, immunities etc. land
// in a future data slice. Until then, every monster gets one generic Strike
// scaled off its level so the auto-roll loop is exercisable end-to-end.
//
// TODO: replace this with a lookup against `apps/web/public/data/monsters.json`
// once the ingest emits ability blocks (see docs/data-pipeline.md).

export type StubAbility = {
  id: string;
  name: string;
  blurb: string;
  characteristic: Characteristic;
  // The slice-3 RollPower payload carries the ladder inline. Real abilities
  // will derive these from data; here we approximate by scaling with level.
  ladder: {
    t1: { damage: number; damageType: DamageType };
    t2: { damage: number; damageType: DamageType };
    t3: { damage: number; damageType: DamageType };
  };
};

function strikeFor(level: number, damageType: DamageType = 'untyped'): StubAbility {
  // Scale: t1 ≈ level+1, t2 ≈ 2(level+1), t3 ≈ 3(level+1). Floor at 1/3/5
  // so even a level-0 critter does something on a hit.
  const t1 = Math.max(1, level + 1);
  const t2 = Math.max(3, (level + 1) * 2);
  const t3 = Math.max(5, (level + 1) * 3);
  return {
    id: 'strike',
    name: 'Strike',
    blurb: 'Generic melee strike — placeholder until the ability data ships.',
    characteristic: 'might',
    ladder: {
      t1: { damage: t1, damageType },
      t2: { damage: t2, damageType },
      t3: { damage: t3, damageType },
    },
  };
}

// Public lookup. Today every monster gets one generic Strike scaled by level;
// the call signature is set up so a future data slice can return a real list
// without touching the caller.
export function abilitiesForMonster(_monsterId: string, level: number): StubAbility[] {
  return [strikeFor(level)];
}

// PC fallback. Phase 2 brings the real character sheet; for slice 11 the
// generic Free Strike (characteristic 0 baseline, untyped damage) keeps the
// auto-roll loop usable when a PC is the focused participant.
export function abilitiesForPc(): StubAbility[] {
  return [
    {
      id: 'free-strike',
      name: 'Free Strike',
      blurb: 'Generic free strike — replace with the real ability sheet in Phase 2.',
      characteristic: 'might',
      ladder: {
        t1: { damage: 2, damageType: 'untyped' },
        t2: { damage: 5, damageType: 'untyped' },
        t3: { damage: 8, damageType: 'untyped' },
      },
    },
  ];
}
