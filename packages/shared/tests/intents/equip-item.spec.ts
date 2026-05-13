import { describe, expect, it } from 'vitest';
import { EquipItemPayloadSchema, UnequipItemPayloadSchema } from '../../src/intents';

describe('EquipItemPayloadSchema', () => {
  it('requires characterId and inventoryEntryId', () => {
    expect(EquipItemPayloadSchema.safeParse({}).success).toBe(false);
    expect(
      EquipItemPayloadSchema.safeParse({ characterId: 'c1', inventoryEntryId: 'i1' }).success,
    ).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(
      EquipItemPayloadSchema.safeParse({ characterId: '', inventoryEntryId: 'i1' }).success,
    ).toBe(false);
  });

  it('defaults stamped flags to false when omitted', () => {
    const parsed = EquipItemPayloadSchema.parse({ characterId: 'c1', inventoryEntryId: 'i1' });
    expect(parsed.ownsCharacter).toBe(false);
    expect(parsed.inventoryEntryExists).toBe(false);
  });

  it('accepts stamped flags', () => {
    const parsed = EquipItemPayloadSchema.parse({
      characterId: 'c1',
      inventoryEntryId: 'i1',
      ownsCharacter: true,
      inventoryEntryExists: true,
    });
    expect(parsed.ownsCharacter).toBe(true);
    expect(parsed.inventoryEntryExists).toBe(true);
  });
});

describe('UnequipItemPayloadSchema', () => {
  it('requires characterId and inventoryEntryId', () => {
    expect(UnequipItemPayloadSchema.safeParse({}).success).toBe(false);
    expect(
      UnequipItemPayloadSchema.safeParse({ characterId: 'c1', inventoryEntryId: 'i1' }).success,
    ).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(
      UnequipItemPayloadSchema.safeParse({ characterId: '', inventoryEntryId: 'i1' }).success,
    ).toBe(false);
  });

  it('defaults stamped flags to false when omitted', () => {
    const parsed = UnequipItemPayloadSchema.parse({ characterId: 'c1', inventoryEntryId: 'i1' });
    expect(parsed.ownsCharacter).toBe(false);
    expect(parsed.inventoryEntryExists).toBe(false);
  });

  it('accepts stamped flags', () => {
    const parsed = UnequipItemPayloadSchema.parse({
      characterId: 'c1',
      inventoryEntryId: 'i1',
      ownsCharacter: true,
      inventoryEntryExists: true,
    });
    expect(parsed.ownsCharacter).toBe(true);
    expect(parsed.inventoryEntryExists).toBe(true);
  });
});
