import { peerInitials } from '../utils/peer.js';

// Placeholder avatar shared by the inbox and conversation header. Avatar uploads
// and Storage are out of scope, so a peer is represented by their initials.
export function PeerAvatar({ peer, size = 'medium' }) {
  return (
    <span className="msg-avatar" data-size={size} aria-hidden="true">
      {peerInitials(peer)}
    </span>
  );
}
