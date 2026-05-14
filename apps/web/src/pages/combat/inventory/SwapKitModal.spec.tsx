import type { Kit } from '@ironyard/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SwapKitModal } from './SwapKitModal';

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
