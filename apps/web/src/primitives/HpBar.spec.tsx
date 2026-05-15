import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { HpBar } from './HpBar';

afterEach(cleanup);

describe('HpBar', () => {
  describe('compact (existing) variant', () => {
    it('renders a 4px bar with no inset text', () => {
      const { container } = render(<HpBar current={50} max={100} compact />);
      expect(container.textContent).toBe('');
    });
  });

  describe('variant: "inline"', () => {
    it('renders the current/max readout inside a taller bar', () => {
      render(<HpBar current={78} max={110} variant="inline" />);
      expect(screen.getByText('78')).toBeInTheDocument();
      expect(screen.getByText('/110')).toBeInTheDocument();
    });

    it('uses hp-good styling when current >= 50% of max', () => {
      const { container } = render(<HpBar current={75} max={100} variant="inline" />);
      expect(container.innerHTML).toMatch(/hp-good/);
    });

    it('uses hp-warn styling when current is 25-50% of max', () => {
      const { container } = render(<HpBar current={30} max={100} variant="inline" />);
      expect(container.innerHTML).toMatch(/hp-warn/);
    });

    it('uses hp-bad styling when current is <25% of max', () => {
      const { container } = render(<HpBar current={10} max={100} variant="inline" />);
      expect(container.innerHTML).toMatch(/hp-bad/);
    });
  });
});
