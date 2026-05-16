import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EssenceBlock } from './EssenceBlock';

afterEach(cleanup);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const noop = () => {};

describe('EssenceBlock', () => {
  it('renders Essence label + current value + base-gain footnote', () => {
    render(
      <EssenceBlock
        currentEssence={5}
        baseGainPerTurn={2}
        maintainedAbilities={[]}
        onStopMaintain={noop}
      />,
    );

    // Label
    expect(screen.getByText(/^essence$/i)).toBeInTheDocument();
    // Current value
    expect(screen.getByTestId('essence-value')).toHaveTextContent('5');
    // Footnote: +2/turn · +1 first dmg-in-10sq
    const footnote = screen.getByTestId('essence-footnote');
    expect(footnote).toHaveTextContent('+2/turn');
    expect(footnote).toHaveTextContent(/\+1 first dmg-in-10sq/i);
  });

  it('renders Maintenance sub-section with each maintained ability + total net', () => {
    render(
      <EssenceBlock
        currentEssence={10}
        baseGainPerTurn={2}
        maintainedAbilities={[
          { abilityId: 'a1', abilityName: 'Burning Aura', costPerTurn: 1 },
          { abilityId: 'a2', abilityName: 'Stone Skin', costPerTurn: 2 },
        ]}
        onStopMaintain={noop}
      />,
    );

    // Heading reports net = +2 - (1 + 2) = -1
    const heading = screen.getByTestId('maintain-heading');
    expect(heading).toHaveTextContent(/maintaining/i);
    expect(heading).toHaveTextContent('-1/turn');

    // Each ability is listed with its name and cost
    expect(screen.getByText('Burning Aura')).toBeInTheDocument();
    expect(screen.getByText('Stone Skin')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /stop/i })).toHaveLength(2);
  });

  it('hides Maintenance sub-section when nothing is maintained', () => {
    render(
      <EssenceBlock
        currentEssence={5}
        baseGainPerTurn={2}
        maintainedAbilities={[]}
        onStopMaintain={noop}
      />,
    );

    expect(screen.queryByTestId('maintain-heading')).toBeNull();
    expect(screen.queryByText(/maintaining/i)).toBeNull();
  });

  it('shows auto-drop warning when projected next-turn essence < 0', () => {
    // current 0 + 2 - 5 = -3 → warn
    render(
      <EssenceBlock
        currentEssence={0}
        baseGainPerTurn={2}
        maintainedAbilities={[{ abilityId: 'a1', abilityName: 'Fireshield', costPerTurn: 5 }]}
        onStopMaintain={noop}
      />,
    );

    expect(screen.getByTestId('auto-drop-warning')).toHaveTextContent(/auto-drop next turn/i);
  });

  it('calls onStopMaintain with abilityId when stop button clicked', () => {
    const onStop = vi.fn();
    render(
      <EssenceBlock
        currentEssence={10}
        baseGainPerTurn={2}
        maintainedAbilities={[
          { abilityId: 'a1', abilityName: 'Burning Aura', costPerTurn: 1 },
          { abilityId: 'a2', abilityName: 'Stone Skin', costPerTurn: 2 },
        ]}
        onStopMaintain={onStop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /stop burning aura/i }));
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledWith('a1');
  });
});
