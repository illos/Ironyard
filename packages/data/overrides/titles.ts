// Hand-authored title effect overrides.
//
// Coverage policy
// ───────────────────────────────────────────────────────────────────────────
// 2B Slice 5 shipped one canonical example per effect category (knight =
// stat-mod, zombie-slayer = grant-ability) to prove the title collector
// path worked end-to-end. 2C Slice 5 extends with the remaining titles
// whose chosen benefit is a clean static fold today.
//
// Coverage matrix: docs/superpowers/notes/2026-05-12-2c-slice-5-coverage.md
//
// ── Caveat: multi-choice titles ────────────────────────────────────────────
// Most v1 titles give the player a "choose one of the following benefits"
// menu. The character schema currently stores only `titleId` — there is no
// per-title benefit-selection field. The override entries below implicitly
// assume the player picked the modeled benefit; if they picked a different
// sub-benefit the runtime will over- or under-state the effect.
//
// Resolving this gap is tracked alongside the analogous level-pick issue:
// Q18 / § 10.13. The current modeling choice is to bias toward the headline
// benefit — for `knight` we model "Knightly Aegis" (+6 Stamina); for the
// granted-ability titles we emit the grant. Players who picked a different
// benefit can manually correct their sheet.
//
// requireCanonSlug per § 10.13 (verified): `title-grant-attachments`.

import type { TitleOverride } from './_types';

const SLUG = 'character-attachment-activation.title-grant-attachments';

export const TITLE_OVERRIDES: Record<string, TitleOverride> = {
  // ────────────────────────────────────────────────────────────────────────
  // stat-mod titles
  // ────────────────────────────────────────────────────────────────────────

  // Source: .reference/data-md/Rules/Titles/2nd Echelon/Knight.md L25
  //         "Knightly Aegis: Your Stamina maximum increases by 6."
  // Multi-choice menu (Heraldic Fame +1 Renown, Knightly Aegis +6 Stamina,
  // Knightly Challenge granted ability). We model Knightly Aegis as the
  // headline benefit. Heraldic Fame's Renown grant has no engine slot today;
  // Knightly Challenge's granted ability is alternative branch.
  knight: {
    attachments: [
      {
        source: { kind: 'title', id: 'knight', requireCanonSlug: SLUG },
        effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 6 },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Titles/3rd Echelon/Scarred.md L22.
  // "your Stamina maximum increases by 20". Unlike most titles this is NOT
  // a multi-choice menu — the +20 Stamina is unconditional (the rest of
  // the entry adds an enemy-debuff that we don't yet model).
  scarred: {
    attachments: [
      {
        source: { kind: 'title', id: 'scarred', requireCanonSlug: SLUG },
        effect: { kind: 'stat-mod', stat: 'maxStamina', delta: 20 },
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // grant-ability titles
  // ────────────────────────────────────────────────────────────────────────
  // Each grants a power-roll ability that the parser emitted into
  // titles.json under `grantsAbilityId`. The ability id strings below
  // match those emitted by the title parser — verified via
  //   node -e "const t=require('./apps/api/src/data/titles.json');
  //            t.filter(x=>x.grantsAbilityId).forEach(x=>console.log(x.id,x.grantsAbilityId))"

  // Source: .reference/data-md/Rules/Titles/1st Echelon/Zombie Slayer.md L24+
  //         "Holy Terror (3 Heroic Resource)" granted ability.
  // Multi-choice with Blessed Weapons (damage-type swap rider, no shape) and
  // Divine Health (corruption immunity = highest characteristic score, no
  // shape). We model the granted ability.
  'zombie-slayer': {
    attachments: [
      {
        source: { kind: 'title', id: 'zombie-slayer', requireCanonSlug: SLUG },
        effect: { kind: 'grant-ability', abilityId: 'zombie-slayer-holy-terror' },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Titles/1st Echelon/Ratcatcher.md
  //         "Come Out To Play (...)" granted ability.
  ratcatcher: {
    attachments: [
      {
        source: { kind: 'title', id: 'ratcatcher', requireCanonSlug: SLUG },
        effect: { kind: 'grant-ability', abilityId: 'ratcatcher-come-out-to-play' },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Titles/2nd Echelon/Arena Fighter.md
  //         "Showstopper (...)" granted ability.
  'arena-fighter': {
    attachments: [
      {
        source: { kind: 'title', id: 'arena-fighter', requireCanonSlug: SLUG },
        effect: { kind: 'grant-ability', abilityId: 'arena-fighter-showstopper' },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Titles/2nd Echelon/Battlefield Commander.md
  //         "Charge! (...)" granted ability.
  'battlefield-commander': {
    attachments: [
      {
        source: { kind: 'title', id: 'battlefield-commander', requireCanonSlug: SLUG },
        effect: { kind: 'grant-ability', abilityId: 'battlefield-commander-charge' },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Titles/2nd Echelon/Giant Slayer.md L25+
  //         "The Harder They Fall (7 Heroic Resource)" granted ability.
  // Multi-choice with Smallfolk Dodge (size-conditional bane on enemy
  // strikes; no shape today) and Up the Beanstalk (skill grant Climb;
  // could be authored as grant-skill but the title chooses between three).
  'giant-slayer': {
    attachments: [
      {
        source: { kind: 'title', id: 'giant-slayer', requireCanonSlug: SLUG },
        effect: { kind: 'grant-ability', abilityId: 'giant-slayer-the-harder-they-fall' },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Titles/2nd Echelon/Heist Hero.md
  //         "Timely Distraction (...)" granted ability.
  'heist-hero': {
    attachments: [
      {
        source: { kind: 'title', id: 'heist-hero', requireCanonSlug: SLUG },
        effect: { kind: 'grant-ability', abilityId: 'heist-hero-timely-distraction' },
      },
    ],
  },

  // Source: .reference/data-md/Rules/Titles/3rd Echelon/Maestro.md
  //         "The Devil's Chord (...)" granted ability.
  maestro: {
    attachments: [
      {
        source: { kind: 'title', id: 'maestro', requireCanonSlug: SLUG },
        effect: { kind: 'grant-ability', abilityId: 'maestro-the-devil-s-chord' },
      },
    ],
  },
};
