import { describe, expect, it } from 'vitest';
import { ClientMsgSchema, type Intent, ServerMsgSchema } from '../src/index';

const validIntent: Intent = {
  id: '01HXYZ',
  campaignId: 'campaign_1',
  actor: { userId: 'user_abc', role: 'player' },
  source: 'manual',
  type: 'RollPower',
  payload: { rolls: { d10: [4, 6] } },
};

describe('ClientMsgSchema', () => {
  it('round-trips a dispatch envelope', () => {
    const msg = { kind: 'dispatch', intent: validIntent } as const;
    expect(ClientMsgSchema.parse(msg)).toEqual(msg);
  });

  it('round-trips a sync envelope keyed on sinceSeq', () => {
    const msg = { kind: 'sync', sinceSeq: 42 } as const;
    expect(ClientMsgSchema.parse(msg)).toEqual(msg);
  });

  it('accepts a sync envelope at seq 0 (fresh client)', () => {
    expect(ClientMsgSchema.parse({ kind: 'sync', sinceSeq: 0 })).toEqual({
      kind: 'sync',
      sinceSeq: 0,
    });
  });

  it('round-trips a ping envelope', () => {
    expect(ClientMsgSchema.parse({ kind: 'ping' })).toEqual({ kind: 'ping' });
  });

  it('rejects an unknown kind', () => {
    expect(() => ClientMsgSchema.parse({ kind: 'shout', text: 'hi' })).toThrow();
  });

  it('rejects a sync envelope with a negative sinceSeq', () => {
    expect(() => ClientMsgSchema.parse({ kind: 'sync', sinceSeq: -1 })).toThrow();
  });

  it('rejects a dispatch envelope with a malformed intent', () => {
    expect(() =>
      ClientMsgSchema.parse({ kind: 'dispatch', intent: { ...validIntent, source: 'bogus' } }),
    ).toThrow();
  });
});

describe('ServerMsgSchema', () => {
  it('round-trips an applied envelope', () => {
    const msg = { kind: 'applied', intent: validIntent, seq: 7 } as const;
    expect(ServerMsgSchema.parse(msg)).toEqual(msg);
  });

  it('accepts an applied envelope with an optional state patch', () => {
    const msg = {
      kind: 'applied',
      intent: validIntent,
      seq: 7,
      state: { participants: { p1: { stamina: 42 } } },
    } as const;
    expect(ServerMsgSchema.parse(msg)).toEqual(msg);
  });

  it('round-trips a rejected envelope', () => {
    const msg = { kind: 'rejected', intentId: '01HXYZ', reason: 'permission denied' } as const;
    expect(ServerMsgSchema.parse(msg)).toEqual(msg);
  });

  it('rejects a rejected envelope with an empty reason', () => {
    expect(() =>
      ServerMsgSchema.parse({ kind: 'rejected', intentId: '01HXYZ', reason: '' }),
    ).toThrow();
  });

  it('round-trips a snapshot envelope', () => {
    const msg = { kind: 'snapshot', seq: 99, state: { foo: 'bar' } } as const;
    expect(ServerMsgSchema.parse(msg)).toEqual(msg);
  });

  it('round-trips a pong envelope', () => {
    expect(ServerMsgSchema.parse({ kind: 'pong' })).toEqual({ kind: 'pong' });
  });

  it('narrows correctly via the discriminator', () => {
    const msg = ServerMsgSchema.parse({ kind: 'pong' });
    if (msg.kind === 'pong') {
      // Type narrowing check — TypeScript would error if `kind` weren't a literal-discriminated union.
      expect(msg.kind).toBe('pong');
    } else {
      throw new Error('discriminator narrowing broken');
    }
  });
});
