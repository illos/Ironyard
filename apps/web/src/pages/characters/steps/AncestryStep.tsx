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

// ── Hardcoded pools (prototype-grade; no per-group skills registry yet) ────────

const INTERPERSONAL_SKILLS = ['flirt', 'lead', 'lie', 'persuade'] as const;
const WYRMPLATE_TYPES = ['acid', 'cold', 'corruption', 'fire', 'lightning', 'poison'] as const;

// ── Main step ─────────────────────────────────────────────────────────────────

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

  // Compute trait budget with Revenant +1 adjustment for Size 1S former life.
  let traitBudget = selected ? getAncestryTraitPointBudget(selected.id) : null;
  if (
    draft.ancestryId === 'revenant' &&
    draft.ancestryChoices.formerAncestryId
  ) {
    const formerAncestry = staticData.ancestries.get(
      draft.ancestryChoices.formerAncestryId,
    );
    if (formerAncestry?.defaultSize === '1S') {
      traitBudget = (traitBudget ?? 0) + 1; // 2 + 1 = 3
    }
  }

  const choices = draft.ancestryChoices;
  const patchChoices = (patch: Partial<AncestryChoices>) =>
    onPatch({ ancestryChoices: { ...choices, ...patch } });

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
          budget={traitBudget}
          selected={choices.traitIds}
          onChange={(traitIds) =>
            onPatch({
              ancestryChoices: { ...EMPTY_ANCESTRY_CHOICES, ...choices, traitIds },
            })
          }
        />
      )}

      {draft.ancestryId === 'devil' && (
        <DevilSubPicker
          freeSkillId={choices.freeSkillId}
          onPick={(id) => patchChoices({ freeSkillId: id })}
        />
      )}

      {draft.ancestryId === 'dragon-knight' && (
        <DragonKnightSubPicker
          wyrmplateType={choices.wyrmplateType}
          prismaticScalesType={choices.prismaticScalesType}
          hasPrismaticScales={choices.traitIds.includes('prismatic-scales')}
          onPickWyrmplate={(type) => patchChoices({ wyrmplateType: type })}
          onPickPrismatic={(type) => patchChoices({ prismaticScalesType: type })}
        />
      )}

      {draft.ancestryId === 'revenant' && (
        <RevenantSubPicker
          choices={choices}
          staticData={staticData}
          onPatchChoices={patchChoices}
        />
      )}
    </div>
  );
}

// ── Devil sub-picker ──────────────────────────────────────────────────────────

