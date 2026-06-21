import { contactInitials } from '../utils/contactDisplay.js';

// Placeholder avatar. Avatar uploads and Storage are intentionally out of scope,
// so contacts are represented by their initials until media support lands.
export function ContactAvatar({ user }) {
  return (
    <span className="contact-avatar" aria-hidden="true">
      {contactInitials(user)}
    </span>
  );
}
