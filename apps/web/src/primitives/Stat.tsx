import type { HTMLAttributes, ReactNode } from 'react';

export interface StatProps extends HTMLAttributes<HTMLSpanElement> {
  label: string;
  value: ReactNode;
}

export function Stat({ label, value, className = '', ...rest }: StatProps) {
  return (
    <span
      {...rest}
      className={`inline-flex items-baseline gap-1.5 font-mono uppercase tracking-[0.08em] text-[11px] text-text-mute ${className}`}
    >
      <span>{label}</span>
      <span className="font-sans text-sm font-semibold text-text tabular">{value}</span>
    </span>
  );
}
