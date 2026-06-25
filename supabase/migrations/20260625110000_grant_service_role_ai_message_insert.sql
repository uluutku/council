-- Service workers need controlled AI message inserts for maintenance and
-- deletion test setup. RLS still protects authenticated clients; service_role
-- bypasses RLS and remains server-only.

grant insert on table public.ai_messages to service_role;
