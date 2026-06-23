# Task 011: Live Provider Defaults and Transparent AI Memory

Council defaults missing provider mode to OpenRouter with `deepseek/deepseek-v4-flash`.
`npm run dev:ai` loads the gitignored `supabase/functions/.env` and refuses OpenRouter startup
without a key. Mock mode is explicit and local-only. Safe runtime metadata drives the development
provider badge.

Each AI conversation defaults to curated memory. Owner-only memory rows are scoped to one
conversation, limited to 50 items and 500 characters each, and managed only through narrow RPCs.
Users can list, add, edit, delete, clear, disable, or remember from one of their own messages after
confirmation. No automatic extraction or hidden profiling exists.

Server prompt order is platform safety, contact/persona instructions, style, active curated memory,
then bounded history. Memory is deterministic, marked untrusted, excluded in conversation-only
mode, hard-deleted from future generations, never logged, and never included in browser-visible
prompts.

Out of scope remains embeddings, semantic search, automatic memory extraction, AI-created
memories, shared memory, contradiction resolution, expiry, tools, web search, file understanding,
billing, and background agents.
