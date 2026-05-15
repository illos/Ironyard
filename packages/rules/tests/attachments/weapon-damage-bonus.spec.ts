// End-to-end tests for the kit weapon-damage-bonus attachment (Slice 6 of
// Phase 2 Epic 2C — canon § 10.8). Covers the three stages:
//   1. collectFromKit emits one weapon-damage-bonus attachment per non-zero
//      per-tier slot (melee / ranged).
//   2. applyAttachments sums per-tier tuples across sources into
//      runtime.weaponDamageBonus.{melee, ranged}.
//   3. applyRollPower folds the tier-N entry into the rolled damage when the
//      ability has Weapon + Melee/Ranged keywords, and skips it otherwise.

import { type Character, CharacterSchema, IntentTypes, type Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyAttachments } from '../../src/attachments/apply';
import { collectFromKit } from '../../src/attachments/collectors/kit';
import type { CharacterAttachment } from '../../src/attachments/types';
import type { CharacterRuntime } from '../../src/derive-character-runtime';
import { applyRollPower } from '../../src/intents/roll-power';
import type { ResolvedKit, StaticDataBundle } from '../../src/static-data';
import type { CampaignState, StampedIntent } from '../../src/types';
import { emptyCampaignState } from '../../src/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeBaseRuntime(overrides: Partial<CharacterRuntime> = {}): CharacterRuntime {
  return {
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    maxStamina: 18,
    recoveriesMax: 8,
    recoveryValue: 6,
    heroicResource: { name: 'heroic', max: null, floor: 0 },
    abilityIds: [],
    skills: [],
    languages: [],
    immunities: [],
    weaknesses: [],
    speed: 5,
    size: '1M',
    stability: 0,
    freeStrikeDamage: 2,
    weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
    ...overrides,
  };
}

function makeKit(overrides: Partial<ResolvedKit> = {}): ResolvedKit {
  return {
    id: 'mountain',
    name: 'Mountain',
    staminaBonus: 0,
    speedBonus: 0,
    stabilityBonus: 0,
    meleeDamageBonusPerTier: [0, 0, 0],
    rangedDamageBonusPerTier: [0, 0, 0],
    keywords: [],
    ...overrides,
  };
}

function makeBundleWithKit(kit: ResolvedKit): StaticDataBundle {
  return {
    ancestries: new Map(),
    careers: new Map(),
    classes: new Map(),
    kits: new Map([[kit.id, kit]]),
    abilities: new Map(),
    items: new Map(),
    titles: new Map(),
  };
}

function makeCharacterWithKit(kitId: string): Character {
  return CharacterSchema.parse({ kitId });
}

function makeParticipant(
  overrides: Partial<Participant> & Pick<Participant, 'id' | 'name'>,
): Participant {
  return {
    kind: 'pc',
    level: 1,
    currentStamina: 30,
    maxStamina: 30,
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
    weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
    activeAbilities: [],
    victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false },
    surprised: false,
    ...overrides,
  };
}

function makeIntent(type: string, payload: Record<string, unknown>): StampedIntent {
  return {
    id: 'i_test',
    campaignId: 'campaign-1',
    actor: { userId: 'alice', role: 'director' },
    timestamp: 1_700_000_000_000,
    source: 'manual',
    type: type as StampedIntent['type'],
    payload,
  } as StampedIntent;
}

function makeReadyState(participants: Participant[]): CampaignState {
  return {
    ...emptyCampaignState('campaign-1', 'user-owner'),
    participants,
    encounter: {
      id: 'enc-1',
      currentRound: 1,
      activeParticipantId: null,
      turnState: {},
      malice: { current: 0, lastMaliciousStrikeRound: null },
      firstSide: null,
      currentPickingSide: null,
      actedThisRound: [],
    },
  };
}

// Mountain ladder fixture: t1 deals 3, t2 deals 5, t3 deals 13. Lets us
// verify per-tier bonus folding lands on the right slot.
function ladder3_5_13() {
  return {
    t1: { damage: 3, damageType: 'untyped' as const, conditions: [] },
    t2: { damage: 5, damageType: 'untyped' as const, conditions: [] },
    t3: { damage: 13, damageType: 'untyped' as const, conditions: [] },
  };
}

