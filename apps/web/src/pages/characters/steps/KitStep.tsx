import type { Character } from '@ironyard/shared';
import type { WizardStaticData } from '../../../api/static-data';

export function KitStep({
  draft,
  staticData,
  onPatch,
}: {
  draft: Character;
  staticData: WizardStaticData;
  onPatch: (p: Partial<Character>) => void;
}) {
  const kits = Array.from(staticData.kits.values());
  // Filter to the class's compatible kits if the schema records that info.
  // For Epic 1 the kit list is empty regardless, so the filter is a no-op.
  const compatible = kits;

  if (compatible.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-neutral-300">
          Kit picker comes in Epic 2 — once kit data ingestion lands.
        </p>
        <p className="text-xs text-neutral-500">
          For now this step is informational. Your character will submit without a kit;
          kit-required classes will derive at no-kit defaults until Epic 2.
        </p>
        {draft.kitId !== null && (
          <button
            type="button"
            onClick={() => onPatch({ kitId: null })}
            className="min-h-11 px-3 py-2 rounded-md bg-neutral-100 text-neutral-900 text-sm font-medium"
          >
            Clear current kit
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {compatible.map((k) => (
        <button
          key={k.id}
          type="button"
          onClick={() => onPatch({ kitId: k.id })}
          className={
            'text-left rounded-md border px-4 py-3 min-h-11 ' +
            (k.id === draft.kitId
              ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
              : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-neutral-600')
          }
        >
          <div className="font-medium">{k.name}</div>
          <div className="text-xs opacity-80 mt-1 font-mono">
            ST +{k.staminaBonus} · SPD +{k.speedBonus} · STAB +{k.stabilityBonus}
          </div>
        </button>
      ))}
    </div>
  );
}
