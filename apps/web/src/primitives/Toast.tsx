import type { ReactNode } from 'react';

export interface ToastProps {
  children: ReactNode;
  onDismiss?: () => void;
  /** Undo affordance label; calls onDismiss on click. */
  undoLabel?: string;
}

export function Toast({ children, onDismiss, undoLabel }: ToastProps) {
  return (
    <div className="toast-enter bg-ink-1 border border-line px-3 py-2 flex items-center gap-3 text-sm text-text shadow-lg">
      <span className="flex-1">{children}</span>
      {undoLabel && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent hover:text-accent-strong"
        >
          {undoLabel}
        </button>
      )}
    </div>
  );
}
