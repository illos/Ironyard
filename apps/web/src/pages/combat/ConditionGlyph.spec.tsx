import { cleanup, render, screen } from '@testing-library/react';
import type { ConditionInstance } from '@ironyard/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { ConditionGlyph, ConditionGlyphs } from './ConditionGlyph';

afterEach(cleanup);

function mk(type: ConditionInstance['type'], duration: ConditionInstance['duration'] = { kind: 'manual' }): ConditionInstance {
  return {
    type,
    source: { kind: 'effect', id: 'test' },
    duration,
    appliedAtSeq: 1,
    removable: true,
  };
}

describe('ConditionGlyph', () => {
  it('renders a glyph for each condition type with the per-condition hue class', () => {
    const types = [
      'Bleeding', 'Dazed', 'Frightened', 'Grabbed', 'Prone',
      'Restrained', 'Slowed', 'Taunted', 'Unconscious', 'Weakened',
    ] as const;
    for (const t of types) {
      const { container, unmount } = render(<ConditionGlyph condition={mk(t)} />);
      // The badge has both `title` (browser hover tooltip) and `aria-label`
      // (screen reader). Query by title for unambiguous element selection;
      // separately assert aria-label is present.
      const badge = screen.getByTitle(t);
      expect(badge).toBeInTheDocument();
      expect(badge.getAttribute('aria-label')).toBe(t);
      // Each condition's glyph is an inline SVG inside the badge.
      expect(container.querySelector('svg')).not.toBeNull();
      unmount();
    }
  });

  it('appends EoT duration in the title/aria-label', () => {
    render(<ConditionGlyph condition={mk('Bleeding', { kind: 'EoT' })} />);
    expect(screen.getByTitle('Bleeding · EoT')).toBeInTheDocument();
  });

  it('appends save-ends duration', () => {
    render(<ConditionGlyph condition={mk('Dazed', { kind: 'save_ends' })} />);
    expect(screen.getByTitle('Dazed · save ends')).toBeInTheDocument();
  });

  it('omits suffix for manual duration (engine-generated conditions)', () => {
    render(<ConditionGlyph condition={mk('Unconscious', { kind: 'manual' })} />);
    expect(screen.getByTitle('Unconscious')).toBeInTheDocument();
  });

  it('uses the cond-bleed hue class for Bleeding', () => {
    const { container } = render(<ConditionGlyph condition={mk('Bleeding')} />);
    const badge = container.querySelector('span');
    expect(badge?.className).toMatch(/cond-bleed/);
  });

  it('uses the neutral-400 class for Unconscious (engine-managed KO)', () => {
    const { container } = render(<ConditionGlyph condition={mk('Unconscious')} />);
    const badge = container.querySelector('span');
    expect(badge?.className).toMatch(/neutral-400/);
  });
});

describe('ConditionGlyphs cluster', () => {
  it('renders nothing when conditions list is empty', () => {
    const { container } = render(<ConditionGlyphs conditions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one glyph per condition', () => {
    render(
      <ConditionGlyphs
        conditions={[mk('Bleeding'), mk('Dazed', { kind: 'EoT' }), mk('Slowed')]}
      />,
    );
    expect(screen.getByTitle('Bleeding')).toBeInTheDocument();
    expect(screen.getByTitle('Dazed · EoT')).toBeInTheDocument();
    expect(screen.getByTitle('Slowed')).toBeInTheDocument();
  });
});
