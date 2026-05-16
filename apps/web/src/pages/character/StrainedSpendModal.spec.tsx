import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrainedSpendModal } from './StrainedSpendModal';

afterEach(cleanup);

const noop = () => {};

describe('StrainedSpendModal', () => {
  it('renders projected clarity-after value (2 - 4 = -2)', () => {
    render(
      <StrainedSpendModal
        open
        abilityName="Mind Spike"
        currentClarity={2}
        spendCost={4}
        isPsion={false}
        onCancel={noop}
        onConfirm={noop}
      />,
    );
    expect(screen.getByTestId('strained-projected')).toHaveTextContent('-2');
  });

  it('renders "you will be strained" warning when projected < 0', () => {
    render(
      <StrainedSpendModal
        open
        abilityName="Mind Spike"
        currentClarity={2}
        spendCost={4}
        isPsion={false}
        onCancel={noop}
        onConfirm={noop}
      />,
    );
    expect(screen.getByTestId('strained-warning')).toHaveTextContent(/will be strained/i);
  });

  it('hides Psion toggles for non-Psion Talents', () => {
    render(
      <StrainedSpendModal
        open
        abilityName="Mind Spike"
        currentClarity={2}
        spendCost={4}
        isPsion={false}
        onCancel={noop}
        onConfirm={noop}
      />,
    );
    expect(screen.queryByTestId('psion-opt-in-rider')).toBeNull();
    expect(screen.queryByTestId('psion-opt-out-damage')).toBeNull();
  });

  it('shows opt-out toggle for Psion when spend would strain', () => {
    render(
      <StrainedSpendModal
        open
        abilityName="Mind Spike"
        currentClarity={2}
        spendCost={4}
        isPsion
        onCancel={noop}
        onConfirm={noop}
      />,
    );
    expect(screen.getByTestId('psion-opt-out-damage')).toBeInTheDocument();
    expect(screen.queryByTestId('psion-opt-in-rider')).toBeNull();
  });

  it('shows opt-in-rider toggle for Psion when spend would NOT strain (10 - 3 = 7)', () => {
    render(
      <StrainedSpendModal
        open
        abilityName="Mind Spike"
        currentClarity={10}
        spendCost={3}
        isPsion
        onCancel={noop}
        onConfirm={noop}
      />,
    );
    expect(screen.getByTestId('psion-opt-in-rider')).toBeInTheDocument();
    expect(screen.queryByTestId('psion-opt-out-damage')).toBeNull();
  });

  it('Confirm dispatches onConfirm with toggle values', () => {
    const onConfirm = vi.fn();
    render(
      <StrainedSpendModal
        open
        abilityName="Mind Spike"
        currentClarity={10}
        spendCost={3}
        isPsion
        onCancel={noop}
        onConfirm={onConfirm}
      />,
    );

    // Flip the opt-in-rider toggle on
    fireEvent.click(screen.getByTestId('psion-opt-in-rider'));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ talentStrainedOptInRider: true });
  });

  it('Cancel dispatches onCancel without calling onConfirm', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <StrainedSpendModal
        open
        abilityName="Mind Spike"
        currentClarity={2}
        spendCost={4}
        isPsion={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
