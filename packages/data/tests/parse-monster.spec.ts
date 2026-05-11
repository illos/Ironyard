import { describe, expect, it } from 'vitest';
import { parseMonsterMarkdown, slugifyMonster } from '../src/parse-monster';

// ─────────────────────────────────────────────────────────────────────────────
// Fixture: Goblin Warrior — Level 1 horde harrier. Vanilla action, malice-cost
// ability, plain trait. No immunities, no weaknesses, walk-only movement.
// ─────────────────────────────────────────────────────────────────────────────
const goblinWarrior = `---
agility: 2
ancestry:
  - Goblin
  - Humanoid
ev: '3'
free_strike: 1
intuition: 0
item_id: goblin-warrior
item_index: '01'
item_name: Goblin Warrior
level: 1
might: -2
presence: -1
reason: 0
roles:
  - Horde Harrier
size: 1S
speed: 6
stability: 0
stamina: '15'
type: monster/goblins/statblock
---

###### Goblin Warrior

|  Goblin, Humanoid   |            -            |       Level 1       |      Horde Harrier      |          EV 3          |
| :-----------------: | :---------------------: | :-----------------: | :---------------------: | :--------------------: |
|  **1S**<br/> Size   |    **6**<br/> Speed     | **15**<br/> Stamina |  **0**<br/> Stability   | **1**<br/> Free Strike |
| **-**<br/> Immunity | **Climb**<br/> Movement |          -          | **-**<br/> With Captain |  **-**<br/> Weakness   |
|  **-2**<br/> Might  |   **+2**<br/> Agility   |  **0**<br/> Reason  |  **0**<br/> Intuition   |  **-1**<br/> Presence  |

<!-- -->
> 🗡 **Spear Charge (Signature Ability)**
>
> | **Charge, Melee, Strike, Weapon** |               **Main action** |
> | --------------------------------- | ----------------------------: |
> | **📏 Melee 1**                    | **🎯 One creature or object** |
>
> **Power Roll + 2:**
>
> - **≤11:** 3 damage
> - **12-16:** 4 damage
> - **17+:** 5 damage

<!-- -->
> 🗡 **Bury the Point (2 Malice)**
>
> | **Melee, Strike, Weapon** |     **Main action** |
> | ------------------------- | ------------------: |
> | **📏 Melee 1**            | **🎯 One creature** |
>
> **Power Roll + 2:**
>
> - **≤11:** 5 damage; M < 0 bleeding (save ends)
> - **12-16:** 6 damage; M < 1 bleeding (save ends)
> - **17+:** 7 damage; M < 2 bleeding (save ends)

<!-- -->
> ⭐️ **Crafty**
>
> The warrior doesn't provoke opportunity attacks by moving.
`;

// ─────────────────────────────────────────────────────────────────────────────
// Fixture: Angulotl Cleaver — Level 1 minion with a typed immunity
// ("Poison 2") and a non-empty With Captain.
// ─────────────────────────────────────────────────────────────────────────────
const angulotlCleaver = `---
agility: 2
ancestry:
  - Angulotl
  - Humanoid
ev: 3 for 4 minions
free_strike: 2
intuition: 1
item_id: angulotl-cleaver
item_index: '03'
item_name: Angulotl Cleaver
level: 1
might: 0
presence: 0
reason: 0
roles:
  - Minion Ambusher
size: 1S
speed: 6
stability: 0
stamina: '4'
---

###### Angulotl Cleaver

|     Angulotl, Humanoid     |               -               |      Level 1       |                 Minion Ambusher                  |   EV 3 for 4 minions   |
| :------------------------: | :---------------------------: | :----------------: | :----------------------------------------------: | :--------------------: |
|      **1S**<br/> Size      |       **6**<br/> Speed        | **4**<br/> Stamina |               **0**<br/> Stability               | **2**<br/> Free Strike |
| **Poison 2**<br/> Immunity | **Climb, swim**<br/> Movement |         -          | **+1 damage bonus to strikes**<br/> With Captain |  **-**<br/> Weakness   |
|      **0**<br/> Might      |      **+2**<br/> Agility      | **+0**<br/> Reason |              **+1**<br/> Intuition               |  **+0**<br/> Presence  |

<!-- -->
> 🗡 **Hop and Chop (Signature Ability)**
>
> | **Melee, Strike, Weapon** |                          **Main action** |
> | ------------------------- | ---------------------------------------: |
> | **📏 Melee 1**            | **🎯 One creature or object per minion** |
>
> **Power Roll + 2:**
>
> - **≤11:** 2 damage
> - **12-16:** 4 damage
> - **17+:** 5 damage
>
> **Effect:** The cleaver jumps up to 4 squares before or after making this strike.

<!-- -->
> ⭐️ **Toxiferous**
>
> Whenever an adjacent enemy grabs the cleaver or uses a melee ability against them, that enemy takes 1 poison damage.
`;

