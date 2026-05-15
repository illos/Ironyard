import type { Participant } from '@ironyard/shared';

type PickAffordance =
  | { kind: 'self'; onClick: () => void; label: string }
  | { kind: 'other'; onClick: () => void; label: string }
  | { kind: 'foe-tap'; onClick: () => void };

export function derivePickAffordance(args: {
  participant: Participant;
  currentPickingSide: 'heroes' | 'foes' | null;
  acted: string[];
  viewerId: string | null;
  isActingAsDirector: boolean;
  onPick: () => void;
}): PickAffordance | null {
  const { participant, currentPickingSide, acted, viewerId, isActingAsDirector, onPick } = args;
  if (!currentPickingSide) return null;
  if (acted.includes(participant.id)) return null;
  const side = participant.kind === 'pc' ? 'heroes' : 'foes';
  if (side !== currentPickingSide) return null;

  if (side === 'heroes') {
    if (participant.ownerId && participant.ownerId === viewerId) {
      return { kind: 'self', onClick: onPick, label: "I'LL GO NOW" };
    }
    if (isActingAsDirector) {
      return { kind: 'other', onClick: onPick, label: 'Pick for them' };
    }
    return null;
  }

  // foes
  if (isActingAsDirector) {
    return { kind: 'foe-tap', onClick: onPick };
  }
  return null;
}
