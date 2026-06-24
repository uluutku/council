-- Storage RLS policies execute these private helpers as the authenticated
-- caller, so the role needs execute permission on the policy predicates.

grant execute on function private.is_current_user_avatar_path(text) to authenticated;
grant execute on function private.can_current_user_read_profile_avatar(text) to authenticated;
grant execute on function private.can_current_user_read_persona_avatar(text) to authenticated;
