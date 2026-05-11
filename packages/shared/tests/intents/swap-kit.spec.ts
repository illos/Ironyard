import { describe, expect, it } from 'vitest';
import { SwapKitPayloadSchema } from '../../src/intents/swap-kit';

describe('SwapKitPayloadSchema', () => {
  it('accepts a valid payload', () => {
    expect(
      SwapKitPayloadSchema.parse({ characterId: 'c-1', newKitId: 'wrecker', ownerId: 'u-owner' }),
    ).toBeDefined();
  });

  it('rejects empty characterId', () => {
    expect(() =>
      SwapKitPayloadSchema.parse({ characterId: '', newKitId: 'wrecker', ownerId: 'u-owner' }),
    ).toThrow();
  });

  it('rejects empty newKitId', () => {
    expect(() =>
      SwapKitPayloadSchema.parse({ characterId: 'c-1', newKitId: '', ownerId: 'u-owner' }),
    ).toThrow();
  });

  it('rejects empty ownerId', () => {
    expect(() =>
      SwapKitPayloadSchema.parse({ characterId: 'c-1', newKitId: 'wrecker', ownerId: '' }),
    ).toThrow();
  });

  it('rejects missing ownerId', () => {
    expect(() => SwapKitPayloadSchema.parse({ characterId: 'c-1', newKitId: 'wrecker' })).toThrow();
  });
});
