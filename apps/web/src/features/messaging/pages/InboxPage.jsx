import { usePageTitle } from '../../../hooks/usePageTitle.js';

// The inbox index pane. The conversation list itself lives in the messaging
// layout sidebar (always visible on desktop, full-screen on narrow viewports at
// this route). This component fills the desktop "active conversation" pane with
// a calm placeholder until a conversation is opened.
export function InboxPage() {
  usePageTitle('Messages');

  return (
    <div className="conversation-placeholder">
      <p className="conversation-placeholder-title">Your conversations</p>
      <p>Select a conversation to read and reply, or start one from your contacts.</p>
    </div>
  );
}