// ── 1. collector ────────────────────────────────────────────────────────────

describe('collectFromKit — weapon-damage-bonus emission', () => {
  it('Mountain (+0/+0/+4 melee) emits one melee weapon-damage-bonus tuple [0,0,4]', () => {
    const kit = makeKit({
      meleeDamageBonusPerTier: [0, 0, 4],
      rangedDamageBonusPerTier: [0, 0, 0],
    });
    const char = makeCharacterWithKit('mountain');
    const out = collectFromKit(char, makeBundleWithKit(kit));
    const weaponBonuses = out.filter((a) => a.effect.kind === 'weapon-damage-bonus');
    expect(weaponBonuses).toHaveLength(1);
    expect(weaponBonuses[0]).toEqual({
      source: { kind: 'kit', id: 'mountain.melee-damage-bonus' },
      effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: [0, 0, 4] },
    });
  });

  it('Cloak and Dagger (+1/+1/+1 melee, +1/+1/+1 ranged) emits both', () => {
    const kit = makeKit({
      id: 'cloak-and-dagger',
      name: 'Cloak and Dagger',
      meleeDamageBonusPerTier: [1, 1, 1],
      rangedDamageBonusPerTier: [1, 1, 1],
    });
    const char = makeCharacterWithKit('cloak-and-dagger');
    const out = collectFromKit(char, makeBundleWithKit(kit));
    const weaponBonuses = out.filter((a) => a.effect.kind === 'weapon-damage-bonus');
    expect(weaponBonuses).toHaveLength(2);
    expect(weaponBonuses).toContainEqual({
      source: { kind: 'kit', id: 'cloak-and-dagger.melee-damage-bonus' },
      effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: [1, 1, 1] },
    });
    expect(weaponBonuses).toContainEqual({
      source: { kind: 'kit', id: 'cloak-and-dagger.ranged-damage-bonus' },
      effect: { kind: 'weapon-damage-bonus', appliesTo: 'ranged', perTier: [1, 1, 1] },
    });
  });

  it('emits nothing when both per-tier tuples are all zeros', () => {
    const kit = makeKit({
      meleeDamageBonusPerTier: [0, 0, 0],
      rangedDamageBonusPerTier: [0, 0, 0],
    });
    const char = makeCharacterWithKit('mountain');
    const out = collectFromKit(char, makeBundleWithKit(kit));
    const weaponBonuses = out.filter((a) => a.effect.kind === 'weapon-damage-bonus');
    expect(weaponBonuses).toHaveLength(0);
  });

  it('no longer emits a free-strike-damage attachment from the kit melee bonus', () => {
    // Regression guard: the pre-Slice-6 collector pushed
    //   { kind: 'free-strike-damage', delta: kit.meleeDamageBonus }
    // which over-applied to free strikes (not all Melee+Weapon abilities) and
    // was tier-collapsed. The variant itself still exists for other uses; the
    // kit emission path simply stops producing it.
    const kit = makeKit({
      meleeDamageBonusPerTier: [2, 2, 2],
      rangedDamageBonusPerTier: [0, 0, 0],
    });
    const char = makeCharacterWithKit('mountain');
    const out = collectFromKit(char, makeBundleWithKit(kit));
    const freeStrike = out.filter((a) => a.effect.kind === 'free-strike-damage');
    expect(freeStrike).toHaveLength(0);
  });
});

// ── 2. applier ──────────────────────────────────────────────────────────────

