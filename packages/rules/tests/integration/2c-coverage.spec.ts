// 2C Slice 5 coverage acceptance test — representative PC fixtures covering
// the headline item + title override categories authored in Slice 5.
//
// Each fixture exercises a different attachment-source combination:
//   - Kit-keyword-gated armor treasure (heavy-armor)
//   - Kit-keyword-gated weapon treasure (whip)
//   - Body-slot trinket (bastion-belt — stamina + stability)
//   - Body-slot leveled treasure (bloodbound-band, lightning-treads)
//   - Title stat-mod (scarred / knight)
//   - Title grant-ability (giant-slayer)
//   - Trinket weapon-damage-bonus (bracers-of-strife)
//   - Combined: armor + trinket + title on a single PC
//   - Negative gate: kit-mismatch causes weapon treasure to skip
//
// We snapshot the derived runtime. Values were spot-checked against canon
// before committing the snapshot. The acceptance bar is "no fresh PC level
// 1–10 with reasonable equipped items + applied title produces a wrong
// runtime number" — these fixtures cover the static-fold path end-to-end.

import type { InventoryEntry } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { deriveCharacterRuntime } from '../../src/derive-character-runtime';
import type { ResolvedKit, StaticDataBundle } from '../../src/static-data';
import { buildBundleWithFury, buildCharacter } from '../fixtures/character-runtime';

// Construct an inventory entry with a stable test-id (so snapshots don't
// drift on each run). The character schema generates a UUID by default; we
// override with a deterministic value here.
function inv(itemId: string, equipped = true): InventoryEntry {
  return { id: `inv-${itemId}`, itemId, quantity: 1, equipped };
}

// Helper: extend the Fury bundle with an extra kit fixture so we can cover
// other keyword combinations. Mirrors the shape from
// tests/attachments/weapon-damage-bonus.spec.ts.
function withKit(bundle: StaticDataBundle, kit: ResolvedKit): StaticDataBundle {
  const kits = new Map(bundle.kits);
  kits.set(kit.id, kit);
  return { ...bundle, kits };
}

function makeKit(overrides: Partial<ResolvedKit> & Pick<ResolvedKit, 'id' | 'name'>): ResolvedKit {
  return {
    staminaBonus: 0,
    speedBonus: 0,
    stabilityBonus: 0,
    meleeDamageBonusPerTier: [0, 0, 0],
    rangedDamageBonusPerTier: [0, 0, 0],
    // Slice 10 / Phase 2b Group A+B (2b.3) — distance + disengage defaults.
    meleeDistanceBonus: 0,
    rangedDistanceBonus: 0,
    disengageBonus: 0,
    keywords: [],
    ...overrides,
  };
}