// ─────────────────────────────────────────────────────────────────────────────
// Fixture: Bale Eye — typed weakness ("Holy 5"), no immunity. Mid-tier demon.
// ─────────────────────────────────────────────────────────────────────────────
const baleEye = `---
agility: 0
ancestry:
  - Demon
ev: '20'
free_strike: 4
intuition: 2
item_id: bale-eye
item_index: '02'
item_name: Bale Eye
level: 4
might: 0
presence: 4
reason: 4
roles:
  - Boss Controller
size: 1L
speed: 0
stability: 1
stamina: '120'
---

###### Bale Eye

|     Demon     |          -          |       Level 4        |         Boss Controller         |        EV 20        |
| :-----------: | :-----------------: | :------------------: | :-----------------------------: | :-----------------: |
| **1L**<br/> Size | **0**<br/> Speed | **120**<br/> Stamina | **1**<br/> Stability | **4**<br/> Free Strike |
| **-**<br/> Immunity | **Hover**<br/> Movement | - | **-**<br/> With Captain | **Holy 5**<br/> Weakness |
| **0**<br/> Might | **+0**<br/> Agility | **+4**<br/> Reason | **+2**<br/> Intuition | **+4**<br/> Presence |

<!-- -->
> 🏹 **Death Beam (Signature Ability)**
>
> | **Magic, Ranged, Strike** |                       **Main Action** |
> | ------------------------- | ------------------------------------: |
> | **📏 Ranged 10**          | **🎯 One creature**                    |
>
> **Power Roll + 4:**
>
> - **≤11:** 6 corruption damage
> - **12-16:** 9 corruption damage
> - **17+:** 13 corruption damage
`;

// ─────────────────────────────────────────────────────────────────────────────
// Fixture: Ajax the Invincible — Level 11 solo boss. Many ability variants:
// trait without a table, multiple triggered actions, villain actions, malice
// options. Stress test for ability parsing.
// ─────────────────────────────────────────────────────────────────────────────
const ajaxBoss = `---
agility: 4
ancestry:
  - Human
  - Humanoid
ev: '156'
free_strike: 11
intuition: 5
item_id: ajax-the-invincible
item_index: '01'
item_name: Ajax the Invincible
level: 11
might: 5
presence: 4
reason: 5
roles:
  - Solo
size: 1L
speed: 7
stability: 2
stamina: '700'
---

###### Ajax the Invincible

|    Human, Humanoid    |              -               |       Level 11       |          Solo           |         EV 156          |
| :-------------------: | :--------------------------: | :------------------: | :---------------------: | :---------------------: |
|   **1L**<br/> Size    |       **7**<br/> Speed       | **700**<br/> Stamina |  **2**<br/> Stability   | **11**<br/> Free Strike |
| **-**<br/> Immunities | **Fly, hover**<br/> Movement |          -           | **-**<br/> With Captain |   **-**<br/> Weakness   |
|   **+5**<br/> Might   |     **+4**<br/> Agility      |  **+5**<br/> Reason  |  **+5**<br/> Intuition  |  **+4**<br/> Presence   |

<!-- -->
> ☠️ **Ajax**
>
> **Ajax Turns:** Ajax takes up to three turns each round. He can't take turns consecutively.

<!-- -->
> 🗡 **Blade of the Gol King (Signature Ability)**
>
> | **Charge, Magic, Melee, Strike, Weapon** |                 **Main Action** |
> | ---------------------------------------- | ------------------------------: |
> | **📏 Melee 1**                           | **🎯 Two creatures or objects** |
>
> **Power Roll + 5:**
>
> - **≤11:** 16 damage; M < 4 the target loses 1d3 Recoveries
> - **12-16:** 22 damage; M < 5 the target loses 1d3 Recoveries
> - **17+:** 26 damage; M < 6 prone and the target loses 1d3 Recoveries

<!-- -->
> ❗️ **Is This What They Taught You?**
>
> | **Ranged**       |           **Triggered action** |
> | ---------------- | -----------------------------: |
> | **📏 Ranged 10** | **🎯 The triggering creature** |
>
> **Trigger:** A creature within distance marks Ajax.
>
> **Effect:** The target is marked while Ajax is marked.

<!-- -->
> ☠️ **Phoenix Wing King (Villain Action 1)**
>
> | **Area, Magic, Weapon** |                         **-** |
> | ----------------------- | ----------------------------: |
> | **📏 5 burst**          | **🎯 Each enemy in the area** |
>
> **Power Roll + 5:**
>
> - **≤11:** 11 fire damage; A < 4 weakened (save ends)
> - **12-16:** 17 fire damage; A < 5 weakened (save ends)
> - **17+:** 21 fire damage; A < 6 weakened (save ends)
`;

