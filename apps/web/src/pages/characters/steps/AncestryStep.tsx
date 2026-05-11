import type { Character } from '@ironyard/shared';
import type { WizardStaticData } from '../../../api/static-data';

export function AncestryStep(_props: {
  draft: Character;
  staticData: WizardStaticData;
  onPatch: (p: Partial<Character>) => void;
}) {
  return <p className="text-neutral-400">AncestryStep (Phase D2)</p>;
}