describe('2C Slice 5 coverage — items + titles', () => {
  // ── Fixture 1: kit-keyword-gated armor (heavy-armor) ────────────────────
  // Mountain-kit Fury at L1 with Chain of the Sea and Sky equipped should
  // derive +6 maxStamina from the armor override (kit has heavy-armor).
  it('Mountain kit + Chain of the Sea and Sky → +6 maxStamina', () => {
    const bundle = withKit(
      buildBundleWithFury(),
      makeKit({ id: 'mountain', name: 'Mountain', keywords: ['heavy-armor', 'heavy-weapon'] }),
    );
    const character = buildCharacter({
      kitId: 'mountain',
      inventory: [inv('chain-of-the-sea-and-sky')],
    });
    const runtime = deriveCharacterRuntime(character, bundle);
    expect(runtime).toMatchSnapshot();
  });

  // ── Fixture 2: kit-keyword-gated weapon (heavy-weapon) ──────────────────
  // Mountain-kit Fury at L1 with Icemaker Maul equipped should derive
  // weapon-damage-bonus melee [1, 2, 3] from the treasure override.
  it('Mountain kit + Icemaker Maul → +1/+2/+3 melee weapon-damage-bonus', () => {
    const bundle = withKit(
      buildBundleWithFury(),
      makeKit({ id: 'mountain', name: 'Mountain', keywords: ['heavy-armor', 'heavy-weapon'] }),
    );
    const character = buildCharacter({
      kitId: 'mountain',
      inventory: [inv('icemaker-maul')],
    });
    const runtime = deriveCharacterRuntime(character, bundle);
    expect(runtime).toMatchSnapshot();
  });

  // ── Fixture 3: kit-keyword GATE MISS ─────────────────────────────────────
  // Bow-kit (Sniper) with Icemaker Maul (heavy-weapon-only) equipped should
  // NOT receive the bonus. Snapshot proves the gate's negative path.
  it('Sniper kit + Icemaker Maul → bonus SKIPPED (kit mismatch)', () => {
    const bundle = withKit(
      buildBundleWithFury(),
      makeKit({ id: 'sniper', name: 'Sniper', keywords: ['bow'] }),
    );
    const character = buildCharacter({
      kitId: 'sniper',
      inventory: [inv('icemaker-maul')],
    });
    const runtime = deriveCharacterRuntime(character, bundle);
    expect(runtime).toMatchSnapshot();
  });

  // ── Fixture 4: kit-keyword-gated ranged weapon (bow) ────────────────────
  it('Sniper kit + Onerous Bow → +1/+2/+3 ranged weapon-damage-bonus', () => {
    const bundle = withKit(
      buildBundleWithFury(),
      makeKit({ id: 'sniper', name: 'Sniper', keywords: ['bow'] }),
    );
    const character = buildCharacter({
      kitId: 'sniper',
      inventory: [inv('onerous-bow')],
    });
    const runtime = deriveCharacterRuntime(character, bundle);
    expect(runtime).toMatchSnapshot();
  });

  // ── Fixture 5: body-slot trinket (stat-mod stamina + stability) ─────────
  // Bastion Belt: +3 maxStamina + +1 stability. NOT kit-keyword-gated.
  it('Any kit + Bastion Belt → +3 maxStamina + +1 stability', () => {
    const bundle = buildBundleWithFury();
    const character = buildCharacter({
      inventory: [inv('bastion-belt')],
    });
    const runtime = deriveCharacterRuntime(character, bundle);
    expect(runtime).toMatchSnapshot();
  });

  // ── Fixture 6: body-slot trinket weapon-damage-bonus (FLAT) ─────────────
  // Bracers of Strife: flat +2 melee weapon-damage-bonus (perTier [2,2,2])
  // — applies regardless of kit, additive with the kit's own per-tier mods.
  // The Fury fixture's Wrecker kit emits melee [1,1,1]; the resulting
  // weaponDamageBonus.melee should be [3,3,3].
  it('Wrecker kit + Bracers of Strife → +3/+3/+3 melee (kit + trinket)', () => {
    const bundle = buildBundleWithFury();
    const character = buildCharacter({
      inventory: [inv('bracers-of-strife')],
    });
    const runtime = deriveCharacterRuntime(character, bundle);
    expect(runtime).toMatchSnapshot();
  });

  // ── Fixture 7: body-slot leveled treasure (lightning-treads) ────────────
  // +2 speed; no kit gate.
  it('Any kit + Lightning Treads → +2 speed', () => {
    const bundle = buildBundleWithFury();
    const character = buildCharacter({
      inventory: [inv('lightning-treads')],
    });
    const runtime = deriveCharacterRuntime(character, bundle);
    expect(runtime).toMatchSnapshot();
  });

  // ── Fixture 8: title stat-mod (knight) ──────────────────────────────────
  it('titleId knight → +6 maxStamina via title', () => {
    const bundle = buildBundleWithFury();
    const character = buildCharacter({ titleId: 'knight' });
    const runtime = deriveCharacterRuntime(character, bundle);
    expect(runtime).toMatchSnapshot();
  });

  // ── Fixture 9: title stat-mod (scarred) ─────────────────────────────────
  it('titleId scarred → +20 maxStamina via title', () => {
    const bundle = buildBundleWithFury();
    const character = buildCharacter({ titleId: 'scarred' });
    const runtime = deriveCharacterRuntime(character, bundle);
    expect(runtime).toMatchSnapshot();
  });

  // ── Fixture 10: title grant-ability (giant-slayer) ──────────────────────
  // Expects abilityIds to include giant-slayer-the-harder-they-fall.
  it('titleId giant-slayer → abilityId added', () => {
    const bundle = buildBundleWithFury();
    const character = buildCharacter({ titleId: 'giant-slayer' });
    const runtime = deriveCharacterRuntime(character, bundle);
    expect(runtime).toMatchSnapshot();
  });

  // ── Fixture 11: combined item + title stack ─────────────────────────────
  // Mountain kit + Spiny Turtle (heavy-armor, +6 stamina) + Bastion Belt
  // (+3 stamina, +1 stability) + Knight (+6 stamina) at L1. Expected
  // maxStamina = Fury base (21) + 6 + 3 + 6 = 36. Stability = +1.
  it('Combined: Spiny Turtle + Bastion Belt + Knight → maxStamina 36, stability 1', () => {
    const bundle = withKit(
      buildBundleWithFury(),
      makeKit({ id: 'mountain', name: 'Mountain', keywords: ['heavy-armor', 'heavy-weapon'] }),
    );
    const character = buildCharacter({
      kitId: 'mountain',
      titleId: 'knight',
      inventory: [inv('spiny-turtle'), inv('bastion-belt')],
    });
    const runtime = deriveCharacterRuntime(character, bundle);
    expect(runtime).toMatchSnapshot();
  });

  // ── Fixture 12: unequipped item does NOT contribute ─────────────────────
  it('Spiny Turtle UNEQUIPPED → no stamina bonus', () => {
    const bundle = withKit(
      buildBundleWithFury(),
      makeKit({ id: 'mountain', name: 'Mountain', keywords: ['heavy-armor', 'heavy-weapon'] }),
    );
    const character = buildCharacter({
      kitId: 'mountain',
      inventory: [inv('spiny-turtle', false)],
    });
    const runtime = deriveCharacterRuntime(character, bundle);
    expect(runtime).toMatchSnapshot();
  });
});
