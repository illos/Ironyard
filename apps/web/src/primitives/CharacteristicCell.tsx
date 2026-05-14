import type { HTMLAttributes } from 'react';

export interface CharacteristicCellProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: number;
  locked?: boolean;
}

export function CharacteristicCell({
  label,
  value,
  locked = false,
  className = '',
  ...rest
}: CharacteristicCellProps) {
  return (
    <div
      {...rest}
      className={`flex flex-col items-center justify-center gap-1 p-3 bg-ink-2 border border-line ${className}`}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-mute">
        {label}{locked && ' · locked'}
      </span>
      <span className="text-2xl font-semibold tabular text-text">
        {value >= 0 ? `+${value}` : value}
      </span>
    </div>
  );
}
