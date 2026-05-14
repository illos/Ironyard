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
        <p className="text-sm text-text-dim">
          Kit picker comes in Epic 2 — once kit data ingestion lands.
        </p>
        <p className="text-xs text-text-mute">
          For now this step is informational. Your character will submit without a kit;
          kit-required classes will derive at no-kit defaults until Epic 2.
        </p>
        {draft.kitId !== null && (
          <button
            type="button"
            onClick={() => onPatch({ kitId: null })}
            className="min-h-11 px-3 py-2 bg-accent text-ink-0 text-sm font-medium"
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
            'text-left border px-4 py-3 min-h-11 ' +
            (k.id === draft.kitId
              ? 'bg-accent text-ink-0 border-accent'
              : 'bg-ink-1 text-text-dim border-line hover:border-accent')
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
