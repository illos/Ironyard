import type { InventoryEntry, Item } from '@ironyard/shared';
import { ItemRow } from './ItemRow';

type Row = { entry: InventoryEntry; item: Item | undefined };
type Props = {
  title: string;
  rows: Row[];
  onEquip: (id: string) => void;
  onUnequip: (id: string) => void;
  // Body slots where two or more equipped trinkets share a slot. Passed down
  // from InventoryPanel so ItemRow can render BodySlotConflictChip without
  // recomputing the set per row.
  conflictingSlots: Set<string>;
};

// Per-category wrapper. Returns null when empty so the panel doesn't render a
// hollow section header for categories the character doesn't own.
export function InventorySection({ title, rows, onEquip, onUnequip, conflictingSlots }: Props) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1">
      <h4 className="text-xs uppercase tracking-wide text-neutral-500">{title}</h4>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.entry.id}>
            <ItemRow
              entry={r.entry}
              item={r.item}
              onEquip={onEquip}
              onUnequip={onUnequip}
              conflictingSlots={conflictingSlots}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
