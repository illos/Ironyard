import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ParticipantRow } from './ParticipantRow';

afterEach(cleanup);

/** Minimum valid props for ParticipantRow */
const BASE = {
  sigil: 'AV',
  name: 'Ash Vey',
  staminaCurrent: 40,
  staminaMax: 60,
} as const;

describe('ParticipantRow — slice 1 state tags', () => {
  it('renders no state tag when staminaState=healthy (default)', () => {
    const { container } = render(<ParticipantRow {...BASE} />);
    // No role="status" element
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('renders no state tag when staminaState=healthy (explicit)', () => {
    const { container } = render(<ParticipantRow {...BASE} staminaState="healthy" />);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('renders WINDED tag with muted tone', () => {
    render(<ParticipantRow {...BASE} staminaState="winded" />);
    const tag = screen.getByRole('status');
    expect(tag.textContent).toBe('WINDED');
    expect(tag.className).toMatch(/text-text-mute/);
  });

  it('renders DYING tag with foe tone', () => {
    render(<ParticipantRow {...BASE} staminaState="dying" />);
    const tag = screen.getByRole('status');
    expect(tag.textContent).toBe('DYING');
    expect(tag.className).toMatch(/text-foe/);
  });

  it('renders DEAD tag with foe tone and strikes through the name', () => {
    render(<ParticipantRow {...BASE} staminaState="dead" />);
    const tag = screen.getByRole('status');
    expect(tag.textContent).toBe('DEAD');
    expect(tag.className).toMatch(/text-foe/);
    // Name span should carry line-through + opacity
    const nameSpan = screen.getByText('Ash Vey');
    expect(nameSpan.className).toMatch(/line-through/);
    expect(nameSpan.className).toMatch(/opacity-60/);
  });

  it('renders KO tag with 💤 glyph and foe tone', () => {
    render(<ParticipantRow {...BASE} staminaState="unconscious" />);
    const tag = screen.getByRole('status');
    // textContent includes both the glyph span and the text
    expect(tag.textContent).toContain('💤');
    expect(tag.textContent).toContain('KO');
    expect(tag.className).toMatch(/text-foe/);
  });

  it('renders INERT (12h) tag with muted tone', () => {
    render(<ParticipantRow {...BASE} staminaState="inert" />);
    const tag = screen.getByRole('status');
    expect(tag.textContent).toBe('INERT (12h)');
    expect(tag.className).toMatch(/text-text-mute/);
  });

  it('renders RUBBLE (12h) tag with muted tone', () => {
    render(<ParticipantRow {...BASE} staminaState="rubble" />);
    const tag = screen.getByRole('status');
    expect(tag.textContent).toBe('RUBBLE (12h)');
    expect(tag.className).toMatch(/text-text-mute/);
  });

  it('renders DOOMED tag with 🔥 glyph and hero (accent) tone', () => {
    render(<ParticipantRow {...BASE} staminaState="doomed" />);
    const tag = screen.getByRole('status');
    expect(tag.textContent).toContain('🔥');
    expect(tag.textContent).toContain('DOOMED');
    expect(tag.className).toMatch(/text-accent/);
  });

  it('does not strike through the name when staminaState is not dead', () => {
    render(<ParticipantRow {...BASE} staminaState="winded" />);
    const nameSpan = screen.getByText('Ash Vey');
    expect(nameSpan.className).not.toMatch(/line-through/);
  });
});
