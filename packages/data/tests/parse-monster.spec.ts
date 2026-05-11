import { describe, expect, it } from 'vitest';
import { parseMonsterMarkdown, slugifyMonster } from '../src/parse-monster';

const sample = `---
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

| Body table … |
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

describe('parseMonsterMarkdown', () => {
  it('extracts id, name, level from a valid SteelCompendium statblock', () => {
    const result = parseMonsterMarkdown(sample);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.monster).toEqual({
        id: 'angulotl-cleaver-l1',
        name: 'Angulotl Cleaver',
        level: 1,
      });
    }
  });

  it('derives the id from name+level even when the source has an item_id', () => {
    // Source `item_id` is informational; it collides across levels for some
    // monster families. We always slugify to keep ids unique.
    const result = parseMonsterMarkdown(sample);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.monster.id).toBe('angulotl-cleaver-l1');
  });

  it('rejects content with no frontmatter', () => {
    const result = parseMonsterMarkdown('# Just a markdown file\n\nnothing here');
    expect(result.ok).toBe(false);
  });

  it('rejects a statblock missing item_name', () => {
    const noName = sample.replace('item_name: Angulotl Cleaver\n', '');
    const result = parseMonsterMarkdown(noName);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/item_name/);
  });

  it('rejects a statblock missing level', () => {
    const noLevel = sample.replace('level: 1\n', '');
    const result = parseMonsterMarkdown(noLevel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/level/);
  });

  it('rejects a level outside the 0..20 range', () => {
    const bad = sample.replace('level: 1\n', 'level: 21\n');
    const result = parseMonsterMarkdown(bad);
    expect(result.ok).toBe(false);
  });

  it('accepts boss-tier levels (>10) and template-tier levels (0)', () => {
    expect(parseMonsterMarkdown(sample.replace('level: 1\n', 'level: 11\n')).ok).toBe(true);
    expect(parseMonsterMarkdown(sample.replace('level: 1\n', 'level: 0\n')).ok).toBe(true);
  });
});
