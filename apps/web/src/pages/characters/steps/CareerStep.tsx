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
              className={`text-left border px-4 py-3 min-h-11 ${isSelected ? 'bg-accent text-ink-0 border-accent' : 'bg-ink-1 text-text-dim border-line hover:border-accent'}`}
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
    <div className="border border-line p-4 space-y-4">
      {incidents.length > 0 && (
        <div>
          <h3 className="text-sm text-text-dim mb-1">Inciting incident</h3>
          <p className="text-xs text-text-mute mb-2">
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
                  className={`block w-full min-h-11 px-3 py-2 border text-sm text-left transition-colors ${
                    selected
                      ? 'bg-accent text-ink-0 border-accent'
                      : 'bg-ink-1 text-text-dim border-line hover:border-accent'
                  }`}
                >
                  <div className="font-medium">{ii.title}</div>
                  {ii.description && (
                    <p
                      className={`mt-1 text-xs leading-relaxed ${
                        selected ? 'text-ink-0/80' : 'text-text-dim'
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
