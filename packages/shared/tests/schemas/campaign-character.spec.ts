import { describe, expect, it } from 'vitest';
import {
  CampaignCharacterSchema,
  CampaignCharacterStatusSchema,
} from '../../src/schemas/campaign-character';

describe('CampaignCharacterStatusSchema', () => {
  it('accepts "pending"', () => {
    expect(CampaignCharacterStatusSchema.safeParse('pending').success).toBe(true);
  });

  it('accepts "approved"', () => {
    expect(CampaignCharacterStatusSchema.safeParse('approved').success).toBe(true);
  });

  it('rejects unknown status', () => {
    expect(CampaignCharacterStatusSchema.safeParse('denied').success).toBe(false);
  });
});

describe('CampaignCharacterSchema', () => {
  const validPending = {
    campaignId: '01HWZXXXXXXXXXXXXXXXXXX',
    characterId: '01HWZXXXXXXXXXXXXXXXXXY',
    status: 'pending' as const,
    submittedAt: 1715000000000,
    decidedAt: null,
    decidedBy: null,
  };

  const validApproved = {
    campaignId: '01HWZXXXXXXXXXXXXXXXXXX',
    characterId: '01HWZXXXXXXXXXXXXXXXXXY',
    status: 'approved' as const,
    submittedAt: 1715000000000,
    decidedAt: 1715001000000,
    decidedBy: '01HWZXXXXXXXXXXXXXXXXXZ',
  };

  it('accepts a valid pending row', () => {
    expect(CampaignCharacterSchema.safeParse(validPending).success).toBe(true);
  });

  it('accepts a valid approved row', () => {
    expect(CampaignCharacterSchema.safeParse(validApproved).success).toBe(true);
  });

  it('rejects missing campaignId', () => {
    const { campaignId: _c, ...rest } = validPending;
    expect(CampaignCharacterSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects empty characterId', () => {
    expect(CampaignCharacterSchema.safeParse({ ...validPending, characterId: '' }).success).toBe(
      false,
    );
  });

  it('rejects invalid status', () => {
    expect(CampaignCharacterSchema.safeParse({ ...validPending, status: 'denied' }).success).toBe(
      false,
    );
  });

  it('rejects negative submittedAt', () => {
    expect(CampaignCharacterSchema.safeParse({ ...validPending, submittedAt: -1 }).success).toBe(
      false,
    );
  });

  it('rejects non-null decidedBy with null decidedAt (structurally valid — schema does not cross-validate)', () => {
    // Schema doesn't enforce the business rule that decidedBy requires decidedAt.
    // It just validates types. This test documents the known behaviour.
    const result = CampaignCharacterSchema.safeParse({
      ...validPending,
      decidedBy: 'some-user-id',
      decidedAt: null,
    });
    expect(result.success).toBe(true);
  });
});
