// apps/web/src/primitives/Button.tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'default' | 'primary' | 'ghost';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-ink-2 text-text border border-line hover:border-accent',
  primary: 'bg-accent text-ink-0 border border-accent-strong hover:bg-accent-strong font-semibold',
  ghost:
    'bg-transparent text-text-dim border border-transparent hover:text-text hover:border-line-soft',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-9 px-3 text-sm',
};

export function Button({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-1.5 transition-colors ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </button>
  );
}
