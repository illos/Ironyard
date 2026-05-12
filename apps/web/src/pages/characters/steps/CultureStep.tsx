import { useState } from 'react';
import type { Character, CharacterCulture } from '@ironyard/shared';
import {
  ARCHETYPICAL_CULTURES,
  CULTURE_ASPECT_DESCRIPTIONS,
  getTypicalAncestryCulture,
  type ArchetypicalCulture,
  type CultureEnvironment,
  type CultureOrganization,
  type CultureUpbringing,
  type TypicalAncestryCulture,
} from '@ironyard/shared';

type CulturePath = 'typical' | 'archetypical' | 'scratch';

// Placeholder pools — Phase 2 Epic 1. Real skills registry in Phase 5.
const SKILL_POOL_BY_ASPECT: Record<string, string[]> = {
  environment: ['Wilderness', 'Society', 'Riding'],
  organization: ['Diplomacy', 'Intuition'],
  upbringing: ['Crafting', 'History', 'Lore'],
};
const LANGUAGE_POOL = ['Caelian', 'Khoursirian', 'Vasloria', 'Phaedros'];
const ENVIRONMENTS = ['nomadic', 'rural', 'secluded', 'urban', 'wilderness'] as const;
const ORGANIZATIONS = ['bureaucratic', 'communal'] as const;
const UPBRINGINGS = ['academic', 'creative', 'labor', 'lawless', 'martial', 'noble'] as const;

function ancestryLabel(id: string) {
  return id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ── Main step ─────────────────────────────────────────────────────────────────

export function CultureStep({ draft, onPatch }: { draft: Character; onPatch: (p: Partial<Character>) => void }) {
  const culture = draft.culture;
  const hasData = culture.environment !== null || culture.organization !== null || culture.upbringing !== null;
  // When reloading an existing draft we can't know the original path; default to scratch.
  const [path, setPath] = useState<CulturePath | null>(hasData ? 'scratch' : null);

  const set = (patch: Partial<CharacterCulture>) => onPatch({ culture: { ...culture, ...patch } });

  const typicalPreset = getTypicalAncestryCulture(draft.ancestryId);
  const isRevenant = draft.ancestryId === 'revenant';

  const selectPath = (chosen: CulturePath) => {
    if (chosen === 'typical' && typicalPreset) {
      set({ environment: typicalPreset.environment, organization: typicalPreset.organization,
            upbringing: typicalPreset.upbringing, language: typicalPreset.language });
    }
    setPath(chosen);
  };

  const changePath = () => {
    set({ environment: null, organization: null, upbringing: null, language: null });
    setPath(null);
  };

  if (path === null) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-neutral-100">Choose how to build your culture</h2>
        {draft.ancestryId && typicalPreset && (
          <PathCard
            title={`Typical for ${ancestryLabel(draft.ancestryId)}`}
            description="Use the standard culture for heroes raised among their own kind."
            onClick={() => selectPath('typical')}
          />
        )}
        {isRevenant && (
          <p className="text-sm text-amber-400 px-1">
            Revenant doesn&apos;t have a typical ancestry culture — pick Archetypical or Build from scratch.
          </p>
        )}
        <PathCard
          title="Archetypical (pick a community)"
          description="Choose from 16 community archetypes — Artisan Guild, Knightly Order, and more."
          onClick={() => selectPath('archetypical')}
        />
        <PathCard
          title="Build from scratch"
          description="Hand-pick every aspect: environment, organization, and upbringing."
          onClick={() => selectPath('scratch')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={changePath}
        className="text-sm text-neutral-400 hover:text-neutral-200 underline underline-offset-2">
        ← Change path
      </button>
      {path === 'typical' && typicalPreset && <TypicalPath culture={culture} preset={typicalPreset} set={set} />}
      {path === 'archetypical' && <ArchetypicalPath culture={culture} set={set} />}
      {path === 'scratch' && <ScratchPath culture={culture} set={set} />}
    </div>
  );
}

// ── Path card ─────────────────────────────────────────────────────────────────

function PathCard({ title, description, onClick }: { title: string; description: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full text-left rounded-lg border border-neutral-700 bg-neutral-900 hover:border-neutral-500 px-4 py-3 space-y-1 transition-colors">
      <div className="text-sm font-medium text-neutral-100">{title}</div>
      <div className="text-xs text-neutral-400">{description}</div>
    </button>
  );
}

// ── Typical path ──────────────────────────────────────────────────────────────

function TypicalPath({ culture, preset, set }: {
  culture: CharacterCulture;
  preset: TypicalAncestryCulture;
  set: (p: Partial<CharacterCulture>) => void;
}) {
  return (
    <div className="space-y-5">
      <PresetSummary rows={[
        { label: 'Language', value: preset.language },
        { label: 'Environment', value: preset.environment },
        { label: 'Organization', value: preset.organization },
        { label: 'Upbringing', value: preset.upbringing },
      ]} />
      <SkillPickers culture={culture} set={set} />
    </div>
  );
}

// ── Archetypical path ─────────────────────────────────────────────────────────

function ArchetypicalPath({ culture, set }: {
  culture: CharacterCulture;
  set: (p: Partial<CharacterCulture>) => void;
}) {
  const [selected, setSelected] = useState<ArchetypicalCulture | null>(null);

  const pick = (c: ArchetypicalCulture) => {
    setSelected(c);
    set({ environment: c.environment, organization: c.organization, upbringing: c.upbringing });
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm text-neutral-300 mb-2">Choose a community</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ARCHETYPICAL_CULTURES.map((c) => (
            <button key={c.id} type="button" onClick={() => pick(c)}
              className={
                'min-h-11 px-3 py-2 rounded-md border text-sm text-left transition-colors ' +
                (selected?.id === c.id
                  ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                  : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
              }>
              {c.name}
            </button>
          ))}
        </div>
      </div>
      {selected && (
        <>
          <PresetSummary rows={[
            { label: 'Environment', value: selected.environment },
            { label: 'Organization', value: selected.organization },
            { label: 'Upbringing', value: selected.upbringing },
          ]} />
          <SkillPicker label="Language" options={LANGUAGE_POOL} value={culture.language}
            onChange={(v) => set({ language: v })} />
          <SkillPickers culture={culture} set={set} />
        </>
      )}
    </div>
  );
}

