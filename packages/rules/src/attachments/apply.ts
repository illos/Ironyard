import type { Character } from '@ironyard/shared';
import type { CanonSlug } from '../canon-status.generated';
import type { CharacterRuntime } from '../derive-character-runtime';
import { requireCanon } from '../require-canon';
import type { ResolvedKit } from '../static-data';
import type {
  AttachmentCondition,
  AttachmentEffect,
  CharacterAttachment,
} from './types';

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
    if (
      att.source.requireCanonSlug &&
      !requireCanon(att.source.requireCanonSlug as CanonSlug)
    )
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

function resolveLevel(value: number | 'level', character: Character): number {
  return value === 'level' ? character.level : value;
}

function applyEffect(out: CharacterRuntime, effect: AttachmentEffect, ctx: ApplyCtx): void {
  switch (effect.kind) {
    case 'stat-mod':
      (out as unknown as Record<string, number>)[effect.stat] =
        ((out as unknown as Record<string, number>)[effect.stat] ?? 0) + effect.delta;
      return;
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
  }
}
