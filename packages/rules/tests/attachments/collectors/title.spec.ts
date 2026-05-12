// Smoke tests for the title collector. Slice 5 of Phase 2 Epic 2B authors
// one canonical-example title override per effect category (stat-mod and
// grant-ability) to prove the title collector path works end-to-end.

import { describe, expect, it } from 'vitest';
import { collectFromTitle } from '../../../src/attachments/collectors/title';
import { CharacterSchema } from '@ironyard/shared';
import type { StaticDataBundle } from '../../../src/static-data';

// The title collector reads only `character.titleId`. The bundle argument
// is a placeholder for future canon-lookup work.
const BUNDLE_STUB = {} as never as StaticDataBundle;

describe('collectFromTitle — stat-mod (knight)', () => {
  it('emits a maxStamina stat-mod attachment when titleId = "knight"', () => {
    const char = CharacterSchema.parse({ titleId: 'knight' });
    const out = collectFromTitle(char, BUNDLE_STUB);
    expect(out).toHaveLength(1);
    const att = out[0]!;
    expect(att.source.kind).toBe('title');
    expect(att.source.id).toBe('knight');
    expect(att.effect).toEqual({ kind: 'stat-mod', stat: 'maxStamina', delta: 6 });
  });

  it('emits nothing when titleId is null', () => {
    const char = CharacterSchema.parse({ titleId: null });
    const out = collectFromTitle(char, BUNDLE_STUB);
    expect(out).toEqual([]);
  });

  it('emits nothing when titleId has no override entry', () => {
    const char = CharacterSchema.parse({ titleId: 'some-unknown-title' });
    const out = collectFromTitle(char, BUNDLE_STUB);
    expect(out).toEqual([]);
  });
});

describe('collectFromTitle — grant-ability (zombie-slayer)', () => {
  it('emits a grant-ability attachment when titleId = "zombie-slayer"', () => {
    const char = CharacterSchema.parse({ titleId: 'zombie-slayer' });
    const out = collectFromTitle(char, BUNDLE_STUB);
    expect(out).toHaveLength(1);
    const att = out[0]!;
    expect(att.source.kind).toBe('title');
    expect(att.source.id).toBe('zombie-slayer');
    expect(att.effect).toEqual({
      kind: 'grant-ability',
      abilityId: 'zombie-slayer-holy-terror',
    });
  });
});
