/* Wizard reference data — plausible Draw Steel content for the prototype.
   Mirrors the shape of ancestries.json / careers.json / classes.json etc. */

window.CW_ANCESTRIES = [
  {
    id: 'polder',
    name: 'Polder',
    tagline: 'Small, stubborn, slipshadow.',
    size: '1S',
    speed: 5,
    blurb:
      'A short-statured people from the high hedgerows and root-warrens. The world is built for taller things; polder make do with cleverness, luck, and the willingness to bite first.',
    traits: [
      { name: 'Small but Stubborn', body: 'Edge on saves against being knocked prone or pushed.' },
      { name: 'Slipshadow', body: 'Treat any creature one size larger than you as cover.' },
    ],
  },
  {
    id: 'human',
    name: 'Human',
    tagline: 'Adaptable. Restless. Everywhere.',
    size: '1M',
    speed: 5,
    blurb:
      'Common across every culture and climate, humans take to almost anything they put their will toward. What they lack in lineage they make up for in spread.',
    traits: [
      { name: 'Versatile', body: 'Gain one additional skill of your choice.' },
      { name: 'Resolve', body: 'Once per encounter, treat a single die you rolled as a 10.' },
    ],
  },
  {
    id: 'devil',
    name: 'Devil',
    tagline: 'Pacted, horned, half-here.',
    size: '1M',
    speed: 5,
    blurb:
      'Descended from infernal pacts older than any current king. Cannot pass through holy ground unburned, can stand in firelight without flinching.',
    traits: [
      { name: 'Pact-Touched', body: 'Edge on tests against being charmed or compelled.' },
      { name: 'Hellfire Resistance', body: 'Reduce all fire damage by 5.' },
    ],
  },
  {
    id: 'hakaan',
    name: 'Hakaan',
    tagline: 'Built to break siege lines.',
    size: '1L',
    speed: 5,
    blurb:
      'Tall, broad, and forged for war by their own creators. Hakaan endure punishment that would fell others twice and ask for a second round.',
    traits: [
      { name: 'Unstoppable', body: 'Forced movement against you is reduced by 1.' },
      { name: 'Heavy', body: 'Stability +2. You cannot be carried by Small or Medium creatures.' },
    ],
  },
  {
    id: 'memonek',
    name: 'Memonek',
    tagline: 'Glassblood. Memorykeepers.',
    size: '1M',
    speed: 5,
    blurb:
      'Once-mortal scholars given crystalline bodies by a long-dead empire. They remember things they were never told and dream in voices not their own.',
    traits: [
      {
        name: 'Glasswalk',
        body: 'Difficult terrain costs no extra movement on hard, smooth surfaces.',
      },
      {
        name: 'Echoed Mind',
        body: 'Once per session, recall a piece of information you have no reason to know.',
      },
    ],
  },
  {
    id: 'orc',
    name: 'Orc',
    tagline: 'Tusked, tireless, kin-first.',
    size: '1M',
    speed: 6,
    blurb:
      'Tall and broad, with tusks and a tradition of song. Orc clans hold each other above any state, banner, or coin.',
    traits: [
      {
        name: 'Stride',
        body: 'Speed +1. Ignore the first square of difficult terrain you cross each turn.',
      },
      { name: 'Kin Shield', body: 'When an ally adjacent to you takes damage, reduce it by 2.' },
    ],
  },
  {
    id: 'revenant',
    name: 'Revenant',
    tagline: "Came back. Didn't ask why.",
    size: '1M',
    speed: 5,
    blurb:
      'Those who returned from death without a clear errand. Bones held together by a debt nobody alive can collect.',
    traits: [
      {
        name: 'Deathless',
        body: 'Edge on saves against the dying condition. You do not need to breathe.',
      },
      { name: 'Cold Hand', body: 'Your touch attacks deal 1 cold damage.' },
    ],
  },
  {
    id: 'wode-elf',
    name: 'Wode Elf',
    tagline: 'Forest-bound. Long-lived.',
    size: '1M',
    speed: 6,
    blurb:
      'Sylvan elves who tend the wode — the wild green between settled lands. They count seasons the way others count meals.',
    traits: [
      { name: 'Forest Stride', body: 'Difficult terrain in forests costs no extra movement.' },
      { name: 'Keen Senses', body: 'Edge on Search and Alertness tests.' },
    ],
  },
];

