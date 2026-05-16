import { z } from 'zod';

// Per-turn flag keys — see slice 2a spec § perEncounterFlags shape. Each key
// corresponds to a participant flag that can be set on a specific turn and
// reset when the participant whose turn it is scoped to ends their turn.
// Slice 2a writes these on every qualifying event; consumers (most non-δ
// class-feature work) read them.
export const PerTurnFlagKeySchema = z.enum([
  'damageDealtThisTurn',         // scope: dealer; future: Tactician mark bonus, Conduit lightning curse
  'damageTakenThisTurn',         // scope: target; future: Null Reactive Slide
  'forcedMovementApplied',       // scope: actor; counter (number) of forced-move applications; future: Fury surge generators
  'usedJudgmentThisTurn',        // scope: actor; future: Censor Exorcist order
  'movedViaAbilityThisTurn',     // scope: actor; future: Null surge generator
  'nullFieldTriggeredThisTurn',  // scope: Null hero; future: Null surge generator
  'teleportedAdjacentToThisTurn',// scope: actor; value: enemy id list; future: Shadow Ash Burn
  'passedThroughSpaceThisTurn',  // scope: actor; value: enemy id list; future: Shadow corruption space
]);
export type PerTurnFlagKey = z.infer<typeof PerTurnFlagKeySchema>;

export const PerTurnEntrySchema = z.object({
  scopedToTurnOf: z.string().min(1),  // ParticipantId whose EndTurn resets this entry
  key: PerTurnFlagKeySchema,
  value: z.union([z.boolean(), z.number(), z.array(z.string())]),
}).strict();
export type PerTurnEntry = z.infer<typeof PerTurnEntrySchema>;

export const PerRoundFlagsSchema = z.object({
  tookDamage:                       z.boolean().default(false),  // Fury Ferocity; slice-2b Bloodfire reader
  judgedTargetDamagedMe:            z.boolean().default(false),  // Censor Wrath
  damagedJudgedTarget:              z.boolean().default(false),  // Censor Wrath
  markedTargetDamagedByAnyone:      z.boolean().default(false),  // Tactician Focus
  dealtSurgeDamage:                 z.boolean().default(false),  // Shadow Insight
  directorSpentMalice:              z.boolean().default(false),  // Null Discipline (per-Null latch)
  creatureForceMoved:               z.boolean().default(false),  // Talent Clarity (per-Talent latch)
  allyHeroicWithin10Triggered:      z.boolean().default(false),  // Tactician spatial OA (per-Tactician latch)
  nullFieldEnemyMainTriggered:      z.boolean().default(false),  // Null spatial OA (per-Null latch)
  elementalistDamageWithin10Triggered: z.boolean().default(false),  // Elementalist spatial OA (per-Elementalist latch)
}).strict();
export type PerRoundFlags = z.infer<typeof PerRoundFlagsSchema>;

export function defaultPerRoundFlags(): PerRoundFlags {
  return {
    tookDamage: false,
    judgedTargetDamagedMe: false,
    damagedJudgedTarget: false,
    markedTargetDamagedByAnyone: false,
    dealtSurgeDamage: false,
    directorSpentMalice: false,
    creatureForceMoved: false,
    allyHeroicWithin10Triggered: false,
    nullFieldEnemyMainTriggered: false,
    elementalistDamageWithin10Triggered: false,
  };
}

export const PerEncounterLatchesSchema = z.object({
  firstTimeWindedTriggered:         z.boolean().default(false),  // Fury
  firstTimeDyingTriggered:          z.boolean().default(false),  // Fury
  troubadourThreeHeroesTriggered:   z.boolean().default(false),
  troubadourAnyHeroWindedTriggered: z.boolean().default(false),
  troubadourReviveOARaised:         z.boolean().default(false),
}).strict();
export type PerEncounterLatches = z.infer<typeof PerEncounterLatchesSchema>;

export function defaultPerEncounterLatches(): PerEncounterLatches {
  return {
    firstTimeWindedTriggered: false,
    firstTimeDyingTriggered: false,
    troubadourThreeHeroesTriggered: false,
    troubadourAnyHeroWindedTriggered: false,
    troubadourReviveOARaised: false,
  };
}

export const PerEncounterFlagsSchema = z.object({
  perTurn:      z.object({ entries: z.array(PerTurnEntrySchema).default([]) }).default({ entries: [] }),
  perRound:     PerRoundFlagsSchema.default(defaultPerRoundFlags()),
  perEncounter: PerEncounterLatchesSchema.default(defaultPerEncounterLatches()),
}).strict();
export type PerEncounterFlags = z.infer<typeof PerEncounterFlagsSchema>;

export function defaultPerEncounterFlags(): PerEncounterFlags {
  return {
    perTurn: { entries: [] },
    perRound: defaultPerRoundFlags(),
    perEncounter: defaultPerEncounterLatches(),
  };
}
