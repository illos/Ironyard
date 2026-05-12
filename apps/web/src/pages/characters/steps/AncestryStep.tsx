import { getAncestryTraitPointBudget } from '@ironyard/shared';
import type { AncestryChoices, Character } from '@ironyard/shared';

const EMPTY_ANCESTRY_CHOICES: AncestryChoices = {
  traitIds: [],
  freeSkillId: null,
  wyrmplateType: null,
  prismaticScalesType: null,
  formerAncestryId: null,
  previousLifeTraitIds: [],
};
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
                onPatch({ ancestryId: a.id, ancestryChoices: EMPTY_ANCESTRY_CHOICES })
              }
              className={`text-left rounded-md border px-4 py-3 min-h-11 ${isSelected ? 'bg-neutral-100 text-neutral-900 border-neutral-100' : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600'}`}
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
          budget={getAncestryTraitPointBudget(selected.id)}
          selected={draft.ancestryChoices?.traitIds ?? []}
          onChange={(traitIds) =>
            onPatch({ ancestryChoices: { ...EMPTY_ANCESTRY_CHOICES, ...draft.ancestryChoices, traitIds } })
          }
        />
      )}
    </div>
  );
}

function TraitsPicker({
  traits,
  budget,
  selected,
  onChange,
}: {
  traits: Array<{ id: string; name: string; cost: number }>;
  budget: number | null;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const traitById = new Map(traits.map((t) => [t.id, t]));

  const spent = selected.reduce((sum, id) => {
    const t = traitById.get(id);
    return sum + (t?.cost ?? 0);
  }, 0);

  const toggle = (id: string) => {
    const t = traitById.get(id);
    if (!t) return;
    const isSelected = selected.includes(id);
    if (isSelected) {
      onChange(selected.filter((x) => x !== id));
    } else {
      if (budget !== null && spent + t.cost > budget) return;
      onChange([...selected, id]);
    }
  };

  const counterClass =
    budget !== null && spent > budget
      ? 'text-rose-400'
      : budget !== null && spent === budget
        ? 'text-emerald-400'
        : 'text-neutral-400';

  return (
    <div className="rounded-md border border-neutral-800 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Purchasable traits</h3>
        {budget !== null && (
          <p className={`text-sm ${counterClass}`}>
            {spent} of {budget} points spent
          </p>
        )}
      </div>
      <ul className="space-y-2">
        {traits.map((t) => {
          const isSelected = selected.includes(t.id);
          const wouldExceed =
            !isSelected && budget !== null && spent + t.cost > budget;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => toggle(t.id)}
                disabled={wouldExceed}
                title={wouldExceed ? 'Not enough points remaining' : undefined}
                className={`w-full text-left rounded-md border px-3 py-2 min-h-11 ${
                  isSelected
                    ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                    : wouldExceed
                      ? 'bg-neutral-900 border-neutral-800 text-neutral-600 cursor-not-allowed'
                      : 'bg-neutral-900 border-neutral-800 hover:border-neutral-600'
                }`}
              >
                <span className="font-medium">{t.name}</span>
                <span className="text-xs ml-2 opacity-70">cost {t.cost}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
