import type { OpenAction } from '@ironyard/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OpenActionsList } from './OpenActionsList';

function fakeOA(overrides: Partial<OpenAction> = {}): OpenAction {
  return {
    id: 'oa-1',
    kind: 'title-doomed-opt-in',
    participantId: 'pc-1',
    raisedAtRound: 1,
    raisedByIntentId: 'i-1',
    expiresAtRound: null,
    payload: {},
    ...overrides,
  } as OpenAction;
}

describe('OpenActionsList', () => {
  it('renders nothing (null) when the list is empty', () => {
    const html = renderToStaticMarkup(
      <OpenActionsList
        openActions={[]}
        currentUserId="alice"
        activeDirectorId="alice"
        currentRound={1}
        participantDisplayLookup={() => ({ ownerId: 'alice', name: 'Alice' })}
        onClaim={() => {}}
      />,
    );
    expect(html).toBe('');
  });

  it('renders an entry with the registered copy title for title-doomed-opt-in', () => {
    const html = renderToStaticMarkup(
      <OpenActionsList
        openActions={[fakeOA()]}
        currentUserId="alice"
        activeDirectorId="alice"
        currentRound={1}
        participantDisplayLookup={() => ({ ownerId: 'alice', name: 'Alice' })}
        onClaim={() => {}}
      />,
    );
    expect(html).toContain('Embrace your doom?');
  });

  it('renders the Claim button enabled for the targeted PC\'s owner', () => {
    const html = renderToStaticMarkup(
      <OpenActionsList
        openActions={[fakeOA({ participantId: 'pc-1' })]}
        currentUserId="alice"
        activeDirectorId="gm"
        currentRound={1}
        participantDisplayLookup={(pid) => (pid === 'pc-1' ? { ownerId: 'alice', name: 'Alice' } : { ownerId: null, name: null })}
        onClaim={() => {}}
      />,
    );
    // Button is rendered without `disabled=""` for the eligible owner.
    expect(html).toContain('<button');
    expect(html).not.toMatch(/disabled=""[^>]*>Claim</);
  });

  it('renders the Claim button enabled for the active director', () => {
    const html = renderToStaticMarkup(
      <OpenActionsList
        openActions={[fakeOA({ participantId: 'pc-1' })]}
        currentUserId="gm"
        activeDirectorId="gm"
        currentRound={1}
        participantDisplayLookup={(pid) => (pid === 'pc-1' ? { ownerId: 'alice', name: 'Alice' } : { ownerId: null, name: null })}
        onClaim={() => {}}
      />,
    );
    expect(html).not.toMatch(/disabled=""[^>]*>Claim</);
  });

  it('renders the Claim button disabled for non-eligible users', () => {
    const html = renderToStaticMarkup(
      <OpenActionsList
        openActions={[fakeOA({ participantId: 'pc-1' })]}
        currentUserId="bob"
        activeDirectorId="gm"
        currentRound={1}
        participantDisplayLookup={(pid) => (pid === 'pc-1' ? { ownerId: 'alice', name: 'Alice' } : { ownerId: null, name: null })}
        onClaim={() => {}}
      />,
    );
    expect(html).toMatch(/disabled=""/);
  });
});