window.CW_CULTURES = {
  environment: [
    { id: 'urban', name: 'Urban', body: 'Born to streets, smoke, and a hundred neighbors.' },
    { id: 'rural', name: 'Rural', body: 'Fields, fences, and the long quiet between.' },
    {
      id: 'wilderness',
      name: 'Wilderness',
      body: 'Beyond the last fencepost. Self-rule, hard winters.',
    },
    { id: 'nomadic', name: 'Nomadic', body: 'Home is whoever you ride with this season.' },
    { id: 'secluded', name: 'Secluded', body: 'Closed compound, cloister, or family valley.' },
    {
      id: 'underground',
      name: 'Underground',
      body: 'Caverns, sewers, and the lamp-lit reaches beneath.',
    },
  ],
  organization: [
    {
      id: 'anarchic',
      name: 'Anarchic',
      body: 'No standing authority — work things out, mostly with words.',
    },
    {
      id: 'bureaucratic',
      name: 'Bureaucratic',
      body: 'Forms, seals, and stamps. Every door asks who sent you.',
    },
    {
      id: 'communal',
      name: 'Communal',
      body: 'Decisions taken together. Belonging matters more than property.',
    },
    { id: 'hierarchical', name: 'Hierarchical', body: 'Clear chain — birth, rank, or blade.' },
  ],
  upbringing: [
    { id: 'academic', name: 'Academic', body: 'Books, lectures, ink-stained fingers.' },
    { id: 'creative', name: 'Creative', body: 'Trained to make — songs, glass, lies.' },
    { id: 'illegal', name: 'Illegal', body: 'Raised to know which laws were worth the lash.' },
    { id: 'labor', name: 'Labor', body: 'Hands first. Work before talk.' },
    { id: 'martial', name: 'Martial', body: 'Drilled. Disciplined. Or beaten into one of those.' },
    { id: 'noble', name: 'Noble', body: 'Letters of credit, expectations to match.' },
    { id: 'wild', name: 'Wild', body: 'Few rules. The land taught you most of them.' },
  ],
};

window.CW_LANGUAGES = [
  'Caelian',
  'Khoursirian',
  'Variak',
  'Old Vasloria',
  'High Hoadi',
  'Memonek-glass',
  'Orcish',
  'Sylvan',
  'Infernal',
  'Trade Cant',
  'Deep Tongue',
];

window.CW_CAREERS = [
  {
    id: 'sage',
    name: 'Sage',
    blurb:
      'You served at a college, library, or scriptorium. The work taught you patience and a useful suspicion of certainty.',
    skills: ['Lore: Magic', 'Lore: Psionics', 'Society'],
    perk: 'Edge on Lore tests for one hour after consulting any written source.',
  },
  {
    id: 'soldier',
    name: 'Soldier',
    blurb:
      'You took the coin and the colors. Old wounds remember weather; old habits get you down the alley first.',
    skills: ['Lead', 'Endurance', 'Strategy'],
    perk: "When you assist an ally's melee attack, they deal +2 damage on a hit.",
  },
  {
    id: 'criminal',
    name: 'Criminal',
    blurb:
      'You did the work and avoided most of the consequences. The work was easier than the avoiding.',
    skills: ['Sneak', 'Pick Lock', 'Read Person'],
    perk: "You always know the nearest fence and the going rate for what you're carrying.",
  },
  {
    id: 'performer',
    name: 'Performer',
    blurb:
      'Stage, street, or smoke-room. You learned to read a crowd before it decided what to do with you.',
    skills: ['Perform', 'Persuade', 'Flirt'],
    perk: 'Spend 1 minute performing to grant nearby allies a Hero Token (once per session).',
  },
  {
    id: 'mariner',
    name: 'Mariner',
    blurb:
      'You learned the weather by feel and the rope by feel and most other things the hard way.',
    skills: ['Climb', 'Swim', 'Navigate'],
    perk: 'Edge on tests to balance, climb rigging, or move on a tilting surface.',
  },
  {
    id: 'noble',
    name: 'Noble',
    blurb:
      'Born to expectations and the resources to meet them. Whether you met them is the interesting part.',
    skills: ['Society', 'Lead', 'Brag'],
    perk: 'Once per session, name-drop your way into a closed door or guarded room.',
  },
  {
    id: 'watch',
    name: 'Watch',
    blurb:
      'Night patrol, posted at a gate, or kicking down doors with a writ. You know which silences mean trouble.',
    skills: ['Alertness', 'Interrogate', 'Intimidate'],
    perk: 'After 10 minutes in a settlement, locate the nearest watch post, sanctioned brawl, and unlicensed magic-dealer.',
  },
  {
    id: 'beggar',
    name: 'Beggar',
    blurb:
      'The lowest seat at the table, with the clearest view of who sits at the highest. You learned what people throw away.',
    skills: ['Empathize', 'Hide', 'Rumors'],
    perk: "Spend an hour on a street and walk away knowing the city's three loudest rumors.",
  },
];

