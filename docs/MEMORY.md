# Memory

Council implements two transparent modes per AI conversation:

- `curated` (default): bounded recent history plus active memories explicitly saved by the user.
- `conversation_only`: bounded recent history only; saved memories remain stored but inactive.

Council only stores memories the user explicitly saves or approves. There is no automatic
extraction, hidden profile, embedding, semantic search, contradiction handling, or shared memory.

`ai_memories` stores owner ID, conversation ID, category, content (maximum 500 characters), optional
source user-message ID, and timestamps. Categories are personal fact, preference, goal, project,
constraint, instruction, interest, and other. A conversation holds at most 50 memories. RLS permits
only owner reads; narrow RPCs create, edit, hard-delete, clear, and change mode. A source message
must be a user message from the same AI conversation.

The Memory dialog lists every item and supports add, edit, delete, delete-all confirmation, mode
switching, saved/remaining count, search, category filtering, a 500-character editor counter, and a
confirm-before-save Remember action on the user's own AI messages. Memory query keys include the
conversation ID and all queries are cleared on sign-out.

Server context places curated memories after platform/contact/style instructions and before recent
history. Deterministic ordering and hard deletion make changes effective on the next generation.
Archived custom personas retain memories and history; generation remains disabled until restored.
