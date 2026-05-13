import type { InventoryEntry, Item } from '@ironyard/shared';

type Props = {
  entry: InventoryEntry;
  item: Item | undefined;
  onEquip: (id: string) => void;
  onUnequip: (id: string) => void;
};

// Renders one inventory row. Orphan rows (unknown itemId) surface a warning so
// the player can see the data drift; equip/unequip controls only render for
// non-consumable categories — consumables get a "Use" button in Slice 2.
export function ItemRow({ entry, item, onEquip, onUnequip }: Props) {
  if (!item) {
    return (
      <div className="rounded border border-rose-800/40 bg-rose-950/30 px-2 py-1 text-sm text-rose-300">
        Unknown item: {entry.itemId}
      </div>
    );
  }

  const isConsumable = item.category === 'consumable';
  const isEquipped = entry.equipped;
  const qtyLabel = isConsumable && entry.quantity > 1 ? ` ×${entry.quantity}` : '';

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
