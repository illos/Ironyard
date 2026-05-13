import { type StaticDataBundle, deriveCharacterRuntime } from '@ironyard/rules';
import { type Ability, type Character } from '@ironyard/shared';
import { Link, useParams } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useCharacter, useMe } from '../../api/queries';
import { type WizardStaticData, useWizardStaticData } from '../../api/static-data';
import { useSessionSocket } from '../../ws/useSessionSocket';
import { AttachToCampaign } from './parts/AttachToCampaign';

const CHARACTERISTIC_ORDER = [
  'might',
  'agility',
  'reason',
  'intuition',
  'presence',
] as const;

export function Sheet() {
  const { id } = useParams({ from: '/characters/$id' });
  const me = useMe();
  const ch = useCharacter(id);
  const staticData = useWizardStaticData();

  const campaignId = ch.data?.data.campaignId ?? undefined;
  const sock = useSessionSocket(campaignId);

  if (me.isLoading || ch.isLoading || !staticData) {
    return <main className="mx-auto max-w-4xl p-6 text-neutral-400">Loading…</main>;
  }
  if (!me.data) {
    return (
      <main className="mx-auto max-w-4xl p-6 text-neutral-400">
        Sign in to view characters.
      </main>
    );
  }
  if (!ch.data) {
    return <main className="mx-auto max-w-4xl p-6 text-rose-400">Character not found.</main>;
  }

  const character = ch.data.data;
  const inCampaign = !!campaignId;
  const inEncounter = inCampaign && sock.activeEncounter !== null;

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-5">
      <SheetHeader
        name={ch.data.name}
        character={character}
        staticData={staticData}
        characterId={id}
        inEncounter={inEncounter}
        campaignId={campaignId}
      />

      <SheetBody character={character} staticData={staticData} />

      {inEncounter && (
        <div className="rounded-md border border-emerald-900 bg-emerald-950/40 p-4 text-sm">
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
  const ancestry = character.ancestryId
    ? staticData.ancestries.get(character.ancestryId)
    : null;
  const career = character.careerId ? staticData.careers.get(character.careerId) : null;
  const subclass = klass?.subclasses?.find((s) => s.id === character.subclassId);

  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{name}</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Level {character.level}
          {klass && ` · ${klass.name}`}
          {subclass && ` (${subclass.name})`}
          {ancestry && ` · ${ancestry.name}`}
          {career && ` · ${career.name}`}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Link
          to="/characters/$id/edit"
          params={{ id: characterId }}
          className="inline-flex items-center min-h-11 px-3 rounded-md border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-900"
        >
          Edit in wizard
        </Link>
        {inEncounter && campaignId && (
          <Link
            to="/campaigns/$id/play"
            params={{ id: campaignId }}
            className="inline-flex items-center min-h-11 px-3 rounded-md bg-emerald-500 text-neutral-900 text-sm font-medium"
          >
            Go to play screen →
          </Link>
        )}
      </div>
    </header>
  );
}

// ── Body ─────────────────────────────────────────────────────────────────────

function SheetBody({
  character,
  staticData,
}: {
  character: Character;
  staticData: WizardStaticData;
}) {
  const bundle: StaticDataBundle = useMemo(
    () => ({
      ancestries: staticData.ancestries as StaticDataBundle['ancestries'],
      careers: staticData.careers as StaticDataBundle['careers'],
      classes: staticData.classes as StaticDataBundle['classes'],
      kits: staticData.kits as StaticDataBundle['kits'],
      abilities: staticData.abilities as StaticDataBundle['abilities'],
      items: staticData.items as StaticDataBundle['items'],
      titles: staticData.titles as StaticDataBundle['titles'],
    }),
    [staticData],
  );
  const runtime = useMemo(() => deriveCharacterRuntime(character, bundle), [character, bundle]);

  return (
    <div className="space-y-5">
      <CoreStatsSection character={character} runtime={runtime} staticData={staticData} />
      <CharacteristicsSection runtime={runtime} />
      <EquipmentSection character={character} runtime={runtime} staticData={staticData} />
      <CultureSection character={character} />
      <CareerSection character={character} staticData={staticData} />
      <ComplicationSection character={character} staticData={staticData} />
      <AncestrySection character={character} staticData={staticData} />
      <SkillsSection skills={runtime.skills} languages={runtime.languages} />
      <AbilitiesSection runtime={runtime} bundle={bundle} character={character} />
      <InventorySection character={character} staticData={staticData} />
      <TitleSection character={character} staticData={staticData} />
      <DetailsSection character={character} />
    </div>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-neutral-800 bg-neutral-950 p-4 space-y-3">
      <h2 className="text-sm uppercase tracking-wider text-neutral-400">{title}</h2>
      {children}
    </section>
  );
}

function KeyValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-xs uppercase tracking-wider text-neutral-500 w-32 flex-shrink-0">
        {label}
      </dt>
      <dd className="text-sm text-neutral-200">{value}</dd>
    </div>
  );
}

