import { describe, expect, it } from 'vitest';
import { PsionFlagsSchema, defaultPsionFlags } from '../src/psion-flags';

describe('PsionFlagsSchema', () => {
  it('parses a default', () => {
    const parsed = PsionFlagsSchema.parse(defaultPsionFlags());
    expect(parsed.clarityDamageOptOutThisTurn).toBe(false);
  });

  it('parses with opt-out set', () => {
    const parsed = PsionFlagsSchema.parse({ clarityDamageOptOutThisTurn: true });
    expect(parsed.clarityDamageOptOutThisTurn).toBe(true);
  });
});
