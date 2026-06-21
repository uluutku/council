import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '../../../hooks/usePageTitle.js';
import { FormStatus } from '../../../components/FormStatus.jsx';
import { ContactAvatar } from '../components/ContactAvatar.jsx';
import { UnblockUserDialog } from '../components/UnblockUserDialog.jsx';
import { ContactsError, ContactsLoading, EmptyState } from '../components/ContactsFeedback.jsx';
import { blockedUsersQueryOptions } from '../queries/contactQueries.js';
import { useUnblockUser } from '../queries/contactMutations.js';
import { mapContactError } from '../utils/contactErrors.js';
import { contactDisplayName, formatBlockedDate } from '../utils/contactDisplay.js';

const NEUTRAL = { message: '', tone: 'neutral' };

export function BlockedUsersPage() {
  usePageTitle('Blocked users');
  const blockedQuery = useQuery(blockedUsersQueryOptions());
  const unblock = useUnblockUser();
  const [dialog, setDialog] = useState(null);
  const [status, setStatus] = useState(NEUTRAL);

  const blocked = blockedQuery.data ?? [];

  function closeDialog() {
    setDialog(null);
  }

  async function confirmUnblock() {
    const user = dialog.user;
    const name = contactDisplayName(user);
    try {
      await unblock.mutateAsync({ targetUserId: user.id });
      setStatus({ message: `${name} has been unblocked.`, tone: 'success' });
    } catch (error) {
      setStatus({ message: mapContactError(error).message, tone: 'error' });
    } finally {
      closeDialog();
    }
  }

  return (
    <section className="settings-section">
      <div>
        <p className="eyebrow">Privacy</p>
        <h1>Blocked users</h1>
        <p>People you have blocked. Only your own blocks are shown here.</p>
      </div>

      <FormStatus message={status.message} tone={status.tone} />

      {blockedQuery.isPending ? <ContactsLoading label="Loading blocked users…" /> : null}

      {blockedQuery.isError ? (
        <ContactsError
          message={mapContactError(blockedQuery.error).message}
          onRetry={() => blockedQuery.refetch()}
        />
      ) : null}

      {blockedQuery.isSuccess ? (
        blocked.length === 0 ? (
          <EmptyState title="You have not blocked anyone." />
        ) : (
          <ul className="contact-list">
            {blocked.map((user) => {
              const name = contactDisplayName(user);
              const blockedOn = formatBlockedDate(user.blocked_at);
              return (
                <li className="contact-card" key={user.id}>
                  <ContactAvatar user={user} />
                  <div className="contact-identity">
                    <p className="contact-name">{name}</p>
                    <p className="contact-username">@{user.username}</p>
                    {blockedOn ? <p className="contact-meta">Blocked {blockedOn}</p> : null}
                  </div>
                  <div className="contact-actions">
                    <button
                      type="button"
                      className="button button--secondary button--small"
                      onClick={() => setDialog({ user })}
                    >
                      Unblock
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      <UnblockUserDialog
        open={Boolean(dialog)}
        name={dialog ? contactDisplayName(dialog.user) : ''}
        isPending={unblock.isPending}
        onConfirm={confirmUnblock}
        onCancel={closeDialog}
      />
    </section>
  );
}
