import { z } from 'zod';
import { MonsterSchema } from '../data/monster';

// Client sends: { monsterId, quantity, nameOverride? }
// DO stamps: { ...client fields, monster: <resolved MonsterSchema> }
export const AddMonsterPayloadSchema = z.object({
  monsterId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  nameOverride: z.string().min(1).max(80).optional(),
  monster: MonsterSchema, // stamped by DO before reducer sees it
});
export type AddMonsterPayload = z.infer<typeof AddMonsterPayloadSchema>;
