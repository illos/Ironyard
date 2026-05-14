import type { OpenAction } from '@ironyard/shared';
import { OPEN_ACTION_COPY } from '@ironyard/shared';

type Props = {
  openActions: OpenAction[];
  currentUserId: string;
  activeDirectorId: string;
  /** Resolve a participantId → owner userId (or null if monster / missing). */
  participantOwnerLookup: (participantId: string) => string | null;
  onClaim: (openActionId: string) => void;
};

/**
 * Lobby-visible list of pending OpenActions. Visible to every connected user
 * (directors and players alike). The Claim button is enabled only for the
 * targeted participant's owner OR the active director.
 *
 * The same component mounts in CombatRun (director view) and PlayerSheetPanel
 * (player view). Per-user enablement of the Claim button is the only
 * behavioral difference between the two contexts.
 */
export function OpenActionsList(props: Props) {
  const { openActions, currentUserId, activeDirectorId, participantOwnerLookup, onClaim } = props;

  if (openActions.length === 0) {
    return (
      <div className="open-actions-list open-actions-list--empty">
        <p className="open-actions-list__empty">No open actions.</p>
      </div>
    );
  }

  const isDirector = currentUserId === activeDirectorId;

  return (
    <div className="open-actions-list">
      <h3 className="open-actions-list__heading">Open actions</h3>
      <ul className="open-actions-list__items">
        {openActions.map((oa) => {
          const copy = OPEN_ACTION_COPY[oa.kind];
          const title = copy?.title(oa) ?? `Open Action: ${oa.kind}`;
          const body = copy?.body(oa) ?? '';
          const claimLabel = copy?.claimLabel(oa) ?? 'Claim';
          const ownerId = participantOwnerLookup(oa.participantId);
          const isOwner = ownerId !== null && currentUserId === ownerId;
          const canClaim = isOwner || isDirector;

          return (
            <li key={oa.id} className="open-actions-list__row">
              <div className="open-actions-list__title">{title}</div>
              {body && <div className="open-actions-list__body">{body}</div>}
              <button
                type="button"
                className="open-actions-list__claim"
                disabled={!canClaim}
                onClick={() => canClaim && onClaim(oa.id)}
                title={canClaim ? '' : 'Only the targeted player or the director can claim this'}
              >
                {claimLabel}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
