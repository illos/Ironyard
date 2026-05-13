import type { InventoryEntry, Item } from '@ironyard/shared';
import { BodySlotConflictChip } from './BodySlotConflictChip';

type Props = {
  entry: InventoryEntry;
  item: Item | undefined;
  onEquip: (id: string) => void;
  onUnequip: (id: string) => void;
  conflictingSlots: Set<string>;
};

// Renders one inventory row. Orphan rows (unknown itemId) surface a warning so
// the player can see the data drift; equip/unequip controls only render for
// non-consumable categories — consumables get a "Use" button in Slice 2.
// Trinket rows additionally render a BodySlotConflictChip when their body slot
// is shared with another equipped trinket.
export function ItemRow({ entry, item, onEquip, onUnequip, conflictingSlots }: Props) {
  if (!item) {
    return (
      <div className="rounded border border-rose-800/40 bg-rose-950/30 px-2 py-1 text-sm text-rose-300">
        Unknown item: {entry.itemId}
      </div>
    );
  }

  const isConsumable = item.category === 'consumable';
  const isTrinket = item.category === 'trinket';
  const isEquipped = entry.equipped;
  const qtyLabel = isConsumable && entry.quantity > 1 ? ` ×${entry.quantity}` : '';
  // Only trinkets carry a bodySlot; chip stays hidden for other categories.
  const trinketSlot = isTrinket ? item.bodySlot : null;
  const isConflicting = isEquipped && !!trinketSlot && conflictingSlots.has(trinketSlot);

  return (
    <div className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm">
      <div>
        <span className="font-medium">{item.name}</span>
        {qtyLabel && <span className="text-neutral-400">{qtyLabel}</span>}
        {isEquipped && (
          <span className="ml-2 rounded bg-emerald-900/40 px-1 text-xs text-emerald-300">
            Equipped
          </span>
        )}
        {isTrinket && <BodySlotConflictChip conflicting={isConflicting} slot={trinketSlot ?? ''} />}
      </div>
      {!isConsumable && (
        <button
          type="button"
          onClick={() => (isEquipped ? onUnequip(entry.id) : onEquip(entry.id))}
          className="min-h-[44px] rounded border border-neutral-700 px-2 text-xs hover:bg-neutral-800"
        >
          {isEquipped ? 'Unequip' : 'Equip'}
        </button>
      )}
    </div>
  );
}
