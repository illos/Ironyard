import { describe, expect, it } from 'vitest';
import { ApplyDamagePayloadSchema } from '../src/intents';
import { OpenActionKindSchema } from '../src/open-action';

describe('ApplyDamagePayloadSchema.intent', () => {
  const base = {
    targetId: 'p1',
    amount: 8,
    damageType: 'fire' as const,
    sourceIntentId: 'src1',
  };

  it("defaults intent to 'kill' when omitted", () => {
    const p = ApplyDamagePayloadSchema.parse(base);
    expect(p.intent).toBe('kill');
  });

  it("accepts intent: 'knock-out'", () => {
    const p = ApplyDamagePayloadSchema.parse({ ...base, intent: 'knock-out' });
    expect(p.intent).toBe('knock-out');
  });

  it('rejects unknown intent value', () => {
    expect(() => ApplyDamagePayloadSchema.parse({ ...base, intent: 'banish' })).toThrow();
  });
});

describe('OpenActionKindSchema title-doomed-opt-in', () => {
  it('accepts title-doomed-opt-in', () => {
    expect(OpenActionKindSchema.parse('title-doomed-opt-in')).toBe('title-doomed-opt-in');
  });
});
