import { describe, expect, it } from 'vitest';
import { PushItemPayloadSchema } from '../../src/intents';

describe('PushItemPayloadSchema', () => {
  it('requires targetCharacterId and itemId', () => {
    expect(PushItemPayloadSchema.safeParse({}).success).toBe(false);
    expect(PushItemPayloadSchema.safeParse({ targetCharacterId: 'c1', itemId: 'i1' }).success).toBe(
      true,
    );
  });

  it('rejects empty strings', () => {
    expect(PushItemPayloadSchema.safeParse({ targetCharacterId: '', itemId: 'i1' }).success).toBe(
      false,
    );
    expect(PushItemPayloadSchema.safeParse({ targetCharacterId: 'c1', itemId: '' }).success).toBe(
      false,
    );
  });

  it('defaults quantity to 1', () => {
    const parsed = PushItemPayloadSchema.parse({ targetCharacterId: 'c1', itemId: 'i1' });
    expect(parsed.quantity).toBe(1);
  });

  it('defaults stamped flags to false when omitted', () => {
    const parsed = PushItemPayloadSchema.parse({ targetCharacterId: 'c1', itemId: 'i1' });
    expect(parsed.isDirectorPermitted).toBe(false);
    expect(parsed.itemExists).toBe(false);
    expect(parsed.targetCharacterExists).toBe(false);
  });

  it('accepts stamped flags', () => {
    const parsed = PushItemPayloadSchema.parse({
      targetCharacterId: 'c1',
      itemId: 'i1',
      isDirectorPermitted: true,
      itemExists: true,
      targetCharacterExists: true,
    });
    expect(parsed.isDirectorPermitted).toBe(true);
    expect(parsed.itemExists).toBe(true);
    expect(parsed.targetCharacterExists).toBe(true);
  });

  it('accepts quantity within [1, 99]', () => {
    expect(
      PushItemPayloadSchema.safeParse({ targetCharacterId: 'c1', itemId: 'i1', quantity: 1 })
        .success,
    ).toBe(true);
    expect(
      PushItemPayloadSchema.safeParse({ targetCharacterId: 'c1', itemId: 'i1', quantity: 99 })
        .success,
    ).toBe(true);
  });

  it('rejects quantity < 1', () => {
    expect(
      PushItemPayloadSchema.safeParse({ targetCharacterId: 'c1', itemId: 'i1', quantity: 0 })
        .success,
    ).toBe(false);
    expect(
      PushItemPayloadSchema.safeParse({ targetCharacterId: 'c1', itemId: 'i1', quantity: -3 })
        .success,
    ).toBe(false);
  });

  it('rejects quantity > 99', () => {
    expect(
      PushItemPayloadSchema.safeParse({ targetCharacterId: 'c1', itemId: 'i1', quantity: 100 })
        .success,
    ).toBe(false);
  });

  it('rejects non-integer quantity', () => {
    expect(
      PushItemPayloadSchema.safeParse({ targetCharacterId: 'c1', itemId: 'i1', quantity: 1.5 })
        .success,
    ).toBe(false);
  });
});
