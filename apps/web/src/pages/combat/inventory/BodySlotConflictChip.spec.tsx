import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BodySlotConflictChip } from './BodySlotConflictChip';

// Same static-render approach as InventoryPanel.spec.tsx — no jsdom dependency.

describe('BodySlotConflictChip', () => {
  it('renders nothing when not conflicting', () => {
    const html = renderToStaticMarkup(<BodySlotConflictChip conflicting={false} slot="head" />);
    expect(html).toBe('');
  });

  it('renders the warning when conflicting', () => {
    const html = renderToStaticMarkup(<BodySlotConflictChip conflicting slot="head" />);
    expect(html).toMatch(/Slot conflict: head/);
  });
});
