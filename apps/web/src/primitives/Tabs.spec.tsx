import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

afterEach(() => cleanup());

const items = [
  { id: 'overview', label: 'Overview' },
  { id: 'abilities', label: 'Abilities' },
  { id: 'features', label: 'Features' },
];

describe('Tabs', () => {
  it('renders the active tab as selected', () => {
    render(<Tabs items={items} value="abilities" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Abilities' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('calls onChange when a tab is clicked', () => {
    const onChange = vi.fn();
    render(<Tabs items={items} value="overview" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Features' }));
    expect(onChange).toHaveBeenCalledWith('features');
  });

  it('moves focus with ArrowRight / ArrowLeft', () => {
    const onChange = vi.fn();
    render(<Tabs items={items} value="overview" onChange={onChange} />);
    const overview = screen.getByRole('tab', { name: 'Overview' });
    overview.focus();
    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('abilities');
  });
});
