import type { ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function Modal({ open, onClose, title, footer, children }: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg bg-ink-1 border border-line flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <header className="px-4 py-3 border-b border-line-soft text-[11px] uppercase tracking-[0.16em] text-text-mute font-semibold">
            {title}
          </header>
        )}
        <div className="px-4 py-4 overflow-y-auto">{children}</div>
        {footer && (
          <footer className="px-4 py-3 border-t border-line-soft flex justify-end gap-2">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
