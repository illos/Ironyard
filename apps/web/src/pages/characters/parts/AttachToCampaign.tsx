import { useState } from 'react';
import { useAttachCharacterToCampaign } from '../../../api/mutations';
import { Button } from '../../../primitives';

export function AttachToCampaign({ characterId }: { characterId: string }) {
  const [code, setCode] = useState('');
  const attach = useAttachCharacterToCampaign(characterId);
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length !== 6) return;
    attach.mutate({ campaignCode: c });
  };
  return (
    <form onSubmit={onSubmit} className="bg-ink-1 border border-line p-4 flex flex-col gap-3">
      <h3 className="font-medium text-text">Attach to a campaign</h3>
      <p className="text-xs text-text-mute">
        Paste an invite code to join the campaign and submit this character to the director.
      </p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          placeholder="ABCDEF"
          className="flex-1 bg-ink-2 border border-line text-text px-3 py-2 uppercase tracking-widest font-mono min-h-11 outline-none focus:border-accent"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={attach.isPending || code.trim().length !== 6}
          className="min-h-11 disabled:opacity-50"
        >
          Attach
        </Button>
      </div>
      {attach.error && <p className="text-sm text-foe">{(attach.error as Error).message}</p>}
    </form>
  );
}
