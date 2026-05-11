import { z } from 'zod';

// Phase 1 slice 2: minimum viable Monster. Subsequent slices extend with
// stamina, EV, immunities, weaknesses, characteristics, features, source,
// etc. per docs/data-pipeline.md.
//
// Level range widened from the spec's 1..10 — the source data includes
// level 0 templates (Noncombatant) and level 11+ bosses (Ajax the Invincible).
// 0..20 covers what's in the bestiary today with headroom for future content.
export const MonsterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  level: z.number().int().min(0).max(20),
});
export type Monster = z.infer<typeof MonsterSchema>;

export const MonsterFileSchema = z.object({
  version: z.string().min(1), // SteelCompendium data-md pin
  generatedAt: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  monsters: z.array(MonsterSchema),
});
export type MonsterFile = z.infer<typeof MonsterFileSchema>;
