import type { OpenAction } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { formatOpenAction } from './format-open-action';

describe('formatOpenAction', () => {
  it('returns registered copy for known kinds', () => {
    const oa: OpenAction = {
      id: 'oa-1',
      kind: 'title-doomed-opt-in',
      participantId: 'p1',
      raisedAtRound: 1,
      raisedByIntentId: 'i-1',
      expiresAtRound: null,
      payload: {},
    };
    const { title, body, claimLabel } = formatOpenAction(oa);
    expect(title).toBe('Embrace your doom?');
    expect(body).toContain('doomed');
    expect(claimLabel).toBe('Become doomed');
  });

  it('falls back to a generic title and empty body for unknown kinds', () => {
    const oa = {
      id: 'oa-x',
      kind: 'unregistered-kind',
      participantId: 'p1',
      raisedAtRound: 1,
      raisedByIntentId: 'i-1',
      expiresAtRound: null,
      payload: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const { title, body, claimLabel } = formatOpenAction(oa);
    expect(title).toBe('Open Action: unregistered-kind');
    expect(body).toBe('');
    expect(claimLabel).toBe('Claim');
  });
});

describe('formatOpenAction — slice 2a kinds', () => {
  it.each([
    'spatial-trigger-elementalist-essence',
    'spatial-trigger-tactician-ally-heroic',
    'spatial-trigger-null-field',
    'spatial-trigger-troubadour-line-of-effect',
    'pray-to-the-gods',
    'troubadour-auto-revive',
  ])('produces a non-empty title and body for kind %s', (kind) => {
    const oa = {
      id: 'x',
      kind,
      participantId: 'p',
      raisedAtRound: 1,
      raisedByIntentId: 'i',
      expiresAtRound: null,
      payload: {},
    } as any;
    const { title, body, claimLabel } = formatOpenAction(oa);
    expect(title).toBeTruthy();
    expect(body).toBeTruthy();
    expect(claimLabel).toBeTruthy();
  });
});
