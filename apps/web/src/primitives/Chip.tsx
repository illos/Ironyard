// apps/web/src/primitives/Chip.tsx
import type { HTMLAttributes, ReactNode } from 'react';

export type ChipShape = 'square' | 'pill';
export type ChipSize = 'xs' | 'sm';

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  shape?: ChipShape;
  size?: ChipSize;
  selected?: boolean;
  children: ReactNode;
}

const sizeClasses: Record<ChipSize, string> = {
  xs: 'text-[10px] px-1.5 py-0.5',
  sm: 'text-xs px-2 py-1',
};

export function Chip({
  shape = 'square',
  size = 'sm',
  selected = false,
  className = '',
  children,
  ...rest
}: ChipProps) {
  const shapeClass = shape === 'pill' ? 'rounded-full' : '';
  const selectedClass = selected
    ? 'border-accent text-text bg-ink-3'
    : 'border-line text-text-dim bg-ink-2';
  return (
    <span
      {...rest}
      className={`inline-flex items-center gap-1 border tabular ${sizeClasses[size]} ${shapeClass} ${selectedClass} ${className}`}
    >
      {children}
    </span>
  );
}
