import { describe, expect, it } from 'vitest';
import { StartSessionPayloadSchema } from '../../src/intents/start-session';
import { EndSessionPayloadSchema } from '../../src/intents/end-session';

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

describe('EndSessionPayloadSchema', () => {
  it('parses an empty payload', () => {
    const parsed = EndSessionPayloadSchema.parse({});
    expect(parsed).toEqual({});
  });

  it('rejects extra fields', () => {
    expect(() => EndSessionPayloadSchema.parse({ unknown: 1 })).toThrow();
  });
});

import { UpdateSessionAttendancePayloadSchema } from '../../src/intents/update-session-attendance';

describe('UpdateSessionAttendancePayloadSchema', () => {
  it('parses add-only', () => {
    const p = UpdateSessionAttendancePayloadSchema.parse({ add: ['c1'] });
    expect(p.add).toEqual(['c1']);
    expect(p.remove).toBeUndefined();
  });

  it('parses remove-only', () => {
    const p = UpdateSessionAttendancePayloadSchema.parse({ remove: ['c2'] });
    expect(p.remove).toEqual(['c2']);
  });

  it('parses mixed', () => {
    const p = UpdateSessionAttendancePayloadSchema.parse({ add: ['c1'], remove: ['c2'] });
    expect(p.add).toEqual(['c1']);
    expect(p.remove).toEqual(['c2']);
  });

  it('rejects empty payload (must have at least one of add/remove)', () => {
    expect(() => UpdateSessionAttendancePayloadSchema.parse({})).toThrow();
  });
});
