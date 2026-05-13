import type { Item } from '@ironyard/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { type ApprovedCharacter, PushItemModal } from './PushItemModal';

// Static-HTML test (same pattern as SwapKitModal.spec.tsx): the web vitest
// setup has no jsdom + @testing-library/react, so we only cover the initial
// render. Interaction-driven assertions (typing into the search field,
// selecting a character + item, then confirming Push item becomes enabled)
// are deferred to the future test-infra task.

const characters: ApprovedCharacter[] = [
  { id: 'char-1', name: 'Aric' },
  { id: 'char-2', name: 'Borin' },
];

const items: Item[] = [
  { id: 'potion-1', name: 'Healing Potion', category: 'consumable' } as unknown as Item,
  { id: 'helm-1', name: 'Iron Helm', category: 'trinket' } as unknown as Item,
];

describe('PushItemModal', () => {
  it('renders the title', () => {
    const html = renderToStaticMarkup(
      <PushItemModal
        characters={characters}
        items={items}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toMatch(/Push item to a player/);
  });

  it('renders Push item and Cancel buttons', () => {
    const html = renderToStaticMarkup(
      <PushItemModal
        characters={characters}
        items={items}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toMatch(/Push item/);
    expect(html).toMatch(/Cancel/);
  });

  it('renders with role=dialog and aria-modal', () => {
    const html = renderToStaticMarkup(
      <PushItemModal
        characters={characters}
        items={items}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toMatch(/role="dialog"/);
    expect(html).toMatch(/aria-modal="true"/);
  });

  it('disables Push item by default (no character or item selected)', () => {
    const html = renderToStaticMarkup(
      <PushItemModal
        characters={characters}
        items={items}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    // The Push item button is rendered with the `disabled` HTML attribute
    // when characterId or itemId is null (initial render: both null).
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Push item<\/button>/);
  });

  it('renders character options and item names', () => {
    const html = renderToStaticMarkup(
      <PushItemModal
        characters={characters}
        items={items}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toMatch(/Aric/);
    expect(html).toMatch(/Borin/);
    expect(html).toMatch(/Healing Potion/);
    expect(html).toMatch(/Iron Helm/);
  });
});
