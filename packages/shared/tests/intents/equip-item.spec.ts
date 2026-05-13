import { describe, expect, it } from 'vitest';
import { EquipItemPayloadSchema, UnequipItemPayloadSchema } from '../../src/intents';

describe('EquipItemPayloadSchema', () => {
  it('requires characterId and inventoryEntryId', () => {
    expect(EquipItemPayloadSchema.safeParse({}).success).toBe(false);
    expect(EquipItemPayloadSchema.safeParse({ characterId: 'c1', inventoryEntryId: 'i1' }).success).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(EquipItemPayloadSchema.safeParse({ characterId: '', inventoryEntryId: 'i1' }).success).toBe(false);
  });
});

describe('UnequipItemPayloadSchema', () => {
  it('requires characterId and inventoryEntryId', () => {
    expect(UnequipItemPayloadSchema.safeParse({}).success).toBe(false);
    expect(UnequipItemPayloadSchema.safeParse({ characterId: 'c1', inventoryEntryId: 'i1' }).success).toBe(true);
  });
});
