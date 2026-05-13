import type { Kit } from '@ironyard/shared';
import { useState } from 'react';

// Slice 1 (Epic 2C) kit-picker modal. Renders the full kit list as a vertical
// touch-friendly list; selection is local state until Confirm fires. The
// parent (PlayerSheetPanel) handles SwapKit dispatch and modal close. Confirm
// is disabled when no kit is selected or when the selection matches the
// current kit — the reducer would no-op in that case anyway.
type Props = {
  kits: Kit[];
  currentKitId: string | null;
  onConfirm: (kitId: string) => void;
  onClose: () => void;
};

export function SwapKitModal({ kits, currentKitId, onConfirm, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(currentKitId);
  // The native <dialog> element requires imperative showModal()/close() calls
  // and has quirky scrolling/focus behavior. We render a controlled React
  // modal via a styled div with role="dialog" + aria-modal="true" for
  // screen-reader semantics — the prevailing pattern across the app.
  return (
    // biome-ignore lint/a11y/useSemanticElements: see comment above
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-4">
        <h2 className="mb-2 text-lg font-semibold">Swap kit</h2>
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {kits.map((k) => (
            <li key={k.id}>
              <button
                type="button"
                className={`w-full min-h-[44px] rounded px-2 text-left text-sm ${
                  selected === k.id ? 'bg-emerald-900/40' : 'hover:bg-neutral-800'
                }`}
                onClick={() => setSelected(k.id)}
              >
                {k.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded border border-neutral-700 px-3 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || selected === currentKitId}
            onClick={() => selected && onConfirm(selected)}
            className="min-h-[44px] rounded bg-emerald-700 px-3 text-sm disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
