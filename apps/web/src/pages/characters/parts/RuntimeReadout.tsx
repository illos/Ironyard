import { type Character, CompleteCharacterSchema } from '@ironyard/shared';
import { deriveCharacterRuntime, type StaticDataBundle } from '@ironyard/rules';
import { useMemo } from 'react';
import type { WizardStaticData } from '../../../api/static-data';

export function RuntimeReadout({
  character,
  staticData,
}: {
  character: Character;
  staticData: WizardStaticData;
}) {
  // deriveCharacterRuntime only reads ancestries/careers/classes/kits.
  const bundle: StaticDataBundle = useMemo(
    () => ({
      ancestries: staticData.ancestries as StaticDataBundle['ancestries'],
      careers: staticData.careers as StaticDataBundle['careers'],
      classes: staticData.classes as StaticDataBundle['classes'],
      kits: staticData.kits as StaticDataBundle['kits'],
    }),
    [staticData],
  );
  const runtime = useMemo(
    () => deriveCharacterRuntime(character, bundle),
    [character, bundle],
  );
  return (
    <div className="rounded-md border border-neutral-800 p-4 space-y-3 text-sm">
      <h3 className="font-medium">Derived runtime</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-neutral-300">
        <dt>Max stamina</dt><dd className="font-mono">{runtime.maxStamina}</dd>
        <dt>Recoveries (max)</dt><dd className="font-mono">{runtime.recoveriesMax}</dd>
        <dt>Recovery value</dt><dd className="font-mono">{runtime.recoveryValue}</dd>
        <dt>Speed</dt><dd className="font-mono">{runtime.speed}</dd>
        <dt>Stability</dt><dd className="font-mono">{runtime.stability}</dd>
        <dt>Free strike damage</dt><dd className="font-mono">{runtime.freeStrikeDamage}</dd>
      </dl>
      <div>
        <h4 className="text-neutral-400 text-xs uppercase tracking-wide">Characteristics</h4>
        <pre className="font-mono text-xs mt-1">{JSON.stringify(runtime.characteristics, null, 2)}</pre>
      </div>
      <div>
        <h4 className="text-neutral-400 text-xs uppercase tracking-wide">Abilities</h4>
        <ul className="mt-1 text-xs space-y-1">
          {runtime.abilityIds.map((id) => (
            <li key={id} className="font-mono">{id}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function checkSubmitGate(character: Character) {
  const r = CompleteCharacterSchema.safeParse(character);
  if (r.success) return { ok: true as const, blockingMessage: null };
  const issues = r.error.issues;
  return { ok: false as const, blockingMessage: issues[0]?.message ?? 'incomplete' };
}