window.CW_CLASSES = [
  {
    id: 'censor',
    name: 'Censor',
    blurb:
      'Demons and deathless fear you. You carry the power of the gods, armed with wrath and sent out into the world first to seek, then censor those whose actions — or even existence — are anathema to your church.',
    locked: [{ char: 'Might', val: 2 }],
    resource: 'Wrath',
    subclasses: [
      { id: 'anger', name: 'Censor of Anger' },
      { id: 'shield', name: 'Exorcist of the Silver Cord' },
    ],
  },
  {
    id: 'conduit',
    name: 'Conduit',
    blurb:
      "The power of the gods flows through you. As a vessel for divine power, you don't just keep your allies in the fight — you make those allies more effective even as you rain divine energy down upon your foes.",
    locked: [{ char: 'Presence', val: 2 }],
    resource: 'Piety',
    subclasses: [
      { id: 'war', name: 'Steel Vow' },
      { id: 'sun', name: "Sun's Eye" },
      { id: 'death', name: 'Last Threshold' },
    ],
  },
  {
    id: 'elementalist',
    name: 'Elementalist',
    blurb:
      'Air for movement. Earth for permanence. Fire for destruction. Water for change. You use your mastery of the seven elements to destroy, create, and warp the world with magic.',
    locked: [{ char: 'Reason', val: 2 }],
    resource: 'Essence',
    subclasses: [
      { id: 'fire', name: 'Burning Stride' },
      { id: 'stone', name: 'Mountain Stance' },
      { id: 'tide', name: 'Tide-Caller' },
    ],
  },
  {
    id: 'fury',
    name: 'Fury',
    blurb:
      'You do not temper the heat of battle within you — you unleash it. You devastate foes with overwhelming might, hurt yourself and enemies around the battlefield, and grow stronger as your ferocity increases.',
    locked: [{ char: 'Might', val: 2 }],
    resource: 'Rage',
    subclasses: [
      { id: 'berserk', name: 'Berserker' },
      { id: 'stalker', name: 'Storm-stalker' },
      { id: 'wild', name: 'Wild Pack' },
    ],
  },
  {
    id: 'null',
    name: 'Null',
    blurb:
      'The mind is not separate from the body. Perfection of one requires perfection of the other. You strive for perfect discipline, perfect order, mastery over mind and body — an unarmed psionic warrior who dampens and absorbs magic.',
    locked: [{ char: 'Agility', val: 2 }],
    resource: 'Discipline',
    subclasses: [
      { id: 'open', name: 'Open Hand' },
      { id: 'iron', name: 'Iron Wei' },
      { id: 'still', name: 'Still Mirror' },
    ],
  },
  {
    id: 'shadow',
    name: 'Shadow',
    blurb:
      'Subtlety is your art, the tip of the blade your brush. You studied at a secret college specializing in alchemy, illusion, or shadow-magics. Your training places you among the elite ranks of assassins, spies, and commandos.',
    locked: [{ char: 'Agility', val: 2 }],
    resource: 'Insight',
    subclasses: [
      { id: 'black-ash', name: 'Black Ash' },
      { id: 'caustic', name: 'Caustic Alchemy' },
      { id: 'harlequin', name: 'Harlequin Mask' },
    ],
  },
  {
    id: 'tactician',
    name: 'Tactician',
    blurb:
      'Strategist. Defender. Leader. With weapon in hand, you lead allies into the maw of battle, barking out commands that inspire your fellow heroes to move faster and strike more precisely.',
    locked: [{ char: 'Presence', val: 2 }],
    resource: 'Focus',
    subclasses: [
      { id: 'vanguard', name: 'Vanguard' },
      { id: 'mastermind', name: 'Mastermind' },
      { id: 'insurgent', name: 'Insurgent' },
    ],
  },
  {
    id: 'talent',
    name: 'Talent',
    blurb:
      "A rare few are born with the potential to harness psionic power, and only those who experience an awakening can tap into the mind's full potential. You can move and change matter, time, gravity, the laws of physics, or another creature's mind.",
    locked: [
      { char: 'Reason', val: 2 },
      { char: 'Intuition', val: 2 },
    ],
    resource: 'Clarity',
    subclasses: [
      { id: 'telepath', name: 'Telepath' },
      { id: 'telekinetic', name: 'Telekinetic' },
      { id: 'metamorph', name: 'Metamorph' },
    ],
  },
  {
    id: 'troubadour',
    name: 'Troubadour',
    blurb:
      "The whole world's a stage, and everyone on it an actor. You find energy in the drama of everyday life and know how to draw spectacle forth from even the most mundane situations.",
    locked: [{ char: 'Presence', val: 2 }],
    resource: 'Drama',
    subclasses: [
      { id: 'war-dance', name: 'War Dancer' },
      { id: 'shadow-song', name: 'Shadow Song' },
      { id: 'old-poet', name: 'Old Poet' },
    ],
  },
];

