begin;

create or replace function public.mpop_protect_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Auth removes the parent account before cascading to its profile. It uses
  -- its own database login rather than the service-role JWT used by PostgREST.
  if tg_op = 'DELETE' and session_user = 'supabase_auth_admin'
    and auth.uid() is null
    and not exists (select 1 from auth.users where id = old.user_id) then
    return old;
  end if;
  if coalesce(auth.role(), '') = 'service_role'
    or (auth.uid() is null and session_user in ('postgres', 'supabase_admin')) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.role := 'viewer';
    return new;
  end if;
  if tg_op = 'DELETE' or new.role is distinct from old.role
    or new.user_id is distinct from old.user_id then
    raise exception 'Rollen kunnen alleen via gebruikersbeheer worden gewijzigd.';
  end if;
  return new;
end $$;

revoke all on function public.mpop_protect_profile_role() from public, anon, authenticated;

commit;
