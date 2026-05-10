import { z } from 'zod';

export const RoleSchema = z.enum(['director', 'player']);
export type Role = z.infer<typeof RoleSchema>;

export const ActorSchema = z.object({
  userId: z.string().min(1),
  role: RoleSchema,
});
export type Actor = z.infer<typeof ActorSchema>;
