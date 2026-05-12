import { type Character, CharacterDetailsSchema } from '@ironyard/shared';

export function NameDetailsStep({
  draft,
  name,
  campaignCode,
  onNameChange,
  onPatch,
}: {
  draft: Character;
  name: string;
  campaignCode: string | undefined;
  onNameChange: (n: string) => void;
  onPatch: (p: Partial<Character>) => void;
}) {
  const details = draft.details ?? CharacterDetailsSchema.parse({});

  function patchDetails(partial: Partial<typeof details>) {
    onPatch({ details: { ...details, ...partial } });
  }

  return (
    <div className="space-y-6">
      {/* Build state */}
      <div className="rounded-lg border border-neutral-800 p-5 space-y-4">
        <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">Build</h3>

        <Field label="Level">
          <input
            type="number"
            min={1}
            max={10}
            value={draft.level}
            onChange={(e) =>
              onPatch({ level: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })
            }
            className="w-24 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 min-h-11"
          />
        </Field>

        <Field label="Campaign code (optional)">
          <input
            value={campaignCode ?? ''}
            readOnly={!!campaignCode}
            className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 uppercase tracking-widest min-h-11 disabled:opacity-60"
            placeholder="ABCDEF"
          />
          {campaignCode && (
            <p className="text-xs text-neutral-500 mt-1">
              Pre-filled from the join link. Submit at the Review step to send to the director.
            </p>
          )}
        </Field>
      </div>

      {/* Hero details */}
      <div className="rounded-lg border border-neutral-800 p-5 space-y-4">
        <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
          Hero details
        </h3>

        <Field label="Name">
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 min-h-11"
            placeholder="Your hero's name"
          />
        </Field>

        <Field label="Pronouns">
          <input
            value={details.pronouns}
            onChange={(e) => patchDetails({ pronouns: e.target.value })}
            className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 min-h-11"
            placeholder="e.g. they/them"
          />
        </Field>

        <Field label="Age">
          <input
            value={details.age}
            onChange={(e) => patchDetails({ age: e.target.value })}
            className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 min-h-11"
            placeholder="e.g. 34"
          />
        </Field>

        <Field label="Height">
          <input
            value={details.height}
            onChange={(e) => patchDetails({ height: e.target.value })}
            className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 min-h-11"
            placeholder="e.g. 5′10″"
          />
        </Field>

        <Field label="Build">
          <input
            value={details.build}
            onChange={(e) => patchDetails({ build: e.target.value })}
            className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 min-h-11"
            placeholder="e.g. stocky"
          />
        </Field>

        <Field label="Eyes">
          <input
            value={details.eyes}
            onChange={(e) => patchDetails({ eyes: e.target.value })}
            className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 min-h-11"
            placeholder="e.g. amber"
          />
        </Field>

        <Field label="Hair">
          <input
            value={details.hair}
            onChange={(e) => patchDetails({ hair: e.target.value })}
            className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 min-h-11"
            placeholder="e.g. dark brown"
          />
        </Field>

        <Field label="Skin tone">
          <input
            value={details.skinTone}
            onChange={(e) => patchDetails({ skinTone: e.target.value })}
            className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 min-h-11"
            placeholder="e.g. warm tan"
          />
        </Field>

        <Field label="Physical features">
          <input
            value={details.physicalFeatures}
            onChange={(e) => patchDetails({ physicalFeatures: e.target.value })}
            className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 min-h-11"
            placeholder="e.g. pointed ears, calloused hands"
          />
        </Field>

        <Field label="Physical features (texture / description)">
          <textarea
            value={details.physicalFeaturesTexture}
            onChange={(e) => patchDetails({ physicalFeaturesTexture: e.target.value })}
            rows={4}
            className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2"
            placeholder="Describe your hero's appearance in more detail…"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-neutral-300 mb-1">{label}</span>
      {children}
    </label>
  );
}
