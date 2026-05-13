import type { Kit } from '@ironyard/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SwapKitModal } from './SwapKitModal';

// Same pattern as InventoryPanel.spec.tsx: render to static markup and assert
// against the resulting HTML. The web vitest setup has no jsdom +
// @testing-library/react, so interaction tests (clicking a kit, confirming
// the Confirm-disabled state changes) aren't covered here. The "Confirm
// disabled when current matches initial selection" assertion exercises the
// disabled-on-initial-render path, which is the most important static slice
// of the selection-state logic. Selection-change interaction coverage is
// deferred to a future "test infra" task.

const kits = [
  { id: 'mountain', name: 'Mountain' } as unknown as Kit,
  { id: 'panther', name: 'Panther' } as unknown as Kit,
];

describe('SwapKitModal', () => {
  it('lists kits', () => {
    const html = renderToStaticMarkup(
      <SwapKitModal kits={kits} currentKitId="mountain" onConfirm={() => {}} onClose={() => {}} />,
    );
    expect(html).toMatch(/Mountain/);
    expect(html).toMatch(/Panther/);
  });

  it('renders Confirm and Cancel buttons', () => {
    const html = renderToStaticMarkup(
      <SwapKitModal kits={kits} currentKitId="mountain" onConfirm={() => {}} onClose={() => {}} />,
    );
    expect(html).toMatch(/Confirm/);
    expect(html).toMatch(/Cancel/);
  });

  it('renders with role=dialog and aria-modal', () => {
    const html = renderToStaticMarkup(
      <SwapKitModal kits={kits} currentKitId="mountain" onConfirm={() => {}} onClose={() => {}} />,
    );
    expect(html).toMatch(/role="dialog"/);
    expect(html).toMatch(/aria-modal="true"/);
  });

  it('disables Confirm when initial selection matches the current kit', () => {
    // Initial render: selected === currentKitId === "mountain" → Confirm disabled.
    const html = renderToStaticMarkup(
      <SwapKitModal kits={kits} currentKitId="mountain" onConfirm={() => {}} onClose={() => {}} />,
    );
    // Find the Confirm button and assert it carries the `disabled` attribute.
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Confirm<\/button>/);
  });

  it('disables Confirm when no kit is preselected', () => {
    // currentKitId null → selected starts null → Confirm disabled.
    const html = renderToStaticMarkup(
      <SwapKitModal kits={kits} currentKitId={null} onConfirm={() => {}} onClose={() => {}} />,
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Confirm<\/button>/);
  });
});
