/* Character data for Ash — Mike's Talent · Telepath
   Draw Steel characteristics, kit, conditions, skills, abilities. */

window.CS_CHARACTER = {
  id: 'ash',
  name: 'Ash Vey',
  pronouns: 'they / them',
  controller: 'Mike',
  pack: 'lightning',
  sigil: 'AS',
  level: 3,
  victories: 2,
  xp: 8,
  xpToNext: 24,
  wealth: 14,
  renown: 1,
  ancestry: 'Polder',
  class: 'Talent',
  subclass: 'Telepath',
  career: 'Sage',
  culture: {
    environment: 'Urban',
    organization: 'Anarchic',
    upbringing: 'Academic',
    languages: ['Caelian', 'Khoursirian', 'Variak'],
  },
  complication: 'Bound Promise — must answer any direct question truthfully.',
  inciting: 'Heard a thought that was not theirs in the silence after the avalanche.',
  // Characteristics — score from -2 to +5
  chars: [
    { k: 'Might', short: 'MGT', v: 0, locked: false },
    { k: 'Agility', short: 'AGL', v: 1, locked: false },
    { k: 'Reason', short: 'RSN', v: 2, locked: true, source: 'Talent' },
    { k: 'Intuition', short: 'INT', v: 2, locked: true, source: 'Talent' },
    { k: 'Presence', short: 'PRS', v: 0, locked: false },
  ],
  // Body & combat stats (post-kit application)
  stats: {
    size: '1M',
    speed: 5,
    disengage: 1,
    stability: 0,
    meleeDist: 1,
    rangedDist: 10,
    meleeBonus: '+0',
    rangedBonus: '+0',
  },
  stamina: { current: 31, max: 48, temporary: 0, winded: 24 },
  recoveries: { current: 6, max: 8, value: 12 },
  // Heroic resource — Talent uses Clarity
  resource: { name: 'Clarity', short: 'CLA', current: 4, max: 10 },
  heroTokens: 2,
  surges: 1,
  potency: { weak: 0, average: 1, strong: 2 },
  conditions: [
    // (none right now — empty state shown in UI)
  ],
  // Equipment / Kit
  kit: {
    name: 'Mindwalker',
    weapon: 'Whisperblade (Light · Energized)',
    armor: 'Reinforced Cloth',
    notes: 'Kit grants +1 Stability, +1 Ranged distance.',
  },
  // Skills owned (the rest are listed but unchecked)
  skills: {
    Crafting: ['Alchemy'],
    Exploration: ['Climb', 'Navigate'],
    Interpersonal: ['Empathize', 'Read Person', 'Lie'],
    Intrigue: ['Alertness', 'Eavesdrop'],
    Lore: ['Magic', 'Psionics', 'Society'],
  },
  // Titles / Trinkets / Leveled / Consumables
  trinkets: ['Pewter compass (always points to the loudest mind)'],
  titles: ['Apprentice of the Quiet College'],
  consumables: ['Restorative Tincture ×2', 'Smoke vial ×1'],
  treasures: [
    {
      name: 'Mindweave Cord',
      slot: 'Worn · Neck',
      body: 'Once per encounter, may use Clarity in place of a Hero Token for a single roll.',
    },
  ],
  // Abilities — main game-loop content
  abilities: [
    {
      id: 'rebuke',
      category: 'signature',
      action: 'Main',
      cost: null,
      name: 'Mind Spike',
      keywords: ['Magic', 'Psionic', 'Ranged'],
      distance: 'Ranged 10',
      target: '1 creature',
      roll: { stat: 'RSN', mod: '+5', vs: 'I' /* Intuition */ },
      tiers: [
        { range: '≤11', out: '3 psychic' },
        { range: '12–16', out: '6 psychic · push 1' },
        { range: '17+', out: '9 psychic · push 2 · Dazed (EoT)' },
      ],
      effect: null,
    },
    {
      id: 'intrude',
      category: 'signature',
      action: 'Maneuver',
      cost: null,
      name: 'Listen In',
      keywords: ['Magic', 'Psionic'],
      distance: 'Ranged 5',
      target: '1 willing or unaware creature',
      effect:
        'You learn one surface thought. If the target is unaware, you have edge on your next test against them this encounter.',
      roll: null,
    },
    {
      id: 'shieldmind',
      category: 'signature',
      action: 'Triggered',
      cost: null,
      name: 'Shielded Mind',
      keywords: ['Magic', 'Psionic'],
      trigger: 'An ally within 10 takes psychic damage or is forced to make an Intuition save.',
      effect:
        'Reduce that damage by 5 or grant edge on the save. Cannot be triggered again this round.',
    },
    {
      id: 'cascade',
      category: 'heroic',
      action: 'Main',
      cost: 3,
      name: 'Cascade',
      keywords: ['Magic', 'Psionic', 'Area'],
      distance: 'Burst 2',
      target: 'Each enemy in the burst',
      roll: { stat: 'RSN', mod: '+5', vs: 'I' },
      tiers: [
        { range: '≤11', out: '4 psychic' },
        { range: '12–16', out: '7 psychic · Slowed (EoT)' },
        { range: '17+', out: '10 psychic · Slowed · Dazed (save)' },
      ],
    },
    {
      id: 'overspeak',
      category: 'heroic',
      action: 'Main',
      cost: 5,
      name: 'Overspeak',
      keywords: ['Magic', 'Psionic'],
      distance: 'Ranged 10',
      target: '1 creature',
      roll: { stat: 'RSN', mod: '+5', vs: 'I' },
      tiers: [
        {
          range: '≤11',
          out: '6 psychic · target uses its reaction next round on a target you name',
        },
        { range: '12–16', out: '10 psychic · Taunted by you (EoE)' },
        {
          range: '17+',
          out: '14 psychic · target makes one strike against an ally of your choice as a free action',
        },
      ],
    },
    {
      id: 'freestrike',
      category: 'free',
      action: 'Main',
      cost: null,
      name: 'Whisperblade Strike',
      keywords: ['Strike', 'Weapon'],
      distance: 'Melee 1',
      target: '1 creature',
      roll: { stat: 'AGL', mod: '+1', vs: 'Stamina' },
      tiers: [
        { range: '≤11', out: '2 damage' },
        { range: '12–16', out: '4 damage' },
        { range: '17+', out: '6 damage' },
      ],
    },
  ],
  // Class features + ancestry perks + subclass
  features: [
    {
      group: 'Class · Talent',
      items: [
        {
          name: 'Clarity',
          body: 'Earn 2 Clarity at the start of each encounter and 1 each time you take damage. Spend Clarity to fuel Heroic abilities (cost shown on the card).',
        },
        {
          name: 'Psionic Reservoir',
          body: 'When you crit on a psionic ability, gain 1 Clarity (max 10).',
        },
      ],
    },
    {
      group: 'Subclass · Telepath',
      items: [
        {
          name: 'Open Channel',
          body: 'You may use Listen In on a willing ally at any range while on the same plane, no action required.',
        },
        {
          name: 'Echo',
          body: 'Once per encounter, when an enemy crits you, force them to re-roll using their lower die.',
        },
      ],
    },
    {
      group: 'Ancestry · Polder',
      items: [
        {
          name: 'Small but Stubborn',
          body: 'Edge on saves against being knocked prone or pushed.',
        },
        {
          name: 'Slipshadow',
          body: 'You may treat any creature one size larger than you as cover.',
        },
      ],
    },
  ],
};

