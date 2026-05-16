import type { OpenAction } from '@ironyard/shared';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenActionRow } from './OpenActionRow';

afterEach(cleanup);

function makeOA(overrides: Partial<OpenAction> = {}): OpenAction {
  return {
    id: 'oa-1',
    kind: 'title-doomed-opt-in' as OpenAction['kind'],
    participantId: 'p1',
    raisedAtRound: 1,
    raisedByIntentId: 'i-1',
    expiresAtRound: null,
    payload: {},
    ...overrides,
  };
}

describe('OpenActionRow', () => {
  it('renders a hero-tone "FOR YOU" meta line + filled Claim button when target is the viewer', () => {
    render(
      <OpenActionRow
        oa={makeOA()}
        title="Free strike available"
        body="You may make a free strike."
        claimLabel="Claim"
        currentRound={3}
        viewerOwnerForRow="self"
        canClaim
        ownerName="You"
        onClaim={vi.fn()}
      />,
    );
    expect(screen.getByText('Free strike available')).toBeInTheDocument();
    expect(screen.getByText(/FOR YOU/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /claim/i })).toBeEnabled();
  });

  it('renders "FOR KORVA" + a Watching button when target is another player', () => {
    render(
      <OpenActionRow
        oa={makeOA()}
        title="Hero token spent"
        body="Korva spent a hero token."
        claimLabel="Claim"
        currentRound={3}
        viewerOwnerForRow="other-player"
        canClaim={false}
        ownerName="KORVA"
        onClaim={vi.fn()}
      />,
    );
    expect(screen.getByText(/FOR KORVA/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /watching/i })).toBeDisabled();
  });

  it('renders outlined Claim button for director-override (canClaim=true on other-player row)', () => {
    render(
      <OpenActionRow
        oa={makeOA()}
        title="Free strike available"
        body="Korva may make a free strike."
        claimLabel="Claim"
        currentRound={3}
        viewerOwnerForRow="other-player"
        canClaim
        ownerName="KORVA"
        onClaim={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: /claim/i });
    expect(btn).toBeEnabled();
  });

  it('fires onClaim with the OA id when Claim is clicked', async () => {
    const user = userEvent.setup();
    const onClaim = vi.fn();
    render(
      <OpenActionRow
        oa={makeOA({ id: 'oa-xyz' })}
        title="x"
        body="y"
        claimLabel="Claim"
        currentRound={1}
        viewerOwnerForRow="self"
        canClaim
        ownerName="You"
        onClaim={onClaim}
      />,
    );
    await user.click(screen.getByRole('button', { name: /claim/i }));
    expect(onClaim).toHaveBeenCalledWith('oa-xyz');
  });
});
