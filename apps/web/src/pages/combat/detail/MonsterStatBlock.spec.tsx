import type { Participant } from '@ironyard/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MonsterStatBlock } from './MonsterStatBlock';

afterEach(cleanup);

function makeMonster(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'm1',
    name: 'Knight Heretic',
    kind: 'monster',
    ownerId: null,
    characterId: null,
    level: 5,
    currentStamina: 52,
    maxStamina: 52,
    characteristics: { might: 3, agility: 1, reason: -1, intuition: 0, presence: 2 },
    immunities: [],
    weaknesses: [],
    conditions: [],
    heroicResources: [],
    extras: [],
    surges: 0,
    recoveries: { current: 0, max: 0 },
    recoveryValue: 0,
    weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
    activeAbilities: [],
    victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false },
    surprised: false,
    role: 'Elite Defender',
    ancestry: ['Human'],
    size: '1M',
    speed: 5,
    stability: 2,
    freeStrike: 5,
    ev: 12,
    withCaptain: '+1 to Free Strike',
    className: null,
    ...overrides,
  } as Participant;
}

describe('MonsterStatBlock', () => {
  it('renders the characteristic 5-up grid', () => {
    render(<MonsterStatBlock participant={makeMonster()} />);
    expect(screen.getByText(/Might/i)).toBeInTheDocument();
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('-1')).toBeInTheDocument();
  });

  it('renders the physical-stats row (size/speed/stability/freeStrike/ev)', () => {
    render(<MonsterStatBlock participant={makeMonster()} />);
    expect(screen.getByText(/1M/)).toBeInTheDocument();
    expect(screen.getByText(/Speed/i)).toBeInTheDocument();
    // getAllByText because "+1 to Free Strike" (withCaptain) also matches
    expect(screen.getAllByText(/Free Strike/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/EV/)).toBeInTheDocument();
  });

  it('renders the With-Captain line when present', () => {
    render(<MonsterStatBlock participant={makeMonster()} />);
    expect(screen.getByText(/With Captain/i)).toBeInTheDocument();
    expect(screen.getByText('+1 to Free Strike')).toBeInTheDocument();
  });

  it('omits the With-Captain line when null', () => {
    render(<MonsterStatBlock participant={makeMonster({ withCaptain: null })} />);
    expect(screen.queryByText(/With Captain/i)).not.toBeInTheDocument();
  });

  it('shows em-dash placeholders for null pre-2b2a-snapshot fields', () => {
    render(
      <MonsterStatBlock
        participant={makeMonster({
          size: null,
          speed: null,
          stability: null,
          freeStrike: null,
          ev: null,
        })}
      />,
    );
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(5);
  });

  it('does not crash when WS-mirrored snapshot has undefined immunities/weaknesses/withCaptain', () => {
    // WS-mirror snapshots bypass Zod parse; .default([]) and .default(null) clauses
    // never fire, so array/string fields may be genuinely undefined at runtime.
    const wsMirrored = makeMonster({
      immunities: undefined as unknown as [],
      weaknesses: undefined as unknown as [],
      withCaptain: undefined as unknown as null,
    });
    expect(() => render(<MonsterStatBlock participant={wsMirrored} />)).not.toThrow();
    expect(screen.queryByText(/With Captain/i)).not.toBeInTheDocument();
  });
});
