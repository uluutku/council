import { ContactAvatar } from './ContactAvatar.jsx';
import { ContactStatusBadge } from './ContactStatusBadge.jsx';
import { contactDisplayName, formatBlockedDate } from '../utils/contactDisplay.js';

// Incoming requests expose accept/reject/block. Outgoing requests are view-only:
// the database does not define request cancellation, so none is offered.
export function ContactRequestCard({ request, onAccept, onReject, onBlock, isResponding = false }) {
  const name = contactDisplayName(request);
  const requestedOn = formatBlockedDate(request.created_at);

  return (
    <li className="contact-card">
      <ContactAvatar user={request} />
      <div className="contact-identity">
        <p className="contact-name">{name}</p>
        <p className="contact-username">@{request.username}</p>
        {request.status_text ? <p className="contact-status">{request.status_text}</p> : null}
        {request.direction === 'outgoing' ? (
          <ContactStatusBadge label="Request sent" tone="info" />
        ) : (
          <ContactStatusBadge label="Wants to connect" tone="info" />
        )}
        {requestedOn ? <p className="contact-meta">Requested {requestedOn}</p> : null}
      </div>
      {request.direction === 'incoming' ? (
        <div className="contact-actions" role="group" aria-label={`Respond to ${name}`}>
          <button
            type="button"
            className="button button--small"
            onClick={() => onAccept(request)}
            disabled={isResponding}
          >
            Accept
          </button>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => onReject(request)}
            disabled={isResponding}
          >
            Reject
          </button>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => onBlock(request)}
            disabled={isResponding}
          >
            Block
          </button>
        </div>
      ) : null}
    </li>
  );
}
