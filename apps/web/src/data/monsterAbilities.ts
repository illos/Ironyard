import type { Ability } from '@ironyard/shared';

// Phase 1: monsters now read real abilities from `monsters.json` (ingested by
// @ironyard/data). The only remaining stub is the PC free strike — PCs don't
// have ingested abilities until the Phase 2 character sheet lands, and we
// still need *something* on the detail pane for a PC focus so the combat run
// loop is exercisable end-to-end.

// Real Ability shape so the AbilityCard renderer is uniform. Untyped 2/5/8
// ladder — a reasonable level-0 baseline that doesn't pretend to be class-
// specific. Replaced wholesale by the character sheet in Phase 2.
export function pcFreeStrike(): Ability {
  return {
    name: 'Free Strike',
    type: 'action',
    keywords: ['Melee', 'Strike', 'Weapon'],
    distance: 'Melee 1',
    target: 'One creature',
    powerRoll: {
      bonus: '+0',
      tier1: { raw: '2 damage', damage: 2, damageType: 'untyped', conditions: [] },
      tier2: { raw: '5 damage', damage: 5, damageType: 'untyped', conditions: [] },
      tier3: { raw: '8 damage', damage: 8, damageType: 'untyped', conditions: [] },
    },
    raw: 'Free Strike (Phase-2 placeholder)\n\n**Power Roll +0**\n\n- **≤11:** 2 damage\n- **12-16:** 5 damage\n- **17+:** 8 damage',
  };
}
