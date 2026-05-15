import { describe, expect, it } from 'vitest';
import { UseAbilityPayloadSchema } from '../../src/intents/use-ability';

describe('UseAbilityPayloadSchema — slice 2a additions', () => {
  it('accepts the three new optional toggle fields', () => {
    const parsed = UseAbilityPayloadSchema.parse({
      participantId: 'pc-talent',
      abilityId: 'mind-spike',
      source: 'class',
      duration: { kind: 'EoT' },
      talentStrainedOptInRider: true,
      talentClarityDamageOptOutThisTurn: true,
      startMaintenance: false,
    });
    expect(parsed.talentStrainedOptInRider).toBe(true);
    expect(parsed.talentClarityDamageOptOutThisTurn).toBe(true);
    expect(parsed.startMaintenance).toBe(false);
  });

  it('defaults all three to undefined / false when omitted', () => {
    const parsed = UseAbilityPayloadSchema.parse({
      participantId: 'pc-fury',
      abilityId: 'strike',
      source: 'class',
      duration: { kind: 'EoT' },
    });
    expect(parsed.talentStrainedOptInRider ?? false).toBe(false);
    expect(parsed.talentClarityDamageOptOutThisTurn ?? false).toBe(false);
    expect(parsed.startMaintenance ?? false).toBe(false);
  });
});
