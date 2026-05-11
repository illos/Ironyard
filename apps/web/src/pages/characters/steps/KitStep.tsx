import type { Character } from '@ironyard/shared';
import type { WizardStaticData } from '../../../api/static-data';

export function KitStep(_props: {
  draft: Character;
  staticData: WizardStaticData;
  onPatch: (p: Partial<Character>) => void;
}) {
  return <p className="text-neutral-400">KitStep (Phase D7)</p>;
}
