import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UseConsumableButton } from './UseConsumableButton';

describe('UseConsumableButton', () => {
  it('renders a Use button initially', () => {
    const html = renderToStaticMarkup(<UseConsumableButton participants={[]} onUse={() => {}} />);
    expect(html).toMatch(/Use/);
    // Collapsed render should not have the picker chrome.
    expect(html).not.toMatch(/Target:/);
  });
});
