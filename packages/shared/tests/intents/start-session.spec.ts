import { describe, expect, it } from 'vitest';
import { StartSessionPayloadSchema } from '../../src/intents/start-session';

describe('StartSessionPayloadSchema', () => {
  it('parses a minimal valid payload', () => {
    const parsed = StartSessionPayloadSchema.parse({
      attendingCharacterIds: ['char-1', 'char-2'],
    });
    expect(parsed.attendingCharacterIds).toEqual(['char-1', 'char-2']);
    expect(parsed.name).toBeUndefined();
    expect(parsed.heroTokens).toBeUndefined();
  });

  it('parses an explicit name and heroTokens override', () => {
    const parsed = StartSessionPayloadSchema.parse({
      name: 'Bandit Camp',
      attendingCharacterIds: ['c1'],
      heroTokens: 5,
    });
    expect(parsed.name).toBe('Bandit Camp');
    expect(parsed.heroTokens).toBe(5);
  });

  it('parses an optional client-suggested sessionId', () => {
    const parsed = StartSessionPayloadSchema.parse({
      sessionId: 'sess_01ABCDEF',
      attendingCharacterIds: ['c1'],
    });
    expect(parsed.sessionId).toBe('sess_01ABCDEF');
  });

  it('rejects empty attending list', () => {
    expect(() =>
      StartSessionPayloadSchema.parse({ attendingCharacterIds: [] }),
    ).toThrow();
  });

  it('rejects negative heroTokens override', () => {
    expect(() =>
      StartSessionPayloadSchema.parse({
        attendingCharacterIds: ['c1'],
        heroTokens: -1,
      }),
    ).toThrow();
  });
});
