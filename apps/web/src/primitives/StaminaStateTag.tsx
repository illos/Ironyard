import type { StaminaState } from '@ironyard/shared';

// Tailwind v4 JIT: class names must be static strings — no template interpolation.
// Tone-to-class lookup keeps JIT happy (Pass 2b2a PS #2).
const TONE_CLASS = {
  foe:  'text-foe',
  hero: 'text-accent',
  muted: 'text-text-mute',
} as const;

const TAG_COPY: Record<
  Exclude<StaminaState, 'healthy'>,
  { text: string; tone: keyof typeof TONE_CLASS; glyph?: string }
> = {
  winded:      { text: 'WINDED',      tone: 'muted' },
  dying:       { text: 'DYING',       tone: 'foe' },
  dead:        { text: 'DEAD',        tone: 'foe' },
  unconscious: { text: 'KO',          tone: 'foe',   glyph: '💤' },
  inert:       { text: 'INERT (12h)', tone: 'muted' },
  rubble:      { text: 'RUBBLE (12h)', tone: 'muted' },
  doomed:      { text: 'DOOMED',      tone: 'hero',  glyph: '🔥' },
};

export function StaminaStateTag({ state }: { state: StaminaState }) {
  if (state === 'healthy') return null;
  const c = TAG_COPY[state];
  const colorClass = TONE_CLASS[c.tone];
  return (
    <span
      className={`text-xs font-mono uppercase tracking-wider ${colorClass}`}
      role="status"
    >
      {c.glyph && <span aria-hidden>{c.glyph} </span>}
      {c.text}
    </span>
  );
}
