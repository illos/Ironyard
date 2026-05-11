import type { Character } from '@ironyard/shared';

export function NameDetailsStep(_props: {
  draft: Character;
  name: string;
  campaignCode: string | undefined;
  onNameChange: (n: string) => void;
  onPatch: (p: Partial<Character>) => void;
}) {
  return <p className="text-neutral-400">NameDetailsStep (Phase D1)</p>;
}
