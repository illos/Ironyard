import { ParticipantSchema } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';

describe('Pass 2b2a ParticipantSchema additions', () => {
  it('defaults the new monster-meta + PC-className fields to null/[] when omitted', () => {
    const minimal = {
      id: 'p1',
      name: 'Korva',
      kind: 'pc' as const,
      currentStamina: 50,
      maxStamina: 80,
      characteristics: { might: 2, agility: 1, reason: 0, intuition: 0, presence: -1 },
    };
    const parsed = ParticipantSchema.parse(minimal);
    expect(parsed.role).toBeNull();
    expect(parsed.ancestry).toEqual([]);
    expect(parsed.size).toBeNull();
    expect(parsed.speed).toBeNull();
    expect(parsed.stability).toBeNull();
    expect(parsed.freeStrike).toBeNull();
    expect(parsed.ev).toBeNull();
    expect(parsed.withCaptain).toBeNull();
    expect(parsed.className).toBeNull();
  });

  it('accepts populated monster-meta + className fields', () => {
    const monster = {
      id: 'm1',
      name: 'Knight Heretic',
      kind: 'monster' as const,
      currentStamina: 52,
      maxStamina: 52,
      characteristics: { might: 3, agility: 1, reason: -1, intuition: 0, presence: 2 },
      role: 'Elite Defender',
      ancestry: ['Human'],
      size: '1M',
      speed: 5,
      stability: 2,
      freeStrike: 5,
      ev: 12,
      withCaptain: '+1 to Free Strike',
    };
    const parsed = ParticipantSchema.parse(monster);
    expect(parsed.role).toBe('Elite Defender');
    expect(parsed.ancestry).toEqual(['Human']);
    expect(parsed.size).toBe('1M');
    expect(parsed.speed).toBe(5);
    expect(parsed.stability).toBe(2);
    expect(parsed.freeStrike).toBe(5);
    expect(parsed.ev).toBe(12);
    expect(parsed.withCaptain).toBe('+1 to Free Strike');
  });

  it('accepts a populated className on a PC participant', () => {
    const pc = {
      id: 'p2',
      name: 'Sir John',
      kind: 'pc' as const,
      currentStamina: 90,
      maxStamina: 120,
      characteristics: { might: 3, agility: 2, reason: 0, intuition: 1, presence: 1 },
      className: 'Censor',
    };
    expect(ParticipantSchema.parse(pc).className).toBe('Censor');
  });
});
