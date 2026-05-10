import { describe, expect, it } from 'vitest';
import {
  type CanonStatus,
  deriveSlugFragment,
  extractStatus,
  parseCanonDoc,
  renderRegistry,
} from '../scripts/canon-parse';

describe('extractStatus', () => {
  it('reads ✅ as verified', () => {
    expect(extractStatus('## 1. Power rolls (resolution) ✅')).toBe('verified');
  });

  it('reads 🚧 as drafted', () => {
    expect(extractStatus('## 5. Heroic resources & surges 🚧')).toBe('drafted');
  });

  it('reads ⛔ as tbd', () => {
    expect(extractStatus('## 99. Hypothetical ⛔')).toBe('tbd');
  });

  it('returns null when no marker is present', () => {
    expect(extractStatus('### 1.1 The roll')).toBeNull();
  });
});

describe('deriveSlugFragment', () => {
  it('kebab-cases an h2 with a parenthetical', () => {
    expect(deriveSlugFragment('1. Power rolls (resolution) ✅')).toBe('power-rolls');
  });

  it('drops the section number on an h3', () => {
    expect(deriveSlugFragment('1.1 The roll')).toBe('the-roll');
  });

  it('handles em dashes', () => {
    expect(deriveSlugFragment('5.3 Talent — Clarity ✅')).toBe('talent-clarity');
  });

  it('expands & to "and"', () => {
    expect(deriveSlugFragment('5. Heroic resources & surges 🚧')).toBe(
      'heroic-resources-and-surges',
    );
  });

  it('strips typographic apostrophes', () => {
    expect(deriveSlugFragment("5.5 Director's Malice ✅")).toBe('directors-malice');
  });

  it('handles multi-segment section numbers', () => {
    expect(deriveSlugFragment('5.4.9 Engine summary')).toBe('engine-summary');
  });

  it('strips parenthetical groups', () => {
    expect(deriveSlugFragment('8. Encounter math (victories, EV) ✅')).toBe('encounter-math');
  });

  it('handles commas (collapses to single hyphen)', () => {
    expect(deriveSlugFragment('7. Saves, resistances, tests ✅')).toBe('saves-resistances-tests');
  });
});

describe('parseCanonDoc', () => {
  const md = [
    '# Rules canon',
    '',
    '## Workflow — how rules enter and change in this doc',
    'Non-numbered, must be skipped.',
    '',
    '### Section status legend',
    'Also skipped.',
    '',
    '## 1. Power rolls (resolution) ✅',
    '',
    '### 1.1 The roll',
    'Prose.',
    '',
    '### 1.9 Critical hits ✅',
    'Prose.',
    '',
    '## 5. Heroic resources & surges 🚧',
    '',
    '### 5.1 The nine resources',
    'Inherits parent status.',
    '',
    '### 5.3 Talent — Clarity ✅',
    'Overrides parent.',
    '',
    '## 99. Hypothetical ⛔',
    '',
    '### 99.1 Some sub',
    'Inherits tbd.',
  ].join('\n');

  const entries = parseCanonDoc(md);
  const map = Object.fromEntries(entries.map((e) => [e.slug, e.status])) as Record<
    string,
    CanonStatus
  >;

  it('emits h2 sections with their explicit status', () => {
    expect(map['power-rolls']).toBe('verified');
    expect(map['heroic-resources-and-surges']).toBe('drafted');
    expect(map.hypothetical).toBe('tbd');
  });

  it('emits h3 sub-sections with parent.child slugs', () => {
    expect(map['power-rolls.the-roll']).toBeDefined();
    expect(map['heroic-resources-and-surges.talent-clarity']).toBeDefined();
  });

  it('inherits status from parent h2 when h3 has no marker', () => {
    expect(map['power-rolls.the-roll']).toBe('verified');
    expect(map['heroic-resources-and-surges.the-nine-resources']).toBe('drafted');
    expect(map['hypothetical.some-sub']).toBe('tbd');
  });

  it('lets h3 markers override the parent', () => {
    expect(map['heroic-resources-and-surges.talent-clarity']).toBe('verified');
    expect(map['power-rolls.critical-hits']).toBe('verified');
  });

  it('skips non-numbered headings', () => {
    expect(map['workflow-how-rules-enter-and-change-in-this-doc']).toBeUndefined();
    expect(map['section-status-legend']).toBeUndefined();
  });

  it('produces a stable ordering: document order', () => {
    expect(entries.map((e) => e.slug)).toEqual([
      'power-rolls',
      'power-rolls.the-roll',
      'power-rolls.critical-hits',
      'heroic-resources-and-surges',
      'heroic-resources-and-surges.the-nine-resources',
      'heroic-resources-and-surges.talent-clarity',
      'hypothetical',
      'hypothetical.some-sub',
    ]);
  });
});

describe('renderRegistry', () => {
  it('emits a valid TypeScript module', () => {
    const out = renderRegistry([
      { slug: 'power-rolls', status: 'verified' },
      { slug: 'power-rolls.the-roll', status: 'verified' },
    ]);
    expect(out).toMatch(/^\/\/ @generated/);
    expect(out).toContain("export type CanonStatus = 'verified' | 'drafted' | 'tbd';");
    expect(out).toContain("'power-rolls': 'verified',");
    expect(out).toContain("'power-rolls.the-roll': 'verified',");
    expect(out).toContain('} as const satisfies Record<string, CanonStatus>;');
    expect(out).toContain('export type CanonSlug = keyof typeof canonStatus;');
  });
});
