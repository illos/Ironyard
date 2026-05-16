import type { Character, CharacterCulture } from '@ironyard/shared';
import {
  ARCHETYPICAL_CULTURES,
  type ArchetypicalCulture,
  CULTURE_ASPECT_DESCRIPTIONS,
  type CultureEnvironment,
  type CultureOrganization,
  type CultureUpbringing,
  TYPICAL_ANCESTRY_CULTURES,
  type TypicalAncestryCulture,
} from '@ironyard/shared';
import { useState } from 'react';

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
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Main step ─────────────────────────────────────────────────────────────────

export function CultureStep({
  draft,
  onPatch,
}: { draft: Character; onPatch: (p: Partial<Character>) => void }) {
  const culture = draft.culture;
  const hasData =
    culture.environment !== null || culture.organization !== null || culture.upbringing !== null;
  // When reloading an existing draft we can't know the original path; default to scratch.
  const [path, setPath] = useState<CulturePath | null>(hasData ? 'scratch' : null);

  const set = (patch: Partial<CharacterCulture>) => onPatch({ culture: { ...culture, ...patch } });

  const selectPath = (chosen: CulturePath) => {
    setPath(chosen);
  };

  const changePath = () => {
    set({ environment: null, organization: null, upbringing: null, language: null });
    setPath(null);
  };

  if (path === null) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-text">Choose how to build your culture</h2>
        <PathCard
          title="Typical Ancestry Culture"
          description="Use a preset culture from any ancestry — covers cases like a Human raised by Elves."
          onClick={() => selectPath('typical')}
        />
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
      <button
        type="button"
        onClick={changePath}
        className="text-sm text-text-dim hover:text-text underline underline-offset-2"
      >
        ← Change path
      </button>
      {path === 'typical' && (
        <TypicalPath culture={culture} suggestedAncestryId={draft.ancestryId} set={set} />
      )}
      {path === 'archetypical' && <ArchetypicalPath culture={culture} set={set} />}
      {path === 'scratch' && <ScratchPath culture={culture} set={set} />}
    </div>
  );
}

// ── Path card ─────────────────────────────────────────────────────────────────

function PathCard({
  title,
  description,
  onClick,
}: { title: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left border border-line bg-ink-1 hover:border-accent px-4 py-3 space-y-1 transition-colors"
    >
      <div className="text-sm font-medium text-text">{title}</div>
      <div className="text-xs text-text-dim">{description}</div>
    </button>
  );
}

// ── Typical path ──────────────────────────────────────────────────────────────

function TypicalPath({
  culture,
  suggestedAncestryId,
  set,
}: {
  culture: CharacterCulture;
  suggestedAncestryId: string | null;
  set: (p: Partial<CharacterCulture>) => void;
}) {
  const presets = Object.values(TYPICAL_ANCESTRY_CULTURES);
  // Surface the player's own ancestry's preset first if there is one.
  const ordered = suggestedAncestryId
    ? [
        ...presets.filter((p) => p.ancestryId === suggestedAncestryId),
        ...presets.filter((p) => p.ancestryId !== suggestedAncestryId),
      ]
    : presets;
  const [selected, setSelected] = useState<TypicalAncestryCulture | null>(null);

  const pick = (p: TypicalAncestryCulture) => {
    setSelected(p);
    set({
      language: p.language,
      environment: p.environment,
      organization: p.organization,
      upbringing: p.upbringing,
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm text-text-dim mb-2">Pick an ancestry's typical culture</h3>
        <p className="text-xs text-text-mute mb-2">
          Defaults to your hero's own ancestry, but pick any to cover cross-ancestry backgrounds.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ordered.map((p) => {
            const isSelected = selected?.ancestryId === p.ancestryId;
            const isSuggested = !selected && p.ancestryId === suggestedAncestryId;
            return (
              <button
                key={p.ancestryId}
                type="button"
                onClick={() => pick(p)}
                className={
                  'min-h-11 px-3 py-2 border text-sm text-left transition-colors ' +
                  (isSelected
                    ? 'bg-accent text-ink-0 border-accent'
                    : isSuggested
                      ? 'bg-ink-1 text-text-dim border-accent hover:border-accent-strong'
                      : 'bg-ink-1 text-text-dim border-line hover:border-accent')
                }
              >
                <div className="font-medium">{ancestryLabel(p.ancestryId)}</div>
                {isSuggested && <div className="text-xs text-accent mt-0.5">Your ancestry</div>}
              </button>
            );
          })}
        </div>
      </div>
      {selected && (
        <>
          <PresetSummary
            rows={[
              { label: 'Language', value: selected.language },
              {
                label: 'Environment',
                value: selected.environment,
                description: CULTURE_ASPECT_DESCRIPTIONS.environment[selected.environment],
              },
              {
                label: 'Organization',
                value: selected.organization,
                description: CULTURE_ASPECT_DESCRIPTIONS.organization[selected.organization],
              },
              {
                label: 'Upbringing',
                value: selected.upbringing,
                description: CULTURE_ASPECT_DESCRIPTIONS.upbringing[selected.upbringing],
              },
            ]}
          />
          <SkillPickers culture={culture} set={set} />
        </>
      )}
    </div>
  );
}

