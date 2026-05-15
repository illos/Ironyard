import { z } from 'zod';
import { ActiveAbilityInstanceSchema } from './active-ability';
import { CharacteristicsSchema } from './characteristic';
import { ConditionInstanceSchema } from './condition';
import { TypedResistanceSchema } from './damage';
import { MaintainedAbilitySchema } from './maintained-ability';
import { PerEncounterFlagsSchema, defaultPerEncounterFlags } from './per-encounter-flags';
import { PsionFlagsSchema, defaultPsionFlags } from './psion-flags';
import { ExtraResourceInstanceSchema, HeroicResourceInstanceSchema } from './resource';
import { ParticipantStateOverrideSchema } from './stamina-override';

// Quick stat block. Phase 1 ships PCs as form-built blocks; later phases swap
// PCs in by character id from the D1 `characters` table, but the in-encounter
// representation stays this shape.
export const ParticipantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['pc', 'monster']),
  // Phase 2 Epic 1: PC participants carry the owning user's id so the web
  // client can identify "the viewer's own participant" for the in-encounter
  // sheet panel. Monsters are owner-less (null). Nullable + default null
  // keeps older snapshots parseable.
  ownerId: z.string().nullable().default(null),
  // Phase 2 Epic 1 (Task F2): PC participants carry the originating character
  // id so PlayerSheetPanel can call useCharacter(characterId) → deriveRuntime
  // → render abilities. Nullable + default null keeps older snapshots parseable.
  characterId: z.string().nullable().default(null),
  // Slice 6: `level` feeds Bleeding's `1d6 + level` damage (rules-canon §3.5.1)
  // and other level-scaled effects. Range mirrors MonsterSchema (0..20) so the
  // PC and monster shapes share one source of truth. Defaults to 1 so existing
  // payloads that omit the field still parse — slice-5 fixtures don't change.
  level: z.number().int().min(0).max(20).default(1),
  // Pass 3 Slice 1 — bound relaxed from .min(0). Heroes go negative when
  // dying per canon §2.8 (currentStamina ≤ 0 → dying; ≤ -windedValue → dead).
  // applyDamageStep clamps the lower bound at -maxStamina-1 (sentinel) when
  // explicit death-state transitions resolve.
  currentStamina: z.number().int(),
  maxStamina: z.number().int().min(1),
  characteristics: CharacteristicsSchema,
  immunities: z.array(TypedResistanceSchema).default([]),
  weaknesses: z.array(TypedResistanceSchema).default([]),
  // Slice 5: conditions live on the participant as data. Slice 6 wires hooks
  // (Bleeding damage, edge/bane contributions, action gating) into the reducer.
  conditions: z.array(ConditionInstanceSchema).default([]),
  // Slice 7: heroic resource pools. Each participant carries ≤ 1 instance per
  // canon heroic resource name (typed registry — rules-canon §5.4.9). Talent's
  // Clarity is the only resource that can have a negative `floor`. Free-form
  // extras (e.g. Censor Virtue, Conduit Divine Power at 10th level, homebrew)
  // live in `extras` so the type system stays clean for the canon-fixed nine.
  heroicResources: z.array(HeroicResourceInstanceSchema).default([]),
  extras: z.array(ExtraResourceInstanceSchema).default([]),
  // Slice 7: universal surges pool (canon §5.6). Floor 0, no ceiling. Reset to
  // 0 at end of encounter (handled by future EndEncounter intent).
  surges: z.number().int().min(0).default(0),
  // Slice 7: recoveries pool (canon §2.13). `SpendRecovery` consumes 1 and
  // dispatches a derived `ApplyHeal { amount: recoveryValue }` capped at
  // maxStamina. The dispatcher / character sheet computes `recoveryValue`
  // (typically maxStamina/3 rounded down); the engine doesn't derive it.
  recoveries: z
    .object({
      current: z.number().int().min(0),
      max: z.number().int().min(0),
    })
    .default({ current: 0, max: 0 }),
  recoveryValue: z.number().int().min(0).default(0),
  // Slice 6 / Epic 2C § 10.8: per-tier weapon damage bonus, snapshot from the
  // derived runtime at materialization (StartEncounter). RollPower reads
  // `weaponDamageBonus.{melee,ranged}[tier - 1]` and adds it to ability damage
  // when the ability has Weapon + Melee/Ranged keywords. Defaults keep older
  // snapshots and monster fixtures parseable (monsters carry zeros).
  weaponDamageBonus: z
    .object({
      melee: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
      ranged: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
    })
    .default({ melee: [0, 0, 0], ranged: [0, 0, 0] }),
  // Q17 Bucket A: narrative-only maneuvers (Human Detect the Supernatural,
  // Polder Shadowmeld) toggle on as tagged active abilities. The engine tracks
  // expiry; the table adjudicates effect.
  activeAbilities: z.array(ActiveAbilityInstanceSchema).default([]),
  // Per-character Victories (canon § 8.1) materialized onto the participant at
  // StartEncounter for cheap reducer access. Sourced from `character.victories`.
  victories: z.number().int().min(0).default(0),
  // Phase 5 Pass 2a — per-turn action-usage state for the Turn-flow UI.
  // Reset to all-false by applyStartTurn when this participant becomes the
  // turn-holder. RollPower auto-emits a derived MarkActionUsed based on
  // ability.type (action → main, maneuver → maneuver); Move has no engine
  // intent so it's set by the "Done moving" button only.
  turnActionUsage: z
    .object({
      main: z.boolean(),
      maneuver: z.boolean(),
      move: z.boolean(),
    })
    .default({ main: false, maneuver: false, move: false }),
  // Phase 5 Pass 2b1 — zipper-initiative surprise flag (canon § 4.1).
  // Set by `MarkSurprised` or as part of `RollInitiative.surprised[]`.
  // Cleared by `applyEndRound` at the end of round 1 per canon. The
  // "edge on rolls against" and "can't take triggered actions" consequences
  // of being surprised are Phase 2b umbrella work — 2b1 only carries the flag.
  surprised: z.boolean().default(false),
  // Phase 5 Pass 2b2a — monster meta stamped at StartEncounter from the
  // monster definition. Null on PC participants and on pre-2b2a snapshots.
  role: z.string().nullable().default(null),
  ancestry: z.array(z.string()).default([]),
  size: z.string().nullable().default(null),
  speed: z.number().int().nullable().default(null),
  stability: z.number().int().nullable().default(null),
  freeStrike: z.number().int().nullable().default(null),
  ev: z.number().int().nullable().default(null),
  withCaptain: z.string().nullable().default(null),
  // Phase 5 Pass 2b2a — PC class display name stamped at StartEncounter from
  // the character blob. Null on monster participants and pre-2b2a snapshots.
  className: z.string().nullable().default(null),
  // Pass 3 Slice 1 — purchased ancestry trait ids stamped at StartEncounter
  // from character.ancestryChoices.traitIds. Allows reducer helpers to detect
  // Hakaan-Doomsight and other purchased-trait gating without a character
  // lookup at runtime. Empty default keeps pre-slice-1 snapshots parseable.
  purchasedTraits: z.array(z.string()).default([]),
  // Pass 3 Slice 1 — title id(s) equipped at encounter start, derived from
  // character.titleId. Allows reducer helpers to detect Title Doomed without
  // a character lookup. Single element array when the character has a title;
  // empty otherwise. Empty default keeps pre-slice-1 snapshots parseable.
  equippedTitleIds: z.array(z.string()).default([]),
  // Pass 3 Slice 1 — canon §2.7-2.9 state machine.
  // Derived from currentStamina + staminaOverride via recomputeStaminaState.
  // The reducer recomputes after every stamina-mutating intent and emits
  // StaminaTransitioned when the value changes. Default 'healthy' keeps
  // pre-slice-1 snapshots parseable; loaders re-run derivation.
  staminaState: z
    .enum(['healthy', 'winded', 'dying', 'dead', 'unconscious', 'inert', 'rubble', 'doomed'])
    .default('healthy'),
  // Per-trait override of canonical state transitions. See stamina-override.ts.
  staminaOverride: ParticipantStateOverrideSchema.nullable().default(null),
  // Reified from 2b.0's permissive flag. True unless explicitly ablated (e.g.
  // force-move-to-extreme, vaporizing-damage). Slice 1 ships the field; the
  // ablation events themselves arrive in later slices.
  bodyIntact: z.boolean().default(true),
  // Canon §4.10 — round-tick reset by applyEndRound. Gates triggered-action
  // availability.
  triggeredActionUsedThisRound: z.boolean().default(false),
  // Pass 3 Slice 2a — per-turn / per-round / per-encounter flag bag consumed
  // by class-feature triggers (Fury Ferocity, Censor Wrath, Tactician Focus,
  // Shadow Insight, Null Discipline, Talent Clarity, Troubadour latches).
  // Reset semantics live in turn.ts (perTurn entries clear at EndTurn of
  // scopedToTurnOf, perRound at EndRound, perEncounter at EndEncounter).
  perEncounterFlags: PerEncounterFlagsSchema.default(defaultPerEncounterFlags()),
  // Pass 3 Slice 2a — posthumous Drama eligibility latch. Set true when a
  // hero dies; consumed by GainResource (Drama crossing 30) to dispatch the
  // auto-revive open action. Cleared on revive.
  posthumousDramaEligible: z.boolean().default(false),
  // Pass 3 Slice 2a — Psion 10th-level flags (Clarity damage opt-out). Reset
  // at EndTurn.
  psionFlags: PsionFlagsSchema.default(defaultPsionFlags()),
  // Pass 3 Slice 2a — Elementalist Maintenance: abilities the hero is keeping
  // up at a per-turn essence cost. StartTurn deducts costPerTurn after the
  // per-turn essence gain; auto-drops if essence would go negative.
  maintainedAbilities: z.array(MaintainedAbilitySchema).default([]),
});
export type Participant = z.infer<typeof ParticipantSchema>;
