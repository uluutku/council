import { Link } from 'react-router-dom';
import { PeerAvatar } from './PeerAvatar.jsx';
import { RealtimeStatusIndicator } from './RealtimeStatusIndicator.jsx';
import { peerName } from '../utils/peer.js';
import { presenceLabel } from '../utils/presence.js';

// Peer identity header for the active conversation. The back link returns to the
// inbox and is the primary navigation on narrow screens.
export function ConversationHeader({
  peer,
  realtimeStatus,
  presence = null,
  isTyping = false,
  children = null,
}) {
  const name = peerName(peer);
  const status = isTyping ? `${name} is typing...` : presenceLabel(presence);

  return (
    <header className="conversation-header">
      <Link to="/app/messages" className="conversation-back" aria-label="Back to conversations">
        <span aria-hidden="true">←</span>
      </Link>
      <PeerAvatar peer={peer} size="small" />
      <div className="conversation-header-identity">
        <h1 className="conversation-header-name">{name}</h1>
        {peer?.username ? <p className="conversation-header-username">@{peer.username}</p> : null}
        {status ? <p className="conversation-header-presence">{status}</p> : null}
      </div>
      <RealtimeStatusIndicator status={realtimeStatus} />
      {children}
    </header>
  );
}
