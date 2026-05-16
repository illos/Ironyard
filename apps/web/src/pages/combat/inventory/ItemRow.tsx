import type { InventoryEntry, Item, Participant } from '@ironyard/shared';
import { BodySlotConflictChip } from './BodySlotConflictChip';
import { UseConsumableButton } from './UseConsumableButton';

type Props = {
  entry: InventoryEntry;
  item: Item | undefined;
  onEquip: (id: string) => void;
  onUnequip: (id: string) => void;
  // Slice 2: consumables get a UseConsumableButton instead of Equip/Unequip.
  // `participants` is the non-self participant list passed through from the
  // active encounter so the picker can offer per-target buttons.
  participants: Participant[];
  onUse: (inventoryEntryId: string, targetParticipantId?: string) => void;
  conflictingSlots: Set<string>;
};

// Renders one inventory row. Orphan rows (unknown itemId) surface a warning so
// the player can see the data drift. Consumables render UseConsumableButton;
// non-consumables render Equip/Unequip. Trinket rows additionally render a
// BodySlotConflictChip when their body slot is shared with another equipped
// trinket.
export function ItemRow({
  entry,
  item,
  onEquip,
  onUnequip,
  participants,
  onUse,
  conflictingSlots,
}: Props) {
  if (!item) {
    return (
      <div className="border border-foe bg-ink-1 px-2 py-1 text-sm text-foe">
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
    <div className="flex items-center justify-between border border-line bg-ink-1 px-2 py-1 text-sm">
      <div>
        <span className="font-medium">{item.name}</span>
        {qtyLabel && <span className="text-text-dim">{qtyLabel}</span>}
        {isEquipped && <span className="ml-2 bg-accent text-ink-0 px-1 text-xs">Equipped</span>}
        {isTrinket && <BodySlotConflictChip conflicting={isConflicting} slot={trinketSlot ?? ''} />}
      </div>
      {isConsumable ? (
        <UseConsumableButton
          participants={participants}
          onUse={(targetId) => onUse(entry.id, targetId)}
        />
      ) : (
        <button
          type="button"
          onClick={() => (isEquipped ? onUnequip(entry.id) : onEquip(entry.id))}
          className="min-h-[44px] border border-line px-2 text-xs hover:bg-ink-2"
        >
          {isEquipped ? 'Unequip' : 'Equip'}
        </button>
      )}
    </div>
  );
}
