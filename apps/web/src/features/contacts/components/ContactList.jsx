import { ContactCard } from './ContactCard.jsx';

export function ContactList({
  contacts,
  onMessage,
  onRemove,
  onBlock,
  startingContactId,
  emptyState,
}) {
  if (contacts.length === 0) {
    return emptyState ?? null;
  }

  return (
    <ul className="contact-list">
      {contacts.map((contact) => (
        <ContactCard
          key={contact.id}
          contact={contact}
          onMessage={onMessage}
          onRemove={onRemove}
          onBlock={onBlock}
          isStarting={startingContactId === contact.id}
        />
      ))}
    </ul>
  );
}
