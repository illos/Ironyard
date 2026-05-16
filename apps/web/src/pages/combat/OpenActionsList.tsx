import type { OpenAction } from '@ironyard/shared';
import { OPEN_ACTION_COPY } from '@ironyard/shared';
import { Section } from '../../primitives';
import { OpenActionRow, type ViewerRowRelation } from './OpenActionRow';

export type ParticipantDisplayLookup = (participantId: string) => {
  ownerId: string | null;
  name: string | null;
};

type Props = {
  openActions: OpenAction[];
  currentUserId: string;
  activeDirectorId: string;
  currentRound: number;
  participantDisplayLookup: ParticipantDisplayLookup;
  onClaim: (openActionId: string) => void;
};

/**
 * Phase 5 Pass 2b2a — primitive-wrapped Open Actions list. Empty state
 * collapses entirely (returns null). Each row delegates to OpenActionRow
 * for the for-me / watching / director-override variants.
 */
export function OpenActionsList(props: Props) {
  const {
    openActions,
    currentUserId,
    activeDirectorId,
    currentRound,
    participantDisplayLookup,
    onClaim,
  } = props;

  if (openActions.length === 0) return null;
  const isDirector = currentUserId === activeDirectorId;

  return (
    <Section heading={`OPEN ACTIONS · ${openActions.length}`}>
      <div className="flex flex-col gap-1.5">
        {openActions.map((oa) => {
          const copy = OPEN_ACTION_COPY[oa.kind];
          const title = copy?.title(oa) ?? `Open Action: ${oa.kind}`;
          const body = copy?.body(oa) ?? '';
          const claimLabel = copy?.claimLabel(oa) ?? 'Claim';
          const { ownerId, name } = participantDisplayLookup(oa.participantId);
          const isOwnerSelf = ownerId !== null && currentUserId === ownerId;
          const viewerOwnerForRow: ViewerRowRelation = isOwnerSelf ? 'self' : 'other-player';
          const canClaim = isOwnerSelf || isDirector;
          const ownerName = isOwnerSelf ? 'You' : (name ?? 'someone');

          return (
            <OpenActionRow
              key={oa.id}
              oa={oa}
              title={title}
              body={body}
              claimLabel={claimLabel}
              currentRound={currentRound}
              viewerOwnerForRow={viewerOwnerForRow}
              canClaim={canClaim}
              ownerName={ownerName}
              onClaim={onClaim}
            />
          );
        })}
      </div>
    </Section>
  );
}
