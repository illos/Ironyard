import type { HTMLAttributes } from 'react';

export interface ActiveCharacterChipProps extends HTMLAttributes<HTMLDivElement> {
  username: string;
  characterName: string;
}

export function ActiveCharacterChip({
  username,
  characterName,
  className = '',
  ...rest
}: ActiveCharacterChipProps) {
  return (
    <div {...rest} className={`flex flex-col items-end gap-px leading-tight ${className}`}>
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-mute">
        {username} playing
      </span>
      <span className="text-sm font-semibold tracking-tight text-accent">{characterName}</span>
    </div>
  );
}
