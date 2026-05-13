import type { Ability } from '@ironyard/shared';

// Hand-authored ability records that the markdown parser doesn't emit.
//
// Some ancestry signature traits are described inline inside the ancestry
// markdown (e.g. Human's *Detect the Supernatural* sits under
// `Ancestries/Human.md` Signature Trait block) and don't live under
// `Rules/Abilities/<class>/...`. The parser only walks the `Abilities` tree,
// so these are invisible to the pipeline unless we materialize them here.
//
// Build.ts appends this array to the parsed abilities before writing the
// abilities.json bundle.
//
// Resolves rule-questions Q17 Bucket A (data gaps). The matching wiring is
// in packages/data/overrides/ancestries.ts (signatureTraitAbilityId).
export const SYNTHETIC_ABILITIES: Ability[] = [
  {
    id: 'human.detect-the-supernatural',
    name: 'Detect the Supernatural',
    type: 'maneuver',
    keywords: ['Magic'],
    distance: 'Self',
    target: 'Self',
    effect:
      'Until the end of your next turn, you know the location of any supernatural object, or any undead, construct, or creature from another world within 5 squares, even if you don\'t have line of effect to that object or creature. You know if you\'re detecting an item or a creature, and you know the nature of any creature you detect.',
    raw: 'As a maneuver, you can open your awareness to detect supernatural creatures and phenomena. Until the end of your next turn, you know the location of any supernatural object, or any undead, construct, or creature from another world within 5 squares, even if you don\'t have line of effect to that object or creature. You know if you\'re detecting an item or a creature, and you know the nature of any creature you detect.',
    cost: null,
    tier: null,
    isSubclass: false,
    sourceClassId: null,
  },
  {
    id: 'polder.shadowmeld',
    name: 'Shadowmeld',
    type: 'maneuver',
    keywords: ['Magic'],
    distance: 'Self',
    target: 'Self',
    effect:
      'You flatten yourself into a shadow against a wall or floor you are touching, and become hidden from any creature you have cover or concealment from or who isn\'t observing you. While in shadow form, you have full awareness of your surroundings, and strikes made against you and tests made to search for you take a bane. You can\'t move or be force moved, and you can\'t take main actions or maneuvers except to exit this form or to direct creatures under your control. Any ability or effect that targets more than 1 square affects you in this form only if it explicitly affects the surface you are flattened against. You can exit this form as a maneuver. If the surface you are flattened against is destroyed, this ability ends and you take 1d6 damage that can\'t be reduced in any way.',
    raw: 'You become an actual shadow. Magic / Maneuver / Self / Self. You flatten yourself into a shadow and become hidden from any creature you have cover or concealment from. Strikes and search tests against you take a bane. You can\'t move or be force moved, and you can\'t take main actions or maneuvers except to exit this form. You can exit this form as a maneuver.',
    cost: null,
    tier: null,
    isSubclass: false,
    sourceClassId: null,
  },
];
