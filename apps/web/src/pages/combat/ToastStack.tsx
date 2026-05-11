export type Toast = {
  id: string;
  // The text to show to the table.
  text: string;
  // Intent id this toast's Undo button should void. Optional — some toasts
  // (e.g. "Round started") aren't undoable from the toast row.
  undoTargetId?: string;
  // True if the undoTarget has already been voided / can't be undone again.
  undone: boolean;
};

type Props = {
  toasts: Toast[];
  onUndo: (intentId: string) => void;
  onDismiss: (toastId: string) => void;
};

export function ToastStack({ toasts, onUndo, onDismiss }: Props) {
  if (toasts.length === 0) return null;
  return (
    // <output> is the semantic equivalent of role="status" per biome's
    // useSemanticElements rule. Wrapped div would also pass — we go with the
    // recommended element so the rule is satisfied without disabling.
    <output
      // Fixed bottom-right on iPad / desktop; top on phone so the toasts don't
      // fight thumb-zone controls.
      className="pointer-events-none fixed left-2 right-2 top-2 sm:left-auto sm:right-4 sm:bottom-4 sm:top-auto sm:max-w-md flex flex-col gap-2 z-50"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto rounded-lg border border-neutral-800 border-l-2 border-l-rose-500 bg-neutral-900/95 backdrop-blur px-4 py-3 shadow-lg shadow-black/40 toast-enter"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-neutral-100 flex-1">{t.text}</p>
            <div className="flex items-center gap-1.5 shrink-0">
              {t.undoTargetId && !t.undone && (
                <button
                  type="button"
                  onClick={() => t.undoTargetId && onUndo(t.undoTargetId)}
                  className="min-h-11 min-w-11 px-3 rounded-md bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-sm font-semibold text-neutral-100 transition-colors"
                >
                  Undo
                </button>
              )}
              <button
                type="button"
                onClick={() => onDismiss(t.id)}
                aria-label="Dismiss"
                className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </div>
        </div>
      ))}
    </output>
  );
}
