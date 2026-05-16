import type { Character } from '@ironyard/shared';
import type { CanonSlug } from '../canon-status.generated';
import type { CharacterRuntime } from '../derive-character-runtime';
import { requireCanon } from '../require-canon';
import type { ResolvedKit } from '../static-data';
import type { AttachmentCondition, AttachmentEffect, CharacterAttachment } from './types';

export type ApplyCtx = {
  character: Character;
  kit: ResolvedKit | null;
};

export function applyAttachments(
  base: CharacterRuntime,
  attachments: CharacterAttachment[],
  ctx: ApplyCtx,
): CharacterRuntime {
  const out: CharacterRuntime = structuredClone(base);

  // Split direct recoveryValue mods so we can re-derive after maxStamina mods.
  const deferredRecoveryValueMods: CharacterAttachment[] = [];

  for (const att of attachments) {
    // requireCanonSlug is a plain string at the type level (carried by data
    // collectors) but the engine gate expects a CanonSlug. The runtime check
    // returns false for unknown slugs, so the cast is safe.
    if (att.source.requireCanonSlug && !requireCanon(att.source.requireCanonSlug as CanonSlug))
      continue;
    if (att.condition && !evaluateCondition(att.condition, ctx)) continue;
    if (att.effect.kind === 'stat-mod' && att.effect.stat === 'recoveryValue') {
      deferredRecoveryValueMods.push(att);
      continue;
    }
    applyEffect(out, att.effect, ctx);
  }

  // Re-derive recoveryValue *after* maxStamina mods, *before* direct mods.
  out.recoveryValue = Math.floor(out.maxStamina / 3);

  for (const att of deferredRecoveryValueMods) {
    applyEffect(out, att.effect, ctx);
  }

  // Dedupe array-valued fields.
  out.abilityIds = [...new Set(out.abilityIds)];
  out.skills = [...new Set(out.skills)];
  out.languages = [...new Set(out.languages)];
  // Phase 2b Group A+B (2b.5, 2b.8): new array-valued runtime fields.
  out.conditionImmunities = [...new Set(out.conditionImmunities)];
  out.skillEdges = [...new Set(out.skillEdges)];

  return out;
}

function evaluateCondition(cond: AttachmentCondition, ctx: ApplyCtx): boolean {
  switch (cond.kind) {
    case 'kit-has-keyword':
      return ctx.kit?.keywords?.includes(cond.keyword) ?? false;
    case 'item-equipped':
      return true; // collector pre-filters by inventory[i].equipped
  }
}

// Phase 2b Group A+B: extended to handle the `{ kind: 'level-plus', offset }`
// variant used by Polder Corruption Immunity. Backward-compatible with the
// existing number-or-'level' shape.
function resolveLevel(
  value: number | 'level' | { kind: 'level-plus'; offset: number },
  character: Character,
): number {
  if (typeof value === 'number') return value;
  if (value === 'level') return character.level;
  return character.level + value.offset; // level-plus
}

function applyEffect(out: CharacterRuntime, effect: AttachmentEffect, ctx: ApplyCtx): void {
  switch (effect.kind) {
    case 'stat-mod':
      (out as unknown as Record<string, number>)[effect.stat] =
        ((out as unknown as Record<string, number>)[effect.stat] ?? 0) + effect.delta;
      return;
    case 'stat-mod-echelon': {
      // Phase 2b Group A+B (2b.6): per-echelon stat-mod. Echelon index derived
      // from character.level per canon: 1-3 → 0, 4-6 → 1, 7-9 → 2, 10+ → 3.
      const lvl = ctx.character.level;
      const idx = lvl >= 10 ? 3 : lvl >= 7 ? 2 : lvl >= 4 ? 1 : 0;
      (out as unknown as Record<string, number>)[effect.stat] =
        ((out as unknown as Record<string, number>)[effect.stat] ?? 0) + effect.perEchelon[idx];
      return;
    }
    case 'stat-replace':
      (out as unknown as Record<string, number | string>)[effect.stat] = effect.value;
      return;
    case 'grant-ability':
      out.abilityIds.push(effect.abilityId);
      return;
    case 'grant-skill':
      out.skills.push(effect.skill);
      return;
    case 'grant-language':
      out.languages.push(effect.language);
      return;
    case 'grant-skill-edge':
      // Phase 2b Group A+B (2b.5): skill group edge for Wode + High Elf Glamors.
      // Consumed by skill rolls in slice 5 (later).
      out.skillEdges.push(effect.skillGroup);
      return;
    case 'immunity':
      out.immunities.push({
        kind: effect.damageKind,
        value: resolveLevel(effect.value, ctx.character),
      });
      return;
    case 'weakness':
      out.weaknesses.push({
        kind: effect.damageKind,
        value: resolveLevel(effect.value, ctx.character),
      });
      return;
    case 'condition-immunity':
      // Phase 2b Group A+B (2b.8): append; deduped below.
      out.conditionImmunities.push(effect.condition);
      return;
    case 'free-strike-damage':
      out.freeStrikeDamage += effect.delta;
      return;
    case 'weapon-damage-bonus': {
      // Slice 6 / Epic 2C § 10.8: sum per-tier bonuses across sources. Canon
      // §10.10 "only the higher applies" stacking for kit-keyword treasures
      // is deferred to a follow-up engine fix — see § 10.16 carry-overs.
      const slot = effect.appliesTo;
      const current = out.weaponDamageBonus[slot];
      out.weaponDamageBonus[slot] = [
        current[0] + effect.perTier[0],
        current[1] + effect.perTier[1],
        current[2] + effect.perTier[2],
      ];
      return;
    }
    case 'weapon-distance-bonus':
      // Phase 2b Group A+B (2b.3): kit-side weapon distance bonus.
      if (effect.appliesTo === 'melee') out.meleeDistanceBonus += effect.delta;
      else out.rangedDistanceBonus += effect.delta;
      return;
    case 'disengage-bonus':
      // Phase 2b Group A+B (2b.4): kit-side disengage bonus.
      out.disengageBonus += effect.delta;
      return;
  }
}