window.CW_CHAR_ARRAYS = [
  { id: 'two-two', values: [2, 2, -1, -1], label: '[+2, +2, −1, −1]', note: 'specialist' },
  { id: 'two-one', values: [2, 1, 1, -1], label: '[+2, +1, +1, −1]', note: 'balanced' },
  { id: 'two-flat', values: [2, 1, 0, 0], label: '[+2, +1, +0, +0]', note: 'round' },
  { id: 'all-one', values: [1, 1, 1, 0], label: '[+1, +1, +1, +0]', note: 'even' },
];

window.CW_COMPLICATIONS = [
  {
    id: 'bound-promise',
    name: 'Bound Promise',
    benefit:
      'When you tell the truth in a tense moment, you have edge on your next Presence test in the scene.',
    drawback:
      'When asked a direct question, you must answer truthfully. You may refuse to answer, but you cannot lie.',
  },
  {
    id: 'cursed-heirloom',
    name: 'Cursed Heirloom',
    benefit: 'Once per session, the heirloom answers a yes / no question correctly.',
    drawback: 'You cannot willingly part with it for more than an hour without bane on all tests.',
  },
  {
    id: 'hunted',
    name: 'Hunted',
    benefit: 'You have edge on tests to read intent in a crowd — you have practice at it.',
    drawback: 'Every session, a watcher reports your location to your hunter.',
  },
  {
    id: 'mistaken-identity',
    name: 'Mistaken Identity',
    benefit: 'Strangers occasionally treat you with unearned warmth or coin.',
    drawback: 'The person you are mistaken for has enemies, and those enemies are not gentle.',
  },
  {
    id: 'pact',
    name: 'Infernal Pact',
    benefit: 'Once per encounter, gain 1 of your heroic resource by accepting a small debt.',
    drawback:
      'At session end, the debt-keeper names a small unpleasant task. You will do it next session.',
  },
  {
    id: 'soulbond',
    name: 'Soulbond',
    benefit: 'You and the soulbound share Hero Tokens freely at any range.',
    drawback: 'When your soulbound takes damage, you take half of it. You cannot refuse this.',
  },
  {
    id: 'vow',
    name: 'Vow of Silence',
    benefit: 'You cannot be compelled by magic that requires you to speak.',
    drawback: 'You do not speak aloud. Tests that depend on the spoken word are at bane.',
  },
  {
    id: 'none',
    name: 'None',
    benefit: '—',
    drawback: 'Complications can be added later. Some directors require one at character creation.',
  },
];

