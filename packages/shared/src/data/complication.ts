import { z } from 'zod';

// ── Complication ──────────────────────────────────────────────────────────────

export const ComplicationSchema = z.object({
  id: z.string().min(1), // matches front-matter item_id
  name: z.string().min(1),
  // Short flavor sentence or two before the benefit/drawback.
  description: z.string().default(''),
  // Mechanical benefit granted.
  benefit: z.string(),
  // Mechanical drawback imposed.
  drawback: z.string(),
});
export type Complication = z.infer<typeof ComplicationSchema>;

// ── File envelope ─────────────────────────────────────────────────────────────

export const ComplicationFileSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  complications: z.array(ComplicationSchema),
});
export type ComplicationFile = z.infer<typeof ComplicationFileSchema>;
