import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useCreateCampaign } from '../api/mutations';
import { useActiveContext } from '../lib/active-context';
import { Button, Section } from '../primitives';

export function CampaignNew() {
  const [name, setName] = useState('');
  const createMut = useCreateCampaign();
  const navigate = useNavigate();
  const { setActiveCampaignId } = useActiveContext();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMut.mutate(
      { name: name.trim() },
      {
        onSuccess: (campaign) => {
          setActiveCampaignId(campaign.id);
          navigate({ to: '/campaigns/$id', params: { id: campaign.id } });
        },
      },
    );
  };

  return (
    <div className="p-6 max-w-xl mx-auto flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-text-dim hover:text-text text-sm">
          ← Home
        </Link>
      </div>
      <Section heading="Start a new campaign">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-mute">
              Name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Ember Reaches"
              required
              // biome-ignore lint/a11y/noAutofocus: dedicated route surface — the campaign-name input is the page's only action.
              autoFocus
              className="bg-ink-2 border border-line px-3 py-2 text-text focus:border-accent focus:outline-none"
            />
          </label>
          {createMut.error && (
            <p className="text-foe text-xs">{(createMut.error as Error).message}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Link to="/">
              <Button type="button">Cancel</Button>
            </Link>
            <Button type="submit" variant="primary" disabled={createMut.isPending}>
              {createMut.isPending ? 'Creating…' : 'Create campaign'}
            </Button>
          </div>
        </form>
      </Section>
    </div>
  );
}
