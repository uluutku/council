# Shared Edge Function utilities

Shared Deno Edge Function utilities may live here when more than one function needs them. The
implemented `ai-chat` function currently keeps its request handling, validation, CORS, SSE,
provider, media, and run-lifecycle helpers inside `supabase/functions/ai-chat/` because they are
specific to that runtime.
