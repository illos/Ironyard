import { z } from 'zod';

export const MagicLinkRequestSchema = z.object({
  email: z.string().email(),
});
export type MagicLinkRequest = z.infer<typeof MagicLinkRequestSchema>;

export const DevLoginRequestSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(64).optional(),
});
export type DevLoginRequest = z.infer<typeof DevLoginRequestSchema>;

export const CurrentUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
});
export type CurrentUser = z.infer<typeof CurrentUserSchema>;
