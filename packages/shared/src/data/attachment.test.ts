import { describe, it, expect } from 'vitest';
import { AttachmentEffectSchema } from './attachment';

describe('Phase 2b Group A+B — new AttachmentEffect kinds', () => {
  it('stat-mod-echelon parses', () => {
    const e = { kind: 'stat-mod-echelon', stat: 'maxStamina', perEchelon: [6, 12, 18, 24] };
    expect(AttachmentEffectSchema.parse(e)).toEqual(e);
  });
  it('immunity with level-plus value parses', () => {
    const e = { kind: 'immunity', damageKind: 'corruption', value: { kind: 'level-plus', offset: 2 } };
    expect(AttachmentEffectSchema.parse(e)).toEqual(e);
  });
  it('condition-immunity parses', () => {
    const e = { kind: 'condition-immunity', condition: 'Bleeding' };
    expect(AttachmentEffectSchema.parse(e)).toEqual(e);
  });
  it('grant-skill-edge parses', () => {
    const e = { kind: 'grant-skill-edge', skillGroup: 'intrigue' };
    expect(AttachmentEffectSchema.parse(e)).toEqual(e);
  });
  it('weapon-distance-bonus parses', () => {
    const e = { kind: 'weapon-distance-bonus', appliesTo: 'ranged', delta: 10 };
    expect(AttachmentEffectSchema.parse(e)).toEqual(e);
  });
  it('disengage-bonus parses', () => {
    const e = { kind: 'disengage-bonus', delta: 1 };
    expect(AttachmentEffectSchema.parse(e)).toEqual(e);
  });
});
