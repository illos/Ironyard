import { describe, expect, it } from 'vitest';
import { StartTurnPayloadSchema } from '../../src';

describe('StartTurnPayloadSchema — slice 2a pray additions', () => {
  it('accepts prayD3 + prayDamage when prayToTheGods is true', () => {
    const parsed = StartTurnPayloadSchema.parse({
      participantId: 'pc-conduit',
      rolls: { d3: 2, prayD3: 1, prayDamage: { d6: 4 } },
      prayToTheGods: true,
    });
    expect(parsed.rolls?.prayD3).toBe(1);
    expect(parsed.prayToTheGods).toBe(true);
  });

  it('parses without pray fields (standard StartTurn)', () => {
    const parsed = StartTurnPayloadSchema.parse({
      participantId: 'pc-fury',
      rolls: { d3: 2 },
    });
    expect(parsed.prayToTheGods ?? false).toBe(false);
  });

  it('rejects prayD3 out of [1,3] range', () => {
    expect(() =>
      StartTurnPayloadSchema.parse({
        participantId: 'p',
        rolls: { d3: 2, prayD3: 4 },
      }),
    ).toThrow();
  });
});
