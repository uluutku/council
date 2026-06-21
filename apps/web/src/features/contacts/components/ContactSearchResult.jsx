import { ContactAvatar } from './ContactAvatar.jsx';
import { ContactStatusBadge } from './ContactStatusBadge.jsx';
import { contactDisplayName } from '../utils/contactDisplay.js';

// Discovery only knows a coarse relationship status ('accepted', 'pending',
// 'rejected', or none). It cannot tell which direction a pending request points,
// so a pending pair is shown as "Request pending" and directed to the Requests
// page rather than inventing an incoming/outgoing distinction here.
function describeRelationship(status) {
  switch (status) {
    case 'accepted':
      return { label: 'Already contacts', tone: 'success', canAdd: false };
    case 'pending':
      return { label: 'Request pending', tone: 'info', canAdd: false };
    default:
      // null (no relationship) or 'rejected'; a fresh request is allowed.
      return { label: null, tone: 'neutral', canAdd: true };
  }
}

export function ContactSearchResult({ result, onAdd, isPending }) {
  const name = contactDisplayName(result);
  const { label, tone, canAdd } = describeRelationship(result.relationship_status);

  return (
    <li className="contact-card">
      <ContactAvatar user={result} />
      <div className="contact-identity">
        <p className="contact-name">{name}</p>
        <p className="contact-username">@{result.username}</p>
        {result.status_text ? <p className="contact-status">{result.status_text}</p> : null}
        <ContactStatusBadge label={label} tone={tone} />
      </div>
      <div className="contact-actions">
        {canAdd ? (
          <button
            type="button"
            className="button button--small"
            onClick={() => onAdd(result)}
            disabled={isPending}
          >
            {isPending ? 'Sending…' : 'Add contact'}
          </button>
        ) : null}
      </div>
    </li>
  );
}
