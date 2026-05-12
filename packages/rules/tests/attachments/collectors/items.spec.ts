// Smoke tests for the items collector. Slice 5 of Phase 2 Epic 2B adds one
// canonical-example override per item category to prove the items collector
// path works end-to-end. The artifact category is SKIPPED-DEFERRED — see
// packages/data/overrides/items.ts header for the rationale.

import { describe, expect, it } from 'vitest';
import { collectFromItems } from '../../../src/attachments/collectors/items';
import { CharacterSchema } from '@ironyard/shared';
import type { StaticDataBundle } from '../../../src/static-data';

// The items collector currently only reads `character.inventory` — the bundle
// argument is a placeholder for future canon-lookup work. Pass a typed stub
// so the test doesn't have to construct the full bundle.
const BUNDLE_STUB = {} as never as StaticDataBundle;

describe('collectFromItems — leveled treasure (lightning-treads)', () => {
  it('emits a speed stat-mod attachment for an equipped Lightning Treads', () => {
    const char = CharacterSchema.parse({
      inventory: [{ itemId: 'lightning-treads', quantity: 1, equipped: true }],
    });
    const out = collectFromItems(char, BUNDLE_STUB);
    expect(out).toHaveLength(1);
    const att = out[0]!;
    expect(att.source.kind).toBe('item');
    expect(att.source.id).toBe('lightning-treads');
    expect(att.effect).toEqual({ kind: 'stat-mod', stat: 'speed', delta: 2 });
  });

  it('skips attachments when Lightning Treads is in inventory but unequipped', () => {
    const char = CharacterSchema.parse({
      inventory: [{ itemId: 'lightning-treads', quantity: 1, equipped: false }],
    });
    const out = collectFromItems(char, BUNDLE_STUB);
    expect(out).toEqual([]);
  });
});

describe('collectFromItems — trinket (color-cloak-yellow)', () => {
  it('emits a lightning immunity attachment for an equipped yellow Color Cloak', () => {
    const char = CharacterSchema.parse({
      inventory: [{ itemId: 'color-cloak-yellow', quantity: 1, equipped: true }],
    });
    const out = collectFromItems(char, BUNDLE_STUB);
    expect(out).toHaveLength(1);
    const att = out[0]!;
    expect(att.source.kind).toBe('item');
    expect(att.source.id).toBe('color-cloak-yellow');
    expect(att.effect).toEqual({
      kind: 'immunity',
      damageKind: 'lightning',
      value: 'level',
    });
  });

  it('skips attachments when the yellow Color Cloak is in inventory but unequipped', () => {
    const char = CharacterSchema.parse({
      inventory: [{ itemId: 'color-cloak-yellow', quantity: 1, equipped: false }],
    });
    const out = collectFromItems(char, BUNDLE_STUB);
    expect(out).toEqual([]);
  });
});
