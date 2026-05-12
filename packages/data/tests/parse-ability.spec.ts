import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAbilityMarkdown } from '../src/parse-ability';

const ABILITIES = join(__dirname, '../../../.reference/data-md/Rules/Abilities');

function findAbility(classFolder: string, namePattern: string): { md: string; path: string } {
  function search(dir: string): string | null {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) {
        const f = search(p);
        if (f) return f;
      } else if (entry.endsWith('.md') && entry.includes(namePattern)) {
        return p;
      }
    }
    return null;
  }
  const path = search(join(ABILITIES, classFolder));
  if (!path) throw new Error(`no ${namePattern} in ${classFolder}`);
  return { md: readFileSync(path, 'utf8'), path };
}

describe('parseAbilityMarkdown', () => {
  it('parses a Fury signature ability — cost 0, sourceClassId fury', () => {
    // Brutal Slam has ability_type: Signature in its frontmatter
    const { md, path } = findAbility('Fury', 'Brutal Slam');
    const a = parseAbilityMarkdown(md, path);
    expect(a).not.toBeNull();
    expect(a!.cost).toBe(0);
    expect(a!.sourceClassId).toBe('fury');
  });

  it('parses an 11-Ferocity ability — cost 11, sourceClassId fury', () => {
    const { md, path } = findAbility('Fury', 'Primordial Rage');
    const a = parseAbilityMarkdown(md, path);
    expect(a).not.toBeNull();
    expect(a!.cost).toBe(11);
    expect(a!.sourceClassId).toBe('fury');
  });

  it('parses a Common ability — sourceClassId common', () => {
    const dir = join(ABILITIES, 'Common');
    // Recurse to find any .md file
    function findFirst(d: string): string | null {
      for (const entry of readdirSync(d)) {
        const p = join(d, entry);
        const st = statSync(p);
        if (st.isDirectory()) {
          const f = findFirst(p);
          if (f) return f;
        } else if (entry.endsWith('.md')) {
          return p;
        }
      }
      return null;
    }
    const filePath = findFirst(dir);
    if (!filePath) throw new Error('no common abilities');
    const a = parseAbilityMarkdown(readFileSync(filePath, 'utf8'), filePath);
    expect(a).not.toBeNull();
    expect(a!.sourceClassId).toBe('common');
  });

  it('parses a Kit ability — sourceClassId kits', () => {
    const dir = join(ABILITIES, 'Kits');
    const subdirs = readdirSync(dir).filter((d) => !d.endsWith('.md'));
    if (subdirs.length === 0) return;
    const sub = join(dir, subdirs[0]!);
    const file = readdirSync(sub).find((f) => f.endsWith('.md'));
    if (!file) return;
    const path = join(sub, file);
    const a = parseAbilityMarkdown(readFileSync(path, 'utf8'), path);
    expect(a).not.toBeNull();
    expect(a!.sourceClassId).toBe('kits');
  });
});

describe('parseAbilityMarkdown — id derivation', () => {
  it('derives id as {sourceClassId}-{slug-of-name}', () => {
    const md = `---
item_name: Mind Spike
type: feature/ability/free
class: tactician
action_type: Main action
---
`;
    const a = parseAbilityMarkdown(md, '/abs/Abilities/Tactician/Mind Spike.md');
    expect(a?.id).toBe('tactician-mind-spike');
  });

  it('slugifies punctuation in names', () => {
    const md = `---
item_name: Run 'em Down!
type: feature/ability/free
class: fury
action_type: Maneuver
---
`;
    const a = parseAbilityMarkdown(md, '/abs/Abilities/Fury/Run em Down.md');
    expect(a?.id).toBe('fury-run-em-down');
  });

  it('falls back to ability-source folder when sourceClassId is null', () => {
    // Common abilities live under Common/; sourceClassId is "common".
    const md = `---
item_name: Heal
type: common-ability/maneuver
---
`;
    const a = parseAbilityMarkdown(md, '/abs/Abilities/Common/Heal.md');
    expect(a?.id).toBe('common-heal');
  });

  it('appends -tN when level is set', () => {
    const md = `---
item_name: Arise (11 Piety)
type: feature/ability/3
class: conduit
level: 7
---
`;
    const a = parseAbilityMarkdown(md, '/abs/Abilities/Conduit/7th-Level Features/Arise.md');
    expect(a?.id).toBe('conduit-arise-11-piety-t7');
  });
});
