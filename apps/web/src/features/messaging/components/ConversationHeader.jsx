import { ArrowLeft, Bell, BellOff, MoreHorizontal, Search, SquareCheckBig } from 'lucide-react';
import { Link } from 'react-router-dom';
import { IconButton } from '../../../components/IconButton.jsx';
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
  isMuted = false,
  onMuteChange = null,
  onSelectMessages = null,
  canSelectMessages = false,
  selectionMode = false,
  children = null,
}) {
  const name = peerName(peer);
  const status = isTyping ? `${name} is typing...` : presenceLabel(presence);

  return (
    <header className="conversation-header">
      <IconButton
        as={Link}
        to="/app/messages"
        className="conversation-back"
        icon={ArrowLeft}
        label="Back to conversations"
      />
      <PeerAvatar peer={peer} size="small" />
      <div className="conversation-header-identity">
        <h1 className="conversation-header-name" tabIndex={-1}>
          {name}
        </h1>
        {peer?.username ? <p className="conversation-header-username">@{peer.username}</p> : null}
        {status ? <p className="conversation-header-presence">{status}</p> : null}
      </div>
      <RealtimeStatusIndicator status={realtimeStatus} />
      <div className="conversation-header-actions">
        <IconButton as={Link} to="/app/messages/search" icon={Search} label="Search messages" />
        {onMuteChange ? (
          <label className="conversation-mute-control">
            {isMuted ? (
              <BellOff aria-hidden="true" size={17} />
            ) : (
              <Bell aria-hidden="true" size={17} />
            )}
            <span className="sr-only">Mute conversation</span>
            <select
              aria-label="Mute conversation"
              value={isMuted ? 'muted' : ''}
              onChange={(event) => onMuteChange(event.target.value)}
            >
              <option value="">{isMuted ? 'Unmute' : 'Notifications on'}</option>
              <option value="hour">Mute 1 hour</option>
              <option value="eight">Mute 8 hours</option>
              <option value="week">Mute 1 week</option>
              <option value="forever">Mute forever</option>
              {isMuted ? <option value="muted">Muted</option> : null}
            </select>
          </label>
        ) : null}
        {onSelectMessages ? (
          <IconButton
            icon={SquareCheckBig}
            label={selectionMode ? 'Selecting messages' : 'Select messages'}
            onClick={onSelectMessages}
            disabled={!canSelectMessages || selectionMode}
          />
        ) : null}
        <IconButton icon={MoreHorizontal} label="More conversation options" disabled />
      </div>
      {children}
    </header>
  );
}
