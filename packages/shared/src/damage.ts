import { z } from 'zod';

// Closed enum per pre-Phase-0 #4. Ingest validates against this set so
// downstream switches can be exhaustive.
export const DAMAGE_TYPES = [
  'fire',
  'cold',
  'holy',
  'corruption',
  'psychic',
  'lightning',
  'poison',
  'acid',
  'sonic',
  'untyped',
] as const;

export const DamageTypeSchema = z.enum(DAMAGE_TYPES);
export type DamageType = z.infer<typeof DamageTypeSchema>;

export const TypedResistanceSchema = z.object({
  type: DamageTypeSchema,
  value: z.number().int().min(0),
});
export type TypedResistance = z.infer<typeof TypedResistanceSchema>;
