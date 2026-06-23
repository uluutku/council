import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { usePageTitle } from '../../../hooks/usePageTitle.js';
import { messagingKeys } from '../../../lib/query-keys/messaging.js';
import { searchMyConversations, searchMyMessages } from '../api/messagingApi.js';
import { peerName } from '../utils/peer.js';

export function MessageSearchPage() {
  usePageTitle('Search messages');
  const [query, setQuery] = useState('');
  const normalized = query.trim();
  const enabled = normalized.length >= 2;
  const conversations = useQuery({
    queryKey: [...messagingKeys.search(normalized), 'conversations'],
    queryFn: () => searchMyConversations(normalized),
    enabled,
  });
  const messages = useInfiniteQuery({
    queryKey: [...messagingKeys.search(normalized), 'messages'],
    queryFn: ({ pageParam }) =>
      searchMyMessages({
        query: normalized,
        before_created_at: pageParam?.created_at ?? null,
        before_id: pageParam?.message_id ?? null,
        result_limit: 30,
      }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => (lastPage.length === 30 ? lastPage.at(-1) : undefined),
    enabled,
  });
  const messageResults = messages.data?.pages.flat() ?? [];

  return (
    <section className="message-search-page">
      <header>
        <Link to="/app/messages">← Messages</Link>
        <h1>Search messages</h1>
      </header>
      <label className="form-field">
        <span>Search conversations and human messages</span>
        <input
          type="search"
          value={query}
          maxLength={200}
          placeholder="Type at least 2 characters"
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
      </label>
      {!enabled ? <p className="field-hint">Enter at least two characters.</p> : null}
      {enabled ? (
        <div className="message-search-groups">
          <section>
            <h2>Conversations</h2>
            {conversations.data?.length ? (
              <ul>
                {conversations.data.map((result) => (
                  <li key={result.conversation_id}>
                    <Link
                      to={`/app/messages/${result.conversation_id}`}
                      state={{
                        peer: {
                          id: result.peer_id,
                          username: result.peer_username,
                          display_name: result.peer_display_name,
                          avatar_path: result.peer_avatar_path,
                        },
                      }}
                    >
                      {peerName({
                        username: result.peer_username,
                        display_name: result.peer_display_name,
                      })}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No conversations match.</p>
            )}
          </section>
          <section>
            <h2>Messages</h2>
            {messageResults.length ? (
              <>
                <ul>
                  {messageResults.map((result) => (
                    <li key={result.message_id}>
                      <Link
                        to={`/app/messages/${result.conversation_id}?message=${result.message_id}`}
                        state={{
                          messageId: result.message_id,
                          peer: {
                            id: result.peer_id,
                            username: result.peer_username,
                            display_name: result.peer_display_name,
                            avatar_path: result.peer_avatar_path,
                          },
                        }}
                      >
                        <strong>
                          {peerName({
                            username: result.peer_username,
                            display_name: result.peer_display_name,
                          })}
                        </strong>
                        <span>{result.snippet}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {messages.hasNextPage ? (
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => messages.fetchNextPage()}
                    disabled={messages.isFetchingNextPage}
                  >
                    {messages.isFetchingNextPage ? 'Loading…' : 'Load more results'}
                  </button>
                ) : null}
              </>
            ) : (
              <p>No messages match.</p>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}
