import { describe, expect, it } from 'vitest';
import {
  CreateCampaignRequestSchema,
  JoinCampaignRequestSchema,
  generateInviteCode,
} from '../src/campaign';

describe('generateInviteCode', () => {
  it('produces a 6-char uppercase Crockford-Base32 string', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
  });

  it('emits distinct codes', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateInviteCode()));
    expect(codes.size).toBeGreaterThan(195); // tolerate a rare 32^6-space collision
  });
});

describe('CreateCampaignRequestSchema', () => {
  it('accepts a valid name', () => {
    expect(CreateCampaignRequestSchema.parse({ name: 'Saturday game' })).toEqual({
      name: 'Saturday game',
    });
  });

  it('rejects empty name', () => {
    expect(() => CreateCampaignRequestSchema.parse({ name: '' })).toThrow();
  });

  it('rejects name over 80 chars', () => {
    expect(() => CreateCampaignRequestSchema.parse({ name: 'x'.repeat(81) })).toThrow();
  });
});

describe('JoinCampaignRequestSchema', () => {
  it('accepts a 6-char uppercase code', () => {
    expect(JoinCampaignRequestSchema.parse({ inviteCode: 'ABC123' })).toEqual({
      inviteCode: 'ABC123',
    });
  });

  it('rejects a lowercase code', () => {
    expect(() => JoinCampaignRequestSchema.parse({ inviteCode: 'abc123' })).toThrow();
  });

  it('rejects a too-short code', () => {
    expect(() => JoinCampaignRequestSchema.parse({ inviteCode: 'ABC' })).toThrow();
  });
});
