import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RollOverflowPopover } from './RollOverflowPopover';

afterEach(cleanup);

describe('RollOverflowPopover', () => {
  it('opens on trigger click and exposes three tier buttons', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<RollOverflowPopover onPickTier={onPick} disabled={false} />);
    await user.click(screen.getByLabelText(/manual roll/i));
    expect(screen.getByRole('button', { name: /tier 1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tier 2/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tier 3/i })).toBeInTheDocument();
  });

  it('fires onPickTier with the chosen tier and closes the popover', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<RollOverflowPopover onPickTier={onPick} disabled={false} />);
    await user.click(screen.getByLabelText(/manual roll/i));
    await user.click(screen.getByRole('button', { name: /tier 2/i }));
    expect(onPick).toHaveBeenCalledWith(2);
  });

  it('disables the trigger when disabled prop is true', () => {
    render(<RollOverflowPopover onPickTier={vi.fn()} disabled />);
    expect(screen.getByLabelText(/manual roll/i)).toBeDisabled();
  });
});
