import type { HTMLAttributes } from 'react';

export interface SigilProps extends HTMLAttributes<HTMLSpanElement> {
  /** Two-letter monogram. Truncated if longer. */
  text: string;
  size?: number;
}

export function Sigil({ text, size = 32, className = '', style, ...rest }: SigilProps) {
  return (
    <span
      {...rest}
      style={{ width: size, height: size, ...style }}
      className={`inline-flex items-center justify-center bg-ink-3 border border-line text-xs font-semibold tracking-wide text-text ${className}`}
    >
      {text.slice(0, 2).toUpperCase()}
    </span>
  );
}
