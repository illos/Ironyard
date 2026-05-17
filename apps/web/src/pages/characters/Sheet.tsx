import { type StaticDataBundle, deriveCharacterRuntime } from '@ironyard/rules';
import type { Ability, Character } from '@ironyard/shared';
import { Link, useParams } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useCharacter, useMe } from '../../api/queries';
import { type WizardStaticData, useWizardStaticData } from '../../api/static-data';
import {
  Button,
  CharacteristicCell,
  Chip,
  Section,
  SkillChipGroup,
  type SkillItem,
  type TabItem,
  Tabs,
} from '../../primitives';
import { useSessionSocket } from '../../ws/useSessionSocket';
import { AttachToCampaign } from './parts/AttachToCampaign';

const CHARACTERISTIC_ORDER = ['might', 'agility', 'reason', 'intuition', 'presence'] as const;

const CHARACTERISTIC_LABELS: Record<(typeof CHARACTERISTIC_ORDER)[number], string> = {
  might: 'MIG',
  agility: 'AGI',
  reason: 'REA',
  intuition: 'INT',
  presence: 'PRE',
};

const TAB_ITEMS: TabItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'abilities', label: 'Abilities' },
  { id: 'features', label: 'Features' },
  { id: 'story', label: 'Story' },
  { id: 'activity', label: 'Activity' },
];

type Runtime = ReturnType<typeof deriveCharacterRuntime>;

