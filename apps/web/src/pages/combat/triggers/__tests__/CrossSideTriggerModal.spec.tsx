import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PendingTriggerSet } from '@ironyard/shared';
import { CrossSideTriggerModal } from '../CrossSideTriggerModal';
import { TriggersPendingPill } from '../TriggersPendingPill';

afterEach(cleanup);

const MOCK_TRIGGERS: PendingTriggerSet = {
  id: 'trig-01',
  triggerEvent: {
    kind: 'damage-applied',
    targetId: 'hero-1',
    attackerId: 'foe-1',
    amount: 10,
    type: 'fire',
  },
  candidates: [
    { participantId: 'hero-1', triggeredActionId: 'shield-up', side: 'heroes' },
    { participantId: 'foe-1', triggeredActionId: 'counter-strike', side: 'foes' },
    { participantId: 'foe-2', triggeredActionId: 'retaliate', side: 'foes' },
  ],
  order: null,
};

const resolveName = (id: string) => {
  const names: Record<string, string> = {
    'hero-1': 'Aria',
    'foe-1': 'Goblin',
    'foe-2': 'Troll',
  };
  return names[id] ?? id;
};

describe('CrossSideTriggerModal', () => {
  it('renders header and trigger description', () => {
    render(
      <CrossSideTriggerModal
        pendingTriggers={MOCK_TRIGGERS}
        resolveName={resolveName}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByText('Resolve trigger order')).toBeTruthy();
    expect(screen.getByText(/Aria took 10 fire damage from Goblin/)).toBeTruthy();
  });

  it('default order is foes first, then heroes', () => {
    render(
      <CrossSideTriggerModal
        pendingTriggers={MOCK_TRIGGERS}
        resolveName={resolveName}
        onResolve={vi.fn()}
      />,
    );
    // dnd-kit's useSortable sets aria-roledescription="sortable" on <li>, which
    // causes testing-library to expose them as role="button", not "listitem".
    const items = screen.getAllByRole('button');
    // Filter to sortable rows only (exclude the Resolve button)
    const rowItems = items.filter((el) => el.tagName === 'LI');
    const foeTroll = rowItems.findIndex((el) => el.textContent?.includes('Troll'));
    const foeGoblin = rowItems.findIndex((el) => el.textContent?.includes('Goblin'));
    const heroAria = rowItems.findIndex((el) => el.textContent?.includes('Aria'));
    // Both foes precede the hero
    expect(foeGoblin).toBeLessThan(heroAria);
    expect(foeTroll).toBeLessThan(heroAria);
  });

  it('clicking Resolve calls onResolve with the current order (foes first)', () => {
    const onResolve = vi.fn();
    render(
      <CrossSideTriggerModal
        pendingTriggers={MOCK_TRIGGERS}
        resolveName={resolveName}
        onResolve={onResolve}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /resolve in order/i }));
    expect(onResolve).toHaveBeenCalledOnce();
    const order: string[] = onResolve.mock.calls[0]?.[0] as string[];
    // Foes come before heroes in the default order
    const heroIndex = order.indexOf('hero-1');
    const foe1Index = order.indexOf('foe-1');
    const foe2Index = order.indexOf('foe-2');
    expect(foe1Index).toBeLessThan(heroIndex);
    expect(foe2Index).toBeLessThan(heroIndex);
  });

  it('shows numbered badges for each candidate', () => {
    render(
      <CrossSideTriggerModal
        pendingTriggers={MOCK_TRIGGERS}
        resolveName={resolveName}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByText('[1]')).toBeTruthy();
    expect(screen.getByText('[2]')).toBeTruthy();
    expect(screen.getByText('[3]')).toBeTruthy();
  });

  it('shows side indicator for each candidate', () => {
    render(
      <CrossSideTriggerModal
        pendingTriggers={MOCK_TRIGGERS}
        resolveName={resolveName}
        onResolve={vi.fn()}
      />,
    );
    const foeLabels = screen.getAllByText('foes');
    const heroLabels = screen.getAllByText('heroes');
    expect(foeLabels).toHaveLength(2);
    expect(heroLabels).toHaveLength(1);
  });
});

describe('TriggersPendingPill', () => {
  it('renders the passive "Director resolving triggers" message', () => {
    render(<TriggersPendingPill />);
    expect(screen.getByText(/Director resolving triggers/)).toBeTruthy();
  });
});
