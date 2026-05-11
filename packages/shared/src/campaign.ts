import { z } from 'zod';

export const CreateCampaignRequestSchema = z.object({
  name: z.string().min(1).max(80),
});
export type CreateCampaignRequest = z.infer<typeof CreateCampaignRequestSchema>;

export const JoinCampaignRequestSchema = z.object({
  inviteCode: z
    .string()
    .min(4)
    .max(16)
    .regex(/^[0-9A-Z]+$/, 'invite code must be uppercase alphanumeric'),
});
export type JoinCampaignRequest = z.infer<typeof JoinCampaignRequestSchema>;

// Invite code: 6-char Crockford-Base32. Same alphabet as ULID so I/L/O/U
// don't get confused with 1/0/V at the table.
const INVITE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const INVITE_LEN = 6;

export function generateInviteCode(): string {
  const bytes = new Uint8Array(INVITE_LEN);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    result += INVITE_ALPHABET[byte % 32];
  }
  return result;
}
