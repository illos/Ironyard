import type { Character } from '@ironyard/shared';
import type { WizardStaticData } from '../../../api/static-data';

export function ComplicationStep(_props: {
  draft: Character;
  staticData: WizardStaticData;
  onPatch: (p: Partial<Character>) => void;
}) {
  return <p className="text-neutral-400">ComplicationStep (Phase D6)</p>;
}
