-- Ensure private avatar buckets exist in environments that already received the
-- avatar UI/schema changes but missed Storage bucket provisioning.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'profile-avatars',
    'profile-avatars',
    false,
    2097152,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'persona-avatars',
    'persona-avatars',
    false,
    2097152,
    array['image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
