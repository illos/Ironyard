import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UseConsumableButton } from './UseConsumableButton';

// Static-HTML render only — same pattern as BodySlotConflictChip.spec.tsx
// and InventoryPanel.spec.tsx. The expanded-picker state requires a click
// interaction; that path will be covered when the repo picks up
// jsdom + @testing-library/react.

describe('UseConsumableButton', () => {
  it('renders a Use button initially', () => {
    const html = renderToStaticMarkup(<UseConsumableButton participants={[]} onUse={() => {}} />);
    expect(html).toMatch(/Use/);
    // Collapsed render should not have the picker chrome.
    expect(html).not.toMatch(/Target:/);
  });
});
