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

describe('ParticipantSchema slice-1 additions', () => {
  const base = {
    id: 'p1',
    name: 'Korva',
    kind: 'pc' as const,
    level: 5,
    currentStamina: 30,
    maxStamina: 30,
    characteristics: { might: 2, agility: 1, reason: 0, intuition: 0, presence: 0 },
  };

  it('defaults staminaState to "healthy"', () => {
    const p = ParticipantSchema.parse(base);
    expect(p.staminaState).toBe('healthy');
  });

  it('defaults staminaOverride to null', () => {
    const p = ParticipantSchema.parse(base);
    expect(p.staminaOverride).toBeNull();
  });

  it('defaults bodyIntact to true', () => {
    const p = ParticipantSchema.parse(base);
    expect(p.bodyIntact).toBe(true);
  });

  it('defaults triggeredActionUsedThisRound to false', () => {
    const p = ParticipantSchema.parse(base);
    expect(p.triggeredActionUsedThisRound).toBe(false);
  });

  it('accepts negative currentStamina (dying hero)', () => {
    const p = ParticipantSchema.parse({ ...base, currentStamina: -5 });
    expect(p.currentStamina).toBe(-5);
  });

  it('accepts a populated staminaOverride', () => {
    const p = ParticipantSchema.parse({
      ...base,
      staminaState: 'doomed',
      staminaOverride: {
        kind: 'doomed',
        source: 'hakaan-doomsight',
        canRegainStamina: true,
        autoTier3OnPowerRolls: true,
        staminaDeathThreshold: 'none',
        dieAtEncounterEnd: true,
      },
    });
    expect(p.staminaOverride?.kind).toBe('doomed');
  });
});
