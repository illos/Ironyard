import type { Character, CharacterCulture } from '@ironyard/shared';

const ENVIRONMENTS = ['nomadic', 'rural', 'secluded', 'urban', 'wilderness'] as const;
const ORGANIZATIONS = ['bureaucratic', 'communal'] as const;
const UPBRINGINGS = ['academic', 'creative', 'labor', 'lawless', 'martial', 'noble'] as const;

// Placeholder skill / language lists. The Draw Steel canon has these as
// inline lists per culture aspect. Hardcoded here for Phase 2 Epic 1; a
// real skills/languages registry comes later. Confirm against rulebook
// before relying on this list for correctness.
const SKILL_POOL_BY_ASPECT: Record<string, string[]> = {
  environment: ['Wilderness', 'Society', 'Riding'],
  organization: ['Diplomacy', 'Intuition'],
  upbringing: ['Crafting', 'History', 'Lore'],
};
const LANGUAGE_POOL = ['Caelian', 'Khoursirian', 'Vasloria', 'Phaedros'];

export function CultureStep({
  draft,
  onPatch,
}: {
  draft: Character;
  onPatch: (p: Partial<Character>) => void;
}) {
  const culture = draft.culture;
  const set = (patch: Partial<CharacterCulture>) =>
    onPatch({ culture: { ...culture, ...patch } });

  return (
    <div className="space-y-5">
      <Picker
        label="Environment"
        options={ENVIRONMENTS}
        value={culture.environment}
        onChange={(v) => set({ environment: v as CharacterCulture['environment'] })}
      />
      <SkillPicker
        label="Environment skill"
        options={SKILL_POOL_BY_ASPECT['environment'] ?? []}
        value={culture.environmentSkill}
        onChange={(v) => set({ environmentSkill: v })}
      />
      <Picker
        label="Organization"
        options={ORGANIZATIONS}
        value={culture.organization}
        onChange={(v) => set({ organization: v as CharacterCulture['organization'] })}
      />
      <SkillPicker
        label="Organization skill"
        options={SKILL_POOL_BY_ASPECT['organization'] ?? []}
        value={culture.organizationSkill}
        onChange={(v) => set({ organizationSkill: v })}
      />
      <Picker
        label="Upbringing"
        options={UPBRINGINGS}
        value={culture.upbringing}
        onChange={(v) => set({ upbringing: v as CharacterCulture['upbringing'] })}
      />
      <SkillPicker
        label="Upbringing skill"
        options={SKILL_POOL_BY_ASPECT['upbringing'] ?? []}
        value={culture.upbringingSkill}
        onChange={(v) => set({ upbringingSkill: v })}
      />
      <SkillPicker
        label="Language"
        options={LANGUAGE_POOL}
        value={culture.language}
        onChange={(v) => set({ language: v })}
      />
    </div>
  );
}

function Picker<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <h3 className="text-sm text-neutral-300 mb-1">{label}</h3>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={
              'min-h-11 px-3 py-2 rounded-md border text-sm ' +
              (value === o
                ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
            }
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function SkillPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <Picker label={label} options={options} value={value} onChange={onChange} />
  );
}
