import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '../../../hooks/usePageTitle.js';
import { FormField } from '../../../components/FormField.jsx';
import { FormStatus } from '../../../components/FormStatus.jsx';
import { ContactSearchResult } from '../components/ContactSearchResult.jsx';
import { ContactsError, ContactsLoading, EmptyState } from '../components/ContactsFeedback.jsx';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { discoverProfilesQueryOptions } from '../queries/contactQueries.js';
import { useSendContactRequest } from '../queries/contactMutations.js';
import { mapContactError } from '../utils/contactErrors.js';
import { contactDisplayName } from '../utils/contactDisplay.js';

const NEUTRAL = { message: '', tone: 'neutral' };
const MIN_QUERY_LENGTH = 2;

function outcomeMessage(outcome, name) {
  switch (outcome) {
    case 'now_contacts':
      return `You are now contacts with ${name}.`;
    case 'already_contacts':
      return `You are already contacts with ${name}.`;
    default:
      return `Contact request sent to ${name}.`;
  }
}

export function DiscoverContactsPage() {
  usePageTitle('Discover people');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const sendRequest = useSendContactRequest();
  const [status, setStatus] = useState(NEUTRAL);
  const [pendingId, setPendingId] = useState(null);

  const trimmed = debouncedQuery.trim();
  const isReady = trimmed.length >= MIN_QUERY_LENGTH;
  const searchQuery = useQuery(discoverProfilesQueryOptions(debouncedQuery));
  const results = searchQuery.data ?? [];

  const showTooShort = query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH;

  async function handleAdd(result) {
    const name = contactDisplayName(result);
    setPendingId(result.id);
    setStatus(NEUTRAL);
    try {
      const action = await sendRequest.mutateAsync({
        targetUserId: result.id,
        knownContact: result.relationship_status === 'accepted',
      });
      setStatus({ message: outcomeMessage(action.outcome, name), tone: 'success' });
    } catch (error) {
      setStatus({ message: mapContactError(error).message, tone: 'error' });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="contacts-section">
      <header className="contacts-header">
        <h1>Discover people</h1>
        <p>Search by username or display name to send a contact request.</p>
      </header>

      <form className="search-form" role="search" onSubmit={(event) => event.preventDefault()}>
        <FormField
          label="Search people"
          name="contact-search"
          hint="Enter at least two characters. Council searches usernames and display names."
        >
          {(fieldProps) => (
            <input
              {...fieldProps}
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="username or name"
            />
          )}
        </FormField>
      </form>

      <FormStatus message={status.message} tone={status.tone} />

      {showTooShort ? (
        <p className="field-hint" role="status">
          Type at least two characters to search.
        </p>
      ) : null}

      {isReady && searchQuery.isFetching ? <ContactsLoading label="Searching…" /> : null}

      {isReady && searchQuery.isError ? (
        <ContactsError
          message={mapContactError(searchQuery.error).message}
          onRetry={() => searchQuery.refetch()}
        />
      ) : null}

      {isReady && searchQuery.isSuccess && results.length === 0 ? (
        <EmptyState title="No people matched that search.">
          <p>Check the spelling or try a different username.</p>
        </EmptyState>
      ) : null}

      {results.length > 0 ? (
        <ul className="contact-list" aria-label="Search results">
          {results.map((result) => (
            <ContactSearchResult
              key={result.id}
              result={result}
              onAdd={handleAdd}
              isPending={pendingId === result.id}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
