import { describe, expect, it } from 'vitest';
import { UseConsumablePayloadSchema } from '../../src/intents';

describe('UseConsumablePayloadSchema', () => {
  it('requires characterId and inventoryEntryId', () => {
    expect(UseConsumablePayloadSchema.safeParse({}).success).toBe(false);
    expect(
      UseConsumablePayloadSchema.safeParse({ characterId: 'c1', inventoryEntryId: 'i1' }).success,
    ).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(
      UseConsumablePayloadSchema.safeParse({ characterId: '', inventoryEntryId: 'i1' }).success,
    ).toBe(false);
    expect(
      UseConsumablePayloadSchema.safeParse({ characterId: 'c1', inventoryEntryId: '' }).success,
    ).toBe(false);
  });

  it('defaults stamped flags when omitted', () => {
    const parsed = UseConsumablePayloadSchema.parse({
      characterId: 'c1',
      inventoryEntryId: 'i1',
    });
    expect(parsed.ownsCharacter).toBe(false);
    expect(parsed.inventoryEntryExists).toBe(false);
    expect(parsed.itemIsConsumable).toBe(false);
    expect(parsed.effectKind).toBe('unknown');
    expect(parsed.healAmount).toBe(0);
    expect(parsed.targetParticipantId).toBeUndefined();
  });

  it('accepts stamped flags', () => {
    const parsed = UseConsumablePayloadSchema.parse({
      characterId: 'c1',
      inventoryEntryId: 'i1',
      ownsCharacter: true,
      inventoryEntryExists: true,
      itemIsConsumable: true,
      effectKind: 'instant',
      healAmount: 12,
    });
    expect(parsed.ownsCharacter).toBe(true);
    expect(parsed.inventoryEntryExists).toBe(true);
    expect(parsed.itemIsConsumable).toBe(true);
    expect(parsed.effectKind).toBe('instant');
    expect(parsed.healAmount).toBe(12);
  });

  it('accepts an optional targetParticipantId', () => {
    const parsed = UseConsumablePayloadSchema.parse({
      characterId: 'c1',
      inventoryEntryId: 'i1',
      targetParticipantId: 'pc:c2',
    });
    expect(parsed.targetParticipantId).toBe('pc:c2');
  });

  it('rejects negative healAmount', () => {
    expect(
      UseConsumablePayloadSchema.safeParse({
        characterId: 'c1',
        inventoryEntryId: 'i1',
        healAmount: -1,
      }).success,
    ).toBe(false);
  });

  it('rejects non-integer healAmount', () => {
    expect(
      UseConsumablePayloadSchema.safeParse({
        characterId: 'c1',
        inventoryEntryId: 'i1',
        healAmount: 1.5,
      }).success,
    ).toBe(false);
  });

  it('accepts each effectKind enum variant', () => {
    for (const kind of ['instant', 'duration', 'two-phase', 'attack', 'area', 'unknown'] as const) {
      const parsed = UseConsumablePayloadSchema.parse({
        characterId: 'c1',
        inventoryEntryId: 'i1',
        effectKind: kind,
      });
      expect(parsed.effectKind).toBe(kind);
    }
  });

  it('rejects an unknown effectKind value', () => {
    expect(
      UseConsumablePayloadSchema.safeParse({
        characterId: 'c1',
        inventoryEntryId: 'i1',
        effectKind: 'banana',
      }).success,
    ).toBe(false);
  });
});
