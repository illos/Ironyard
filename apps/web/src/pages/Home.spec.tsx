import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as ActiveContext from '../lib/active-context';
import * as Mutations from '../api/mutations';
import * as Queries from '../api/queries';
import { Home } from './Home';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Mock Link/useNavigate from @tanstack/react-router
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>(
    '@tanstack/react-router',
  );
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
    // biome-ignore lint/suspicious/noExplicitAny: test stub matches the shape that Home reads
    mutate: vi.fn(),
    isPending: false,
    error: null,
    // biome-ignore lint/suspicious/noExplicitAny: partial mock of a react-query mutation result
  } as any);
});

describe('Home', () => {
  it('shows the no-active-campaign empty state when authenticated and activeCampaignId is null', () => {
    vi.spyOn(ActiveContext, 'useActiveContext').mockReturnValue({
      activeCampaignId: null,
      activeCharacterId: null,
    });
    vi.spyOn(Queries, 'useMe').mockReturnValue({
      data: { user: { id: 'u1', email: 'a@b', displayName: 'A' } },
      isLoading: false,
      // biome-ignore lint/suspicious/noExplicitAny: partial mock of a react-query result
    } as any);
    render(<Home />);
    expect(screen.getByText(/no active campaign/i)).toBeInTheDocument();
    expect(screen.getByText(/start campaign/i)).toBeInTheDocument();
    expect(screen.getByText(/join campaign/i)).toBeInTheDocument();
  });

  it('shows the dev sign-in form when unauthenticated', () => {
    vi.spyOn(ActiveContext, 'useActiveContext').mockReturnValue({
      activeCampaignId: null,
      activeCharacterId: null,
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
});
