import { describe, expect, it } from 'vitest';
import { ParticipantSchema } from '../src/participant';

describe('ParticipantSchema.turnActionUsage', () => {
  it('defaults to all-false when omitted', () => {
    const parsed = ParticipantSchema.parse({
      id: 'p1',
      name: 'Mira',
      kind: 'pc',
      currentStamina: 10,
      maxStamina: 20,
      characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    });
    expect(parsed.turnActionUsage).toEqual({ main: false, maneuver: false, move: false });
  });

  it('preserves explicit values', () => {
    const parsed = ParticipantSchema.parse({
      id: 'p1',
      name: 'Mira',
      kind: 'pc',
      currentStamina: 10,
      maxStamina: 20,
      characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
      turnActionUsage: { main: true, maneuver: false, move: true },
    });
    expect(parsed.turnActionUsage).toEqual({ main: true, maneuver: false, move: true });
  });
});
