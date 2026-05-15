import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { RoleReadout } from './RoleReadout';

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
