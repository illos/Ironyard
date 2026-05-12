import { ANCESTRY_TRAIT_OVERRIDES } from '@ironyard/data';
import type { Character } from '@ironyard/shared';
import type { StaticDataBundle } from '../../static-data';
import type { CharacterAttachment } from '../types';

export function collectFromAncestry(
  character: Character,
  staticData: StaticDataBundle,
): CharacterAttachment[] {
  if (character.ancestryId === null) return [];

  // Revenant does not inherit former-ancestry immunities (canon).
  const ancestry = staticData.ancestries.get(character.ancestryId);
  if (!ancestry) return [];

  const out: CharacterAttachment[] = [];

  // requireCanonSlug omitted — Slice 6 adds canon entries for this category.
  for (const entry of ancestry.grantedImmunities ?? []) {
    out.push({
      source: {
        kind: 'ancestry-trait',
        id: `${character.ancestryId}.granted-immunity.${entry.kind}`,
      },
      effect: { kind: 'immunity', damageKind: entry.kind, value: entry.value },
    });
  }

  // Revenant's signature "Tough But Withered" trait grants four immunities
  // (handled via grantedImmunities above) AND a fire weakness of 5. The
  // grantedImmunities shape doesn't carry weaknesses, so emit it here.
  if (character.ancestryId === 'revenant') {
    out.push({
      source: {
        kind: 'ancestry-trait',
        id: 'revenant.tough-but-withered.fire-weakness',
      },
      effect: { kind: 'weakness', damageKind: 'fire', value: 5 },
    });
  }

  if (character.ancestryId === 'dragon-knight') {
    const { wyrmplateType, prismaticScalesType } = character.ancestryChoices;
    if (wyrmplateType !== null) {
      out.push({
        source: {
          kind: 'ancestry-trait',
          id: 'dragon-knight.wyrmplate',
        },
        effect: { kind: 'immunity', damageKind: wyrmplateType, value: 'level' },
      });
    }
    if (prismaticScalesType !== null) {
      out.push({
        source: {
          kind: 'ancestry-trait',
          id: 'dragon-knight.prismatic-scales',
        },
        effect: { kind: 'immunity', damageKind: prismaticScalesType, value: 'level' },
      });
    }
  }

  if (ancestry.signatureAbilityId) {
    out.push({
      source: {
        kind: 'ancestry-signature',
        id: `${character.ancestryId}.signature`,
      },
      effect: { kind: 'grant-ability', abilityId: ancestry.signatureAbilityId },
    });
  }

  // Purchased traits — consult ANCESTRY_TRAIT_OVERRIDES keyed by
  // `${ancestryId}.${traitId}`. Traits without an override are flavor-only
  // or have effects deferred per the override file's policy comments.
  for (const traitId of character.ancestryChoices.traitIds) {
    const key = `${character.ancestryId}.${traitId}`;
    const overrides = ANCESTRY_TRAIT_OVERRIDES[key];
    if (overrides) out.push(...overrides);
  }

  // Revenant's "Previous Life" purchased traits resolve to a trait id from
  // the FORMER ancestry. The traitIds array carries `previous-life-N-points`
  // placeholders, with the actual chosen trait ids living in
  // ancestryChoices.previousLifeTraitIds. We look them up against the
  // former ancestry's override key (`${formerAncestryId}.${traitId}`).
  if (character.ancestryId === 'revenant' && character.ancestryChoices.formerAncestryId !== null) {
    const formerId = character.ancestryChoices.formerAncestryId;
    for (const traitId of character.ancestryChoices.previousLifeTraitIds) {
      const key = `${formerId}.${traitId}`;
      const overrides = ANCESTRY_TRAIT_OVERRIDES[key];
      if (overrides) {
        // Re-attribute the source so the log shows the revenant-previous-
        // life origin rather than the bare former-ancestry trait.
        for (const att of overrides) {
          out.push({
            ...att,
            source: {
              ...att.source,
              id: `revenant.previous-life.${formerId}.${traitId}`,
            },
          });
        }
      }
    }
  }

  return out;
}
