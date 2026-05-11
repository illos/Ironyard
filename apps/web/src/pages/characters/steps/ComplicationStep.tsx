import type { Character } from '@ironyard/shared';
import type { WizardStaticData } from '../../../api/static-data';

export function ComplicationStep({
  draft,
  staticData,
  onPatch,
}: {
  draft: Character;
  staticData: WizardStaticData;
  onPatch: (p: Partial<Character>) => void;
}) {
  const complications = Array.from(staticData.complications.values());
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-400">Complications are optional. Skip if you don't want one.</p>
      <button
        type="button"
        onClick={() => onPatch({ complicationId: null })}
        className={
          'block w-full text-left rounded-md border px-4 py-3 min-h-11 ' +
          (draft.complicationId === null
            ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
            : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
        }
      >
        <span className="font-medium">No complication</span>
      </button>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {complications.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPatch({ complicationId: c.id })}
            className={
              'text-left rounded-md border px-4 py-3 min-h-11 ' +
              (draft.complicationId === c.id
                ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
            }
          >
            <div className="font-medium">{c.name}</div>
            {c.description && <div className="text-xs opacity-80 mt-1">{c.description}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}
