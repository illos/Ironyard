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
  return (
    <div className="space-y-4">
      <Field label="Character name">
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 min-h-11"
          placeholder="Your hero's name"
        />
      </Field>
      <Field label="Campaign code (optional)">
        <input
          value={campaignCode ?? ''}
          readOnly={!!campaignCode}
          className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 uppercase tracking-widest min-h-11"
          placeholder="ABCDEF"
        />
        {campaignCode && (
          <p className="text-xs text-neutral-500 mt-1">
            Pre-filled from the join link. Submit at the Review step to send to the director.
          </p>
        )}
      </Field>
      <Field label="Level">
        <input
          type="number"
          min={1}
          max={10}
          value={draft.level}
          onChange={(e) => onPatch({ level: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
          className="w-24 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 min-h-11"
        />
      </Field>
      <Field label="Pronouns">
        <input
          value={details.pronouns}
          onChange={(e) => onPatch({ details: { ...details, pronouns: e.target.value } })}
          className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 min-h-11"
        />
      </Field>
      <Field label="Backstory">
        <textarea
          value={details.backstory}
          onChange={(e) => onPatch({ details: { ...details, backstory: e.target.value } })}
          rows={4}
          className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2"
        />
      </Field>
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
