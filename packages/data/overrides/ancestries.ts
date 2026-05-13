// Hand-authored ancestry overrides — defaults the markdown source
// doesn't structurally expose. Folded into the parsed ancestry entries
// at build time (see packages/data/build.ts).
//
// Following the same override pattern used elsewhere in packages/data,
// keyed by ancestry id (slug).

export type AncestryOverride = {
  defaultSize?: string;
  defaultSpeed?: number;
  grantedImmunities?: Array<{ kind: string; value: number | 'level' }>;
  signatureTraitAbilityId?: string | null;
};

export const ANCESTRY_OVERRIDES: Record<string, AncestryOverride> = {
  memonek: {},
  polder: {
    defaultSize: '1S',
    // Q17 Bucket A: Shadowmeld is a narrative-only signature trait — the
    // engine renders it as a maneuver card; the table adjudicates the effect.
    signatureTraitAbilityId: 'polder.shadowmeld',
  },
  devil: {},
  'dragon-knight': {},
  dwarf: {},
  hakaan: { defaultSize: '1L' },
  'high-elf': {},
  human: {
    // Q17 Bucket A: Detect the Supernatural is a narrative-only signature
    // trait — the engine tracks the active-tag duration; the table
    // adjudicates what counts as supernatural and what the player perceives.
    signatureTraitAbilityId: 'human.detect-the-supernatural',
  },
  orc: {},
  'time-raider': {
    grantedImmunities: [{ kind: 'psychic', value: 'level' }],
  },
  'wode-elf': {},
  revenant: {
    // Size derives from formerAncestryId at runtime; defaultSize stays '1M'
    // as a fallback for early-build states.
    defaultSpeed: 5,
    // Tough But Withered signature trait: cold/corruption/lightning/poison
    // immunity equal to level. The companion fire weakness 5 is emitted by
    // collectFromAncestry as a special-case (see that file) because the
    // grantedImmunities shape doesn't model weaknesses.
    grantedImmunities: [
      { kind: 'cold', value: 'level' },
      { kind: 'corruption', value: 'level' },
      { kind: 'lightning', value: 'level' },
      { kind: 'poison', value: 'level' },
    ],
  },
};