export function Sheet() {
  const { id } = useParams({ from: '/characters/$id' });
  const me = useMe();
  const ch = useCharacter(id);
  const staticData = useWizardStaticData();
  const [tab, setTab] = useState('overview');

  const campaignId = ch.data?.data.campaignId ?? undefined;
  const sock = useSessionSocket(campaignId);

  if (me.isLoading || ch.isLoading || !staticData) {
    return <main className="mx-auto max-w-5xl p-4 text-text-mute">Loading…</main>;
  }
  if (!me.data) {
    return (
      <main className="mx-auto max-w-5xl p-4 text-text-mute">Sign in to view characters.</main>
    );
  }
  if (!ch.data) {
    return <main className="mx-auto max-w-5xl p-4 text-foe">Character not found.</main>;
  }

  const character = ch.data.data;
  const inCampaign = !!campaignId;
  const inEncounter = inCampaign && sock.activeEncounter !== null;

  const bundle: StaticDataBundle = {
    ancestries: staticData.ancestries as StaticDataBundle['ancestries'],
    careers: staticData.careers as StaticDataBundle['careers'],
    classes: staticData.classes as StaticDataBundle['classes'],
    kits: staticData.kits as StaticDataBundle['kits'],
    abilities: staticData.abilities as StaticDataBundle['abilities'],
    items: staticData.items as StaticDataBundle['items'],
    titles: staticData.titles as StaticDataBundle['titles'],
  };

  return (
    <main className="mx-auto max-w-5xl p-4 flex flex-col gap-4">
      <SheetHeader
        name={ch.data.name}
        character={character}
        staticData={staticData}
        characterId={id}
        inEncounter={inEncounter}
        campaignId={campaignId}
      />

      <Tabs items={TAB_ITEMS} value={tab} onChange={setTab} />

      <div className="flex flex-col gap-4">
        {tab === 'overview' && (
          <OverviewPanel character={character} staticData={staticData} bundle={bundle} />
        )}
        {tab === 'abilities' && (
          <AbilitiesPanel character={character} staticData={staticData} bundle={bundle} />
        )}
        {tab === 'features' && <FeaturesPanel character={character} staticData={staticData} />}
        {tab === 'story' && <StoryPanel character={character} staticData={staticData} />}
        {tab === 'activity' && <ActivityPanel />}
      </div>

      {inEncounter && (
        <div className="bg-ink-1 border border-accent p-4 text-sm text-text">
          Your character is live in combat. Open the play screen to control it.
        </div>
      )}

      {!inCampaign && <AttachToCampaign characterId={id} />}
    </main>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

function SheetHeader({
  name,
  character,
  staticData,
  characterId,
  inEncounter,
  campaignId,
}: {
  name: string;
  character: Character;
  staticData: WizardStaticData;
  characterId: string;
  inEncounter: boolean;
  campaignId: string | undefined;
}) {
  const klass = character.classId ? staticData.classes.get(character.classId) : null;
  const ancestry = character.ancestryId ? staticData.ancestries.get(character.ancestryId) : null;
  const career = character.careerId ? staticData.careers.get(character.careerId) : null;
  const subclass = klass?.subclasses?.find((s) => s.id === character.subclassId);

  return (
    <header className="flex flex-wrap items-start justify-between gap-3 bg-ink-1 border border-line p-4">
      <div>
        <h1 className="text-2xl font-semibold text-text">{name}</h1>
        <p className="text-xs text-text-mute mt-1">
          Level {character.level}
          {klass && ` · ${klass.name}`}
          {subclass && ` (${subclass.name})`}
          {ancestry && ` · ${ancestry.name}`}
          {career && ` · ${career.name}`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link to="/characters/$id/edit" params={{ id: characterId }}>
          <Button variant="default">Edit in wizard</Button>
        </Link>
        {inEncounter && campaignId && (
          <Link to="/campaigns/$id/play" params={{ id: campaignId }}>
            <Button variant="primary">Go to play screen →</Button>
          </Link>
        )}
      </div>
    </header>
  );
}

// ── Panels ───────────────────────────────────────────────────────────────────

function OverviewPanel({
  character,
  staticData,
  bundle,
}: {
  character: Character;
  staticData: WizardStaticData;
  bundle: StaticDataBundle;
}) {
  const runtime = useMemo(() => deriveCharacterRuntime(character, bundle), [character, bundle]);
  return (
    <>
      <VitalsSection character={character} runtime={runtime} staticData={staticData} />
      <CharacteristicsSection runtime={runtime} />
      <EquipmentSection character={character} runtime={runtime} staticData={staticData} />
      <SkillsSection skills={runtime.skills} languages={runtime.languages} />
      <InventorySection character={character} staticData={staticData} />
      <TitleSection character={character} staticData={staticData} />
      <DetailsSection character={character} />
    </>
  );
}

function AbilitiesPanel({
  character,
  staticData,
  bundle,
}: {
  character: Character;
  staticData: WizardStaticData;
  bundle: StaticDataBundle;
}) {
  const runtime = useMemo(() => deriveCharacterRuntime(character, bundle), [character, bundle]);
  return <AbilitiesSection runtime={runtime} bundle={bundle} character={character} />;
}

function FeaturesPanel({
  character,
  staticData,
}: {
  character: Character;
  staticData: WizardStaticData;
}) {
  const hasCareer = !!character.careerId && !!staticData.careers.get(character.careerId);
  const hasAncestry = !!character.ancestryId && !!staticData.ancestries.get(character.ancestryId);

  if (!hasCareer && !hasAncestry) {
    return (
      <Section heading="Features">
        <p className="text-text-mute text-sm">
          No features yet. Pick a career and ancestry in the wizard to grant features.
        </p>
      </Section>
    );
  }

  return (
    <>
      <CareerFeaturesSection character={character} staticData={staticData} />
      <AncestryFeaturesSection character={character} staticData={staticData} />
    </>
  );
}

function StoryPanel({
  character,
  staticData,
}: {
  character: Character;
  staticData: WizardStaticData;
}) {
  const hasCulture =
    !!character.culture.environment ||
    !!character.culture.organization ||
    !!character.culture.upbringing ||
    !!character.culture.language;
  const career = character.careerId ? staticData.careers.get(character.careerId) : null;
  const incident = career
    ? (career.incitingIncidents ?? []).find(
        (i) => i.id === character.careerChoices.incitingIncidentId,
      )
    : null;
  const complication = character.complicationId
    ? staticData.complications.get(character.complicationId)
    : null;

  if (!hasCulture && !career && !complication) {
    return (
      <Section heading="Story">
        <p className="text-text-mute text-sm">
          No story details recorded yet. Use the wizard to set culture, career, or a complication.
        </p>
      </Section>
    );
  }

  return (
    <>
      <CultureSection character={character} />
      <CareerStorySection
        character={character}
        staticData={staticData}
        career={career}
        incident={incident}
      />
      <ComplicationSection character={character} staticData={staticData} />
    </>
  );
}

function ActivityPanel() {
  return (
    <Section heading="Activity">
      <p className="text-text-mute text-sm">No recent activity</p>
    </Section>
  );
}

// ── Shared atoms ─────────────────────────────────────────────────────────────

function KeyValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-[10px] uppercase tracking-[0.14em] font-mono text-text-mute w-32 flex-shrink-0">
        {label}
      </dt>
      <dd className="text-sm text-text">{value}</dd>
    </div>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

function VitalsSection({
  character,
  runtime,
  staticData,
}: {
  character: Character;
  runtime: Runtime;
  staticData: WizardStaticData;
}) {
  const klass = character.classId ? staticData.classes.get(character.classId) : null;
  const currentStamina = character.currentStamina ?? runtime.maxStamina;
  const winded = Math.floor(runtime.maxStamina / 2);
  const dying = -winded;
  const recoveriesCurrent = Math.max(0, runtime.recoveriesMax - character.recoveriesUsed);

  return (
    <Section heading="Vitals">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-1">
        <KeyValue
          label="Stamina"
          value={
            <>
              <span className="font-mono tabular">
                {currentStamina} / {runtime.maxStamina}
              </span>
              <span className="ml-2 text-xs text-text-mute">
                winded ≤ {winded} · dying {dying} to 0
              </span>
            </>
          }
        />
        <KeyValue
          label="Recoveries"
          value={
            <span className="font-mono tabular">
              {recoveriesCurrent} / {runtime.recoveriesMax}
              <span className="ml-2 text-xs text-text-mute">
                recovery value {runtime.recoveryValue}
              </span>
            </span>
          }
        />
        <KeyValue
          label="Heroic resource"
          value={
            <span className="capitalize">
              {runtime.heroicResource.name}
              {runtime.heroicResource.max !== null && (
                <span className="text-xs text-text-mute ml-2">
                  max {runtime.heroicResource.max}
                </span>
              )}
            </span>
          }
        />
        <KeyValue label="Size" value={runtime.size} />
        <KeyValue label="Speed" value={runtime.speed} />
        <KeyValue label="Stability" value={runtime.stability} />
        <KeyValue label="Free strike" value={runtime.freeStrikeDamage} />
        <KeyValue label="Level" value={character.level} />
        <KeyValue label="XP" value={character.xp} />
        {klass && (
          <KeyValue
            label="Potency"
            value={<span className="capitalize">{klass.potencyCharacteristic}</span>}
          />
        )}
      </dl>
      {runtime.immunities.length > 0 && (
        <p className="text-sm text-text mt-2">
          <span className="text-[10px] uppercase tracking-[0.14em] font-mono text-text-mute mr-2">
            Immunities
          </span>
          {runtime.immunities.map((r) => `${r.kind} ${r.value}`).join(', ')}
        </p>
      )}
      {runtime.weaknesses.length > 0 && (
        <p className="text-sm text-text mt-2">
          <span className="text-[10px] uppercase tracking-[0.14em] font-mono text-text-mute mr-2">
            Weaknesses
          </span>
          {runtime.weaknesses.map((r) => `${r.kind} ${r.value}`).join(', ')}
        </p>
      )}
    </Section>
  );
}

function CharacteristicsSection({ runtime }: { runtime: Runtime }) {
  return (
    <Section heading="Characteristics">
      <div className="grid grid-cols-5 gap-2">
        {CHARACTERISTIC_ORDER.map((ch) => (
          <CharacteristicCell
            key={ch}
            label={CHARACTERISTIC_LABELS[ch]}
            value={runtime.characteristics[ch]}
          />
        ))}
      </div>
    </Section>
  );
}

function EquipmentSection({
  character,
  runtime,
  staticData,
}: {
  character: Character;
  runtime: Runtime;
  staticData: WizardStaticData;
}) {
  const kit = character.kitId ? staticData.kits.get(character.kitId) : null;
  if (!kit) {
    return (
      <Section heading="Equipment / Kit">
        <p className="text-sm text-text-mute">No kit selected.</p>
      </Section>
    );
  }
  const keywords = kit.keywords ?? [];
  return (
    <Section heading={`Equipment / Kit — ${kit.name}`}>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-1">
        {keywords.length > 0 && <KeyValue label="Keywords" value={keywords.join(', ')} />}
        <KeyValue label="Melee damage bonus" value={runtime.weaponDamageBonus.melee.join(' / ')} />
        <KeyValue
          label="Ranged damage bonus"
          value={runtime.weaponDamageBonus.ranged.join(' / ')}
        />
        {kit.staminaBonus !== undefined && kit.staminaBonus !== 0 && (
          <KeyValue label="Stamina bonus" value={`+${kit.staminaBonus}`} />
        )}
        {kit.speedBonus !== undefined && kit.speedBonus !== 0 && (
          <KeyValue label="Speed bonus" value={`+${kit.speedBonus}`} />
        )}
        {kit.stabilityBonus !== undefined && kit.stabilityBonus !== 0 && (
          <KeyValue label="Stability bonus" value={`+${kit.stabilityBonus}`} />
        )}
        {/* Phase 2b Group A+B slice 10/11 — kit distance + disengage bonuses
            surface on the sheet. Distance bonuses are always-on flat numbers;
            disengage bonus surfaces as the resulting shift value (1 + bonus)
            for player table-adjudication. */}
        {kit.meleeDistanceBonus !== undefined && kit.meleeDistanceBonus !== 0 && (
          <KeyValue label="Melee distance bonus" value={`+${kit.meleeDistanceBonus}`} />
        )}
        {kit.rangedDistanceBonus !== undefined && kit.rangedDistanceBonus !== 0 && (
          <KeyValue label="Ranged distance bonus" value={`+${kit.rangedDistanceBonus}`} />
        )}
        {kit.disengageBonus !== undefined && kit.disengageBonus !== 0 && (
          <KeyValue
            label="Disengage"
            value={`shift ${1 + kit.disengageBonus} (no OA)`}
          />
        )}
      </dl>
      {kit.signatureAbilityId && (
        <p className="text-xs text-text-mute mt-2">
          Signature ability: <span className="text-text">{kit.signatureAbilityId}</span>
        </p>
      )}
      {kit.description && (
        <p className="text-sm text-text-dim whitespace-pre-wrap mt-2">{kit.description}</p>
      )}
    </Section>
  );
}

function CultureSection({ character }: { character: Character }) {
  const c = character.culture;
  if (!c.environment && !c.organization && !c.upbringing && !c.language) {
    return null;
  }
  return (
    <Section heading="Culture">
      <dl className="space-y-1">
        {c.customName && <KeyValue label="Name" value={c.customName} />}
        {c.environment && (
          <KeyValue
            label="Environment"
            value={
              <>
                <span className="capitalize">{c.environment}</span>
                {c.environmentSkill && (
                  <span className="ml-2 text-xs text-text-mute">→ {c.environmentSkill}</span>
                )}
              </>
            }
          />
        )}
        {c.organization && (
          <KeyValue
            label="Organization"
            value={
              <>
                <span className="capitalize">{c.organization}</span>
                {c.organizationSkill && (
                  <span className="ml-2 text-xs text-text-mute">→ {c.organizationSkill}</span>
                )}
              </>
            }
          />
        )}
        {c.upbringing && (
          <KeyValue
            label="Upbringing"
            value={
              <>
                <span className="capitalize">{c.upbringing}</span>
                {c.upbringingSkill && (
                  <span className="ml-2 text-xs text-text-mute">→ {c.upbringingSkill}</span>
                )}
              </>
            }
          />
        )}
        {c.language && <KeyValue label="Language" value={c.language} />}
      </dl>
    </Section>
  );
}

function CareerFeaturesSection({
  character,
  staticData,
}: {
  character: Character;
  staticData: WizardStaticData;
}) {
  if (!character.careerId) return null;
  const career = staticData.careers.get(character.careerId);
  if (!career) return null;

  const hasChoices =
    character.careerChoices.skills.length > 0 ||
    character.careerChoices.languages.length > 0 ||
    !!character.careerChoices.perkId ||
    (career.renown ?? 0) > 0 ||
    !!career.wealthNote;

  if (!hasChoices) return null;

  return (
    <Section heading={`Career — ${career.name}`}>
      <dl className="space-y-1">
        {character.careerChoices.skills.length > 0 && (
          <KeyValue label="Career skills" value={character.careerChoices.skills.join(', ')} />
        )}
        {character.careerChoices.languages.length > 0 && (
          <KeyValue label="Career languages" value={character.careerChoices.languages.join(', ')} />
        )}
        {character.careerChoices.perkId && (
          <KeyValue label="Perk" value={character.careerChoices.perkId} />
        )}
        {(career.renown ?? 0) > 0 && <KeyValue label="Renown" value={career.renown} />}
        {career.wealthNote && <KeyValue label="Wealth" value={career.wealthNote} />}
      </dl>
    </Section>
  );
}

function CareerStorySection({
  character,
  career,
  incident,
}: {
  character: Character;
  staticData: WizardStaticData;
  career: ReturnType<WizardStaticData['careers']['get']> | null | undefined;
  incident:
    | NonNullable<
        NonNullable<ReturnType<WizardStaticData['careers']['get']>>['incitingIncidents']
      >[number]
    | undefined
    | null;
}) {
  if (!career) return null;
  if (!career.description && !incident) return null;
  void character;
  return (
    <Section heading={`Career — ${career.name}`}>
      {career.description && (
        <p className="text-sm text-text-dim whitespace-pre-wrap">{career.description}</p>
      )}
      {incident && (
        <div className="mt-2">
          <h3 className="text-[10px] uppercase tracking-[0.14em] font-mono text-text-mute">
            Inciting incident
          </h3>
          <p className="text-sm font-medium text-text mt-1">{incident.title}</p>
          <p className="text-sm text-text-dim whitespace-pre-wrap mt-1">{incident.description}</p>
        </div>
      )}
    </Section>
  );
}

function ComplicationSection({
  character,
  staticData,
}: {
  character: Character;
  staticData: WizardStaticData;
}) {
  if (!character.complicationId) return null;
  const comp = staticData.complications.get(character.complicationId);
  if (!comp) return null;
  return (
    <Section heading={`Complication — ${comp.name}`}>
      {comp.description && (
        <p className="text-sm text-text-dim whitespace-pre-wrap">{comp.description}</p>
      )}
      <dl className="space-y-1 mt-2">
        <KeyValue label="Benefit" value={comp.benefit} />
        <KeyValue label="Drawback" value={comp.drawback} />
      </dl>
    </Section>
  );
}

function AncestryFeaturesSection({
  character,
  staticData,
}: {
  character: Character;
  staticData: WizardStaticData;
}) {
  if (!character.ancestryId) return null;
  const a = staticData.ancestries.get(character.ancestryId);
  if (!a) return null;

  const purchased = (a.purchasedTraits ?? []).filter((t) =>
    character.ancestryChoices.traitIds.includes(t.id),
  );

  return (
    <Section heading={`Ancestry — ${a.name}`}>
      {a.description && (
        <p className="text-sm text-text-dim whitespace-pre-wrap">{a.description}</p>
      )}
      <div className="mt-2">
        <h3 className="text-[10px] uppercase tracking-[0.14em] font-mono text-text-mute">
          Signature trait
        </h3>
        <p className="text-sm font-medium text-text mt-1">{a.signatureTrait.name}</p>
        <p className="text-sm text-text-dim whitespace-pre-wrap mt-1">
          {a.signatureTrait.description}
        </p>
      </div>
      {purchased.length > 0 && (
        <div className="mt-3">
          <h3 className="text-[10px] uppercase tracking-[0.14em] font-mono text-text-mute">
            Purchased traits
          </h3>
          <ul className="mt-1 space-y-2">
            {purchased.map((t) => (
              <li key={t.id} className="text-sm">
                <span className="font-medium text-text">{t.name}</span>
                <span className="text-xs text-text-mute ml-2">({t.cost} pt)</span>
                <p className="text-sm text-text-dim whitespace-pre-wrap mt-1">{t.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {character.ancestryChoices.wyrmplateType && (
        <div className="mt-2">
          <KeyValue
            label="Wyrmplate"
            value={<span className="capitalize">{character.ancestryChoices.wyrmplateType}</span>}
          />
        </div>
      )}
      {character.ancestryChoices.prismaticScalesType && (
        <div className="mt-2">
          <KeyValue
            label="Prismatic scales"
            value={
              <span className="capitalize">{character.ancestryChoices.prismaticScalesType}</span>
            }
          />
        </div>
      )}
      {character.ancestryChoices.formerAncestryId && (
        <div className="mt-2">
          <KeyValue
            label="Former life"
            value={
              <span className="capitalize">
                {staticData.ancestries.get(character.ancestryChoices.formerAncestryId)?.name ??
                  character.ancestryChoices.formerAncestryId}
              </span>
            }
          />
        </div>
      )}
    </Section>
  );
}

function SkillsSection({
  skills,
  languages,
}: {
  skills: readonly string[];
  languages: readonly string[];
}) {
  if (skills.length === 0 && languages.length === 0) return null;
  const skillItems: SkillItem[] = skills.map((s) => ({ id: s, label: s, selected: true }));
  const languageItems: SkillItem[] = languages.map((l) => ({ id: l, label: l, selected: true }));
  return (
    <Section heading="Skills & Languages">
      <div className="flex flex-col gap-3">
        {skills.length > 0 && <SkillChipGroup heading="Skills" items={skillItems} />}
        {languages.length > 0 && <SkillChipGroup heading="Languages" items={languageItems} />}
      </div>
    </Section>
  );
}

function AbilitiesSection({
  runtime,
  bundle,
  character,
}: {
  runtime: Runtime;
  bundle: StaticDataBundle;
  character: Character;
}) {
  const resolved = runtime.abilityIds
    .map((id) => bundle.abilities.get(id))
    .filter((a): a is Ability => !!a);

  if (resolved.length === 0) {
    return (
      <Section heading="Abilities">
        <p className="text-sm text-text-mute">
          No abilities recorded.{' '}
          <Link
            to="/characters/$id/edit"
            params={{ id: character.classId ? character.classId : '' }}
            className="underline text-accent"
          >
            Pick abilities in the wizard
          </Link>
          .
        </p>
      </Section>
    );
  }

  return (
    <Section heading="Abilities">
      <ul className="flex flex-col gap-3">
        {resolved.map((a) => (
          <li key={a.id} className="bg-ink-2 border border-line p-3 flex flex-col gap-1">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium text-text">{a.name}</h3>
              <span className="text-[10px] uppercase tracking-[0.14em] font-mono text-text-mute">
                {a.type}
                {a.cost !== null && a.cost !== undefined && a.cost > 0 && ` · ${a.cost} cost`}
                {a.cost === 0 && ' · signature'}
                {a.tier !== null && a.tier !== undefined && ` · tier ${a.tier}`}
              </span>
            </header>
            {((a.keywords && a.keywords.length > 0) || a.distance || a.target) && (
              <div className="flex flex-wrap gap-1.5">
                {a.keywords?.map((k) => (
                  <Chip key={k} size="xs" shape="pill">
                    {k}
                  </Chip>
                ))}
                {a.distance && (
                  <Chip size="xs" shape="pill">
                    {a.distance}
                  </Chip>
                )}
                {a.target && (
                  <Chip size="xs" shape="pill">
                    {a.target}
                  </Chip>
                )}
              </div>
            )}
            {a.powerRoll && (
              <div className="text-xs font-mono tabular text-text-dim flex flex-col gap-0.5 mt-1">
                <div>Power Roll {a.powerRoll.bonus}</div>
                <div>≤11 — {a.powerRoll.tier1.raw}</div>
                <div>12-16 — {a.powerRoll.tier2.raw}</div>
                <div>17+ — {a.powerRoll.tier3.raw}</div>
              </div>
            )}
            {a.effect && <p className="text-sm text-text-dim whitespace-pre-wrap">{a.effect}</p>}
            {a.trigger && (
              <p className="text-xs text-text-dim">
                <span className="uppercase tracking-[0.14em] font-mono text-text-mute mr-1">
                  Trigger:
                </span>
                {a.trigger}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function InventorySection({
  character,
  staticData,
}: {
  character: Character;
  staticData: WizardStaticData;
}) {
  if (character.inventory.length === 0) return null;
  const equipped = character.inventory.filter((e) => e.equipped);
  const carried = character.inventory.filter((e) => !e.equipped);

  return (
    <Section heading="Inventory">
      <div className="flex flex-col gap-3">
        {equipped.length > 0 && (
          <div>
            <h3 className="text-[10px] uppercase tracking-[0.14em] font-mono text-text-mute mb-1">
              Equipped
            </h3>
            <InventoryList entries={equipped} staticData={staticData} />
          </div>
        )}
        {carried.length > 0 && (
          <div>
            <h3 className="text-[10px] uppercase tracking-[0.14em] font-mono text-text-mute mb-1">
              Carried
            </h3>
            <InventoryList entries={carried} staticData={staticData} />
          </div>
        )}
      </div>
    </Section>
  );
}

function InventoryList({
  entries,
  staticData,
}: {
  entries: Character['inventory'];
  staticData: WizardStaticData;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {entries.map((e) => {
        const item = staticData.items.get(e.itemId);
        const label = item?.name ?? e.itemId;
        return (
          <li
            key={e.id}
            className="flex items-baseline gap-2 bg-ink-2 border border-line px-3 py-2 text-sm"
          >
            <span className="flex-1 text-text">{label}</span>
            {e.quantity > 1 && (
              <span className="text-xs text-text-mute font-mono tabular">×{e.quantity}</span>
            )}
            {item?.category && (
              <span className="text-xs text-text-mute capitalize">{item.category}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TitleSection({
  character,
  staticData,
}: {
  character: Character;
  staticData: WizardStaticData;
}) {
  if (!character.titleId) return null;
  const t = staticData.titles.get(character.titleId);
  if (!t) return null;
  return (
    <Section heading={`Title — ${t.name}`}>
      {t.description && (
        <p className="text-sm text-text-dim whitespace-pre-wrap">{t.description}</p>
      )}
    </Section>
  );
}

function DetailsSection({ character }: { character: Character }) {
  const d = character.details;
  const fields = [
    ['Pronouns', d.pronouns],
    ['Age', d.age],
    ['Height', d.height],
    ['Build', d.build],
    ['Eyes', d.eyes],
    ['Hair', d.hair],
    ['Skin tone', d.skinTone],
    ['Physical features', d.physicalFeatures],
  ] as const;
  const filled = fields.filter(([, v]) => v && v.trim().length > 0);
  if (filled.length === 0) return null;
  return (
    <Section heading="Details">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-1">
        {filled.map(([label, value]) => (
          <KeyValue key={label} label={label} value={value} />
        ))}
      </dl>
    </Section>
  );
}
