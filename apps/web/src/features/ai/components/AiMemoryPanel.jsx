import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { aiMemoriesQueryOptions, aiMemorySettingsQueryOptions } from '../queries/aiQueries.js';
import { useAiMemoryMutations } from '../hooks/useAiMemoryMutations.js';
import { aiErrorMessage } from '../api/aiErrorMessages.js';

const CATEGORIES = [
  ['personal_fact', 'Personal fact'],
  ['preference', 'Preference'],
  ['goal', 'Goal'],
  ['project', 'Project'],
  ['constraint', 'Constraint'],
  ['instruction', 'Instruction'],
  ['interest', 'Interest'],
  ['other', 'Other'],
];
const MEMORY_LIMIT = 50;
const EMPTY_MEMORIES = [];

function categoryLabel(category) {
  return CATEGORIES.find(([value]) => value === category)?.[1] ?? 'Other';
}

export function AiMemoryPanel({ conversationId, initialDraft, onClose }) {
  const settingsQuery = useQuery(aiMemorySettingsQueryOptions(conversationId));
  const memoriesQuery = useQuery(aiMemoriesQueryOptions(conversationId));
  const mutations = useAiMemoryMutations(conversationId);
  const [editor, setEditor] = useState(() => (initialDraft ? { mode: 'create' } : null));
  const [category, setCategory] = useState('other');
  const [content, setContent] = useState(() => initialDraft?.content ?? '');
  const [sourceMessageId, setSourceMessageId] = useState(
    () => initialDraft?.sourceMessageId ?? null,
  );
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [error, setError] = useState('');

  function startAdd() {
    setEditor({ mode: 'create' });
    setCategory('other');
    setContent('');
    setSourceMessageId(null);
    setError('');
  }

  function startEdit(memory) {
    setEditor({ mode: 'edit', memoryId: memory.id });
    setCategory(memory.category);
    setContent(memory.content);
    setSourceMessageId(memory.source_message_id);
    setError('');
  }

  async function save(event) {
    event.preventDefault();
    setError('');
    try {
      const input = { category, content, source_message_id: sourceMessageId };
      if (editor.mode === 'edit') {
        await mutations.update.mutateAsync({ memoryId: editor.memoryId, input });
      } else {
        await mutations.create.mutateAsync(input);
      }
      setEditor(null);
      setContent('');
      setSourceMessageId(null);
    } catch (caught) {
      setError(aiErrorMessage(caught));
    }
  }

  async function remove(memoryId) {
    if (!window.confirm('Delete this saved memory?')) return;
    setError('');
    try {
      await mutations.remove.mutateAsync(memoryId);
    } catch (caught) {
      setError(aiErrorMessage(caught));
    }
  }

  async function removeAll() {
    if (
      !window.confirm('Delete all saved memories for this AI contact? Message history remains.')
    ) {
      return;
    }
    setError('');
    try {
      await mutations.removeAll.mutateAsync();
      setEditor(null);
    } catch (caught) {
      setError(aiErrorMessage(caught));
    }
  }

  async function changeMode(event) {
    setError('');
    try {
      await mutations.setMode.mutateAsync(event.target.value);
    } catch (caught) {
      setError(aiErrorMessage(caught));
    }
  }

  const memories = memoriesQuery.data ?? EMPTY_MEMORIES;
  const memoryMode = settingsQuery.data?.memory_mode ?? 'curated';
  const remainingMemories = Math.max(0, MEMORY_LIMIT - memories.length);
  const filteredMemories = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return memories.filter((memory) => {
      const categoryMatches = categoryFilter === 'all' || memory.category === categoryFilter;
      const searchMatches =
        normalizedSearch.length === 0 ||
        memory.content.toLowerCase().includes(normalizedSearch) ||
        categoryLabel(memory.category).toLowerCase().includes(normalizedSearch);
      return categoryMatches && searchMatches;
    });
  }, [categoryFilter, memories, search]);
  const canAddMemory = memories.length < MEMORY_LIMIT;
  const busy =
    mutations.create.isPending ||
    mutations.update.isPending ||
    mutations.remove.isPending ||
    mutations.removeAll.isPending;

  return (
    <div className="dialog-overlay ai-memory-overlay" role="presentation">
      <section
        className="dialog-panel ai-memory-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-memory-title"
      >
        <header className="ai-memory-header">
          <div>
            <h2 id="ai-memory-title">Memory</h2>
            <p>Council only stores memories you explicitly save or approve.</p>
          </div>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <div className="ai-memory-summary" aria-label="Memory summary">
          <div>
            <span>Mode</span>
            <strong>{memoryMode === 'curated' ? 'Curated' : 'Conversation only'}</strong>
          </div>
          <div>
            <span>Saved</span>
            <strong>
              {memories.length} / {MEMORY_LIMIT}
            </strong>
          </div>
          <div>
            <span>Remaining</span>
            <strong>{remainingMemories}</strong>
          </div>
        </div>

        <label className="ai-memory-mode">
          Memory mode
          <select
            value={memoryMode}
            onChange={changeMode}
            disabled={settingsQuery.isPending || mutations.setMode.isPending}
          >
            <option value="curated">Curated memory</option>
            <option value="conversation_only">Conversation only</option>
          </select>
        </label>
        <p className="ai-memory-explanation">
          Recent conversation history remains available in both modes within Council’s bounded
          context window. Conversation only keeps saved memories inactive without deleting them.
        </p>

        {error ? (
          <p className="form-status form-status--error" role="alert">
            {error}
          </p>
        ) : null}

        {editor ? (
          <form className="ai-memory-editor" onSubmit={save}>
            <label>
              Category
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {CATEGORIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Memory text
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                maxLength={500}
                rows={4}
                required
              />
            </label>
            <p className="ai-memory-counter">{content.length} / 500</p>
            <div className="dialog-actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
              <button type="submit" className="button" disabled={!content.trim() || busy}>
                Save memory
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="button ai-memory-add"
            onClick={startAdd}
            disabled={!canAddMemory}
          >
            Add memory
          </button>
        )}

        <div className="ai-memory-list">
          {memories.length > 0 ? (
            <div className="ai-memory-tools">
              <label>
                Search memories
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search saved details"
                />
              </label>
              <label>
                Filter category
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="all">All categories</option>
                  {CATEGORIES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {memoriesQuery.isPending ? (
            <p>Loading memories…</p>
          ) : memories.length === 0 ? (
            <p className="ai-memory-empty">
              No saved memories. Save something you want this AI contact to remember in future
              conversations.
            </p>
          ) : filteredMemories.length === 0 ? (
            <p className="ai-memory-empty">No memories match that filter.</p>
          ) : (
            <ul>
              {filteredMemories.map((memory) => (
                <li key={memory.id}>
                  <div className="ai-memory-body">
                    <span className="ai-memory-category">{categoryLabel(memory.category)}</span>
                    <p>{memory.content}</p>
                  </div>
                  <div className="ai-memory-actions">
                    <button
                      type="button"
                      className="button button--secondary button--small"
                      onClick={() => startEdit(memory)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="button button--danger button--small"
                      onClick={() => remove(memory.id)}
                      disabled={busy}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {memories.length > 0 ? (
          <button
            type="button"
            className="button button--danger button--small ai-memory-delete-all"
            onClick={removeAll}
            disabled={busy}
          >
            Delete all memories
          </button>
        ) : null}
      </section>
    </div>
  );
}
