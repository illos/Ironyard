import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Mutations from '../api/mutations';
import * as Queries from '../api/queries';
import * as ActiveContext from '../lib/active-context';
import { Home } from './Home';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Mock Link/useNavigate from @tanstack/react-router
vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...rest
    }: {
      children: React.ReactNode;
      to: string;
      [k: string]: unknown;
    }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    useNavigate: () => () => {},
  };
});

beforeEach(() => {
  // Default: stub useDevLogin so renders that fall to the login panel don't blow up.
  vi.spyOn(Mutations, 'useDevLogin').mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    error: null,
    // biome-ignore lint/suspicious/noExplicitAny: partial mock of a react-query mutation result
  } as any);
  // Default stub for useJoinCampaign — used by the JoinModal inside the
  // no-active-campaign branch.
  vi.spyOn(Mutations, 'useJoinCampaign').mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    error: null,
    // biome-ignore lint/suspicious/noExplicitAny: partial mock of a react-query mutation result
  } as any);
  // Default stub for useMyCampaigns — overridden per test as needed.
  vi.spyOn(Queries, 'useMyCampaigns').mockReturnValue({
    data: [],
    isLoading: false,
    // biome-ignore lint/suspicious/noExplicitAny: partial mock of a react-query result
  } as any);
});

describe('Home', () => {
  it('shows the dev sign-in form when unauthenticated', () => {
    vi.spyOn(ActiveContext, 'useActiveContext').mockReturnValue({
      activeCampaignId: null,
      activeCharacterId: null,
      setActiveCampaignId: vi.fn(),
    });
    vi.spyOn(Queries, 'useMe').mockReturnValue({
      data: null,
      isLoading: false,
      // biome-ignore lint/suspicious/noExplicitAny: partial mock of a react-query result
    } as any);
    render(<Home />);
    // Heading is uppercased via tracking, but the raw text is still "Sign in"
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/you@example\.com/i)).toBeInTheDocument();
  });

  it('shows the YOUR CAMPAIGNS list with Make active buttons when authenticated with campaigns and no active campaign', () => {
    vi.spyOn(ActiveContext, 'useActiveContext').mockReturnValue({
      activeCampaignId: null,
      activeCharacterId: null,
      setActiveCampaignId: vi.fn(),
    });
    vi.spyOn(Queries, 'useMe').mockReturnValue({
      data: { user: { id: 'u1', email: 'a@b', displayName: 'A' } },
      isLoading: false,
      // biome-ignore lint/suspicious/noExplicitAny: partial mock of a react-query result
    } as any);
    vi.spyOn(Queries, 'useMyCampaigns').mockReturnValue({
      data: [
        {
          id: 'c1',
          name: 'Ember Reaches',
          inviteCode: 'ABC123',
          isOwner: true,
          isDirector: true,
        },
        {
          id: 'c2',
          name: 'Hollow Keep',
          inviteCode: 'XYZ789',
          isOwner: false,
          isDirector: false,
        },
      ],
      isLoading: false,
      // biome-ignore lint/suspicious/noExplicitAny: partial mock of a react-query result
    } as any);
    render(<Home />);
    expect(screen.getByText(/no active campaign/i)).toBeInTheDocument();
    expect(screen.getByText('Ember Reaches')).toBeInTheDocument();
    expect(screen.getByText('Hollow Keep')).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();
    expect(screen.getByText('XYZ789')).toBeInTheDocument();
    // role badges
    expect(screen.getByText('owner')).toBeInTheDocument();
    expect(screen.getByText('player')).toBeInTheDocument();
    // One Make active button per row.
    expect(screen.getAllByRole('button', { name: /make active/i })).toHaveLength(2);
    // Action buttons are present.
    expect(screen.getByRole('link', { name: /start a new campaign/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join with code/i })).toBeInTheDocument();
  });

  it('shows the empty-state message when authenticated with no campaigns and no active campaign', () => {
    vi.spyOn(ActiveContext, 'useActiveContext').mockReturnValue({
      activeCampaignId: null,
      activeCharacterId: null,
      setActiveCampaignId: vi.fn(),
    });
    vi.spyOn(Queries, 'useMe').mockReturnValue({
      data: { user: { id: 'u1', email: 'a@b', displayName: 'A' } },
      isLoading: false,
      // biome-ignore lint/suspicious/noExplicitAny: partial mock of a react-query result
    } as any);
    vi.spyOn(Queries, 'useMyCampaigns').mockReturnValue({
      data: [],
      isLoading: false,
      // biome-ignore lint/suspicious/noExplicitAny: partial mock of a react-query result
    } as any);
    render(<Home />);
    expect(screen.getByText(/you're not in any campaigns yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start a new campaign/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join with code/i })).toBeInTheDocument();
  });
});