// ── Archetypical path ─────────────────────────────────────────────────────────

function ArchetypicalPath({
  culture,
  set,
}: {
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
        <h3 className="text-sm text-text-dim mb-2">Choose a community</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ARCHETYPICAL_CULTURES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c)}
              className={
                'min-h-11 px-3 py-2 border text-sm text-left transition-colors ' +
                (selected?.id === c.id
                  ? 'bg-accent text-ink-0 border-accent'
                  : 'bg-ink-1 text-text-dim border-line hover:border-accent')
              }
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
      {selected && (
        <>
          <PresetSummary
            rows={[
              {
                label: 'Environment',
                value: selected.environment,
                description: CULTURE_ASPECT_DESCRIPTIONS.environment[selected.environment],
              },
              {
                label: 'Organization',
                value: selected.organization,
                description: CULTURE_ASPECT_DESCRIPTIONS.organization[selected.organization],
              },
              {
                label: 'Upbringing',
                value: selected.upbringing,
                description: CULTURE_ASPECT_DESCRIPTIONS.upbringing[selected.upbringing],
              },
            ]}
          />
          <SkillPicker
            label="Language"
            options={LANGUAGE_POOL}
            value={culture.language}
            onChange={(v) => set({ language: v })}
          />
          <SkillPickers culture={culture} set={set} />
        </>
      )}
    </div>
  );
}

// ── Scratch path ──────────────────────────────────────────────────────────────

function ScratchPath({
  culture,
  set,
}: {
  culture: CharacterCulture;
  set: (p: Partial<CharacterCulture>) => void;
}) {
  return (
    <div className="space-y-5">
      <Picker
        label="Environment"
        options={ENVIRONMENTS}
        value={culture.environment}
        onChange={(v) => set({ environment: v as CultureEnvironment })}
        descriptions={CULTURE_ASPECT_DESCRIPTIONS.environment}
      />
      <Picker
        label="Organization"
        options={ORGANIZATIONS}
        value={culture.organization}
        onChange={(v) => set({ organization: v as CultureOrganization })}
        descriptions={CULTURE_ASPECT_DESCRIPTIONS.organization}
      />
      <Picker
        label="Upbringing"
        options={UPBRINGINGS}
        value={culture.upbringing}
        onChange={(v) => set({ upbringing: v as CultureUpbringing })}
        descriptions={CULTURE_ASPECT_DESCRIPTIONS.upbringing}
      />
      <SkillPicker
        label="Language"
        options={LANGUAGE_POOL}
        value={culture.language}
        onChange={(v) => set({ language: v })}
      />
      <SkillPickers culture={culture} set={set} />
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function PresetSummary({
  rows,
}: {
  rows: { label: string; value: string; description?: string }[];
}) {
  return (
    <div className="border border-line bg-ink-2 px-4 py-3 space-y-3">
      <p className="text-xs text-text-dim uppercase tracking-wide">Auto-filled from preset</p>
      {rows.map(({ label, value, description }) => (
        <div key={label} className="space-y-1">
          <div className="flex gap-2 text-sm">
            <span className="text-text-dim w-24 shrink-0">{label}</span>
            <span className="text-text capitalize">{value}</span>
          </div>
          {description && (
            <p className="text-xs text-text-mute leading-relaxed pl-26 ml-24">{description}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function SkillPickers({
  culture,
  set,
}: {
  culture: CharacterCulture;
  set: (p: Partial<CharacterCulture>) => void;
}) {
  return (
    <>
      <SkillPicker
        label="Environment skill"
        options={SKILL_POOL_BY_ASPECT['environment'] ?? []}
        value={culture.environmentSkill}
        onChange={(v) => set({ environmentSkill: v })}
      />
      <SkillPicker
        label="Organization skill"
        options={SKILL_POOL_BY_ASPECT['organization'] ?? []}
        value={culture.organizationSkill}
        onChange={(v) => set({ organizationSkill: v })}
      />
      <SkillPicker
        label="Upbringing skill"
        options={SKILL_POOL_BY_ASPECT['upbringing'] ?? []}
        value={culture.upbringingSkill}
        onChange={(v) => set({ upbringingSkill: v })}
      />
    </>
  );
}

function Picker<T extends string>({
  label,
  options,
  value,
  onChange,
  descriptions,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
  descriptions?: Partial<Record<T, string>>;
}) {
  return (
    <div>
      <h3 className="text-sm text-text-dim mb-1">{label}</h3>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={
              'min-h-11 px-3 py-2 border text-sm capitalize ' +
              (value === o
                ? 'bg-accent text-ink-0 border-accent'
                : 'bg-ink-1 text-text-dim border-line hover:border-accent')
            }
          >
            {o}
          </button>
        ))}
      </div>
      {descriptions && value && descriptions[value] && (
        <p className="mt-2 text-xs text-text-mute leading-relaxed">{descriptions[value]}</p>
      )}
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
  return <Picker label={label} options={options} value={value} onChange={onChange} />;
}
