import { z } from 'zod';
import { CharacterSchema } from '../character';
import { MonsterSchema } from '../data/monster';

// ── Stamped PC entry (DO resolves character blob + owner from D1) ─────────────

export const StartEncounterStampedPcSchema = z.object({
  characterId: z.string().min(1),
  ownerId: z.string().min(1),
  name: z.string().min(1), // from characters.name column
  character: CharacterSchema, // full blob parsed from characters.data
});
export type StartEncounterStampedPc = z.infer<typeof StartEncounterStampedPcSchema>;

// ── Monster entry (client-sent) ───────────────────────────────────────────────

export const MonsterEntrySchema = z.object({
  monsterId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  nameOverride: z.string().min(1).max(80).optional(),
});
export type MonsterEntry = z.infer<typeof MonsterEntrySchema>;

// ── Stamped monster entry (DO resolves stat block from static data) ───────────

export const StartEncounterStampedMonsterSchema = z.object({
  monsterId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  nameOverride: z.string().min(1).max(80).optional(),
  monster: MonsterSchema, // resolved by DO stamper
});
export type StartEncounterStampedMonster = z.infer<typeof StartEncounterStampedMonsterSchema>;

// ── Full payload ──────────────────────────────────────────────────────────────
//
// Client sends: { encounterId?, characterIds[], monsters[], stampedPcs: [], stampedMonsters: [] }
// DO stamper fills in stampedPcs (reads D1 character blobs) and stampedMonsters
// (resolves static monster data). The reducer ignores characterIds/monsters once
// stamped — stampedPcs and stampedMonsters are the authoritative inputs.

export const StartEncounterPayloadSchema = z.object({
  // Optional optimistic id. The reducer generates the canonical id via ulid()
  // if absent; the client may suggest one for optimistic local state.
  encounterId: z.string().min(1).optional(),

  // Character IDs to include. DO stamper resolves → stampedPcs.
  characterIds: z.array(z.string().min(1)).default([]),

  // Monster entries. DO stamper resolves → stampedMonsters.
  monsters: z.array(MonsterEntrySchema).default([]),

  // DO-stamped PC blobs. Client sends []; DO fills before reducer.
  stampedPcs: z.array(StartEncounterStampedPcSchema).default([]),

  // DO-stamped monster blobs. Client sends []; DO fills before reducer.
  stampedMonsters: z.array(StartEncounterStampedMonsterSchema).default([]),
});
export type StartEncounterPayload = z.infer<typeof StartEncounterPayloadSchema>;
