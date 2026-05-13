// Surfaces a warning when two equipped trinkets share the same body slot.
// Conflict is a UX hint only — the engine does not block equip in Slice 1.
// `conflicting` is computed by InventoryPanel from the equipped trinket set.

type Props = {
  conflicting: boolean;
  slot: string;
};

export function BodySlotConflictChip({ conflicting, slot }: Props) {
  if (!conflicting) return null;
  return (
    <span
      className="ml-2 rounded bg-amber-900/40 px-1 text-xs text-amber-300"
      title={`Two trinkets equipped to ${slot}; only one can apply.`}
    >
      Slot conflict: {slot}
    </span>
  );
}
