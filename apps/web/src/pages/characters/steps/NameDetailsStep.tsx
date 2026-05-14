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
      <div className="border border-line p-5 space-y-4">
        <h3 className="text-sm font-medium text-text-dim uppercase tracking-wider">Build</h3>

        <Field label="Name" required>
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            required
            aria-required
            className="w-full bg-ink-1 border border-line px-3 py-2 min-h-11 focus:border-accent"
            placeholder="Your hero's name"
          />
        </Field>

        <Field label="Level" required>
          <input
            type="number"
            min={1}
            max={10}
            value={draft.level}
            onChange={(e) =>
              onPatch({ level: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })
            }
            required
            aria-required
            className="w-24 bg-ink-1 border border-line px-3 py-2 min-h-11 focus:border-accent"
          />
        </Field>

        <Field label="Campaign code">
          <input
            value={campaignCode ?? ''}
            readOnly={!!campaignCode}
            className="w-full bg-ink-1 border border-line px-3 py-2 uppercase tracking-widest min-h-11 disabled:opacity-60 focus:border-accent"
            placeholder="ABCDEF"
          />
          {campaignCode && (
            <p className="text-xs text-text-mute mt-1">
              Pre-filled from the join link. Submit at the Review step to send to the director.
            </p>
          )}
        </Field>
      </div>

      {/* Hero details */}
      <div className="border border-line p-5 space-y-4">
        <h3 className="text-sm font-medium text-text-dim uppercase tracking-wider">
          Hero details
        </h3>

        <Field label="Pronouns">
          <input
            value={details.pronouns}
            onChange={(e) => patchDetails({ pronouns: e.target.value })}
            className="w-full bg-ink-1 border border-line px-3 py-2 min-h-11 focus:border-accent"
            placeholder="e.g. they/them"
          />
        </Field>

        <Field label="Age">
          <input
            value={details.age}
            onChange={(e) => patchDetails({ age: e.target.value })}
            className="w-full bg-ink-1 border border-line px-3 py-2 min-h-11 focus:border-accent"
            placeholder="e.g. 34"
          />
        </Field>

        <Field label="Height">
          <input
            value={details.height}
            onChange={(e) => patchDetails({ height: e.target.value })}
            className="w-full bg-ink-1 border border-line px-3 py-2 min-h-11 focus:border-accent"
            placeholder="e.g. 5′10″"
          />
        </Field>

        <Field label="Build">
          <input
            value={details.build}
            onChange={(e) => patchDetails({ build: e.target.value })}
            className="w-full bg-ink-1 border border-line px-3 py-2 min-h-11 focus:border-accent"
            placeholder="e.g. stocky"
          />
        </Field>

        <Field label="Eyes">
          <input
            value={details.eyes}
            onChange={(e) => patchDetails({ eyes: e.target.value })}
            className="w-full bg-ink-1 border border-line px-3 py-2 min-h-11 focus:border-accent"
            placeholder="e.g. amber"
          />
        </Field>

        <Field label="Hair">
          <input
            value={details.hair}
            onChange={(e) => patchDetails({ hair: e.target.value })}
            className="w-full bg-ink-1 border border-line px-3 py-2 min-h-11 focus:border-accent"
            placeholder="e.g. dark brown"
          />
        </Field>

        <Field label="Skin tone">
          <input
            value={details.skinTone}
            onChange={(e) => patchDetails({ skinTone: e.target.value })}
            className="w-full bg-ink-1 border border-line px-3 py-2 min-h-11 focus:border-accent"
            placeholder="e.g. warm tan"
          />
        </Field>

        <Field label="Physical features">
          <input
            value={details.physicalFeatures}
            onChange={(e) => patchDetails({ physicalFeatures: e.target.value })}
            className="w-full bg-ink-1 border border-line px-3 py-2 min-h-11 focus:border-accent"
            placeholder="e.g. pointed ears, calloused hands"
          />
        </Field>

        <Field label="Physical features (texture / description)">
          <textarea
            value={details.physicalFeaturesTexture}
            onChange={(e) => patchDetails({ physicalFeaturesTexture: e.target.value })}
            rows={4}
            className="w-full bg-ink-1 border border-line px-3 py-2 focus:border-accent"
            placeholder="Describe your hero's appearance in more detail…"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm text-text-dim mb-1">
        {label}
        {required && <span className="text-foe ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
