import type { Character, Item } from '@ironyard/shared';
import { InventorySection } from './InventorySection';

type Props = {
  character: Character;
  items: Item[];
  onEquip: (inventoryEntryId: string) => void;
  onUnequip: (inventoryEntryId: string) => void;
};

// Partition the character's inventory entries by item category. Orphan rows
// (itemId not present in the static-data bundle) fall into a dedicated bucket
// so they're surfaced rather than silently dropped — useful when ingest drifts
// or a homebrew item is removed.
function partition(character: Character, items: Item[]) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const rows = character.inventory.map((entry) => ({ entry, item: byId.get(entry.itemId) }));
  return {
    artifacts: rows.filter((r) => r.item?.category === 'artifact'),
    leveled: rows.filter((r) => r.item?.category === 'leveled-treasure'),
    trinkets: rows.filter((r) => r.item?.category === 'trinket'),
    consumables: rows.filter((r) => r.item?.category === 'consumable'),
    orphans: rows.filter((r) => r.item === undefined),
  };
}

export function InventoryPanel({ character, items, onEquip, onUnequip }: Props) {
  const { artifacts, leveled, trinkets, consumables, orphans } = partition(character, items);
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-neutral-300">Inventory</h3>
      <InventorySection
        title="Artifacts"
        rows={artifacts}
        onEquip={onEquip}
        onUnequip={onUnequip}
      />
      <InventorySection
        title="Leveled Treasures"
        rows={leveled}
        onEquip={onEquip}
        onUnequip={onUnequip}
      />
      <InventorySection title="Trinkets" rows={trinkets} onEquip={onEquip} onUnequip={onUnequip} />
      <InventorySection
        title="Consumables"
        rows={consumables}
        onEquip={onEquip}
        onUnequip={onUnequip}
      />
      <InventorySection title="Unknown" rows={orphans} onEquip={onEquip} onUnequip={onUnequip} />
    </section>
  );
}
