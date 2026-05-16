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
      <p className="text-sm text-text-dim">
        Complications are optional. Skip if you don't want one.
      </p>
      <button
        type="button"
        onClick={() => onPatch({ complicationId: null })}
        className={
          'block w-full text-left border px-4 py-3 min-h-11 ' +
          (draft.complicationId === null
            ? 'bg-accent text-ink-0 border-accent'
            : 'bg-ink-1 text-text-dim border-line hover:border-accent')
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
              'text-left border px-4 py-3 min-h-11 ' +
              (draft.complicationId === c.id
                ? 'bg-accent text-ink-0 border-accent'
                : 'bg-ink-1 text-text-dim border-line hover:border-accent')
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
