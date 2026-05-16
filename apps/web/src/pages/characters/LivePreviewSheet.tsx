import type { Character } from '@ironyard/shared';
import type { WizardStaticData } from '../../api/static-data';
import {
  CharacteristicCell,
  Chip,
  Section,
  SkillChipGroup,
  type SkillItem,
} from '../../primitives';

const CHARACTERISTIC_ORDER = ['might', 'agility', 'reason', 'intuition', 'presence'] as const;
const CHARACTERISTIC_LABELS: Record<(typeof CHARACTERISTIC_ORDER)[number], string> = {
  might: 'MIG',
  agility: 'AGI',
  reason: 'REA',
  intuition: 'INT',
  presence: 'PRE',
};

// Placeholder dash used wherever a value hasn't been chosen yet.
const DASH = '—';

/**
 * LivePreviewSheet — compact mirror of the character sheet's overview content,
 * driven by the current wizard `draft`. Pure display; never mutates.
 *
 * Where a field isn't yet picked we render a visually-muted placeholder so the
 * player gets a "what does this character look like so far?" feel without the
 * preview pretending to know values it doesn't.
 */
export function LivePreviewSheet({
  name,
  draft,
  staticData,
}: {
  name: string;
  draft: Character;
  staticData: WizardStaticData;
}) {
  const klass = draft.classId ? staticData.classes.get(draft.classId) : null;
  const ancestry = draft.ancestryId ? staticData.ancestries.get(draft.ancestryId) : null;
  const career = draft.careerId ? staticData.careers.get(draft.careerId) : null;
  const kit = draft.kitId ? staticData.kits.get(draft.kitId) : null;
  const subclass = klass?.subclasses?.find((s) => s.id === draft.subclassId) ?? null;

  const displayName = name.trim() || 'Unnamed hero';

  // Resolve characteristic values from class locks + assigned slots when both
  // are present. Anything unresolved renders as a dash.
  const lockedSet = new Set(klass?.lockedCharacteristics ?? []);
  const characteristicValue = (id: (typeof CHARACTERISTIC_ORDER)[number]): number | null => {
    if (lockedSet.has(id)) return 2; // locked characteristics are +2 in Draw Steel
    if (draft.characteristicSlots && id in draft.characteristicSlots) {
      return draft.characteristicSlots[id] ?? null;
    }
    return null;
  };

  // Gather skills from culture + career.
  const skillList: string[] = [];
  if (draft.culture.environmentSkill) skillList.push(draft.culture.environmentSkill);
  if (draft.culture.organizationSkill) skillList.push(draft.culture.organizationSkill);
  if (draft.culture.upbringingSkill) skillList.push(draft.culture.upbringingSkill);
  for (const s of draft.careerChoices.skills) skillList.push(s);
  const skills: SkillItem[] = skillList.map((s, i) => ({
    id: `${s}-${i}`,
    label: s,
    selected: true,
  }));

  const languages: SkillItem[] = [
    ...(draft.culture.language ? [draft.culture.language] : []),
    ...draft.careerChoices.languages,
  ].map((l, i) => ({ id: `${l}-${i}`, label: l, selected: true }));

  return (
    <div className="flex flex-col gap-3 sticky top-0">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="bg-ink-1 border border-line p-3">
        <h2 className="text-lg font-semibold text-text leading-tight">{displayName}</h2>
        <p className="text-xs text-text-mute mt-1 flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-mono tabular">Lv {draft.level}</span>
          <Sep />
          {klass ? (
            <span className="text-text-dim">{klass.name}</span>
          ) : (
            <Placeholder>class</Placeholder>
          )}
          {subclass && (
            <>
              <span className="text-text-mute">({subclass.name})</span>
            </>
          )}
          <Sep />
          {ancestry ? (
            <span className="text-text-dim">{ancestry.name}</span>
          ) : (
            <Placeholder>ancestry</Placeholder>
          )}
          <Sep />
          {career ? (
            <span className="text-text-dim">{career.name}</span>
          ) : (
            <Placeholder>career</Placeholder>
          )}
        </p>
        {kit && (
          <p className="text-xs text-text-mute mt-1 font-mono tabular">
            Kit · {kit.name}
            <span className="text-text-dim ml-2">
              ST +{kit.staminaBonus} · SPD +{kit.speedBonus} · STAB +{kit.stabilityBonus}
            </span>
          </p>
        )}
      </header>

      {/* ── Vitals ─────────────────────────────────────────────────── */}
      <Section heading="Vitals (preview)">
        <dl className="grid grid-cols-2 gap-y-1">
          <PreviewKV label="Stamina" placeholder={!klass}>
            {klass ? <span className="font-mono tabular">— derived after build</span> : DASH}
          </PreviewKV>
          <PreviewKV label="Recoveries" placeholder={!klass}>
            {klass ? <span className="font-mono tabular">— derived after build</span> : DASH}
          </PreviewKV>
          <PreviewKV label="Heroic resource" placeholder={!klass}>
            {klass ? <span className="capitalize">{klass.heroicResource}</span> : DASH}
          </PreviewKV>
          <PreviewKV label="Size" placeholder={!ancestry}>
            {ancestry?.defaultSize ?? DASH}
          </PreviewKV>
        </dl>
      </Section>

      {/* ── Characteristics ───────────────────────────────────────── */}
      <Section heading="Characteristics">
        <div className="grid grid-cols-5 gap-2">
          {CHARACTERISTIC_ORDER.map((ch) => {
            const v = characteristicValue(ch);
            if (v === null) {
              return (
                <div
                  key={ch}
                  className="flex flex-col items-center justify-center gap-1 p-3 bg-ink-2 border border-line opacity-60"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-mute">
                    {CHARACTERISTIC_LABELS[ch]}
                  </span>
                  <span className="text-2xl font-semibold tabular text-text-mute">{DASH}</span>
                </div>
              );
            }
            return (
              <CharacteristicCell
                key={ch}
                label={CHARACTERISTIC_LABELS[ch]}
                value={v}
                locked={lockedSet.has(ch)}
              />
            );
          })}
        </div>
      </Section>

      {/* ── Kit summary (only when picked) ─────────────────────────── */}
      {kit && (
        <Section heading={`Equipment — ${kit.name}`}>
          <dl className="flex flex-col gap-1 text-sm">
            {kit.keywords && kit.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {kit.keywords.map((k) => (
                  <Chip key={k} size="xs" shape="pill">
                    {k}
                  </Chip>
                ))}
              </div>
            )}
            {kit.description && (
              <p className="text-xs text-text-dim whitespace-pre-wrap mt-1">{kit.description}</p>
            )}
          </dl>
        </Section>
      )}

      {/* ── Skills & Languages ────────────────────────────────────── */}
      {(skills.length > 0 || languages.length > 0) && (
        <Section heading="Skills & Languages">
          <div className="flex flex-col gap-3">
            {skills.length > 0 && <SkillChipGroup heading="Skills" items={skills} />}
            {languages.length > 0 && <SkillChipGroup heading="Languages" items={languages} />}
          </div>
        </Section>
      )}

      {/* ── Empty hint ─────────────────────────────────────────────── */}
      {!klass && !ancestry && !career && skills.length === 0 && (
        <p className="text-xs text-text-mute italic px-1">
          Preview updates as you pick options on the left.
        </p>
      )}
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <span className="text-text-mute italic">{children}</span>;
}

function Sep() {
  return <span className="text-text-mute">·</span>;
}

function PreviewKV({
  label,
  placeholder = false,
  children,
}: {
  label: string;
  placeholder?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-[10px] uppercase tracking-[0.14em] font-mono text-text-mute w-28 flex-shrink-0">
        {label}
      </dt>
      <dd className={placeholder ? 'text-sm text-text-mute' : 'text-sm text-text-dim'}>
        {children}
      </dd>
    </div>
  );
}
