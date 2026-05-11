import type {
  ExtraResourceInstance,
  HeroicResourceInstance,
  Participant,
  ResourceRef,
} from '@ironyard/shared';

// Slice 7: shared helpers for the resource intent handlers. The reducer
// resolves a `ResourceRef` to either the heroicResources[] slot or the
// extras[] slot, then applies floor/ceiling rules per canon §5.4.9. The
// helpers below are pure and used by GainResource/SpendResource/SetResource.

export type ResolvedResource =
  | { kind: 'heroic'; instance: HeroicResourceInstance; index: number }
  | { kind: 'extra'; instance: ExtraResourceInstance; index: number };

export function resolveResource(
  participant: Participant,
  ref: ResourceRef,
): ResolvedResource | undefined {
  if (typeof ref === 'string') {
    const index = participant.heroicResources.findIndex((r) => r.name === ref);
    if (index === -1) return undefined;
    const instance = participant.heroicResources[index];
    if (!instance) return undefined;
    return { kind: 'heroic', instance, index };
  }
  const index = participant.extras.findIndex((r) => r.name === ref.extra);
  if (index === -1) return undefined;
  const instance = participant.extras[index];
  if (!instance) return undefined;
  return { kind: 'extra', instance, index };
}

export function refLabel(ref: ResourceRef): string {
  return typeof ref === 'string' ? ref : ref.extra;
}

// Replace one heroic-resource instance immutably in the participant.
export function updateHeroic(
  participant: Participant,
  index: number,
  next: HeroicResourceInstance,
): Participant {
  return {
    ...participant,
    heroicResources: participant.heroicResources.map((r, i) => (i === index ? next : r)),
  };
}

export function updateExtra(
  participant: Participant,
  index: number,
  next: ExtraResourceInstance,
): Participant {
  return {
    ...participant,
    extras: participant.extras.map((r, i) => (i === index ? next : r)),
  };
}

export function appendHeroic(participant: Participant, next: HeroicResourceInstance): Participant {
  return { ...participant, heroicResources: [...participant.heroicResources, next] };
}

export function appendExtra(participant: Participant, next: ExtraResourceInstance): Participant {
  return { ...participant, extras: [...participant.extras, next] };
}
