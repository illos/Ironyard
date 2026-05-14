import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from './ThemeProvider';

afterEach(() => cleanup());

describe('ThemeProvider', () => {
  it('sets data-theme=dark and data-pack=lightning by default', () => {
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>,
    );
    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-pack')).toBe('lightning');
    expect(root.getAttribute('data-density')).toBe('default');
  });

  it('updates data-pack when prop changes', () => {
    const { rerender } = render(
      <ThemeProvider pack="shadow">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute('data-pack')).toBe('shadow');
    rerender(
      <ThemeProvider pack="fireball">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute('data-pack')).toBe('fireball');
  });
});
