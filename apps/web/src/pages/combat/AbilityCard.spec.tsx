import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AbilityCard } from './AbilityCard';
import type { Ability } from '@ironyard/shared';

afterEach(cleanup);

function makeAbility(overrides: Partial<Ability> = {}): Ability {
  return {
    id: 'reaving-slash',
    name: 'Reaving Slash',
    type: 'action',
    costLabel: 'Signature Ability',
    keywords: ['Strike', 'Weapon', 'Melee'],
    distance: 'Melee 1',
    target: 'One creature',
    powerRoll: {
      bonus: '+5',
      tier1: { raw: '5 damage', damage: 5, damageType: 'untyped', effect: undefined, conditions: [] },
      tier2: { raw: '9 damage; bleed', damage: 9, damageType: 'untyped', effect: undefined, conditions: [{ condition: 'Bleeding', duration: { kind: 'EoT' }, scope: 'target' }] },
      tier3: { raw: '13 damage; bleed, push 1', damage: 13, damageType: 'untyped', effect: 'push 1', conditions: [{ condition: 'Bleeding', duration: { kind: 'EoT' }, scope: 'target' }] },
    },
    effect: 'If this attack reduces the target to 0 stamina, you may make a free strike.',
    raw: '',
    cost: null,
    tier: null,
    isSubclass: false,
    sourceClassId: null,
    targetCharacteristic: 'Stamina',
    ...overrides,
  } as Ability;
}

describe('AbilityCard structure', () => {
  it('renders name, distance, keywords, power-roll formula, and the three tier columns', () => {
    render(<AbilityCard ability={makeAbility()} disabled={false} onRoll={vi.fn()} />);
    expect(screen.getByText('Reaving Slash')).toBeInTheDocument();
    expect(screen.getByText('Melee 1')).toBeInTheDocument();
    expect(screen.getByText(/Strike/)).toBeInTheDocument();
    expect(screen.getByText(/2d10/)).toBeInTheDocument();
    expect(screen.getByText(/\+5/)).toBeInTheDocument();
    expect(screen.getByText(/vs Stamina/i)).toBeInTheDocument();
    expect(screen.getByText('≤11')).toBeInTheDocument();
    expect(screen.getByText('12–16')).toBeInTheDocument();
    expect(screen.getByText('17+')).toBeInTheDocument();
  });

  it('renders tier prose with damage + conditions + effect text', () => {
    render(<AbilityCard ability={makeAbility()} disabled={false} onRoll={vi.fn()} />);
    expect(screen.getByText(/5 damage/)).toBeInTheDocument();
    expect(screen.getByText(/9 damage/)).toBeInTheDocument();
    expect(screen.getByText(/13 damage/)).toBeInTheDocument();
    expect(screen.getAllByText(/Bleeding/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/push 1/)).toBeInTheDocument();
  });

  it('folds the damage type into prose when typed', () => {
    const ability = makeAbility({
      powerRoll: {
        bonus: '+3',
        tier1: { raw: '3 fire damage', damage: 3, damageType: 'fire', effect: undefined, conditions: [] },
        tier2: { raw: '5 fire damage', damage: 5, damageType: 'fire', effect: undefined, conditions: [] },
        tier3: { raw: '8 fire damage', damage: 8, damageType: 'fire', effect: undefined, conditions: [] },
      },
    });
    render(<AbilityCard ability={ability} disabled={false} onRoll={vi.fn()} />);
    expect(screen.getByText(/3 fire damage/)).toBeInTheDocument();
  });

  it('omits the type qualifier for untyped damage ("5 damage" not "5 untyped damage")', () => {
    render(<AbilityCard ability={makeAbility()} disabled={false} onRoll={vi.fn()} />);
    expect(screen.queryByText(/untyped damage/)).not.toBeInTheDocument();
  });

  it('renders the effect text when present', () => {
    render(<AbilityCard ability={makeAbility()} disabled={false} onRoll={vi.fn()} />);
    expect(screen.getByText(/reduces the target to 0 stamina/i)).toBeInTheDocument();
  });

  it('omits "vs X" from the formula line when targetCharacteristic is null', () => {
    render(<AbilityCard ability={makeAbility({ targetCharacteristic: null })} disabled={false} onRoll={vi.fn()} />);
    expect(screen.queryByText(/vs Stamina/i)).not.toBeInTheDocument();
    expect(screen.getByText(/2d10/)).toBeInTheDocument();
  });
});
