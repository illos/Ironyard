import type { TriggerEventDesc } from '@ironyard/shared';

export function formatTriggerEvent(
  ev: TriggerEventDesc,
  resolveParticipantName: (id: string) => string,
): string {
  switch (ev.kind) {
    case 'damage-applied': {
      const tName = resolveParticipantName(ev.targetId);
      const aName = ev.attackerId ? resolveParticipantName(ev.attackerId) : 'an effect';
      return `${tName} took ${ev.amount} ${ev.type} damage from ${aName}`;
    }
    case 'stamina-transition':
      return `${resolveParticipantName(ev.participantId)} transitioned from ${ev.from} to ${ev.to}`;
    case 'forced-movement':
      return `${resolveParticipantName(ev.targetId)} was forcibly moved ${ev.distance} squares`;
  }
}
