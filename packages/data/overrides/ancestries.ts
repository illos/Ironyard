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
  signatureAbilityId?: string | null;
};

export const ANCESTRY_OVERRIDES: Record<string, AncestryOverride> = {
  memonek: {},
  polder: { defaultSize: '1S' },
  devil: {},
  'dragon-knight': {},
  dwarf: {},
  hakaan: { defaultSize: '1L' },
  'high-elf': {},
  human: {},
  orc: {},
  'time-raider': {
    grantedImmunities: [{ kind: 'psychic', value: 'level' }],
  },
  'wode-elf': {},
  revenant: {
    // Size derives from formerAncestryId at runtime; defaultSize stays '1M'
    // as a fallback for early-build states.
    defaultSpeed: 5,
  },
};