describe('slugifyMonster', () => {
  it('produces kebab-case with level suffix', () => {
    expect(slugifyMonster('Angulotl Cleaver', 1)).toBe('angulotl-cleaver-l1');
  });

  it('handles apostrophes and special chars', () => {
    expect(slugifyMonster("Goblin's Brute", 4)).toBe('goblin-s-brute-l4');
  });

  it('disambiguates same-name monsters by level', () => {
    expect(slugifyMonster('Goblin', 1)).not.toBe(slugifyMonster('Goblin', 4));
  });
});

describe('parseMonsterMarkdown — frontmatter basics', () => {
  it('extracts id, name, level', () => {
    const result = parseMonsterMarkdown(goblinWarrior);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.monster.id).toBe('goblin-warrior-l1');
      expect(result.monster.name).toBe('Goblin Warrior');
      expect(result.monster.level).toBe(1);
    }
  });

  it('derives the id from name+level even when the source has an item_id', () => {
    const result = parseMonsterMarkdown(goblinWarrior);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.monster.id).toBe('goblin-warrior-l1');
  });

  it('rejects content with no frontmatter', () => {
    const result = parseMonsterMarkdown('# Just a markdown file\n\nnothing here');
    expect(result.ok).toBe(false);
  });

  it('rejects a statblock missing item_name', () => {
    const noName = goblinWarrior.replace('item_name: Goblin Warrior\n', '');
    const result = parseMonsterMarkdown(noName);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/item_name/);
  });

  it('rejects a statblock missing level', () => {
    const noLevel = goblinWarrior.replace('level: 1\n', '');
    const result = parseMonsterMarkdown(noLevel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/level/);
  });

  it('rejects a level outside the 0..20 range', () => {
    const bad = goblinWarrior.replace('level: 1\n', 'level: 21\n');
    const result = parseMonsterMarkdown(bad);
    expect(result.ok).toBe(false);
  });

  it('accepts boss-tier levels (>10) and template-tier levels (0)', () => {
    const boss = parseMonsterMarkdown(goblinWarrior.replace('level: 1\n', 'level: 11\n'));
    const template = parseMonsterMarkdown(goblinWarrior.replace('level: 1\n', 'level: 0\n'));
    expect(boss.ok).toBe(true);
    expect(template.ok).toBe(true);
  });
});

describe('parseMonsterMarkdown — characteristics', () => {
  it('parses signed characteristics including negatives', () => {
    const result = parseMonsterMarkdown(goblinWarrior);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.monster.characteristics).toEqual({
        might: -2,
        agility: 2,
        reason: 0,
        intuition: 0,
        presence: -1,
      });
    }
  });

  it('parses high-tier characteristics (Ajax: +5/+4/+5/+5/+4)', () => {
    const result = parseMonsterMarkdown(ajaxBoss);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.monster.characteristics).toEqual({
        might: 5,
        agility: 4,
        reason: 5,
        intuition: 5,
        presence: 4,
      });
    }
  });
});

