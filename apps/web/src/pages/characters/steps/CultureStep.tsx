import type { Character } from '@ironyard/shared';

export function CultureStep(_props: {
  draft: Character;
  onPatch: (p: Partial<Character>) => void;
}) {
  return <p className="text-neutral-400">CultureStep (Phase D3)</p>;
}