// ── Scratch path ──────────────────────────────────────────────────────────────

function ScratchPath({ culture, set }: {
  culture: CharacterCulture;
  set: (p: Partial<CharacterCulture>) => void;
}) {
  return (
    <div className="space-y-5">
      <Picker label="Environment" options={ENVIRONMENTS} value={culture.environment}
        onChange={(v) => set({ environment: v as CultureEnvironment })}
        descriptions={CULTURE_ASPECT_DESCRIPTIONS.environment} />
      <Picker label="Organization" options={ORGANIZATIONS} value={culture.organization}
        onChange={(v) => set({ organization: v as CultureOrganization })}
        descriptions={CULTURE_ASPECT_DESCRIPTIONS.organization} />
      <Picker label="Upbringing" options={UPBRINGINGS} value={culture.upbringing}
        onChange={(v) => set({ upbringing: v as CultureUpbringing })}
        descriptions={CULTURE_ASPECT_DESCRIPTIONS.upbringing} />
      <SkillPicker label="Language" options={LANGUAGE_POOL} value={culture.language}
        onChange={(v) => set({ language: v })} />
      <SkillPickers culture={culture} set={set} />
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function PresetSummary({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="rounded-md border border-neutral-700 bg-neutral-800/50 px-4 py-3 space-y-1">
      <p className="text-xs text-neutral-400 uppercase tracking-wide mb-2">Auto-filled from preset</p>
      {rows.map(({ label, value }) => (
        <div key={label} className="flex gap-2 text-sm">
          <span className="text-neutral-400 w-24 shrink-0">{label}</span>
          <span className="text-neutral-100 capitalize">{value}</span>
        </div>
      ))}
    </div>
  );
}

function SkillPickers({ culture, set }: {
  culture: CharacterCulture;
  set: (p: Partial<CharacterCulture>) => void;
}) {
  return (
    <>
      <SkillPicker label="Environment skill" options={SKILL_POOL_BY_ASPECT['environment'] ?? []}
        value={culture.environmentSkill} onChange={(v) => set({ environmentSkill: v })} />
      <SkillPicker label="Organization skill" options={SKILL_POOL_BY_ASPECT['organization'] ?? []}
        value={culture.organizationSkill} onChange={(v) => set({ organizationSkill: v })} />
      <SkillPicker label="Upbringing skill" options={SKILL_POOL_BY_ASPECT['upbringing'] ?? []}
        value={culture.upbringingSkill} onChange={(v) => set({ upbringingSkill: v })} />
    </>
  );
}

function Picker<T extends string>({ label, options, value, onChange, descriptions }: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
  descriptions?: Partial<Record<T, string>>;
}) {
  return (
    <div>
      <h3 className="text-sm text-neutral-300 mb-1">{label}</h3>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o} type="button" onClick={() => onChange(o)}
            className={
              'min-h-11 px-3 py-2 rounded-md border text-sm capitalize ' +
              (value === o
                ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
            }>
            {o}
          </button>
        ))}
      </div>
      {descriptions && value && descriptions[value] && (
        <p className="mt-2 text-xs text-neutral-500 leading-relaxed">
          {descriptions[value]}
        </p>
      )}
    </div>
  );
}

function SkillPicker({ label, options, value, onChange }: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return <Picker label={label} options={options} value={value} onChange={onChange} />;
}
