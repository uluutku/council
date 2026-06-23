import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '../../../hooks/usePageTitle.js';
import { FormStatus } from '../../../components/FormStatus.jsx';
import { ContactList } from '../components/ContactList.jsx';
import { RemoveContactDialog } from '../components/RemoveContactDialog.jsx';
import { BlockUserDialog } from '../components/BlockUserDialog.jsx';
import { ContactsError, ContactsLoading, EmptyState } from '../components/ContactsFeedback.jsx';
import { contactsQueryOptions } from '../queries/contactQueries.js';
import { useBlockUser, useRemoveContact } from '../queries/contactMutations.js';
import { mapContactError } from '../utils/contactErrors.js';
import { contactDisplayName } from '../utils/contactDisplay.js';
import { useStartConversation } from '../../messaging/hooks/useStartConversation.js';
import { messagingErrorMessage } from '../../messaging/api/messagingErrorMessages.js';

const NEUTRAL = { message: '', tone: 'neutral' };

export function ContactsPage() {
  usePageTitle('Contacts');
  const navigate = useNavigate();
  const contactsQuery = useQuery(contactsQueryOptions());
  const removeContact = useRemoveContact();
  const blockUser = useBlockUser();
  const startConversation = useStartConversation();
  const [dialog, setDialog] = useState(null);
  const [status, setStatus] = useState(NEUTRAL);
  const [startingContactId, setStartingContactId] = useState(null);

  const contacts = contactsQuery.data ?? [];

  function closeDialog() {
    setDialog(null);
  }

  async function handleMessage(contact) {
    if (startingContactId) return;
    setStatus(NEUTRAL);
    setStartingContactId(contact.id);
    try {
      const result = await startConversation.mutateAsync(contact.id);
      navigate(`/app/messages/${result.conversation_id}`, {
        state: {
          peer: {
            id: contact.id,
            displayName: contact.display_name,
            username: contact.username,
            avatarPath: contact.avatar_path,
            statusText: contact.status_text,
          },
          canSend: result.can_send,
        },
      });
    } catch (error) {
      setStatus({ message: messagingErrorMessage(error), tone: 'error' });
    } finally {
      setStartingContactId(null);
    }
  }

  async function confirmRemove() {
    const contact = dialog.contact;
    const name = contactDisplayName(contact);
    try {
      await removeContact.mutateAsync({ targetUserId: contact.id });
      setStatus({ message: `${name} was removed from your contacts.`, tone: 'success' });
    } catch (error) {
      setStatus({ message: mapContactError(error).message, tone: 'error' });
    } finally {
      closeDialog();
    }
  }

  async function confirmBlock() {
    const contact = dialog.contact;
    const name = contactDisplayName(contact);
    try {
      await blockUser.mutateAsync({ targetUserId: contact.id });
      setStatus({ message: `${name} is now blocked.`, tone: 'success' });
    } catch (error) {
      setStatus({ message: mapContactError(error).message, tone: 'error' });
    } finally {
      closeDialog();
    }
  }

  return (
    <section className="contacts-section">
      <header className="contacts-header">
        <h1>My contacts</h1>
        <p>The people you are connected with on Council.</p>
      </header>

      <FormStatus message={status.message} tone={status.tone} />

      {contactsQuery.isPending ? <ContactsLoading label="Loading your contacts…" /> : null}

      {contactsQuery.isError ? (
        <ContactsError
          message={mapContactError(contactsQuery.error).message}
          onRetry={() => contactsQuery.refetch()}
        />
      ) : null}

      {contactsQuery.isSuccess ? (
        <ContactList
          contacts={contacts}
          onMessage={handleMessage}
          startingContactId={startingContactId}
          onRemove={(contact) => setDialog({ type: 'remove', contact })}
          onBlock={(contact) => setDialog({ type: 'block', contact })}
          emptyState={
            <EmptyState title="You have no contacts yet.">
              <p>
                Find people on the <Link to="/app/contacts/discover">Discover</Link> page and send a
                contact request to get started.
              </p>
            </EmptyState>
          }
        />
      ) : null}

      <RemoveContactDialog
        open={dialog?.type === 'remove'}
        name={dialog ? contactDisplayName(dialog.contact) : ''}
        isPending={removeContact.isPending}
        onConfirm={confirmRemove}
        onCancel={closeDialog}
      />
      <BlockUserDialog
        open={dialog?.type === 'block'}
        name={dialog ? contactDisplayName(dialog.contact) : ''}
        isPending={blockUser.isPending}
        onConfirm={confirmBlock}
        onCancel={closeDialog}
      />
    </section>
  );
}
