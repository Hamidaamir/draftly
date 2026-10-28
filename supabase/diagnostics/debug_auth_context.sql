create or replace function public.debug_auth_context()
returns table (uid uuid, role text)
language sql
stable
set search_path = ''
as $$
  select auth.uid(), auth.role();
$$;

revoke all on function public.debug_auth_context() from public;
grant execute on function public.debug_auth_context() to authenticated;
