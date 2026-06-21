import { ContactActionMenu } from './ContactActionMenu.jsx';
import { ContactAvatar } from './ContactAvatar.jsx';
import { ContactStatusBadge } from './ContactStatusBadge.jsx';
import { contactDisplayName } from '../utils/contactDisplay.js';

// One accepted contact. Email, biography, and online status are intentionally
// absent, and there is no message control because conversations do not exist yet.
export function ContactCard({ contact, onRemove, onBlock }) {
  const name = contactDisplayName(contact);

  return (
    <li className="contact-card">
      <ContactAvatar user={contact} />
      <div className="contact-identity">
        <p className="contact-name">{name}</p>
        <p className="contact-username">@{contact.username}</p>
        {contact.status_text ? <p className="contact-status">{contact.status_text}</p> : null}
        <ContactStatusBadge label="Contact" tone="success" />
      </div>
      <ContactActionMenu label={`Actions for ${name}`}>
        <button
          type="button"
          className="button button--secondary button--small"
          onClick={() => onRemove(contact)}
        >
          Remove
        </button>
        <button
          type="button"
          className="button button--secondary button--small"
          onClick={() => onBlock(contact)}
        >
          Block
        </button>
      </ContactActionMenu>
    </li>
  );
}