function CoreStatsSection({
  character,
  runtime,
  staticData,
}: {
  character: Character;
  runtime: ReturnType<typeof deriveCharacterRuntime>;
  staticData: WizardStaticData;
}) {
  const klass = character.classId ? staticData.classes.get(character.classId) : null;
  const ancestry = character.ancestryId
    ? staticData.ancestries.get(character.ancestryId)
    : null;
  const currentStamina = character.currentStamina ?? runtime.maxStamina;
  const winded = Math.floor(runtime.maxStamina / 2);
  const dying = -winded;
  const recoveriesCurrent = Math.max(0, runtime.recoveriesMax - character.recoveriesUsed);

  return (
    <Section title="Vitals">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-1">
        <KeyValue
          label="Stamina"
          value={
            <>
              <span className="font-mono">
                {currentStamina} / {runtime.maxStamina}
              </span>
              <span className="ml-2 text-xs text-neutral-500">
                winded ≤ {winded} · dying {dying} to 0
              </span>
            </>
          }
        />
        <KeyValue
          label="Recoveries"
          value={
            <span className="font-mono">
              {recoveriesCurrent} / {runtime.recoveriesMax}
              <span className="ml-2 text-xs text-neutral-500">
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
                <span className="text-xs text-neutral-500 ml-2">
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
        <p className="text-sm text-neutral-200">
          <span className="text-xs uppercase tracking-wider text-neutral-500 mr-2">
            Immunities
          </span>
          {runtime.immunities.map((r) => `${r.kind} ${r.value}`).join(', ')}
        </p>
      )}
      {runtime.weaknesses.length > 0 && (
        <p className="text-sm text-neutral-200">
          <span className="text-xs uppercase tracking-wider text-neutral-500 mr-2">Weaknesses</span>
          {runtime.weaknesses.map((r) => `${r.kind} ${r.value}`).join(', ')}
        </p>
      )}
      {ancestry?.grantedImmunities && ancestry.grantedImmunities.length === 0 && null}
    </Section>
  );
}

function CharacteristicsSection({
  runtime,
}: {
  runtime: ReturnType<typeof deriveCharacterRuntime>;
}) {
  return (
    <Section title="Characteristics">
      <dl className="grid grid-cols-5 gap-2 text-center">
        {CHARACTERISTIC_ORDER.map((ch) => {
          const v = runtime.characteristics[ch];
          return (
            <div
              key={ch}
              className="rounded-md bg-neutral-900/60 border border-neutral-800 px-2 py-3"
            >
              <dt className="text-[10px] uppercase tracking-wider text-neutral-500">{ch}</dt>
              <dd className="font-mono tabular-nums text-2xl mt-1">
                {v > 0 ? `+${v}` : v}
              </dd>
            </div>
          );
        })}
      </dl>
    </Section>
  );
}

function EquipmentSection({
  character,
  runtime,
  staticData,
}: {
  character: Character;
  runtime: ReturnType<typeof deriveCharacterRuntime>;
  staticData: WizardStaticData;
}) {
  const kit = character.kitId ? staticData.kits.get(character.kitId) : null;
  if (!kit) {
    return (
      <Section title="Equipment / Kit">
        <p className="text-sm text-neutral-500">No kit selected.</p>
      </Section>
    );
  }
  const keywords = kit.keywords ?? [];
  return (
    <Section title={`Equipment / Kit — ${kit.name}`}>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-1">
        {keywords.length > 0 && (
          <KeyValue label="Keywords" value={keywords.join(', ')} />
        )}
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
      </dl>
      {kit.signatureAbilityId && (
        <p className="text-xs text-neutral-500">
          Signature ability: <span className="text-neutral-200">{kit.signatureAbilityId}</span>
        </p>
      )}
      {kit.description && <p className="text-sm text-neutral-300 whitespace-pre-wrap">{kit.description}</p>}
    </Section>
  );
}

