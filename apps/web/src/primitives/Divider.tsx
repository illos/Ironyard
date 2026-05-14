import type { HTMLAttributes } from 'react';

export interface DividerProps extends HTMLAttributes<HTMLSpanElement> {
  orientation?: 'horizontal' | 'vertical';
  variant?: 'soft' | 'full';
}

export function Divider({
  orientation = 'horizontal',
  variant = 'full',
  className = '',
  ...rest
}: DividerProps) {
  const color = variant === 'soft' ? 'bg-line-soft' : 'bg-line';
  const shape = orientation === 'vertical' ? 'w-px h-4' : 'h-px w-full';
  return <span {...rest} className={`block ${shape} ${color} ${className}`} />;
}
