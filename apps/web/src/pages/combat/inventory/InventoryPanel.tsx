import type { Character, Item, Participant } from '@ironyard/shared';
import { InventorySection } from './InventorySection';

type Props = {
  character: Character;
  items: Item[];
  onEquip: (inventoryEntryId: string) => void;
  onUnequip: (inventoryEntryId: string) => void;
  // Slice 2: non-self participants in the active encounter, plus the
  // UseConsumable dispatch. Threaded down to ItemRow so consumable rows can
  // surface a target picker.
  participants: Participant[];
  onUse: (inventoryEntryId: string, targetParticipantId?: string) => void;
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

// Find body slots where two or more equipped trinkets compete. UX-only signal;
// the reducer does not block equipping a second trinket into the same slot in
// Slice 1 — we just light up a chip so the player sees the redundancy. Slots
// with `null` bodySlot are ignored (e.g. trinkets that don't bind to a slot).
function detectTrinketConflicts(character: Character, items: Item[]): Set<string> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const counts = new Map<string, number>();
  for (const entry of character.inventory) {
    if (!entry.equipped) continue;
    const item = byId.get(entry.itemId);
    if (item?.category !== 'trinket') continue;
    const slot = item.bodySlot;
    if (!slot) continue;
    counts.set(slot, (counts.get(slot) ?? 0) + 1);
  }
  const conflicting = new Set<string>();
  for (const [slot, n] of counts) {
    if (n > 1) conflicting.add(slot);
  }
  return conflicting;
}

export function InventoryPanel({
  character,
  items,
  onEquip,
  onUnequip,
  participants,
  onUse,
}: Props) {
  const { artifacts, leveled, trinkets, consumables, orphans } = partition(character, items);
  const conflictingSlots = detectTrinketConflicts(character, items);
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-neutral-300">Inventory</h3>
      <InventorySection
        title="Artifacts"
        rows={artifacts}
        onEquip={onEquip}
        onUnequip={onUnequip}
        participants={participants}
        onUse={onUse}
        conflictingSlots={conflictingSlots}
      />
      <InventorySection
        title="Leveled Treasures"
        rows={leveled}
        onEquip={onEquip}
        onUnequip={onUnequip}
        participants={participants}
        onUse={onUse}
        conflictingSlots={conflictingSlots}
      />
      <InventorySection
        title="Trinkets"
        rows={trinkets}
        onEquip={onEquip}
        onUnequip={onUnequip}
        participants={participants}
        onUse={onUse}
        conflictingSlots={conflictingSlots}
      />
      <InventorySection
        title="Consumables"
        rows={consumables}
        onEquip={onEquip}
        onUnequip={onUnequip}
        participants={participants}
        onUse={onUse}
        conflictingSlots={conflictingSlots}
      />
      <InventorySection
        title="Unknown"
        rows={orphans}
        onEquip={onEquip}
        onUnequip={onUnequip}
        participants={participants}
        onUse={onUse}
        conflictingSlots={conflictingSlots}
      />
    </section>
  );
}
