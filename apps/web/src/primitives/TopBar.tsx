import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { AccountMenu } from './AccountMenu';
import { ActiveCharacterChip } from './ActiveCharacterChip';

export type TopBarMode = 'A' | 'B' | 'C';

export interface TopBarProps {
  mode: TopBarMode;
  /** Slot for Mode-B campaign breadcrumb / game readouts; Mode-C status chips. */
  middle?: ReactNode;
  /** Slot for Mode-B trailing action buttons (Tweaks, End Round, etc.). */
  trailing?: ReactNode;
  /** Mode-C only: player active-character chip data. */
  activeCharacter?: { username: string; characterName: string };
  onSignOut?: () => void;
}

export function TopBar({
  mode,
  middle,
  trailing,
  activeCharacter,
  onSignOut,
}: TopBarProps) {
  return (
    <div className="h-12 flex-shrink-0 flex items-center gap-4 px-3.5 bg-ink-1 border-b border-line text-xs">
      <Link to="/" className="flex items-center gap-2 font-semibold text-sm">
        <span className="w-[18px] h-[18px] bg-ink-3 border border-line" />
        Ironyard
      </Link>

      <span className="w-px h-[18px] bg-line-soft" />

      <Link to="/" className="text-text-dim hover:text-text">
        Home
      </Link>
      <AccountMenu onSignOut={onSignOut} />

      {mode === 'B' && (
        <Link to="/foes" className="text-text-dim hover:text-text">
          Foes
        </Link>
      )}

      {middle && <span className="flex items-center gap-3">{middle}</span>}

      <span className="flex-1" />

      {trailing}

      {mode === 'C' && activeCharacter && (
        <ActiveCharacterChip
          username={activeCharacter.username}
          characterName={activeCharacter.characterName}
        />
      )}
    </div>
  );
}
