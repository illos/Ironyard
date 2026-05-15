import { describe, expect, it } from 'vitest';
import { StartMaintenancePayloadSchema } from '../../src/intents/start-maintenance';

describe('StartMaintenancePayloadSchema', () => {
  it('parses a valid payload', () => {
    const p = StartMaintenancePayloadSchema.parse({
      participantId: 'pc-elementalist',
      abilityId: 'storm-aegis',
      costPerTurn: 2,
    });
    expect(p.costPerTurn).toBe(2);
  });

  it('rejects zero costPerTurn', () => {
    expect(() =>
      StartMaintenancePayloadSchema.parse({ participantId: 'p', abilityId: 'a', costPerTurn: 0 }),
    ).toThrow();
  });

  it('rejects empty participantId', () => {
    expect(() =>
      StartMaintenancePayloadSchema.parse({ participantId: '', abilityId: 'a', costPerTurn: 2 }),
    ).toThrow();
  });
});
