// Peer identity helpers for the messaging UI. Conversation rows expose peer
// fields with a `peer_` prefix; these normalize them and derive a display name
// and initials. Profile fields can be null when normal profile visibility is
// unavailable, so every helper degrades to a neutral placeholder.

export function conversationPeer(conversation) {
  if (!conversation) return null;
  return {
    id: conversation.peer_id,
    displayName: conversation.peer_display_name,
    username: conversation.peer_username,
    avatarPath: conversation.peer_avatar_path,
    statusText: conversation.peer_status_text,
  };
}

export function peerName(peer) {
  return peer?.displayName || peer?.username || 'Council member';
}

export function peerInitials(peer) {
  const source = (peer?.displayName || peer?.username || '').trim();
  if (source === '') return '?';

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
