import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StartMaintenanceModal } from './StartMaintenanceModal';

afterEach(cleanup);

const noop = () => {};

describe('StartMaintenanceModal', () => {
  it('renders ability name + cost per turn', () => {
    render(
      <StartMaintenanceModal
        open
        abilityName="Flame Wreath"
        costPerTurn={2}
        currentEssence={5}
        baseGainPerTurn={1}
        onCancel={noop}
        onConfirm={noop}
      />,
    );
    expect(screen.getByText(/Flame Wreath/)).toBeInTheDocument();
    expect(screen.getByTestId('maintenance-cost-per-turn')).toHaveTextContent('2');
  });

  it('renders projected essence next turn (5 + 1 - 2 = 4)', () => {
    render(
      <StartMaintenanceModal
        open
        abilityName="Flame Wreath"
        costPerTurn={2}
        currentEssence={5}
        baseGainPerTurn={1}
        onCancel={noop}
        onConfirm={noop}
      />,
    );
    expect(screen.getByTestId('maintenance-projected')).toHaveTextContent('4');
  });

  it('shows "may auto-drop" warning when projected < 0', () => {
    render(
      <StartMaintenanceModal
        open
        abilityName="Flame Wreath"
        costPerTurn={4}
        currentEssence={1}
        baseGainPerTurn={1}
        onCancel={noop}
        onConfirm={noop}
      />,
    );
    // 1 + 1 - 4 = -2
    expect(screen.getByTestId('maintenance-projected')).toHaveTextContent('-2');
    expect(screen.getByTestId('maintenance-autodrop-warning')).toHaveTextContent(/auto-drop/i);
  });

  it('Confirm dispatches onConfirm(true) by default; Cancel calls onCancel without calling onConfirm', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <StartMaintenanceModal
        open
        abilityName="Flame Wreath"
        costPerTurn={2}
        currentEssence={5}
        baseGainPerTurn={1}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(true);

    onConfirm.mockClear();

    rerender(
      <StartMaintenanceModal
        open
        abilityName="Flame Wreath"
        costPerTurn={2}
        currentEssence={5}
        baseGainPerTurn={1}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
