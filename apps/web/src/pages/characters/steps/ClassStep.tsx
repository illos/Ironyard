import { type Character, LevelChoicesSchema } from '@ironyard/shared';
import type { WizardStaticData } from '../../../api/static-data';

export function ClassStep({
  draft,
  staticData,
  onPatch,
}: {
  draft: Character;
  staticData: WizardStaticData;
  onPatch: (p: Partial<Character>) => void;
}) {
  const classes = Array.from(staticData.classes.values());
  const selected = draft.classId ? staticData.classes.get(draft.classId) : null;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm text-neutral-300 mb-1">Class</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {classes.map((cl) => (
            <button
              key={cl.id}
              type="button"
              onClick={() =>
                onPatch({
                  classId: cl.id,
                  subclassId: null,
                  characteristicArray: null,
                  levelChoices: {},
                })
              }
              className={
                'text-left rounded-md border px-4 py-3 min-h-11 ' +
                (cl.id === draft.classId
                  ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                  : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
              }
            >
              <div className="font-medium">{cl.name}</div>
              {cl.description && <div className="text-xs opacity-80 mt-1">{cl.description}</div>}
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <>
          <CharacteristicArrayPicker
            klass={selected}
            value={draft.characteristicArray}
            onChange={(arr) => onPatch({ characteristicArray: arr })}
          />
          <SubclassPicker
            klass={selected}
            value={draft.subclassId}
            onChange={(id) => onPatch({ subclassId: id })}
          />
          <LevelPicks
            draft={draft}
            onChange={(levelChoices) => onPatch({ levelChoices })}
          />
        </>
      )}
    </div>
  );
}

function CharacteristicArrayPicker({
  klass,
  value,
  onChange,
}: {
  klass: { characteristicArrays?: number[][] };
  value: number[] | null;
  onChange: (arr: number[]) => void;
}) {
  const arrays = klass.characteristicArrays ?? [];
  if (arrays.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm text-neutral-300 mb-1">Characteristic array</h3>
      <div className="flex flex-wrap gap-2">
        {arrays.map((arr, i) => {
          const isSelected = value && arr.join(',') === value.join(',');
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(arr)}
              className={
                'min-h-11 px-3 py-2 rounded-md border text-sm font-mono ' +
                (isSelected
                  ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                  : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
              }
            >
              [{arr.join(', ')}]
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SubclassPicker({
  klass,
  value,
  onChange,
}: {
  klass: { subclasses?: Array<{ id: string; name: string }> };
  value: string | null;
  onChange: (id: string) => void;
}) {
  const subs = klass.subclasses ?? [];
  if (subs.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm text-neutral-300 mb-1">Subclass</h3>
      <div className="flex flex-wrap gap-2">
        {subs.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={
              'min-h-11 px-3 py-2 rounded-md border text-sm ' +
              (value === s.id
                ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
            }
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function LevelPicks({
  draft,
  onChange,
}: {
  draft: Character;
  onChange: (lc: Character['levelChoices']) => void;
}) {
  // For prototype, just ensure an empty LevelChoices entry exists per level
  // up to draft.level. Real per-level ability picker is Phase 5 work; the
  // Submit gate only checks that the entries exist (per CompleteCharacterSchema).
  const ensureEntries = () => {
    const next: Character['levelChoices'] = { ...draft.levelChoices };
    for (let lvl = 1; lvl <= draft.level; lvl++) {
      if (!next[String(lvl)]) next[String(lvl)] = LevelChoicesSchema.parse({});
    }
    onChange(next);
  };
  return (
    <div>
      <h3 className="text-sm text-neutral-300 mb-1">Level picks</h3>
      <p className="text-xs text-neutral-500 mb-2">
        Per-level ability / perk / skill picks. Epic 1 ships a stub —
        click below to seed default entries for levels 1–{draft.level}.
        The real interactive picker comes in Phase 5.
      </p>
      <button
        type="button"
        onClick={ensureEntries}
        className="min-h-11 px-3 py-2 rounded-md bg-neutral-100 text-neutral-900 text-sm font-medium"
      >
        Seed levels 1–{draft.level}
      </button>
      <pre className="mt-3 text-xs text-neutral-400 bg-neutral-950 border border-neutral-800 rounded p-3 overflow-x-auto">
        {JSON.stringify(draft.levelChoices, null, 2)}
      </pre>
    </div>
  );
}