function CultureSection({ character }: { character: Character }) {
  const c = character.culture;
  if (!c.environment && !c.organization && !c.upbringing && !c.language) {
    return null;
  }
  return (
    <Section title="Culture">
      <dl className="space-y-1">
        {c.customName && <KeyValue label="Name" value={c.customName} />}
        {c.environment && (
          <KeyValue
            label="Environment"
            value={
              <>
                <span className="capitalize">{c.environment}</span>
                {c.environmentSkill && (
                  <span className="ml-2 text-xs text-neutral-500">→ {c.environmentSkill}</span>
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
                  <span className="ml-2 text-xs text-neutral-500">→ {c.organizationSkill}</span>
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
                  <span className="ml-2 text-xs text-neutral-500">→ {c.upbringingSkill}</span>
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

function CareerSection({
  character,
  staticData,
}: {
  character: Character;
  staticData: WizardStaticData;
}) {
  if (!character.careerId) return null;
  const career = staticData.careers.get(character.careerId);
  if (!career) return null;

  const incident = (career.incitingIncidents ?? []).find(
    (i) => i.id === character.careerChoices.incitingIncidentId,
  );

  return (
    <Section title={`Career — ${career.name}`}>
      {career.description && (
        <p className="text-sm text-neutral-300 whitespace-pre-wrap">{career.description}</p>
      )}
      {(character.careerChoices.skills.length > 0 ||
        character.careerChoices.languages.length > 0 ||
        character.careerChoices.perkId) && (
        <dl className="space-y-1">
          {character.careerChoices.skills.length > 0 && (
            <KeyValue label="Career skills" value={character.careerChoices.skills.join(', ')} />
          )}
          {character.careerChoices.languages.length > 0 && (
            <KeyValue
              label="Career languages"
              value={character.careerChoices.languages.join(', ')}
            />
          )}
          {character.careerChoices.perkId && (
            <KeyValue label="Perk" value={character.careerChoices.perkId} />
          )}
          {(career.renown ?? 0) > 0 && <KeyValue label="Renown" value={career.renown} />}
          {career.wealthNote && <KeyValue label="Wealth" value={career.wealthNote} />}
        </dl>
      )}
      {incident && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-neutral-500">Inciting incident</h3>
          <p className="text-sm font-medium text-neutral-200 mt-1">{incident.title}</p>
          <p className="text-sm text-neutral-300 whitespace-pre-wrap mt-1">
            {incident.description}
          </p>
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
    <Section title={`Complication — ${comp.name}`}>
      {comp.description && (
        <p className="text-sm text-neutral-300 whitespace-pre-wrap">{comp.description}</p>
      )}
      <dl className="space-y-1">
        <KeyValue label="Benefit" value={comp.benefit} />
        <KeyValue label="Drawback" value={comp.drawback} />
      </dl>
    </Section>
  );
}

function AncestrySection({
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
    <Section title={`Ancestry — ${a.name}`}>
      {a.description && (
        <p className="text-sm text-neutral-300 whitespace-pre-wrap">{a.description}</p>
      )}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-neutral-500">Signature trait</h3>
        <p className="text-sm font-medium text-neutral-200 mt-1">{a.signatureTrait.name}</p>
        <p className="text-sm text-neutral-300 whitespace-pre-wrap mt-1">
          {a.signatureTrait.description}
        </p>
      </div>
      {purchased.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-neutral-500">Purchased traits</h3>
          <ul className="mt-1 space-y-2">
            {purchased.map((t) => (
              <li key={t.id} className="text-sm">
                <span className="font-medium text-neutral-200">{t.name}</span>
                <span className="text-xs text-neutral-500 ml-2">({t.cost} pt)</span>
                <p className="text-sm text-neutral-300 whitespace-pre-wrap mt-1">
                  {t.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {character.ancestryChoices.wyrmplateType && (
        <KeyValue
          label="Wyrmplate"
          value={<span className="capitalize">{character.ancestryChoices.wyrmplateType}</span>}
        />
      )}
      {character.ancestryChoices.prismaticScalesType && (
        <KeyValue
          label="Prismatic scales"
          value={
            <span className="capitalize">{character.ancestryChoices.prismaticScalesType}</span>
          }
        />
      )}
      {character.ancestryChoices.formerAncestryId && (
        <KeyValue
          label="Former life"
          value={
            <span className="capitalize">
              {staticData.ancestries.get(character.ancestryChoices.formerAncestryId)?.name ??
                character.ancestryChoices.formerAncestryId}
            </span>
          }
        />
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
  return (
    <Section title="Skills & Languages">
      {skills.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Skills</h3>
          <ul className="flex flex-wrap gap-1">
            {skills.map((s) => (
              <li
                key={s}
                className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-200 capitalize"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
      {languages.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Languages</h3>
          <ul className="flex flex-wrap gap-1">
            {languages.map((l) => (
              <li
                key={l}
                className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-200"
              >
                {l}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function AbilitiesSection({
  runtime,
  bundle,
  character,
}: {
  runtime: ReturnType<typeof deriveCharacterRuntime>;
  bundle: StaticDataBundle;
  character: Character;
}) {
  const resolved = runtime.abilityIds
    .map((id) => bundle.abilities.get(id))
    .filter((a): a is Ability => !!a);

  if (resolved.length === 0) {
    return (
      <Section title="Abilities">
        <p className="text-sm text-neutral-500">
          No abilities recorded.{' '}
          <Link
            to="/characters/$id/edit"
            params={{ id: character.classId ? character.classId : '' }}
            className="underline"
          >
            Pick abilities in the wizard
          </Link>
          .
        </p>
      </Section>
    );
  }

  return (
    <Section title="Abilities">
      <ul className="space-y-3">
        {resolved.map((a) => (
          <li
            key={a.id}
            className="rounded-md border border-neutral-800 bg-neutral-900/40 p-3 space-y-1"
          >
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium text-neutral-100">{a.name}</h3>
              <span className="text-xs text-neutral-500 uppercase tracking-wider">
                {a.type}
                {a.cost !== null && a.cost !== undefined && a.cost > 0 && ` · ${a.cost} cost`}
                {a.cost === 0 && ' · signature'}
                {a.tier !== null && a.tier !== undefined && ` · tier ${a.tier}`}
              </span>
            </header>
            {(a.keywords && a.keywords.length > 0) || a.distance || a.target ? (
              <p className="text-xs text-neutral-500">
                {a.keywords && a.keywords.length > 0 && (
                  <span className="mr-2">{a.keywords.join(' · ')}</span>
                )}
                {a.distance && <span className="mr-2">📏 {a.distance}</span>}
                {a.target && <span>🎯 {a.target}</span>}
              </p>
            ) : null}
            {a.powerRoll && (
              <div className="text-xs font-mono text-neutral-300 space-y-0.5 mt-1">
                <div>Power Roll {a.powerRoll.bonus}</div>
                <div>≤11 — {a.powerRoll.tier1.raw}</div>
                <div>12-16 — {a.powerRoll.tier2.raw}</div>
                <div>17+ — {a.powerRoll.tier3.raw}</div>
              </div>
            )}
            {a.effect && (
              <p className="text-sm text-neutral-300 whitespace-pre-wrap">{a.effect}</p>
            )}
            {a.trigger && (
              <p className="text-xs text-neutral-400">
                <span className="uppercase tracking-wider text-neutral-500 mr-1">Trigger:</span>
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
    <Section title="Inventory">
      {equipped.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Equipped</h3>
          <InventoryList entries={equipped} staticData={staticData} />
        </div>
      )}
      {carried.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Carried</h3>
          <InventoryList entries={carried} staticData={staticData} />
        </div>
      )}
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
    <ul className="space-y-1">
      {entries.map((e) => {
        const item = staticData.items.get(e.itemId);
        const label = item?.name ?? e.itemId;
        return (
          <li
            key={e.id}
            className="flex items-baseline gap-2 rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm"
          >
            <span className="flex-1 text-neutral-200">{label}</span>
            {e.quantity > 1 && (
              <span className="text-xs text-neutral-500">×{e.quantity}</span>
            )}
            {item?.category && (
              <span className="text-xs text-neutral-500 capitalize">{item.category}</span>
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
    <Section title={`Title — ${t.name}`}>
      {t.description && <p className="text-sm text-neutral-300 whitespace-pre-wrap">{t.description}</p>}
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
    <Section title="Details">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-1">
        {filled.map(([label, value]) => (
          <KeyValue key={label} label={label} value={value} />
        ))}
      </dl>
    </Section>
  );
}