window.CS_CONDITIONS_ALL = [
  { name: 'bleeding', glyph: '◊' },
  { name: 'dazed', glyph: '◌' },
  { name: 'frightened', glyph: '❢' },
  { name: 'grabbed', glyph: '⊕' },
  { name: 'prone', glyph: '▼' },
  { name: 'restrained', glyph: '⊗' },
  { name: 'slowed', glyph: '≈' },
  { name: 'taunted', glyph: '✕' },
  { name: 'weakened', glyph: '↓' },
  { name: 'hidden', glyph: '◐' },
];

// Skill list mirrors PDF — used to render unchecked skills as muted.
window.CS_SKILL_LIST = {
  Crafting: [
    'Alchemy',
    'Architecture',
    'Blacksmithing',
    'Carpentry',
    'Cooking',
    'Fletching',
    'Forgery',
    'Jewelry',
    'Mechanics',
    'Tailoring',
  ],
  Exploration: [
    'Climb',
    'Drive',
    'Endurance',
    'Gymnastics',
    'Heal',
    'Jump',
    'Lift',
    'Navigate',
    'Ride',
    'Swim',
  ],
  Interpersonal: [
    'Brag',
    'Empathize',
    'Flirt',
    'Gamble',
    'Handle Animals',
    'Interrogate',
    'Intimidate',
    'Lead',
    'Lie',
    'Music',
    'Perform',
    'Persuade',
    'Read Person',
  ],
  Intrigue: [
    'Alertness',
    'Conceal Object',
    'Disguise',
    'Eavesdrop',
    'Escape Artist',
    'Hide',
    'Pick Lock',
    'Pick Pocket',
    'Sabotage',
    'Search',
    'Sneak',
    'Track',
  ],
  Lore: [
    'Culture',
    'Criminal Und.',
    'History',
    'Magic',
    'Monsters',
    'Nature',
    'Psionics',
    'Religion',
    'Rumors',
    'Society',
    'Strategy',
    'Timescape',
  ],
};

// Recent activity (light log — last few sessions / saves)
window.CS_LOG = [
  { who: 'Mike → Ash', txt: 'Spent 1 Hero Token to reroll an Intuition save in S07.', t: '2d ago' },
  { who: 'Director', txt: 'Granted Apprentice of the Quiet College title.', t: 'S06' },
  { who: 'Mike → Ash', txt: 'Advanced to Level 3 · gained Cascade.', t: 'S05' },
  { who: 'Mike → Ash', txt: "Took Mindweave Cord from the captain's hoard.", t: 'S04' },
];
