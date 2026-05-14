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

  it('updates data-theme when prop changes', () => {
    const { rerender } = render(
      <ThemeProvider theme="dark">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    rerender(
      <ThemeProvider theme="light">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('updates data-density when prop changes', () => {
    const { rerender } = render(
      <ThemeProvider density="default">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute('data-density')).toBe('default');
    rerender(
      <ThemeProvider density="compact">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
  });
});
