import { describe, expect, it } from 'vitest';
import { ActorSchema, type Intent, IntentSchema } from '../src/index';

const validActor = { userId: 'user_abc', role: 'director' as const };

const baseIntent: Intent = {
  id: '01HXYZ',
  sessionId: 'session_1',
  actor: validActor,
  source: 'manual',
  type: 'StartEncounter',
  payload: { encounterId: 'enc_1' },
};

describe('ActorSchema', () => {
  it('accepts a valid actor', () => {
    expect(ActorSchema.parse(validActor)).toEqual(validActor);
  });

  it('rejects an unknown role', () => {
    expect(() => ActorSchema.parse({ userId: 'u', role: 'spectator' })).toThrow();
  });

  it('rejects an empty userId', () => {
    expect(() => ActorSchema.parse({ userId: '', role: 'player' })).toThrow();
  });
});

describe('IntentSchema', () => {
  it('round-trips a minimal client-dispatched intent (no timestamp)', () => {
    const parsed = IntentSchema.parse(baseIntent);
    expect(parsed).toEqual(baseIntent);
  });

  it('round-trips a server-stamped intent (with timestamp)', () => {
    const stamped: Intent = { ...baseIntent, timestamp: 1_700_000_000_000 };
    expect(IntentSchema.parse(stamped)).toEqual(stamped);
  });

  it('accepts causedBy for derived intents', () => {
    const derived: Intent = { ...baseIntent, causedBy: 'parent_intent_id' };
    expect(IntentSchema.parse(derived)).toEqual(derived);
  });

  it('rejects an unknown source value', () => {
    expect(() =>
      IntentSchema.parse({ ...baseIntent, source: 'cheaty' as unknown as 'auto' }),
    ).toThrow();
  });

  it('rejects a negative timestamp', () => {
    expect(() => IntentSchema.parse({ ...baseIntent, timestamp: -1 })).toThrow();
  });

  it('rejects a non-integer timestamp', () => {
    expect(() => IntentSchema.parse({ ...baseIntent, timestamp: 1.5 })).toThrow();
  });

  it('rejects an empty intent type', () => {
    expect(() => IntentSchema.parse({ ...baseIntent, type: '' })).toThrow();
  });

  it('preserves the payload verbatim (unknown shape, no narrowing in Phase 0)', () => {
    const oddPayload = { rolls: { d10: [3, 7] }, deeply: { nested: ['stuff'] } };
    const parsed = IntentSchema.parse({ ...baseIntent, payload: oddPayload });
    expect(parsed.payload).toEqual(oddPayload);
  });
});
