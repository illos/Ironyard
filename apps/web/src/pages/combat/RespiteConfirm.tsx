import type { Character, Item } from '@ironyard/shared';
import { useState } from 'react';

// Slice 4 (Epic 2C) Respite confirm modal. Players or director press the
// "Respite" trigger from the campaign screen; this modal previews what
// changes and collects the per-character Dragon Knight Wyrmplate damage-type
// pick. On confirm the parent dispatches a Respite intent with
// `wyrmplateChoices` populated. The DO stamps `safelyCarryWarnings` at
// dispatch time from the live participant inventory; the warning block here
// is informational only (it previews characters carrying > 3 equipped
// leveled treasures so the player isn't surprised by the resulting roll).
//
// Wire-up pattern (used by CampaignView.tsx):
//   const [open, setOpen] = useState(false);
//   <RespiteConfirm
//     characters={characters}
//     items={items}
//     onConfirm={({ wyrmplateChoices }) => {
//       dispatch(buildIntent({
//         campaignId, type: IntentTypes.Respite,
//         payload: { wyrmplateChoices }, actor,
//       }));
//       setOpen(false);
//     }}
//     onClose={() => setOpen(false)}
//   />

// Damage types the canon allows a Dragon Knight to select for Wyrmplate.
// Matches §10.17 — Dragon Knight Wyrmplate. Mirrors the engine-side list in
// packages/rules; if a new type is added there, update this picker too.
const DAMAGE_TYPES = [
  'acid',
  'cold',
  'corruption',
  'fire',
  'holy',
  'lightning',
  'poison',
  'psychic',
  'sonic',
] as const;

type Props = {
  characters: Character[];
  items: Item[];
  onConfirm: (payload: { wyrmplateChoices: Record<string, string> }) => void;
  onClose: () => void;
};

export function RespiteConfirm({ characters, items, onConfirm, onClose }: Props) {
  const dks = characters.filter((c) => c.ancestryId === 'dragon-knight');
  // Seed each DK with their current pick (or 'fire' as a safe default). The
  // map is keyed by character id so multiple DKs can be picked at once if a
  // party happens to have several.
  const [wyrmplateChoices, setWyrmplateChoices] = useState<Record<string, string>>(
    Object.fromEntries(
      dks.map((c) => [
        // Character schema doesn't carry an id field — the id comes from the
        // CharacterResponse wrapper. We thread it in via the Character cast
        // upstream; for the rendering branch below we look it up via the
        // same index. Tests pass id-bearing fixtures explicitly.
        (c as Character & { id: string; name?: string }).id,
        c.ancestryChoices?.wyrmplateType ?? 'fire',
      ]),
    ),
  );

  // 3-safely-carry preview. Canon §10.17 caps the comfortable carry at 3
  // leveled treasures; over that, the character has to make a Presence roll
  // at respite. The real warning fires reducer-side from the participant
  // inventory; this block is a heads-up so the player isn't surprised.
  const safelyCarryRisks = characters
    .map((c) => {
      const count = c.inventory.filter((e) => {
        if (!e.equipped) return false;
        const item = items.find((i) => i.id === e.itemId);
        return item?.category === 'leveled-treasure';
      }).length;
      return count > 3 ? { character: c, count } : null;
    })
    .filter(
      (r): r is { character: Character & { id: string; name?: string }; count: number } =>
        r !== null,
    );

  return (
    // biome-ignore lint/a11y/useSemanticElements: matches PushItemModal — controlled React modal
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md space-y-3 rounded-lg border border-neutral-700 bg-neutral-900 p-4">
        <h2 className="text-lg font-semibold">Respite</h2>
        <p className="text-xs text-neutral-400">
          24h of rest. Heroes regain stamina + recoveries; Victories convert to XP; negative
          resources reset to 0.
        </p>

        {dks.length > 0 && (
          <section>
            <h3 className="mb-1 text-sm font-medium">Wyrmplate damage type</h3>
            {dks.map((c) => {
              const aug = c as Character & { id: string; name?: string };
              const id = aug.id;
              return (
                <div key={id} className="mb-2">
                  <label htmlFor={`wyrmplate-${id}`} className="block text-xs text-neutral-400">
                    {aug.name ?? id}
                  </label>
                  <select
                    id={`wyrmplate-${id}`}
                    className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm"
                    value={wyrmplateChoices[id] ?? 'fire'}
                    onChange={(e) =>
                      setWyrmplateChoices({ ...wyrmplateChoices, [id]: e.target.value })
                    }
                  >
                    {DAMAGE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </section>
        )}

        {safelyCarryRisks.length > 0 && (
          <section className="rounded border border-amber-700 bg-amber-900/30 p-2 text-xs text-amber-300">
            <strong>3-safely-carry warning.</strong>
            <ul className="mt-1 list-disc pl-4">
              {safelyCarryRisks.map((r) => (
                <li key={r.character.id}>
                  {r.character.name ?? r.character.id} carries {r.count} leveled treasures —
                  Presence roll required at respite (canon § 10.17).
                </li>
              ))}
            </ul>
          </section>
        )}

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
            onClick={() => onConfirm({ wyrmplateChoices })}
            className="min-h-[44px] rounded bg-emerald-700 px-3 text-sm"
          >
            Confirm respite
          </button>
        </div>
      </div>
    </div>
  );
}
