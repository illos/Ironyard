import { type Character, CharacterSchema } from '@ironyard/shared';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useCreateCharacter, useUpdateCharacter } from '../../api/mutations';
import { useCharacter, useMe } from '../../api/queries';
import { type WizardStaticData, useWizardStaticData } from '../../api/static-data';
import { AncestryStep } from './steps/AncestryStep';
import { CareerStep } from './steps/CareerStep';
import { ClassStep } from './steps/ClassStep';
import { ComplicationStep } from './steps/ComplicationStep';
import { KitStep } from './steps/KitStep';
import { NameDetailsStep } from './steps/NameDetailsStep';
import { ReviewStep } from './steps/ReviewStep';
import { CultureStep } from './steps/CultureStep';
import { StepStepper } from './parts/StepStepper';

const STEP_IDS = [
  'name',
  'ancestry',
  'culture',
  'career',
  'class',
  'complication',
  'kit',
  'review',
] as const;
type StepId = (typeof STEP_IDS)[number];

const STEP_LABELS: Record<StepId, string> = {
  name: 'Name & Details',
  ancestry: 'Ancestry',
  culture: 'Culture',
  career: 'Career',
  class: 'Class',
  complication: 'Complication',
  kit: 'Kit',
  review: 'Review',
};

function emptyCharacter(): Character {
  return CharacterSchema.parse({});
}

export function Wizard() {
  const me = useMe();
  const navigate = useNavigate();

  // Two URL surfaces: /characters/new (with optional ?code) and /characters/$id/edit.
  // strict: false lets a single component handle both routes without a from constraint.
  const params = useParams({ strict: false }) as { id?: string };
  const search = useSearch({ strict: false }) as { code?: string };
  const editingId = params.id ?? null;

  const loaded = useCharacter(editingId ?? undefined);
  const createMut = useCreateCharacter();
  const staticData = useWizardStaticData();

  // Local draft state — primary source of truth for the wizard.
  const [draft, setDraft] = useState<Character>(() => emptyCharacter());
  const [characterId, setCharacterId] = useState<string | null>(editingId);
  const [name, setName] = useState<string>('');
  const [step, setStep] = useState<StepId>('name');
  // Persisted-once-on-first-save flag — used to gate between POST and PUT.
  const [persisted, setPersisted] = useState<boolean>(!!editingId);

  // Hydrate from server when editing.
  useEffect(() => {
    if (loaded.data && characterId === editingId) {
      setDraft(loaded.data.data);
      setName(loaded.data.name);
      setPersisted(true);
    }
  }, [loaded.data, characterId, editingId]);

  const updateMut = useUpdateCharacter(characterId ?? '');

  // Hide the kit step when the chosen class doesn't use a kit.
  const visibleSteps: StepId[] = (() => {
    if (!staticData || !draft.classId) return STEP_IDS as unknown as StepId[];
    const klass = staticData.classes.get(draft.classId);
    if (klass && (klass as { usesKit?: boolean }).usesKit === false) {
      return STEP_IDS.filter((s) => s !== 'kit');
    }
    return STEP_IDS as unknown as StepId[];
  })();

  if (me.isLoading || (editingId !== null && loaded.isLoading) || !staticData) {
    return <main className="mx-auto max-w-3xl p-6 text-neutral-400">Loading…</main>;
  }
  if (!me.data) {
    return <main className="mx-auto max-w-3xl p-6 text-neutral-400">Sign in to create a character.</main>;
  }

  const patch = (p: Partial<Character>) => setDraft((d) => ({ ...d, ...p }));

  const persist = async (): Promise<string | null> => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      // Name is required; bounce the user back to the first step instead of
      // silently saving "Unnamed hero".
      setStep('name');
      return null;
    }
    if (!persisted) {
      const created = await createMut.mutateAsync({
        name: trimmedName,
        campaignCode: search.code,
        data: draft,
      });
      setCharacterId(created.id);
      setPersisted(true);
      // Reflect the server-resolved campaignId back into the draft (in case
      // the campaign code joined a campaign and set data.campaignId).
      setDraft(created.data);
      return created.id;
    } else if (characterId) {
      const updated = await updateMut.mutateAsync({
        name: trimmedName,
        data: draft,
      });
      setDraft(updated.data);
      return characterId;
    }
    return null;
  };

  const goToStep = async (next: StepId) => {
    await persist();
    setStep(next);
  };

  const stepIndex = visibleSteps.indexOf(step);
  const hasPrev = stepIndex > 0;
  const hasNext = stepIndex < visibleSteps.length - 1;
  const prev = () => { if (hasPrev) setStep(visibleSteps[stepIndex - 1]!); };
  const next = async () => { if (hasNext) await goToStep(visibleSteps[stepIndex + 1]!); };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{editingId ? 'Edit character' : 'New character'}</h1>
      </header>
      <StepStepper
        steps={visibleSteps.map((id) => ({ id, label: STEP_LABELS[id] }))}
        current={step}
        onJump={(id) => { void goToStep(id as StepId); }}
      />
      <section className="rounded-lg border border-neutral-800 p-5">
        {step === 'name' && (
          <NameDetailsStep
            draft={draft}
            name={name}
            campaignCode={search.code}
            onNameChange={setName}
            onPatch={patch}
          />
        )}
        {step === 'ancestry' && <AncestryStep draft={draft} staticData={staticData} onPatch={patch} />}
        {step === 'culture' && <CultureStep draft={draft} onPatch={patch} />}
        {step === 'career' && <CareerStep draft={draft} staticData={staticData} onPatch={patch} />}
        {step === 'class' && <ClassStep draft={draft} staticData={staticData} onPatch={patch} />}
        {step === 'complication' && <ComplicationStep draft={draft} staticData={staticData} onPatch={patch} />}
        {step === 'kit' && <KitStep draft={draft} staticData={staticData} onPatch={patch} />}
        {step === 'review' && (
          <ReviewStep
            draft={draft}
            staticData={staticData}
            characterId={characterId}
            onSubmitted={(id) => { void navigate({ to: '/characters/$id', params: { id } }); }}
          />
        )}
      </section>
      <nav className="flex justify-between">
        <button
          type="button"
          onClick={prev}
          disabled={!hasPrev}
          className="rounded-md bg-neutral-800 text-neutral-100 px-4 py-2 disabled:opacity-50"
        >
          ← Back
        </button>
        {hasNext && (
          <button
            type="button"
            onClick={() => { void next(); }}
            className="rounded-md bg-neutral-100 text-neutral-900 px-4 py-2 font-medium"
          >
            Save &amp; Continue →
          </button>
        )}
      </nav>
    </main>
  );
}