describe('parseMonsterMarkdown — stamina', () => {
  it('parses stamina from frontmatter quoted string', () => {
    const result = parseMonsterMarkdown(goblinWarrior);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.monster.stamina).toEqual({ base: 15 });
  });

  it('parses high stamina (Ajax: 700)', () => {
    const result = parseMonsterMarkdown(ajaxBoss);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.monster.stamina.base).toBe(700);
  });

  it('parses minion stamina (Cleaver: 4)', () => {
    const result = parseMonsterMarkdown(angulotlCleaver);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.monster.stamina.base).toBe(4);
  });
});

describe('parseMonsterMarkdown — EV', () => {
  it('parses integer EV', () => {
    const r = parseMonsterMarkdown(goblinWarrior);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.monster.ev).toEqual({ ev: 3 });
  });

  it('parses minion EV with note ("3 for 4 minions")', () => {
    const r = parseMonsterMarkdown(angulotlCleaver);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.monster.ev).toEqual({ ev: 3, note: 'for 4 minions' });
  });

  it('parses boss EV (156)', () => {
    const r = parseMonsterMarkdown(ajaxBoss);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.monster.ev.ev).toBe(156);
  });
});

describe('parseMonsterMarkdown — immunities and weaknesses', () => {
  it('parses typed immunity ("Poison 2")', () => {
    const r = parseMonsterMarkdown(angulotlCleaver);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.monster.immunities).toEqual([{ type: 'poison', value: 2 }]);
  });

  it('parses typed weakness ("Holy 5")', () => {
    const r = parseMonsterMarkdown(baleEye);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.monster.weaknesses).toEqual([{ type: 'holy', value: 5 }]);
  });

  it('emits no immunities/weaknesses when "-" placeholder', () => {
    const r = parseMonsterMarkdown(goblinWarrior);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.monster.immunities).toEqual([]);
      expect(r.monster.weaknesses).toEqual([]);
    }
  });
});

describe('parseMonsterMarkdown — speed, size, stability, movement', () => {
  it('parses speed from frontmatter', () => {
    const r = parseMonsterMarkdown(goblinWarrior);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.monster.speed).toBe(6);
  });

  it('parses size string verbatim ("1S", "1L")', () => {
    const w = parseMonsterMarkdown(goblinWarrior);
    const a = parseMonsterMarkdown(ajaxBoss);
    expect(w.ok && a.ok).toBe(true);
    if (w.ok) expect(w.monster.size).toBe('1S');
    if (a.ok) expect(a.monster.size).toBe('1L');
  });

  it('parses movement modes from body table', () => {
    const a = parseMonsterMarkdown(ajaxBoss);
    expect(a.ok).toBe(true);
    if (a.ok) {
      expect(a.monster.movement.sort()).toEqual(['fly', 'hover']);
    }
  });

  it('falls back to walk-only when movement is "-"', () => {
    const fixture = goblinWarrior.replace('**Climb**<br/> Movement', '**-**<br/> Movement');
    const r = parseMonsterMarkdown(fixture);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.monster.movement).toEqual(['walk']);
  });

  it('parses stability and free strike from frontmatter', () => {
    const a = parseMonsterMarkdown(ajaxBoss);
    expect(a.ok).toBe(true);
    if (a.ok) {
      expect(a.monster.stability).toBe(2);
      expect(a.monster.freeStrike).toBe(11);
    }
  });
});

describe('parseMonsterMarkdown — roles and ancestry', () => {
  it('extracts roles array', () => {
    const r = parseMonsterMarkdown(goblinWarrior);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.monster.roles).toEqual(['Horde Harrier']);
  });

  it('extracts multi-element ancestry', () => {
    const r = parseMonsterMarkdown(goblinWarrior);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.monster.ancestry).toEqual(['Goblin', 'Humanoid']);
  });

  it('extracts Solo role', () => {
    const r = parseMonsterMarkdown(ajaxBoss);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.monster.roles).toEqual(['Solo']);
  });
});

describe('parseMonsterMarkdown — with-captain bonus', () => {
  it('captures the with-captain narrative string when present', () => {
    const r = parseMonsterMarkdown(angulotlCleaver);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.monster.withCaptain).toBe('+1 damage bonus to strikes');
  });

  it('leaves withCaptain undefined when the cell is "-"', () => {
    const r = parseMonsterMarkdown(goblinWarrior);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.monster.withCaptain).toBeUndefined();
  });
});