function DevilSubPicker({
  freeSkillId,
  onPick,
}: {
  freeSkillId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="rounded-md border border-neutral-800 p-4 space-y-2">
      <h3 className="font-medium">Silver Tongue</h3>
      <p className="text-sm text-neutral-400">Choose one interpersonal skill.</p>
      <div className="flex flex-wrap gap-2">
        {INTERPERSONAL_SKILLS.map((skill) => (
          <button
            key={skill}
            type="button"
            onClick={() => onPick(skill)}
            className={
              'min-h-11 px-3 py-2 rounded-md border text-sm capitalize ' +
              (freeSkillId === skill
                ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
            }
          >
            {skill}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Dragon Knight sub-picker ──────────────────────────────────────────────────

function DragonKnightSubPicker({
  wyrmplateType,
  prismaticScalesType,
  hasPrismaticScales,
  onPickWyrmplate,
  onPickPrismatic,
}: {
  wyrmplateType: string | null;
  prismaticScalesType: string | null;
  hasPrismaticScales: boolean;
  onPickWyrmplate: (type: string) => void;
  onPickPrismatic: (type: string) => void;
}) {
  return (
    <div className="rounded-md border border-neutral-800 p-4 space-y-4">
      <div className="space-y-2">
        <h3 className="font-medium">Wyrmplate</h3>
        <p className="text-sm text-neutral-400">Choose your damage immunity type.</p>
        <div className="flex flex-wrap gap-2">
          {WYRMPLATE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onPickWyrmplate(type)}
              className={
                'min-h-11 px-3 py-2 rounded-md border text-sm capitalize ' +
                (wyrmplateType === type
                  ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                  : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
              }
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {hasPrismaticScales && (
        <div className="space-y-2 border-t border-neutral-700 pt-4">
          <h3 className="font-medium">Prismatic Scales</h3>
          <p className="text-sm text-neutral-400">
            Choose a second permanent damage immunity.
          </p>
          <div className="flex flex-wrap gap-2">
            {WYRMPLATE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onPickPrismatic(type)}
                className={
                  'min-h-11 px-3 py-2 rounded-md border text-sm capitalize ' +
                  (prismaticScalesType === type
                    ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                    : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
                }
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Revenant sub-picker ───────────────────────────────────────────────────────

function RevenantSubPicker({
  choices,
  staticData,
  onPatchChoices,
}: {
  choices: AncestryChoices;
  staticData: WizardStaticData;
  onPatchChoices: (patch: Partial<AncestryChoices>) => void;
}) {
  const nonRevenantAncestries = Array.from(staticData.ancestries.values()).filter(
    (a) => a.id !== 'revenant',
  );

  const formerAncestry = choices.formerAncestryId
    ? staticData.ancestries.get(choices.formerAncestryId)
    : null;

  // Slots: one entry per previous-life-* purchase in traitIds.
  const previousLifeSlots = choices.traitIds.filter((id) =>
    id.startsWith('previous-life-'),
  );

  const handleFormerAncestryPick = (id: string) => {
    onPatchChoices({
      formerAncestryId: id,
      previousLifeTraitIds: [],
    });
  };

  const handlePreviousLifePick = (slotIdx: number, traitId: string) => {
    const next = [...choices.previousLifeTraitIds];
    next[slotIdx] = traitId;
    onPatchChoices({ previousLifeTraitIds: next });
  };

  return (
    <div className="rounded-md border border-neutral-800 p-4 space-y-4">
      {/* Former Life ancestry picker */}
      <div className="space-y-2">
        <h3 className="font-medium">Former Life</h3>
        <p className="text-sm text-neutral-400">
          Choose the ancestry you were before you died.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {nonRevenantAncestries.map((a) => {
            const isSelected = a.id === choices.formerAncestryId;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => handleFormerAncestryPick(a.id)}
                className={`text-left rounded-md border px-4 py-3 min-h-11 ${isSelected ? 'bg-neutral-100 text-neutral-900 border-neutral-100' : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600'}`}
              >
                <span className="font-medium">{a.name}</span>
                {a.defaultSize !== '1M' && (
                  <span className="text-xs ml-2 opacity-70">Size {a.defaultSize}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Previous Life trait pickers — one per slot purchased */}
      {previousLifeSlots.length > 0 && formerAncestry && (
        <div className="space-y-4 border-t border-neutral-700 pt-4">
          <h3 className="font-medium">Previous Life Traits</h3>
          {previousLifeSlots.map((slotId, slotIdx) => {
            const cost = slotId.includes('1-point')
              ? 1
              : slotId.includes('2-points')
                ? 2
                : null;
            const eligibleTraits = (formerAncestry.purchasedTraits ?? []).filter(
              (t) => cost === null || t.cost === cost,
            );
            const currentChoice = choices.previousLifeTraitIds[slotIdx] ?? null;

            return (
              <div key={`${slotId}-${slotIdx}`} className="space-y-2">
                <p className="text-sm text-neutral-400">
                  Previous Life slot {slotIdx + 1}{' '}
                  {cost !== null ? `(${cost}-point trait from ${formerAncestry.name})` : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  {eligibleTraits.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handlePreviousLifePick(slotIdx, t.id)}
                      className={
                        'min-h-11 px-3 py-2 rounded-md border text-sm ' +
                        (currentChoice === t.id
                          ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                          : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
                      }
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Prompt when Previous Life slots exist but no former ancestry chosen yet */}
      {previousLifeSlots.length > 0 && !formerAncestry && (
        <p className="text-sm text-neutral-500 border-t border-neutral-700 pt-4">
          Choose your former ancestry above to unlock Previous Life trait picks.
        </p>
      )}
    </div>
  );
}

// ── Traits picker ─────────────────────────────────────────────────────────────

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
