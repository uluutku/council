# Memory

Council plans four transparent AI memory modes:

1. Ephemeral: current request plus a small recent window, with no persistent memory.
2. Conversation history: recent messages and a rolling summary limited to that conversation.
3. Curated memory: the AI proposes memories and the user approves, edits, or rejects them.
4. Automatic persistent memory: eligible memories are saved automatically under stricter
   sensitive-data rules.

Curated memory is the recommended default because it combines continuity with user control.
Memory categories will include biography, preference, communication style, goal, project,
constraint, relationship event, instruction, interest, and current plan.

Each AI contact will expose a ledger for pending, active, superseded, expired, and sensitive
memories. Users will be able to inspect source context, edit, delete, pin, expire, disable
retrieval, export, or clear memory. Contradictory facts will be retained temporarily and resolved
through confidence checks or user confirmation.

Deleting an AI conversation must offer visible-conversation deletion or transactional deletion of
the conversation and all derived memories. Deleted memories must not return through summaries,
caches, or retrieval.

Task 001 implements no memory storage, extraction, retrieval, or UI.
