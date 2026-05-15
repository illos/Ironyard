import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { HeroResourceCell } from './HeroResourceCell';
import type { Participant } from '@ironyard/shared';

afterEach(cleanup);

function makePc(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'p1',
    name: 'Korva',
    kind: 'pc',
    ownerId: 'u1',
    characterId: 'c1',
    level: 5,
    currentStamina: 78,
    maxStamina: 110,
    characteristics: { might: 2, agility: 2, reason: 1, intuition: 0, presence: -1 },
    immunities: [],
    weaknesses: [],
    conditions: [],
    heroicResources: [{ name: 'focus', value: 3, floor: 0 }],
    extras: [],
    surges: 0,
    recoveries: { current: 5, max: 8 },
    recoveryValue: 0,
    weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
    activeAbilities: [],
    victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false },
    surprised: false,
    role: null,
    ancestry: [],
    size: null,
    speed: null,
    stability: null,
    freeStrike: null,
    ev: null,
    withCaptain: null,
    className: 'Tactician',
    ...overrides,
  } as Participant;
}

describe('HeroResourceCell', () => {
  it('renders the resource name + filled/unfilled pip row', () => {
    render(<HeroResourceCell participant={makePc({ heroicResources: [{ name: 'focus', value: 3, floor: 0 }] })} />);
    expect(screen.getByText('Focus')).toBeInTheDocument();
    const pips = screen.getAllByTestId('resource-pip');
    expect(pips).toHaveLength(8);
    expect(pips.filter((p) => p.dataset.filled === 'true')).toHaveLength(3);
  });

  it('fills all 8 pips + renders the +N overflow numeric when value > 8', () => {
    render(<HeroResourceCell participant={makePc({ heroicResources: [{ name: 'ferocity', value: 10, floor: 0 }] })} />);
    const pips = screen.getAllByTestId('resource-pip');
    expect(pips.filter((p) => p.dataset.filled === 'true')).toHaveLength(8);
    expect(screen.getByText(/\+2/)).toBeInTheDocument();
  });

  it('renders nothing when the participant has no heroic resource', () => {
    const { container } = render(<HeroResourceCell participant={makePc({ heroicResources: [] })} />);
    expect(container.firstChild).toBeNull();
  });
});