describe('parseMonsterMarkdown — abilities', () => {
  it('parses a signature action ability (Spear Charge)', () => {
    const r = parseMonsterMarkdown(goblinWarrior);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const spear = r.monster.abilities.find((a) => a.name === 'Spear Charge');
    expect(spear).toBeDefined();
    if (!spear) return;
    expect(spear.type).toBe('action');
    expect(spear.cost).toBe('Signature Ability');
    expect(spear.keywords).toEqual(['Charge', 'Melee', 'Strike', 'Weapon']);
    expect(spear.distance).toBe('Melee 1');
    expect(spear.target).toBe('One creature or object');
    expect(spear.powerRoll).toEqual({
      bonus: '+2',
      tier1: { raw: '3 damage', damage: 3, damageType: 'untyped', conditions: [] },
      tier2: { raw: '4 damage', damage: 4, damageType: 'untyped', conditions: [] },
      tier3: { raw: '5 damage', damage: 5, damageType: 'untyped', conditions: [] },
    });
  });

  it('parses a malice-cost action ability (Bury the Point — 2 Malice)', () => {
    const r = parseMonsterMarkdown(goblinWarrior);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const bury = r.monster.abilities.find((a) => a.name === 'Bury the Point');
    expect(bury).toBeDefined();
    if (!bury) return;
    expect(bury.type).toBe('action');
    expect(bury.cost).toBe('2 Malice');
    // Tier1 of "Bury the Point": "5 damage; M < 0 bleeding (save ends)" — the
    // Bleeding condition is now extracted into `conditions` (with the potency
    // prefix preserved in `note`), and the leftover residue lands in `effect`.
    expect(bury.powerRoll?.tier1.raw).toMatch(/5 damage/);
    expect(bury.powerRoll?.tier1.damage).toBe(5);
    expect(bury.powerRoll?.tier1.damageType).toBe('untyped');
    expect(bury.powerRoll?.tier1.conditions).toEqual([
      {
        condition: 'Bleeding',
        duration: { kind: 'save_ends' },
        scope: 'target',
        note: 'M < 0',
      },
    ]);
  });

  it('parses a trait (Crafty)', () => {
    const r = parseMonsterMarkdown(goblinWarrior);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const crafty = r.monster.abilities.find((a) => a.name === 'Crafty');
    expect(crafty).toBeDefined();
    if (!crafty) return;
    expect(crafty.type).toBe('trait');
    expect(crafty.powerRoll).toBeUndefined();
    expect(crafty.effect).toMatch(/opportunity attacks/);
  });

  it('parses an ability effect paragraph (Hop and Chop)', () => {
    const r = parseMonsterMarkdown(angulotlCleaver);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const hop = r.monster.abilities.find((a) => a.name === 'Hop and Chop');
    expect(hop?.effect).toMatch(/jumps up to 4 squares/);
  });

  it('parses a triggered action with a Trigger clause (Is This What They Taught You?)', () => {
    const r = parseMonsterMarkdown(ajaxBoss);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const trig = r.monster.abilities.find((a) => a.name === 'Is This What They Taught You?');
    expect(trig).toBeDefined();
    if (!trig) return;
    expect(trig.type).toBe('triggered');
    expect(trig.trigger).toMatch(/marks Ajax/);
  });

  it('parses a villain action (Phoenix Wing King)', () => {
    const r = parseMonsterMarkdown(ajaxBoss);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const villain = r.monster.abilities.find((a) => a.name === 'Phoenix Wing King');
    expect(villain).toBeDefined();
    if (!villain) return;
    expect(villain.type).toBe('villain');
    expect(villain.cost).toBe('Villain Action 1');
  });

  it('parses a trait with no action table (Ajax)', () => {
    const r = parseMonsterMarkdown(ajaxBoss);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const trait = r.monster.abilities.find((a) => a.name === 'Ajax');
    expect(trait).toBeDefined();
    if (!trait) return;
    expect(trait.type).toBe('trait');
    expect(trait.effect).toMatch(/Ajax takes up to three turns/);
  });

  it('preserves the raw block text for UI fallback', () => {
    const r = parseMonsterMarkdown(goblinWarrior);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const spear = r.monster.abilities.find((a) => a.name === 'Spear Charge');
    expect(spear?.raw).toMatch(/Power Roll \+ 2/);
  });
});
