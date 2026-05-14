import type { Participant } from '@ironyard/shared';
import { useState } from 'react';

type Props = {
  // Other-than-self participants in the active encounter. Self gets its own
  // button at the top of the picker — passing the self participant in here
  // would just duplicate it.
  participants: Participant[];
  // Called with `undefined` for the Self branch (matches the optional
  // `targetParticipantId` on UseConsumablePayloadSchema, where omitted means
  // "the character's own participant").
  onUse: (targetParticipantId?: string) => void;
};

// Two-state inline picker for the Use action on a consumable inventory row.
// Collapsed: a single "Use" button matching the Equip/Unequip affordance on
// non-consumable rows. Expanded: a Self button + one button per non-self
// participant + Cancel. Click on a target collapses the picker again so the
// row never holds expanded state across a successful dispatch.
//
// No jsdom + testing-library in this repo yet; the spec only asserts the
// collapsed render. Click-to-expand coverage is deferred to whenever the
// project gains an interaction test framework (same pattern as SwapKitModal).
export function UseConsumableButton({ participants, onUse }: Props) {
  const [picking, setPicking] = useState(false);

  if (!picking) {
    return (
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="min-h-[44px] border border-line px-2 text-xs hover:bg-ink-2"
      >
        Use
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-xs text-text-dim">Target:</div>
      <button
        type="button"
        onClick={() => {
          onUse(undefined);
          setPicking(false);
        }}
        className="block min-h-[44px] w-full bg-ink-2 px-2 text-xs hover:bg-ink-3"
      >
        Self
      </button>
      {participants.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => {
            onUse(p.id);
            setPicking(false);
          }}
          className="block min-h-[44px] w-full bg-ink-2 px-2 text-xs hover:bg-ink-3"
        >
          {p.name}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setPicking(false)}
        className="min-h-[44px] text-xs text-text-mute hover:text-text-dim"
      >
        Cancel
      </button>
    </div>
  );
}
