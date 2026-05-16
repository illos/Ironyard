import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABILITY_TARGETING_EFFECTS } from '../../src/class-triggers/ability-targeting-effects';

describe('ABILITY_TARGETING_EFFECTS', () => {
  it('contains entries for the two PHB ability ids', () => {
    expect(ABILITY_TARGETING_EFFECTS['censor-judgment-t1']).toEqual({
      relationKind: 'judged',
      mode: 'replace',
    });
    expect(ABILITY_TARGETING_EFFECTS['tactician-mark-t1']).toEqual({
      relationKind: 'marked',
      mode: 'replace',
    });
  });

  it('keys correspond to actual ability ids in the data pipeline (fail loudly on rename)', () => {
    const abilitiesPath = resolve(__dirname, '../../../../apps/web/public/data/abilities.json');
    const data = JSON.parse(readFileSync(abilitiesPath, 'utf8'));
    // The shape: top-level object with an `abilities` array (flat, not nested by class).
    // Verified via `head -100 apps/web/public/data/abilities.json`.
    const ids = new Set<string>();
    if (Array.isArray(data.abilities)) {
      for (const a of data.abilities) {
        if (a.id) ids.add(a.id);
      }
    }
    for (const key of Object.keys(ABILITY_TARGETING_EFFECTS)) {
      expect(ids.has(key), `ABILITY_TARGETING_EFFECTS key '${key}' not in abilities.json`).toBe(
        true,
      );
    }
  });
});
