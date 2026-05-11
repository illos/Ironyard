import type { Character } from '@ironyard/shared';
import type { WizardStaticData } from '../../../api/static-data';

export function AncestryStep({
  draft,
  staticData,
  onPatch,
}: {
  draft: Character;
  staticData: WizardStaticData;
  onPatch: (p: Partial<Character>) => void;
}) {
  const ancestries = Array.from(staticData.ancestries.values());
  const selected = draft.ancestryId ? staticData.ancestries.get(draft.ancestryId) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ancestries.map((a) => {
          const isSelected = a.id === draft.ancestryId;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() =>
                onPatch({ ancestryId: a.id, ancestryChoices: { traitIds: [] } })
              }
              className={
                'text-left rounded-md border px-4 py-3 min-h-11 ' +
                (isSelected
                  ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                  : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
              }
            >
              <div className="font-medium">{a.name}</div>
              {a.description && <div className="text-xs opacity-80 mt-1">{a.description}</div>}
            </button>
          );
        })}
      </div>

      {selected && selected.purchasedTraits.length > 0 && (
        <TraitsPicker
          traits={selected.purchasedTraits}
          selected={draft.ancestryChoices?.traitIds ?? []}
          onChange={(traitIds) => onPatch({ ancestryChoices: { traitIds } })}
        />
      )}
    </div>
  );
}

function TraitsPicker({
  traits,
  selected,
  onChange,
}: {
  traits: Array<{ id: string; name: string; cost: number }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };
  return (
    <div className="rounded-md border border-neutral-800 p-4 space-y-2">
      <h3 className="font-medium">Purchasable traits</h3>
      <ul className="space-y-2">
        {traits.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => toggle(t.id)}
              className={
                'w-full text-left rounded-md border px-3 py-2 min-h-11 ' +
                (selected.includes(t.id)
                  ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                  : 'bg-neutral-900 border-neutral-800 hover:border-neutral-600')
              }
            >
              <span className="font-medium">{t.name}</span>
              <span className="text-xs ml-2 opacity-70">cost {t.cost}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
