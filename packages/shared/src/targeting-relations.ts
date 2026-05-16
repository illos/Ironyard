import { z } from 'zod';

// Pass 3 Slice 2b — player-managed targeting relations on a source
// participant. Mutated via SetTargetingRelation intent (per-row chip toggle)
// or auto-derived from UseAbility for the two PHB ability ids in
// ABILITY_TARGETING_EFFECTS (Judgment, Mark). Engine reads these in three
// class-trigger predicates (Censor isJudgedBy, Tactician isMarkedBy,
// Null hasActiveNullFieldOver).

export const TargetingRelationKindSchema = z.enum(['judged', 'marked', 'nullField']);
export type TargetingRelationKind = z.infer<typeof TargetingRelationKindSchema>;

export const TargetingRelationsSchema = z.object({
  judged: z.array(z.string().min(1)).default([]),
  marked: z.array(z.string().min(1)).default([]),
  nullField: z.array(z.string().min(1)).default([]),
});
export type TargetingRelations = z.infer<typeof TargetingRelationsSchema>;

export function defaultTargetingRelations(): TargetingRelations {
  return { judged: [], marked: [], nullField: [] };
}
