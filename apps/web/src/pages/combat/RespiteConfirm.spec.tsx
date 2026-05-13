import type { Character, Item } from '@ironyard/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RespiteConfirm } from './RespiteConfirm';

// Static-HTML test (same pattern as PushItemModal.spec / SwapKitModal.spec):
// the web vitest setup has no jsdom + @testing-library/react, so we only
// cover the initial render. Click-driven assertions (Wyrmplate dropdown
// change → onConfirm fires with payload) are deferred to the test-infra
// task.

// Fixtures carry id + name at the top level — same shape the CampaignView
// wrapper produces by spreading CharacterResponse.data and lifting
// id + name out of the response wrapper. Character is the inner data blob
// type, so the surface fields are attached via the same { id, name } cast.

const dkCharacter = {
  id: 'char-dk',
  name: 'Tarn',
  ancestryId: 'dragon-knight',
  ancestryChoices: { wyrmplateType: 'fire' },
  inventory: [],
  details: {},
} as unknown as Character;

const heavyCarrier = {
  id: 'char-greedy',
  name: 'Greedy',
  ancestryId: 'human',
  ancestryChoices: {},
  inventory: [
    { id: 'i1', itemId: 'lt1', quantity: 1, equipped: true },
    { id: 'i2', itemId: 'lt2', quantity: 1, equipped: true },
    { id: 'i3', itemId: 'lt3', quantity: 1, equipped: true },
    { id: 'i4', itemId: 'lt4', quantity: 1, equipped: true },
  ],
  details: {},
} as unknown as Character;

const items: Item[] = [
  { id: 'lt1', name: 'L1', category: 'leveled-treasure' } as unknown as Item,
  { id: 'lt2', name: 'L2', category: 'leveled-treasure' } as unknown as Item,
  { id: 'lt3', name: 'L3', category: 'leveled-treasure' } as unknown as Item,
  { id: 'lt4', name: 'L4', category: 'leveled-treasure' } as unknown as Item,
];

describe('RespiteConfirm', () => {
  it('shows Confirm + Cancel buttons', () => {
    const html = renderToStaticMarkup(
      <RespiteConfirm characters={[]} items={[]} onConfirm={() => {}} onClose={() => {}} />,
    );
    expect(html).toMatch(/Confirm respite/);
    expect(html).toMatch(/Cancel/);
  });

  it('renders with role=dialog and aria-modal', () => {
    const html = renderToStaticMarkup(
      <RespiteConfirm characters={[]} items={[]} onConfirm={() => {}} onClose={() => {}} />,
    );
    expect(html).toMatch(/role="dialog"/);
    expect(html).toMatch(/aria-modal="true"/);
  });

  it('shows a Wyrmplate prompt for Dragon Knight characters', () => {
    const html = renderToStaticMarkup(
      <RespiteConfirm
        characters={[dkCharacter]}
        items={[]}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toMatch(/Wyrmplate/);
    expect(html).toMatch(/Tarn/);
  });

  it('does not show a Wyrmplate prompt when no Dragon Knight is present', () => {
    const html = renderToStaticMarkup(
      <RespiteConfirm characters={[]} items={[]} onConfirm={() => {}} onClose={() => {}} />,
    );
    expect(html).not.toMatch(/Wyrmplate/);
  });

  it('shows the 3-safely-carry preview when > 3 leveled treasures equipped', () => {
    const html = renderToStaticMarkup(
      <RespiteConfirm
        characters={[heavyCarrier]}
        items={items}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toMatch(/3-safely-carry/);
    expect(html).toMatch(/Greedy/);
    expect(html).toMatch(/4 leveled treasures/);
  });

  it('does not show the warning at exactly 3 equipped leveled treasures', () => {
    const threeLT = {
      ...heavyCarrier,
      inventory: heavyCarrier.inventory.slice(0, 3),
    } as unknown as Character;
    const html = renderToStaticMarkup(
      <RespiteConfirm
        characters={[threeLT]}
        items={items}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).not.toMatch(/3-safely-carry/);
  });
});
