import type { Item } from '@ironyard/shared';
import { useMemo, useState } from 'react';

// Slice 3 (Epic 2C) director push-item modal. Director picks a target
// approved character + searches the item catalog + confirms a quantity,
// then the parent (CampaignView) dispatches a PushItem intent. Confirm is
// disabled until both a character and an item are selected. Selection,
// search text, and quantity live as local state; the parent owns visibility.
//
// Wire-up pattern (for future trigger surfaces, e.g. CombatRun):
//   const [open, setOpen] = useState(false);
//   const approved = useCampaignCharacters(campaignId, 'approved');
//   const items = useItems();
//   const charactersForModal = approved.data?.map((cc) => ({
//     id: cc.characterId,
//     name: cc.characterId.slice(0, 8),
//   })) ?? [];
//   <PushItemModal
//     characters={charactersForModal}
//     items={items.data ?? []}
//     onConfirm={(targetCharacterId, itemId, quantity) => {
//       sock.dispatch(buildIntent({
//         campaignId,
//         type: IntentTypes.PushItem,
//         payload: { targetCharacterId, itemId, quantity },
//         actor,
//       }));
//       setOpen(false);
//     }}
//     onClose={() => setOpen(false)}
//   />

export type ApprovedCharacter = { id: string; name: string };

type Props = {
  characters: ApprovedCharacter[];
  items: Item[];
  onConfirm: (targetCharacterId: string, itemId: string, quantity: number) => void;
  onClose: () => void;
};

export function PushItemModal({ characters, items, onConfirm, onClose }: Props) {
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [quantity, setQuantity] = useState(1);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: matches SwapKitModal pattern — controlled React modal
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-lg space-y-3 rounded-lg border border-neutral-700 bg-neutral-900 p-4">
        <h2 className="text-lg font-semibold">Push item to a player</h2>

        <div>
          <label htmlFor="push-character" className="block text-xs text-neutral-400">
            Target character
          </label>
          <select
            id="push-character"
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm"
            value={characterId ?? ''}
            onChange={(e) => setCharacterId(e.target.value || null)}
          >
            <option value="">— pick —</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="push-search" className="block text-xs text-neutral-400">
            Item search
          </label>
          <input
            id="push-search"
            type="text"
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type to filter…"
          />
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded border border-neutral-800 bg-neutral-950 p-1">
            {filtered.slice(0, 50).map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  className={`w-full min-h-[44px] rounded px-2 text-left text-sm ${
                    itemId === i.id ? 'bg-emerald-900/40' : 'hover:bg-neutral-800'
                  }`}
                  onClick={() => setItemId(i.id)}
                >
                  <span className="font-medium">{i.name}</span>
                  <span className="ml-2 text-xs text-neutral-500">{i.category}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <label htmlFor="push-qty" className="block text-xs text-neutral-400">
            Quantity
          </label>
          <input
            id="push-qty"
            type="number"
            min={1}
            max={99}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
            className="mt-1 w-24 rounded border border-neutral-700 bg-neutral-800 p-2 text-sm"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded border border-neutral-700 px-3 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!characterId || !itemId}
            onClick={() => characterId && itemId && onConfirm(characterId, itemId, quantity)}
            className="min-h-[44px] rounded bg-emerald-700 px-3 text-sm disabled:opacity-50"
          >
            Push item
          </button>
        </div>
      </div>
    </div>
  );
}
