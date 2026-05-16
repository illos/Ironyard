import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { TargetingRelationsCard } from './TargetingRelationsCard';

afterEach(cleanup);

const baseSource = (overrides: any = {}) => ({
  id: 'censor-1',
  name: 'Aldric',
  targetingRelations: { judged: [], marked: [], nullField: [] },
  ...overrides,
});

describe('TargetingRelationsCard', () => {
  it('renders empty state when the relation array is empty', () => {
    render(
      <TargetingRelationsCard
        source={baseSource()}
        relationKind="judged"
        candidates={[]}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText(/judging: none/i)).toBeInTheDocument();
  });

  it('renders entries with a remove control', () => {
    render(
      <TargetingRelationsCard
        source={baseSource({
          targetingRelations: { judged: ['goblin-a'], marked: [], nullField: [] },
        })}
        relationKind="judged"
        candidates={[{ id: 'goblin-a', name: 'Goblin A' }]}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('Goblin A')).toBeInTheDocument();
  });

  it('calls onToggle(targetId, false) when remove tapped', () => {
    const onToggle = vi.fn();
    render(
      <TargetingRelationsCard
        source={baseSource({
          targetingRelations: { judged: ['goblin-a'], marked: [], nullField: [] },
        })}
        relationKind="judged"
        candidates={[{ id: 'goblin-a', name: 'Goblin A' }]}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByLabelText(/remove Goblin A/i));
    expect(onToggle).toHaveBeenCalledWith('goblin-a', false);
  });

  it('opens picker, selecting a candidate dispatches add', () => {
    const onToggle = vi.fn();
    render(
      <TargetingRelationsCard
        source={baseSource()}
        relationKind="judged"
        candidates={[
          { id: 'goblin-a', name: 'Goblin A' },
          { id: 'goblin-b', name: 'Goblin B' },
        ]}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByText(/add target/i));
    fireEvent.click(screen.getByText('Goblin B'));
    expect(onToggle).toHaveBeenCalledWith('goblin-b', true);
  });

  it('correctly labels Null Field empty state', () => {
    render(
      <TargetingRelationsCard
        source={baseSource()}
        relationKind="nullField"
        candidates={[]}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText(/null field: none/i)).toBeInTheDocument();
  });
});
