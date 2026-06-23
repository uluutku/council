import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '../../../hooks/usePageTitle.js';
import { FormStatus } from '../../../components/FormStatus.jsx';
import { ContactRequestCard } from '../components/ContactRequestCard.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { BlockUserDialog } from '../components/BlockUserDialog.jsx';
import { ContactsError, ContactsLoading, EmptyState } from '../components/ContactsFeedback.jsx';
import { contactRequestsQueryOptions } from '../queries/contactQueries.js';
import { useBlockUser, useRespondContactRequest } from '../queries/contactMutations.js';
import { splitContactRequests } from '../utils/contactRequests.js';
import { mapContactError } from '../utils/contactErrors.js';
import { contactDisplayName } from '../utils/contactDisplay.js';

const NEUTRAL = { message: '', tone: 'neutral' };

export function ContactRequestsPage() {
  usePageTitle('Contact requests');
  const requestsQuery = useQuery(contactRequestsQueryOptions());
  const respond = useRespondContactRequest();
  const blockUser = useBlockUser();
  const [dialog, setDialog] = useState(null);
  const [status, setStatus] = useState(NEUTRAL);

  const { incoming, outgoing } = splitContactRequests(requestsQuery.data ?? []);

  function closeDialog() {
    setDialog(null);
  }

  async function handleAccept(request) {
    const name = contactDisplayName(request);
    setStatus(NEUTRAL);
    try {
      await respond.mutateAsync({ relationshipId: request.relationship_id, response: 'accepted' });
      setStatus({ message: `You are now contacts with ${name}.`, tone: 'success' });
    } catch (error) {
      setStatus({ message: mapContactError(error).message, tone: 'error' });
    }
  }

  async function confirmReject() {
    const request = dialog.request;
    const name = contactDisplayName(request);
    try {
      await respond.mutateAsync({ relationshipId: request.relationship_id, response: 'rejected' });
      setStatus({ message: `You declined the request from ${name}.`, tone: 'success' });
    } catch (error) {
      setStatus({ message: mapContactError(error).message, tone: 'error' });
    } finally {
      closeDialog();
    }
  }

  async function confirmBlock() {
    const request = dialog.request;
    const name = contactDisplayName(request);
    try {
      await blockUser.mutateAsync({ targetUserId: request.id });
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
        <h1>Contact requests</h1>
        <p>Requests waiting for a response and the requests you have sent.</p>
      </header>

      <FormStatus message={status.message} tone={status.tone} />

      {requestsQuery.isPending ? <ContactsLoading label="Loading requests…" /> : null}

      {requestsQuery.isError ? (
        <ContactsError
          message={mapContactError(requestsQuery.error).message}
          onRetry={() => requestsQuery.refetch()}
        />
      ) : null}

      {requestsQuery.isSuccess ? (
        <>
          <section aria-labelledby="incoming-heading" className="request-section">
            <h2 id="incoming-heading">Incoming</h2>
            {incoming.length === 0 ? (
              <EmptyState title="No incoming requests.">
                <p>When someone asks to connect, their request appears here.</p>
              </EmptyState>
            ) : (
              <ul className="contact-list">
                {incoming.map((request) => (
                  <ContactRequestCard
                    key={request.relationship_id}
                    request={request}
                    isResponding={respond.isPending || blockUser.isPending}
                    onAccept={handleAccept}
                    onReject={(item) => setDialog({ type: 'reject', request: item })}
                    onBlock={(item) => setDialog({ type: 'block', request: item })}
                  />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="outgoing-heading" className="request-section">
            <h2 id="outgoing-heading">Outgoing</h2>
            {outgoing.length === 0 ? (
              <EmptyState title="No outgoing requests.">
                <p>
                  Requests you send from <Link to="/app/contacts/discover">Discover</Link> appear
                  here until they are answered.
                </p>
              </EmptyState>
            ) : (
              <ul className="contact-list">
                {outgoing.map((request) => (
                  <ContactRequestCard key={request.relationship_id} request={request} />
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      <ConfirmDialog
        open={dialog?.type === 'reject'}
        title={`Reject ${dialog ? contactDisplayName(dialog.request) : ''}?`}
        confirmLabel="Reject request"
        isPending={respond.isPending}
        onConfirm={confirmReject}
        onCancel={closeDialog}
        description={
          <p>
            Rejecting removes the request from your list. It does not block them, and they may send
            a new request later.
          </p>
        }
      />
      <BlockUserDialog
        open={dialog?.type === 'block'}
        name={dialog ? contactDisplayName(dialog.request) : ''}
        isPending={blockUser.isPending}
        onConfirm={confirmBlock}
        onCancel={closeDialog}
      />
    </section>
  );
}
