import { useState } from 'react';
import { useAttachCharacterToCampaign } from '../../../api/mutations';

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
    <form onSubmit={onSubmit} className="rounded-md border border-neutral-800 p-4 space-y-3">
      <h3 className="font-medium">Attach to a campaign</h3>
      <p className="text-xs text-neutral-500">
        Paste an invite code to join the campaign and submit this character to the director.
      </p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          placeholder="ABCDEF"
          className="flex-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 uppercase tracking-widest min-h-11"
        />
        <button
          type="submit"
          disabled={attach.isPending || code.trim().length !== 6}
          className="min-h-11 px-4 py-2 rounded-md bg-neutral-100 text-neutral-900 font-medium disabled:opacity-50"
        >
          Attach
        </button>
      </div>
      {attach.error && (
        <p className="text-sm text-rose-400">{(attach.error as Error).message}</p>
      )}
    </form>
  );
}
