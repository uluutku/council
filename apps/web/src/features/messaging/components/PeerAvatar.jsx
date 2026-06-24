import { peerInitials } from '../utils/peer.js';
import { PROFILE_AVATAR_BUCKET } from '../../../lib/avatarStorage.js';
import { useSignedAvatarUrl } from '../../../hooks/useSignedAvatarUrl.js';

export function PeerAvatar({ peer, size = 'medium' }) {
  const url = useSignedAvatarUrl(PROFILE_AVATAR_BUCKET, peer?.avatarPath);

  return (
    <span className="msg-avatar" data-size={size} aria-hidden="true">
      {url ? <img src={url} alt="" /> : peerInitials(peer)}
    </span>
  );
}
