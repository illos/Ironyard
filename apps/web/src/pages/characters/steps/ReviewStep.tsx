import type { Character } from '@ironyard/shared';
import type { WizardStaticData } from '../../../api/static-data';

export function ReviewStep(_props: {
  draft: Character;
  staticData: WizardStaticData;
  characterId: string | null;
  onSubmitted: (id: string) => void;
}) {
  return <p className="text-neutral-400">ReviewStep (Phase D8)</p>;
}