window.CW_KITS = {
  /* per-class kit options. Some shared. */
  shadow: [
    {
      id: 'rapid-fire',
      name: 'Rapid-Fire',
      weapon: 'Light Crossbow',
      armor: 'Reinforced Cloth',
      bonuses: { stamina: '+3', speed: '+0', melee: '+0', ranged: '+1' },
      notes: 'Trades melee bite for distance and a second shot per round.',
    },
    {
      id: 'shadow-blade',
      name: 'Shadow Blade',
      weapon: 'Whisperblade (Light · Energized)',
      armor: 'Reinforced Cloth',
      bonuses: { stamina: '+3', speed: '+1', melee: '+1', ranged: '+0' },
      notes: 'Built for close work, alleys, and rooftops.',
    },
    {
      id: 'panther',
      name: 'Panther',
      weapon: 'Twin Daggers',
      armor: 'None (unarmored)',
      bonuses: { stamina: '+0', speed: '+2', melee: '+1', ranged: '+0' },
      notes: 'Fastest of the shadow kits. Trades stamina for movement.',
    },
  ],
  talent: [
    {
      id: 'mindwalker',
      name: 'Mindwalker',
      weapon: 'Whisperblade (Light · Energized)',
      armor: 'Reinforced Cloth',
      bonuses: { stamina: '+3', speed: '+0', melee: '+0', ranged: '+1' },
      notes: 'Mind-resonant blade keys to your Clarity. Most Talents who travel start here.',
    },
    {
      id: 'ironmind',
      name: 'Ironmind',
      weapon: 'Heavy Staff',
      armor: 'Reinforced Cloth',
      bonuses: { stamina: '+5', speed: '+0', melee: '+1', ranged: '+0' },
      notes: 'Built for Talents who plan to be hit.',
    },
  ],
  default: [
    {
      id: 'warden',
      name: 'Warden',
      weapon: 'Greatsword',
      armor: 'Heavy Plate',
      bonuses: { stamina: '+6', speed: '−1', melee: '+1', ranged: '+0' },
      notes: 'Front-line absorber. Slow but unbroken.',
    },
    {
      id: 'ranger',
      name: 'Ranger',
      weapon: 'Longbow',
      armor: 'Hide',
      bonuses: { stamina: '+2', speed: '+1', melee: '+0', ranged: '+2' },
      notes: 'Quiet, mobile, long-reach.',
    },
    {
      id: 'mage',
      name: 'Mage',
      weapon: 'Focus Rod',
      armor: 'Light Robes',
      bonuses: { stamina: '+0', speed: '+0', melee: '+0', ranged: '+1' },
      notes: 'Glass cannon. Pack a friend.',
    },
  ],
};

window.CW_PACKS = [
  { id: 'lightning', name: 'Lightning', swatch: 'oklch(0.82 0.16 230)' },
  { id: 'shadow', name: 'Shadow', swatch: 'oklch(0.62 0.20 305)' },
  { id: 'fireball', name: 'Fireball', swatch: 'oklch(0.74 0.20 50)' },
  { id: 'chrome', name: 'Chrome', swatch: 'oklch(0.84 0.025 240)' },
];

window.CW_STEPS = [
  { id: 'name', num: 1, label: 'Name & Details' },
  { id: 'ancestry', num: 2, label: 'Ancestry' },
  { id: 'culture', num: 3, label: 'Culture' },
  { id: 'career', num: 4, label: 'Career' },
  { id: 'class', num: 5, label: 'Class' },
  { id: 'complication', num: 6, label: 'Complication' },
  { id: 'kit', num: 7, label: 'Kit' },
  { id: 'review', num: 8, label: 'Review' },
];

/* Starting wizard state — mirrors what's shown in the screenshot:
   Class step active, Shadow chosen, Black Ash subclass, [+2,+2,-1,-1] array. */
window.CW_INITIAL = {
  step: 'class',
  name: 'Ash Vey',
  pronouns: 'they / them',
  controller: 'Mike',
  pack: 'lightning',
  sigil: 'AS',
  notes: "Quiet College apprentice, found their voice in someone else's grief.",

  ancestry: 'polder',
  culture: {
    environment: 'urban',
    organization: 'anarchic',
    upbringing: 'academic',
    languages: ['Caelian', 'Khoursirian', 'Variak'],
  },
  career: 'sage',
  inciting: 'Heard a thought that was not theirs in the silence after the avalanche.',

  classId: 'shadow',
  subclass: 'black-ash',
  arrayId: 'two-two',
  assign: { Might: null, Reason: null, Intuition: null, Presence: null }, // free chars after locked

  complication: 'bound-promise',
  kitId: 'shadow-blade',
};
