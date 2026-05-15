import type { Character, Participant } from '@ironyard/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Queries from '../../../api/queries';
import * as SessionSocket from '../../../ws/useSessionSocket';
import { DoomsightBecomeDoomedButton } from '../DoomsightBecomeDoomedButton';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const hakaan: Character = {
  ancestryId: 'hakaan',
  ancestryChoices: { traitIds: ['doomsight'] },
} as unknown as Character;

const hakaan_no_doomsight: Character = {
  ancestryId: 'hakaan',
  ancestryChoices: { traitIds: [] },
} as unknown as Character;

const human: Character = {
  ancestryId: 'human',
  ancestryChoices: { traitIds: [] },
} as unknown as Character;

function makeParticipant(staminaState: Participant['staminaState'] = 'healthy'): Participant {
  return {
    id: 'p1',
    kind: 'pc',
    name: 'Thresh',
    staminaState,
    currentStamina: 30,
    maxStamina: 40,
  } as unknown as Participant;
}

const CAMPAIGN_ID = 'camp-1';

// ── Mock setup ────────────────────────────────────────────────────────────────

let mockDispatch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockDispatch = vi.fn().mockReturnValue(true);

  vi.spyOn(Queries, 'useMe').mockReturnValue({
    data: { user: { id: 'user-1', email: 'test@example.com', displayName: 'Test' } },
    isLoading: false,
    // biome-ignore lint/suspicious/noExplicitAny: partial mock
  } as any);

  vi.spyOn(SessionSocket, 'useSessionSocket').mockReturnValue({
    dispatch: mockDispatch,
    status: 'open',
    members: [],
    activeEncounter: null,
    activeDirectorId: null,
    currentSessionId: null,
    attendingCharacterIds: [],
    heroTokens: 0,
    lastRejection: null,
    intentLog: [],
    openActions: [],
    // biome-ignore lint/suspicious/noExplicitAny: partial mock
  } as any);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DoomsightBecomeDoomedButton', () => {
  it('renders for Hakaan with Doomsight trait', () => {
    render(
      <DoomsightBecomeDoomedButton
        character={hakaan}
        participant={makeParticipant()}
        campaignId={CAMPAIGN_ID}
      />,
    );
    expect(screen.getByRole('region', { name: /doomsight/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /become doomed/i })).toBeInTheDocument();
  });

  it('does NOT render for non-Hakaan PC', () => {
    const { container } = render(
      <DoomsightBecomeDoomedButton
        character={human}
        participant={makeParticipant()}
        campaignId={CAMPAIGN_ID}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('does NOT render for Hakaan without Doomsight trait', () => {
    const { container } = render(
      <DoomsightBecomeDoomedButton
        character={hakaan_no_doomsight}
        participant={makeParticipant()}
        campaignId={CAMPAIGN_ID}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('opens confirm modal on click', () => {
    render(
      <DoomsightBecomeDoomedButton
        character={hakaan}
        participant={makeParticipant()}
        campaignId={CAMPAIGN_ID}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /become doomed/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/auto tier-3/i)).toBeInTheDocument();
  });

  it('dispatches BecomeDoomed on confirm', () => {
    const participant = makeParticipant();
    render(
      <DoomsightBecomeDoomedButton
        character={hakaan}
        participant={participant}
        campaignId={CAMPAIGN_ID}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /become doomed/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes.*become doomed/i }));
    expect(mockDispatch).toHaveBeenCalledOnce();
    // biome-ignore lint/suspicious/noExplicitAny: test-only access to mock call args
    const sentIntent = (mockDispatch.mock.calls[0] as any[])[0] as {
      type: string;
      payload: unknown;
    };
    expect(sentIntent.type).toBe('BecomeDoomed');
    expect(sentIntent.payload).toMatchObject({
      participantId: 'p1',
      source: 'hakaan-doomsight',
    });
  });

  it('closes modal on cancel', () => {
    render(
      <DoomsightBecomeDoomedButton
        character={hakaan}
        participant={makeParticipant()}
        campaignId={CAMPAIGN_ID}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /become doomed/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('is disabled when participant.staminaState === "dead"', () => {
    render(
      <DoomsightBecomeDoomedButton
        character={hakaan}
        participant={makeParticipant('dead')}
        campaignId={CAMPAIGN_ID}
      />,
    );
    expect(screen.getByRole('button', { name: /become doomed/i })).toBeDisabled();
  });

  it('is disabled when participant.staminaState === "doomed"', () => {
    render(
      <DoomsightBecomeDoomedButton
        character={hakaan}
        participant={makeParticipant('doomed')}
        campaignId={CAMPAIGN_ID}
      />,
    );
    expect(screen.getByRole('button', { name: /become doomed/i })).toBeDisabled();
  });

  it('is disabled when no active encounter (participant is null)', () => {
    render(
      <DoomsightBecomeDoomedButton
        character={hakaan}
        participant={null}
        campaignId={CAMPAIGN_ID}
      />,
    );
    expect(screen.getByRole('button', { name: /become doomed/i })).toBeDisabled();
  });
});
