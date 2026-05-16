// Hand-authored ancestry purchased-trait attachment overrides.
//
// Keyed by `${ancestryId}.${traitId}` (the trait id is the slug emitted by
// parse-ancestry.ts — see e.g. "staying-power", "beast-legs"). When a
// character's `ancestryChoices.traitIds` includes a trait, the collector
// pulls the matching attachments here and folds them into the runtime.
//
// Coverage policy (Slice 4 of Phase 2 Epic 2B):
//   - Skill grants → `grant-skill`
//   - Language grants → `grant-language` (no ancestry traits grant languages
//     in v1; entry kept for future use)
//   - Stat bonuses (Stamina, recoveries, speed, stability) → `stat-mod`
//   - Immunity grants → `immunity`
//   - Ability grants (signature trait abilities from traits like Dragon Breath,
//     Psionic Bolt, etc.) → `grant-ability` — DEFERRED. The wizard's level
//     picks don't currently surface ability ids for purchasable signature
//     abilities, and the ability data has no canon slug yet. Re-visit in
//     Slice 6 when canon entries land.
//   - Conditional effects ("while wearing armor", "when wounded",
//     "while flying") → SKIPPED-DEFERRED — current AttachmentCondition
//     shape only models `kit-has-keyword` / `item-equipped`.
//   - Flavor / edge-on-test / triggered-action-only effects → no entry.
//     These remain prose-only on the trait card.
//
// requireCanonSlug is intentionally omitted on every entry here — Slice 6
// adds canon entries for these effect categories. Setting an unverified
// slug now would silently skip the attachment via the requireCanon gate.

import type { CharacterAttachment } from '@ironyard/shared';