describe('applyAttachments — weapon-damage-bonus folding', () => {
  it('single melee bonus lands in runtime.weaponDamageBonus.melee', () => {
    const attachments: CharacterAttachment[] = [
      {
        source: { kind: 'kit', id: 'mountain.melee-damage-bonus' },
        effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: [0, 0, 4] },
      },
    ];
    const out = applyAttachments(makeBaseRuntime(), attachments, {
      character: CharacterSchema.parse({}),
      kit: null,
    });
    expect(out.weaponDamageBonus.melee).toEqual([0, 0, 4]);
    expect(out.weaponDamageBonus.ranged).toEqual([0, 0, 0]);
  });

  it('two melee sources sum per tier', () => {
    const attachments: CharacterAttachment[] = [
      {
        source: { kind: 'kit', id: 'mountain.melee-damage-bonus' },
        effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: [2, 5, 7] },
      },
      {
        // Mock a kit-keyword-gated leveled-treasure source. § 10.10 "only the
        // higher applies" stacking is deferred to a follow-up; today this just
        // sums.
        source: { kind: 'item', id: 'sharp-blade' },
        effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: [1, 2, 3] },
      },
    ];
    const out = applyAttachments(makeBaseRuntime(), attachments, {
      character: CharacterSchema.parse({}),
      kit: null,
    });
    expect(out.weaponDamageBonus.melee).toEqual([3, 7, 10]);
    expect(out.weaponDamageBonus.ranged).toEqual([0, 0, 0]);
  });

  it('melee and ranged sources land in independent slots', () => {
    const attachments: CharacterAttachment[] = [
      {
        source: { kind: 'kit', id: 'cloak-and-dagger.melee-damage-bonus' },
        effect: { kind: 'weapon-damage-bonus', appliesTo: 'melee', perTier: [1, 1, 1] },
      },
      {
        source: { kind: 'kit', id: 'cloak-and-dagger.ranged-damage-bonus' },
        effect: { kind: 'weapon-damage-bonus', appliesTo: 'ranged', perTier: [1, 1, 1] },
      },
    ];
    const out = applyAttachments(makeBaseRuntime(), attachments, {
      character: CharacterSchema.parse({}),
      kit: null,
    });
    expect(out.weaponDamageBonus.melee).toEqual([1, 1, 1]);
    expect(out.weaponDamageBonus.ranged).toEqual([1, 1, 1]);
  });
});

// ── 3. RollPower fold ───────────────────────────────────────────────────────

