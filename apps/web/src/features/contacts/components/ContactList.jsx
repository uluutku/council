import { ContactCard } from './ContactCard.jsx';

export function ContactList({ contacts, onRemove, onBlock, emptyState }) {
  if (contacts.length === 0) {
    return emptyState ?? null;
  }

  return (
    <ul className="contact-list">
      {contacts.map((contact) => (
        <ContactCard key={contact.id} contact={contact} onRemove={onRemove} onBlock={onBlock} />
      ))}
    </ul>
  );
}
