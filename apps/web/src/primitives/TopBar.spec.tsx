import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...rest
  }: {
    children: ReactNode;
    to: string;
    [k: string]: unknown;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useLocation: () => ({ pathname: '/' }),
  useNavigate: () => () => {},
}));

vi.mock('../lib/active-context', () => ({
  useActiveContext: () => ({
    activeCampaignId: null,
    setActiveCampaignId: () => {},
  }),
}));

vi.mock('../api/queries', () => ({
  useMyCampaigns: () => ({ data: undefined }),
}));

import { TopBar } from './TopBar';

afterEach(() => cleanup());

describe('TopBar', () => {
  it('renders Mode A when no active campaign', () => {
    render(<TopBar mode="A" />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.queryByText('Foes')).not.toBeInTheDocument();
  });

  it('renders Mode B with Foes link for active director', () => {
    render(<TopBar mode="B" />);
    expect(screen.getByText('Foes')).toBeInTheDocument();
  });

  it('renders Mode C without Foes; shows active-character chip when provided', () => {
    render(<TopBar mode="C" activeCharacter={{ username: 'mike', characterName: 'Ash Vey' }} />);
    expect(screen.queryByText('Foes')).not.toBeInTheDocument();
    expect(screen.getByText('Ash Vey')).toBeInTheDocument();
  });
});