describe('applyRollPower — kit weapon damage bonus folds by tier and keywords', () => {
  it('Melee + Weapon ability includes the tier-N melee bonus', () => {
    // Mountain melee = [0, 0, 4]; force tier-3 outcome via two natural 10s
    // (canon §1.4 — high-pair tier promotion). Base damage at t3 = 13;
    // expected final = 13 + 4 = 17.
    const attacker = makeParticipant({
      id: 'pc:alice',
      name: 'Alice',
      weaponDamageBonus: { melee: [0, 0, 4], ranged: [0, 0, 0] },
    });
    const target = makeParticipant({ id: 'pc:bob', name: 'Bob', kind: 'monster' });
    const state = makeReadyState([attacker, target]);

    const intent = makeIntent(IntentTypes.RollPower, {
      abilityId: 'mountain-pain-for-pain',
      attackerId: 'pc:alice',
      targetIds: ['pc:bob'],
      characteristic: 'might',
      edges: 0,
      banes: 0,
      rolls: { d10: [10, 10] },
      ladder: ladder3_5_13(),
      abilityKeywords: ['Melee', 'Weapon'],
    });
    const result = applyRollPower(state, intent);
    expect(result.errors).toBeUndefined();
    const applyDamage = result.derived.find((d) => d.type === IntentTypes.ApplyDamage);
    expect(applyDamage).toBeDefined();
    expect((applyDamage?.payload as { amount: number }).amount).toBe(17);
  });

  it('Ranged + Weapon ability includes the tier-N ranged bonus, not the melee slot', () => {
    // Ranged-only kit: melee = zeros, ranged = [0, 0, 4]. Tier-3 base 13 + 4 = 17.
    const attacker = makeParticipant({
      id: 'pc:archer',
      name: 'Archer',
      weaponDamageBonus: { melee: [9, 9, 9], ranged: [0, 0, 4] },
    });
    const target = makeParticipant({ id: 'm:goblin', name: 'Goblin', kind: 'monster' });
    const state = makeReadyState([attacker, target]);

    const intent = makeIntent(IntentTypes.RollPower, {
      abilityId: 'sniper-shot',
      attackerId: 'pc:archer',
      targetIds: ['m:goblin'],
      characteristic: 'agility',
      edges: 0,
      banes: 0,
      rolls: { d10: [10, 10] },
      ladder: ladder3_5_13(),
      abilityKeywords: ['Ranged', 'Weapon'],
    });
    const result = applyRollPower(state, intent);
    expect(result.errors).toBeUndefined();
    const applyDamage = result.derived.find((d) => d.type === IntentTypes.ApplyDamage);
    expect((applyDamage?.payload as { amount: number }).amount).toBe(17);
  });

  it('non-Weapon ability gets no kit bonus', () => {
    // Even with a non-zero kit bonus, an ability without the Weapon keyword
    // (e.g. a Magic ability) must NOT receive the bonus.
    const attacker = makeParticipant({
      id: 'pc:mage',
      name: 'Mage',
      weaponDamageBonus: { melee: [5, 5, 5], ranged: [5, 5, 5] },
    });
    const target = makeParticipant({ id: 'm:goblin', name: 'Goblin', kind: 'monster' });
    const state = makeReadyState([attacker, target]);

    const intent = makeIntent(IntentTypes.RollPower, {
      abilityId: 'magic-missile',
      attackerId: 'pc:mage',
      targetIds: ['m:goblin'],
      characteristic: 'reason',
      edges: 0,
      banes: 0,
      rolls: { d10: [10, 10] },
      ladder: ladder3_5_13(),
      abilityKeywords: ['Magic'],
    });
    const result = applyRollPower(state, intent);
    expect(result.errors).toBeUndefined();
    const applyDamage = result.derived.find((d) => d.type === IntentTypes.ApplyDamage);
    expect((applyDamage?.payload as { amount: number }).amount).toBe(13); // base only
  });

  it('Melee + Weapon at tier-1 picks index 0 (not the highest tier)', () => {
    // Per-tier guard: a kit with [2, 5, 7] adds 2 at tier 1, not 7. Force
    // tier-1 via two natural 1s (canon §1.4 — natural-double promotion fires
    // only with two 10s; 1+1 yields the lowest tier per the power-roll table).
    const attacker = makeParticipant({
      id: 'pc:alice',
      name: 'Alice',
      weaponDamageBonus: { melee: [2, 5, 7], ranged: [0, 0, 0] },
    });
    const target = makeParticipant({ id: 'm:goblin', name: 'Goblin', kind: 'monster' });
    const state = makeReadyState([attacker, target]);

    const intent = makeIntent(IntentTypes.RollPower, {
      abilityId: 'basic-strike',
      attackerId: 'pc:alice',
      targetIds: ['m:goblin'],
      characteristic: 'might',
      edges: 0,
      banes: 0,
      rolls: { d10: [1, 1] }, // sum 2, no characteristic bonus → tier 1
      ladder: ladder3_5_13(),
      abilityKeywords: ['Melee', 'Weapon'],
    });
    const result = applyRollPower(state, intent);
    expect(result.errors).toBeUndefined();
    const applyDamage = result.derived.find((d) => d.type === IntentTypes.ApplyDamage);
    // Base t1 damage 3 + tier-1 melee bonus 2 = 5.
    expect((applyDamage?.payload as { amount: number }).amount).toBe(5);
  });

  it('matches Weapon/Melee keywords case-insensitively', () => {
    // The dispatcher passes through whatever AbilitySchema.keywords holds
    // (typically Title-Cased "Weapon"/"Melee"). The engine lowercases before
    // matching so a lowercased payload from a homebrew authoring path still
    // triggers the fold.
    const attacker = makeParticipant({
      id: 'pc:alice',
      name: 'Alice',
      weaponDamageBonus: { melee: [0, 0, 4], ranged: [0, 0, 0] },
    });
    const target = makeParticipant({ id: 'm:goblin', name: 'Goblin', kind: 'monster' });
    const state = makeReadyState([attacker, target]);

    const intent = makeIntent(IntentTypes.RollPower, {
      abilityId: 'mountain-pain-for-pain',
      attackerId: 'pc:alice',
      targetIds: ['m:goblin'],
      characteristic: 'might',
      edges: 0,
      banes: 0,
      rolls: { d10: [10, 10] },
      ladder: ladder3_5_13(),
      abilityKeywords: ['melee', 'weapon'], // lowercase
    });
    const result = applyRollPower(state, intent);
    expect(result.errors).toBeUndefined();
    const applyDamage = result.derived.find((d) => d.type === IntentTypes.ApplyDamage);
    expect((applyDamage?.payload as { amount: number }).amount).toBe(17);
  });
});
