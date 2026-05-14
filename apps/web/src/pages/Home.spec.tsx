import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ActiveContext from '../lib/active-context';
import { Home } from './Home';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Mock Link/useNavigate from @tanstack/react-router
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
  return {
    ...actual,
    Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string; [k: string]: unknown }) => (
      <a href={to} {...rest}>{children}</a>
    ),
    useNavigate: () => () => {},
  };
});

describe('Home', () => {
  it('shows the no-active-campaign empty state when activeCampaignId is null', () => {
    vi.spyOn(ActiveContext, 'useActiveContext').mockReturnValue({
      activeCampaignId: null,
      activeCharacterId: null,
    });
    render(<Home />);
    expect(screen.getByText(/no active campaign/i)).toBeInTheDocument();
    expect(screen.getByText(/start campaign/i)).toBeInTheDocument();
    expect(screen.getByText(/join campaign/i)).toBeInTheDocument();
  });
});
