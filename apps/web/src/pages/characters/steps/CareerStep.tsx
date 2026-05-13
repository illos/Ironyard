import type { Character } from '@ironyard/shared';
import type { WizardStaticData } from '../../../api/static-data';

export function CareerStep({
  draft,
  staticData,
  onPatch,
}: {
  draft: Character;
  staticData: WizardStaticData;
  onPatch: (p: Partial<Character>) => void;
}) {
  const careers = Array.from(staticData.careers.values());
  const selected = draft.careerId ? staticData.careers.get(draft.careerId) : null;
  const choices = draft.careerChoices;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {careers.map((c) => {
          const isSelected = c.id === draft.careerId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() =>
                onPatch({
                  careerId: c.id,
                  careerChoices: {
                    skills: [],
                    languages: [],
                    incitingIncidentId: null,
                    perkId: null,
                  },
                })
              }
              className={`text-left rounded-md border px-4 py-3 min-h-11 ${isSelected ? 'bg-neutral-100 text-neutral-900 border-neutral-100' : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600'}`}
            >
              <div className="font-medium">{c.name}</div>
              {c.description && <div className="text-xs opacity-80 mt-1">{c.description}</div>}
            </button>
          );
        })}
      </div>

      {selected && (
        <CareerChoices
          career={selected}
          choices={choices}
          onChange={(next) => onPatch({ careerChoices: { ...choices, ...next } })}
        />
      )}
    </div>
  );
}

function CareerChoices({
  career,
  choices,
  onChange,
}: {
  career: {
    incitingIncidents?: Array<{ id: string; title: string; description?: string }>;
  };
  choices: Character['careerChoices'];
  onChange: (next: Partial<Character['careerChoices']>) => void;
}) {
  const incidents = career.incitingIncidents ?? [];
  if (incidents.length === 0) return null;
  return (
    <div className="rounded-md border border-neutral-800 p-4 space-y-4">
      {incidents.length > 0 && (
        <div>
          <h3 className="text-sm text-neutral-300 mb-1">Inciting incident</h3>
          <p className="text-xs text-neutral-500 mb-2">
            Pick the event that pushed your hero out into the world. Tap a title to expand its
            flavor text.
          </p>
          <div className="space-y-2">
            {incidents.map((ii) => {
              const selected = choices.incitingIncidentId === ii.id;
              return (
                <button
                  key={ii.id}
                  type="button"
                  onClick={() => onChange({ incitingIncidentId: ii.id })}
                  className={`block w-full min-h-11 px-3 py-2 rounded-md border text-sm text-left transition-colors ${
                    selected
                      ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                      : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600'
                  }`}
                >
                  <div className="font-medium">{ii.title}</div>
                  {ii.description && (
                    <p
                      className={`mt-1 text-xs leading-relaxed ${
                        selected ? 'text-neutral-700' : 'text-neutral-400'
                      }`}
                    >
                      {ii.description}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
