export type CultureEnvironment = 'nomadic' | 'rural' | 'secluded' | 'urban' | 'wilderness';
export type CultureOrganization = 'bureaucratic' | 'communal';
export type CultureUpbringing = 'academic' | 'creative' | 'labor' | 'lawless' | 'martial' | 'noble';

export type TypicalAncestryCulture = {
  ancestryId: string;
  language: string;
  environment: CultureEnvironment;
  organization: CultureOrganization;
  upbringing: CultureUpbringing;
};

export type ArchetypicalCulture = {
  id: string; // slug, e.g. 'artisan-guild'
  name: string; // display name, e.g. 'Artisan Guild'
  environment: CultureEnvironment;
  organization: CultureOrganization;
  upbringing: CultureUpbringing;
};

// Source: Draw Steel rulebook, Background chapter. Revenants omitted —
// they gain their ancestry after death, so no typical ancestry culture
// applies.
export const TYPICAL_ANCESTRY_CULTURES: Record<string, TypicalAncestryCulture> = {
  devil: {
    ancestryId: 'devil',
    language: 'Anjali',
    environment: 'urban',
    organization: 'bureaucratic',
    upbringing: 'academic',
  },
  'dragon-knight': {
    ancestryId: 'dragon-knight',
    language: 'Vastariax',
    environment: 'secluded',
    organization: 'bureaucratic',
    upbringing: 'martial',
  },
  dwarf: {
    ancestryId: 'dwarf',
    language: 'Zaliac',
    environment: 'secluded',
    organization: 'bureaucratic',
    upbringing: 'creative',
  },
  'wode-elf': {
    ancestryId: 'wode-elf',
    language: 'Yllyric',
    environment: 'wilderness',
    organization: 'bureaucratic',
    upbringing: 'martial',
  },
  'high-elf': {
    ancestryId: 'high-elf',
    language: 'Hyrallic',
    environment: 'secluded',
    organization: 'bureaucratic',
    upbringing: 'martial',
  },
  hakaan: {
    ancestryId: 'hakaan',
    language: 'Vhoric',
    environment: 'rural',
    organization: 'communal',
    upbringing: 'labor',
  },
  human: {
    ancestryId: 'human',
    language: 'Vaslorian',
    environment: 'urban',
    organization: 'communal',
    upbringing: 'labor',
  },
  memonek: {
    ancestryId: 'memonek',
    language: 'Axiomatic',
    environment: 'nomadic',
    organization: 'communal',
    upbringing: 'academic',
  },
  orc: {
    ancestryId: 'orc',
    language: 'Kalliak',
    environment: 'wilderness',
    organization: 'communal',
    upbringing: 'creative',
  },
  polder: {
    ancestryId: 'polder',
    language: 'Khoursirian',
    environment: 'urban',
    organization: 'communal',
    upbringing: 'creative',
  },
  'time-raider': {
    ancestryId: 'time-raider',
    language: 'Voll',
    environment: 'nomadic',
    organization: 'communal',
    upbringing: 'martial',
  },
};

// Source: Draw Steel rulebook, Background chapter.
export const ARCHETYPICAL_CULTURES: ArchetypicalCulture[] = [
  { id: 'artisan-guild', name: 'Artisan Guild', environment: 'urban', organization: 'bureaucratic', upbringing: 'creative' },
  { id: 'borderland-homestead', name: 'Borderland Homestead', environment: 'wilderness', organization: 'communal', upbringing: 'labor' },
  { id: 'college-conclave', name: 'College Conclave', environment: 'urban', organization: 'bureaucratic', upbringing: 'academic' },
  { id: 'criminal-gang', name: 'Criminal Gang', environment: 'urban', organization: 'communal', upbringing: 'lawless' },
  { id: 'farming-village', name: 'Farming Village', environment: 'rural', organization: 'bureaucratic', upbringing: 'labor' },
  { id: 'herding-community', name: 'Herding Community', environment: 'nomadic', organization: 'communal', upbringing: 'labor' },
  { id: 'knightly-order', name: 'Knightly Order', environment: 'secluded', organization: 'bureaucratic', upbringing: 'martial' },
  { id: 'laborer-neighborhood', name: 'Laborer Neighborhood', environment: 'urban', organization: 'communal', upbringing: 'labor' },
  { id: 'mercenary-band', name: 'Mercenary Band', environment: 'nomadic', organization: 'bureaucratic', upbringing: 'martial' },
  { id: 'merchant-caravan', name: 'Merchant Caravan', environment: 'nomadic', organization: 'bureaucratic', upbringing: 'creative' },
  { id: 'monastic-order', name: 'Monastic Order', environment: 'secluded', organization: 'bureaucratic', upbringing: 'academic' },
  { id: 'noble-house', name: 'Noble House', environment: 'urban', organization: 'bureaucratic', upbringing: 'noble' },
  { id: 'outlaw-band', name: 'Outlaw Band', environment: 'wilderness', organization: 'communal', upbringing: 'lawless' },
  { id: 'pirate-crew', name: 'Pirate Crew', environment: 'nomadic', organization: 'communal', upbringing: 'lawless' },
  { id: 'telepathic-hive', name: 'Telepathic Hive', environment: 'secluded', organization: 'communal', upbringing: 'creative' },
  { id: 'traveling-entertainers', name: 'Traveling Entertainers', environment: 'nomadic', organization: 'communal', upbringing: 'creative' },
];

export function getTypicalAncestryCulture(ancestryId: string | null): TypicalAncestryCulture | null {
  if (!ancestryId) return null;
  return TYPICAL_ANCESTRY_CULTURES[ancestryId] ?? null;
}
