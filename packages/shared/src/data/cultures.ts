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

// Descriptive flavor text for each culture aspect option, sourced from
// Draw Steel\'s Cultures chapter (.reference/data-md/Rules/Cultures/). Used by
// CultureStep to surface what each option means when the player is choosing.
// Paraphrased from the rulebook to avoid shipping copyright text in the repo.
export const CULTURE_ASPECT_DESCRIPTIONS = {
  environment: {
    nomadic: 'A culture that travels rather than settles — following migrations, selling wares, or simply embracing a restless life on the move. Heroes raised this way learn to navigate wild terrain and rely on one another through close, constant cooperation.',
    rural: 'Rooted in a town, village, or small settled enclave. People here farm, fish, mine, or trade with passing travelers. Skills and trades are passed down deliberately, because in a small community there may be only one person who knows how to do a crucial job.',
    secluded: 'Based in a single close-quarters structure — a monastery, castle, or similar enclave — with little contact beyond its walls. Heroes from secluded cultures grow up skilled at getting along with the same people day after day, and often develop deep habits of study or introspection.',
    urban: 'Centered in a city or large population hub, from a sprawling metropolis to a dense underground warren. Heroes from urban cultures learn early to read people, navigate politics, and hold their own amid crowds and competing ambitions.',
    wilderness: 'A culture that lives within nature rather than taming it — in desert, forest, tundra, ocean, or stranger climes. Heroes raised here learn to take everything they need from the land itself, crafting their own tools and shelter while thriving where others would be lost.',
  } as Record<CultureEnvironment, string>,
  organization: {
    bureaucratic: 'Governed by official ranks, formal laws, and recorded rules — whether a noble hierarchy, a guild charter, or a military chain of command. Heroes who grew up here learn that the written rule is power, and that knowing how to bend, reinterpret, or work around it is equally powerful.',
    communal: 'Everyone has an equal voice and a shared stake. Important decisions are made together, burdens are distributed across all members, and no single person holds permanent authority. Heroes from communal cultures are practiced at self-reliance and at protecting their group from outside interference.',
  } as Record<CultureOrganization, string>,
  upbringing: {
    academic: 'Raised among people who collect, study, and pass on knowledge — scholars, clergy, or specialists dedicated to a discipline. Heroes from academic cultures learn that information is its own kind of power.',
    creative: 'Brought up among makers — artists, musicians, craftspeople, builders. Whether the work is a carved statue or a wagon wheel, the culture prizes quality and attention to detail. Heroes here grow up understanding the value of doing something well.',
    labor: 'Raised in a culture built around physical work — farming, herding, mining, hauling, or building. The people here understand what it costs to sustain a community, and heroes who grew up laboring know the value of honest effort and a strong back.',
    lawless: 'Raised among folk who operated outside accepted law — pirates, thieves, rebels, spies. Breaking rules was survival, and getting away with it was a skill. Heroes from lawless cultures have little trouble sidestepping convention when it suits them.',
    martial: 'Brought up by warriors — soldiers, mercenaries, monster-hunters, or any group whose life revolves around combat. Heroes with this upbringing are always ready for a fight and know how to finish one.',
    noble: 'Raised among leaders who hold power over others and play politics to keep it. Whether the title came by birthright or deed, heroes with this background understand that a whispered word to the right person can outweigh any army.',
  } as Record<CultureUpbringing, string>,
} as const;
