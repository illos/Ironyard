import type { Character, Item } from '@ironyard/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InventoryPanel } from './InventoryPanel';

// We render to a static HTML string via react-dom/server rather than mounting
// into a real DOM. The web app's vitest setup has no jsdom + no
// @testing-library/react installed — adding them just for these snapshot-style
// assertions would be heavier than the test deserves at Slice-1 prototype
// fidelity. Static markup is sufficient: the four assertions below check
// observable text and structural fragments that exist in the rendered output
// of a pure render (no effects, no state).

const character = {
  inventory: [
    { id: 'inv-1', itemId: 'lightning-treads', quantity: 1, equipped: true },
    { id: 'inv-2', itemId: 'potion-of-stamina', quantity: 3, equipped: false },
    { id: 'inv-3', itemId: 'orphan-item-id', quantity: 1, equipped: false },
  ],
} as unknown as Character;

const items: Item[] = [
  {
    id: 'lightning-treads',
    name: 'Lightning Treads',
    category: 'trinket',
    bodySlot: 'feet',
  } as unknown as Item,
  {
    id: 'potion-of-stamina',
    name: 'Potion of Stamina',
    category: 'consumable',
    effectKind: 'instant',
  } as unknown as Item,
];

function renderPanel(): string {
  return renderToStaticMarkup(
    <InventoryPanel character={character} items={items} onEquip={() => {}} onUnequip={() => {}} />,
  );
}

describe('InventoryPanel', () => {
  it('renders sections for present categories only', () => {
    const html = renderPanel();
    expect(html).toMatch(/Trinkets/);
    expect(html).toMatch(/Consumables/);
    // No leveled or artifact entries → those sections should not render.
    expect(html).not.toMatch(/Artifacts/);
    expect(html).not.toMatch(/Leveled Treasures/);
  });

  it('marks equipped items with an "Equipped" badge', () => {
    const html = renderPanel();
    expect(html).toMatch(/Lightning Treads/);
    expect(html).toMatch(/Equipped/);
  });

  it('shows consumable quantity', () => {
    const html = renderPanel();
    expect(html).toMatch(/×3/);
  });

  it('flags unknown itemIds with a warning row', () => {
    const html = renderPanel();
    expect(html).toMatch(/orphan-item-id/);
    expect(html).toMatch(/Unknown item/i);
  });

  it('flags body-slot conflicts when two equipped trinkets share a slot', () => {
    const conflictingCharacter = {
      inventory: [
        { id: 'inv-1', itemId: 'helm-a', quantity: 1, equipped: true },
        { id: 'inv-2', itemId: 'helm-b', quantity: 1, equipped: true },
      ],
    } as unknown as Character;
    const conflictingItems: Item[] = [
      { id: 'helm-a', name: 'Helm A', category: 'trinket', bodySlot: 'head' } as unknown as Item,
      { id: 'helm-b', name: 'Helm B', category: 'trinket', bodySlot: 'head' } as unknown as Item,
    ];
    const html = renderToStaticMarkup(
      <InventoryPanel
        character={conflictingCharacter}
        items={conflictingItems}
        onEquip={() => {}}
        onUnequip={() => {}}
      />,
    );
    expect(html).toMatch(/Slot conflict: head/);
  });

  it('does not flag when only one trinket per slot is equipped', () => {
    const okCharacter = {
      inventory: [
        { id: 'inv-1', itemId: 'helm', quantity: 1, equipped: true },
        { id: 'inv-2', itemId: 'belt', quantity: 1, equipped: true },
      ],
    } as unknown as Character;
    const okItems: Item[] = [
      { id: 'helm', name: 'Helm', category: 'trinket', bodySlot: 'head' } as unknown as Item,
      { id: 'belt', name: 'Belt', category: 'trinket', bodySlot: 'waist' } as unknown as Item,
    ];
    const html = renderToStaticMarkup(
      <InventoryPanel
        character={okCharacter}
        items={okItems}
        onEquip={() => {}}
        onUnequip={() => {}}
      />,
    );
    expect(html).not.toMatch(/Slot conflict/);
  });

  it('does not flag unequipped duplicate trinkets', () => {
    const carriedDupCharacter = {
      inventory: [
        { id: 'inv-1', itemId: 'helm-a', quantity: 1, equipped: true },
        { id: 'inv-2', itemId: 'helm-b', quantity: 1, equipped: false },
      ],
    } as unknown as Character;
    const carriedDupItems: Item[] = [
      { id: 'helm-a', name: 'Helm A', category: 'trinket', bodySlot: 'head' } as unknown as Item,
      { id: 'helm-b', name: 'Helm B', category: 'trinket', bodySlot: 'head' } as unknown as Item,
    ];
    const html = renderToStaticMarkup(
      <InventoryPanel
        character={carriedDupCharacter}
        items={carriedDupItems}
        onEquip={() => {}}
        onUnequip={() => {}}
      />,
    );
    expect(html).not.toMatch(/Slot conflict/);
  });
});
