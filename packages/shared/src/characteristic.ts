import { z } from 'zod';

// Per rules-canon §1.1, characteristic scores range from −5 to +5.
const charScore = z.number().int().min(-5).max(5);

export const CharacteristicSchema = z.enum(['might', 'agility', 'reason', 'intuition', 'presence']);
export type Characteristic = z.infer<typeof CharacteristicSchema>;

export const CharacteristicsSchema = z.object({
  might: charScore,
  agility: charScore,
  reason: charScore,
  intuition: charScore,
  presence: charScore,
});
export type Characteristics = z.infer<typeof CharacteristicsSchema>;