export const ANCESTRY_TRAIT_OVERRIDES: Record<string, CharacterAttachment[]> = {
  // ── Human ────────────────────────────────────────────────────────────────
  // "Staying Power (2 Points)": +2 Recoveries.
  'human.staying-power': [
    {
      source: { kind: 'ancestry-trait', id: 'human.staying-power' },
      effect: { kind: 'stat-mod', stat: 'recoveriesMax', delta: 2 },
    },
  ],
  // SKIPPED-DEFERRED — Perseverance (1pt): "while slowed, speed=3 instead of
  //   2" is a conditional effect we can't model statelessly.
  // SKIPPED-DEFERRED — Can't Take Hold, Determination, Resist the
  //   Unnatural: triggered-action / conditional reaction effects.

  // ── Devil ───────────────────────────────────────────────────────────────
  // "Beast Legs (1 Point)": speed 6 → +1 over baseline 5.
  'devil.beast-legs': [
    {
      source: { kind: 'ancestry-trait', id: 'devil.beast-legs' },
      effect: { kind: 'stat-mod', stat: 'speed', delta: 1 },
    },
  ],
  // SKIPPED-DEFERRED — Wings (2pts): conditional (only while flying);
  //   weakness 5 at level <=3 is also level-conditional in a shape we
  //   don't yet model.
  // SKIPPED-DEFERRED — Barbed Tail, Glowing Eyes, Hellsight, Impressive
  //   Horns, Prehensile Tail: triggered-action / saving-throw / strike-math
  //   effects that don't fold into static runtime stats.

  // ── Dragon Knight ───────────────────────────────────────────────────────
  // Wyrmplate (signature) and Prismatic Scales (purchased) are already
  // handled by collectFromAncestry's special-cased ancestryChoices logic.
  // SKIPPED-DEFERRED — Draconian Guard (1pt): triggered-action damage
  //   reduction, not a static runtime stat.
  // SKIPPED-DEFERRED — Draconian Pride / Dragon Breath (2pts each):
  //   ability grants; deferred until canon entries land in Slice 6.
  // SKIPPED-DEFERRED — Remember Your Oath, Wings: conditional /
  //   maneuver-activated effects.

  // ── Dwarf ───────────────────────────────────────────────────────────────
  // "Grounded (1 Point)": +1 stability.
  'dwarf.grounded': [
    {
      source: { kind: 'ancestry-trait', id: 'dwarf.grounded' },
      effect: { kind: 'stat-mod', stat: 'stability', delta: 1 },
    },
  ],
  // "Spark Off Your Skin (2 Points)": +6 Stamina, +6 more at 4th, 7th, 10th.
  // Canon: Dwarf.md:149 / heroes-flat.txt:2940-2943.
  // Uses the stat-mod-echelon variant landed in Phase 2b Group A+B slice 1
  // (tuple = [L1, L4, L7, L10]).
  'dwarf.spark-off-your-skin': [
    {
      source: { kind: 'ancestry-trait', id: 'dwarf.spark-off-your-skin' },
      effect: { kind: 'stat-mod-echelon', stat: 'maxStamina', perEchelon: [6, 12, 18, 24] },
    },
  ],
  // "Great Fortitude": immune to the Weakened condition.
  // Phase 2b slice 2: shipped via the condition-immunity attachment kind;
  // engine reads via isImmuneToCondition + StartEncounter snapshot.
  'dwarf.great-fortitude': [
    {
      source: { kind: 'ancestry-trait', id: 'dwarf.great-fortitude' },
      effect: { kind: 'condition-immunity', condition: 'Weakened' },
    },
  ],
  // SKIPPED-DEFERRED — Stand Tough (potency-resistance math, edge-on-test),
  //   Stone Singer (out-of-combat utility).

  // ── Hakaan ──────────────────────────────────────────────────────────────
  // Signature "Big!" trait already handled by ANCESTRY_OVERRIDES.defaultSize.
  // SKIPPED-DEFERRED — Doomsight, Forceful, Great Fortitude, Stand Tough,
  //   All Is a Feather: conditional / edge-on-test / save-modifier / one-shot
  //   doom effects, none flat-stat.

  // ── High Elf ────────────────────────────────────────────────────────────
  // "Unstoppable Mind": immune to the Dazed condition.
  // Phase 2b slice 2: shipped via the condition-immunity attachment kind.
  'high-elf.unstoppable-mind': [
    {
      source: { kind: 'ancestry-trait', id: 'high-elf.unstoppable-mind' },
      effect: { kind: 'condition-immunity', condition: 'Dazed' },
    },
  ],
  // SKIPPED-DEFERRED — Glamor of Terror, Otherworldly Grace: triggered-action /
  //   save-modifier effects not yet modellable.
  // SKIPPED-DEFERRED — Graceful Retreat: +1 shift distance on Disengage is
  //   a move-action-specific modifier; not a base speed change.
  // SKIPPED-DEFERRED — High Senses, Revisit Memory: edge-on-test only.

  // ── Memonek ─────────────────────────────────────────────────────────────
  // Signature "Fall Lightly" + "Lightweight" already prose-only.
  // "Lightning Nimbleness (2 Points)": speed 7 → +2 over baseline 5.
  'memonek.lightning-nimbleness': [
    {
      source: { kind: 'ancestry-trait', id: 'memonek.lightning-nimbleness' },
      effect: { kind: 'stat-mod', stat: 'speed', delta: 2 },
    },
  ],
  // SKIPPED-DEFERRED — Useful Emotion (1pt): "at the start of any combat,
  //   gain 1 surge" — surges are an encounter-time resource, not a runtime
  //   stat. The intent reducer will handle this at encounter start, not
  //   the static derivation pass.
  // "Nonstop": immune to the Slowed condition.
  // Phase 2b slice 2: shipped via the condition-immunity attachment kind.
  'memonek.nonstop': [
    {
      source: { kind: 'ancestry-trait', id: 'memonek.nonstop' },
      effect: { kind: 'condition-immunity', condition: 'Slowed' },
    },
  ],
  // Memonek "Unphased" (immunity to the surprised *flag*, not a ConditionType)
  // is NOT shipped via condition-immunity. The Surprised state is a boolean on
  // Participant (`participant.surprised`), so MarkSurprised / RollInitiative
  // gate via a direct purchasedTraits check instead. If a typed flag-immunity
  // helper grows in a future slice, generalize there.
  // SKIPPED-DEFERRED — Keeper of Order, I Am Law, Systematic Mind: triggered-
  //   reaction / edge-on-test / "can't be moved through" effects, none flat-stat.

  // ── Orc ─────────────────────────────────────────────────────────────────
  // "Grounded (1 Point)": +1 stability — same as Dwarf's Grounded.
  'orc.grounded': [
    {
      source: { kind: 'ancestry-trait', id: 'orc.grounded' },
      effect: { kind: 'stat-mod', stat: 'stability', delta: 1 },
    },
  ],
  // SKIPPED-DEFERRED — Bloodfire Rush (1pt): conditional (+2 speed only on
  //   the round you take damage). Not yet modellable.
  // "Nonstop": immune to the Slowed condition.
  // Phase 2b slice 2: shipped via the condition-immunity attachment kind.
  'orc.nonstop': [
    {
      source: { kind: 'ancestry-trait', id: 'orc.nonstop' },
      effect: { kind: 'condition-immunity', condition: 'Slowed' },
    },
  ],
  // SKIPPED-DEFERRED — Glowing Recovery, Passionate Artisan:
  //   maneuver-modifier / project-roll-bonus.

  // ── Polder ──────────────────────────────────────────────────────────────
  // Signature "Small!" already handled by ANCESTRY_OVERRIDES.defaultSize.
  // "Corruption Immunity (1 Point)": corruption immunity = level + 2.
  // Canon: Polder.md:161 / heroes-flat.txt:3919-3924.
  // Uses the level-plus variant of immunity.value landed in Phase 2b
  // Group A+B slice 1.
  'polder.corruption-immunity': [
    {
      source: { kind: 'ancestry-trait', id: 'polder.corruption-immunity' },
      effect: {
        kind: 'immunity',
        damageKind: 'corruption',
        value: { kind: 'level-plus', offset: 2 },
      },
    },
  ],
  // "Fearless": immune to the Frightened condition.
  // Phase 2b slice 2: shipped via the condition-immunity attachment kind.
  'polder.fearless': [
    {
      source: { kind: 'ancestry-trait', id: 'polder.fearless' },
      effect: { kind: 'condition-immunity', condition: 'Frightened' },
    },
  ],
  // SKIPPED-DEFERRED — Nimblestep, Polder Geist, Reactive Tumble,
  //   Graceful Retreat: movement-modifier / triggered-reaction effects,
  //   none flat-stat.

  // ── Revenant ────────────────────────────────────────────────────────────
  // Signature trait grants four immunities (cold/corruption/lightning/poison
  // = level) and fire weakness 5. These are picked up by the existing
  // grantedImmunities path in ANCESTRY_OVERRIDES once that key is populated
  // — see TODO in the parse-ancestry follow-up. For now, encode them here
  // as ancestry-signature attachments so the runtime is correct even with
  // ANCESTRY_OVERRIDES.revenant.grantedImmunities still empty.
  //
  // Implementation note: collectFromAncestry already emits grantedImmunities,
  // so we leave this empty here and instead populate the override map
  // (ancestries.ts) — see follow-up edit below.
  //
  // Purchased traits:
  // "Bloodless": immune to the Bleeding condition (and can't be made bleeding
  // even while dying — see stamina.ts dying-side-effect suppression which now
  // reads conditionImmunities via the isImmuneToCondition helper).
  // Phase 2b slice 2: shipped via the condition-immunity attachment kind.
  'revenant.bloodless': [
    {
      source: { kind: 'ancestry-trait', id: 'revenant.bloodless' },
      effect: { kind: 'condition-immunity', condition: 'Bleeding' },
    },
  ],
  // SKIPPED-DEFERRED — Undead Influence, Vengeance Mark:
  //   edge-on-test / ability-grant (deferred per above policy).
  // Previous Life traits resolve to the FORMER ancestry's traits — handled
  // by previousLifeTraitIds in ancestryChoices, which the collector should
  // also consult. See follow-up enhancement in collectFromAncestry.

  // ── Time Raider ─────────────────────────────────────────────────────────
  // Signature "Psychic Scar" already handled by ANCESTRY_OVERRIDES.
  // SKIPPED-DEFERRED — Beyondsight, Foresight, Four-Armed Athletics,
  //   Four-Armed Martial Arts, Psionic Gift, Unstoppable Mind: maneuver /
  //   triggered-action / edge-on-test / ability-grant / condition-immunity
  //   effects. None flat-stat.

  // ── Wode Elf ────────────────────────────────────────────────────────────
  // "Swift (1 Point)": speed 6 → +1 over baseline 5.
  'wode-elf.swift': [
    {
      source: { kind: 'ancestry-trait', id: 'wode-elf.swift' },
      effect: { kind: 'stat-mod', stat: 'speed', delta: 1 },
    },
  ],
  // SKIPPED-DEFERRED — Forest Walk, Quick and Brutal, Otherworldly Grace,
  //   Revisit Memory, The Wode Defends (ability grant): movement-conditional
  //   / triggered-action / save-modifier / edge-on-test / ability-grant.
};
