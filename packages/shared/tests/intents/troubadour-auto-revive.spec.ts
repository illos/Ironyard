import { describe, expect, it } from 'vitest';
import { TroubadourAutoRevivePayloadSchema } from '../../src/intents/troubadour-auto-revive';

describe('TroubadourAutoRevivePayloadSchema', () => {
  it('parses a valid payload', () => {
    const p = TroubadourAutoRevivePayloadSchema.parse({ participantId: 'pc-troubadour' });
    expect(p.participantId).toBe('pc-troubadour');
  });

  it('rejects empty participantId', () => {
    expect(() => TroubadourAutoRevivePayloadSchema.parse({ participantId: '' })).toThrow();
  });
});
