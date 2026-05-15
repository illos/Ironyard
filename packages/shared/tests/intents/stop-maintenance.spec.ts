import { describe, expect, it } from 'vitest';
import { StopMaintenancePayloadSchema } from '../../src/intents/stop-maintenance';

describe('StopMaintenancePayloadSchema', () => {
  it('parses a valid payload', () => {
    const p = StopMaintenancePayloadSchema.parse({
      participantId: 'pc-elementalist',
      abilityId: 'storm-aegis',
    });
    expect(p.participantId).toBe('pc-elementalist');
  });

  it('rejects empty abilityId', () => {
    expect(() =>
      StopMaintenancePayloadSchema.parse({ participantId: 'p', abilityId: '' }),
    ).toThrow();
  });
});
