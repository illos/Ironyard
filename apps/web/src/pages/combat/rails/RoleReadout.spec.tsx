import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { Participant } from '@ironyard/shared';

afterEach(cleanup);
import { RoleReadout } from './RoleReadout';
import { roleReadoutFor } from './rail-utils';

function makeMonster(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'm1', name: 'Test Monster', kind: 'monster',
    ownerId: null, characterId: null, level: 1,
    currentStamina: 20, maxStamina: 20,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [], weaknesses: [], conditions: [],
    heroicResources: [], extras: [], surges: 0,
    recoveries: { current: 0, max: 0 }, recoveryValue: 0,
    weaponDamageBonus: { melee: [0, 0, 0], ranged: [0, 0, 0] },
    activeAbilities: [], victories: 0,
    turnActionUsage: { main: false, maneuver: false, move: false }, surprised: false,
    role: 'Elite Defender', ancestry: [],
    size: null, speed: null, stability: null, freeStrike: null, ev: null,
    withCaptain: null, className: null,
    ...overrides,
  } as Participant;
}

describe('RoleReadout', () => {
  it('renders a rank pill + family when role parses cleanly', () => {
    render(<RoleReadout data={{ kind: 'monster-ranked', level: 5, rank: 'Elite', family: 'Defender' }} />);
    expect(screen.getByText('ELI')).toBeInTheDocument();
    expect(screen.getByText(/L5 · DEFENDER/i)).toBeInTheDocument();
  });

  it('renders family-only (no pill) for an unranked monster', () => {
    render(<RoleReadout data={{ kind: 'monster-unranked', level: 3, family: 'Controller' }} />);
    expect(screen.queryByText(/MIN|HOR|PLA|ELI|LED|SOL/)).not.toBeInTheDocument();
    expect(screen.getByText(/L3 · CONTROLLER/i)).toBeInTheDocument();
  });

  it('falls back to "L{level} · FOE" for a pre-2b2a monster snapshot', () => {
    render(<RoleReadout data={{ kind: 'monster-fallback', level: 4 }} />);
    expect(screen.getByText(/L4 · FOE/i)).toBeInTheDocument();
  });

  it('renders "L{level} · {CLASSNAME}" for a PC with a className', () => {
    render(<RoleReadout data={{ kind: 'pc', level: 5, className: 'Tactician' }} />);
    expect(screen.getByText(/L5 · TACTICIAN/i)).toBeInTheDocument();
  });

  it('falls back to "L{level} · HERO" when PC className is null', () => {
    render(<RoleReadout data={{ kind: 'pc', level: 2, className: null }} />);
    expect(screen.getByText(/L2 · HERO/i)).toBeInTheDocument();
  });
});

describe('roleReadoutFor — WS-mirror undefined regression', () => {
  it('treats undefined role (WS-mirrored snapshot) as monster-fallback', () => {
    // WS-mirror snapshots bypass Zod parse, so .default(null) never fires.
    // The field is genuinely undefined at runtime despite the TS type claiming string|null.
    const wsMirrored = makeMonster({ role: undefined as unknown as null });
    const data = roleReadoutFor(wsMirrored);
    expect(data).toEqual({ kind: 'monster-fallback', level: 1 });
  });
});
