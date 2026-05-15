import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { HeroRecoveriesCell } from './HeroRecoveriesCell';
import type { Participant } from '@ironyard/shared';

afterEach(cleanup);

function makePc(recoveries: { current: number; max: number }): Participant {
  return {
    id: 'p1', name: 'Korva', kind: 'pc',
    ownerId: 'u1', characterId: 'c1', level: 5,
    currentStamina: 78, maxStamina: 110,
    characteristics: { might: 2, agility: 2, reason: 1, intuition: 0, presence: -1 },
    immunities: [], weaknesses: [], conditions: [],
    heroicResources: [], extras: [], surges: 0,
    recoveries, recoveryValue: 0,
    weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
    activeAbilities: [], victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false }, surprised: false,
    role: null, ancestry: [], size: null, speed: null, stability: null,
    freeStrike: null, ev: null, withCaptain: null, className: 'Tactician',
  } as Participant;
}

describe('HeroRecoveriesCell', () => {
  it('renders the Rec label + current/max readout', () => {
    render(<HeroRecoveriesCell participant={makePc({ current: 5, max: 8 })} />);
    expect(screen.getByText('Rec')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('/8')).toBeInTheDocument();
  });

  it('shows 0/0 when the pool is empty', () => {
    render(<HeroRecoveriesCell participant={makePc({ current: 0, max: 0 })} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('/0')).toBeInTheDocument();
  });
});
