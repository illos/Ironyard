import { describe, expect, it } from 'vitest';
import { EndSessionPayloadSchema } from '../../src/intents/end-session';
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
    expect(() => StartSessionPayloadSchema.parse({ attendingCharacterIds: [] })).toThrow();
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

import { GainHeroTokenPayloadSchema } from '../../src/intents/gain-hero-token';
import { SpendHeroTokenPayloadSchema } from '../../src/intents/spend-hero-token';

describe('GainHeroTokenPayloadSchema', () => {
  it('parses positive amount', () => {
    const p = GainHeroTokenPayloadSchema.parse({ amount: 2 });
    expect(p.amount).toBe(2);
  });

  it('rejects zero or negative', () => {
    expect(() => GainHeroTokenPayloadSchema.parse({ amount: 0 })).toThrow();
    expect(() => GainHeroTokenPayloadSchema.parse({ amount: -1 })).toThrow();
  });
});

describe('SpendHeroTokenPayloadSchema', () => {
  it('parses surge_burst with amount 1', () => {
    const p = SpendHeroTokenPayloadSchema.parse({
      amount: 1,
      reason: 'surge_burst',
      participantId: 'pc:alice',
    });
    expect(p.reason).toBe('surge_burst');
  });

  it('parses regain_stamina with amount 2', () => {
    const p = SpendHeroTokenPayloadSchema.parse({
      amount: 2,
      reason: 'regain_stamina',
      participantId: 'pc:bob',
    });
    expect(p.amount).toBe(2);
  });

  it('parses narrative with arbitrary positive amount', () => {
    const p = SpendHeroTokenPayloadSchema.parse({
      amount: 3,
      reason: 'narrative',
      participantId: 'pc:cleric',
    });
    expect(p.amount).toBe(3);
  });

  it('rejects unknown reason', () => {
    expect(() =>
      SpendHeroTokenPayloadSchema.parse({
        amount: 1,
        reason: 'whatever',
        participantId: 'pc:x',
      }),
    ).toThrow();
  });

  it('rejects amount < 1', () => {
    expect(() =>
      SpendHeroTokenPayloadSchema.parse({
        amount: 0,
        reason: 'narrative',
        participantId: 'pc:x',
      }),
    ).toThrow();
  });
});
