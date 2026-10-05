begin;

-- Profiles are the authority for application roles, never user-editable auth metadata.
create or replace function public.mpop_protect_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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

drop trigger if exists mpop_protect_profile_role on public.profiles;
create trigger mpop_protect_profile_role
  before insert or update or delete on public.profiles
  for each row execute function public.mpop_protect_profile_role();

-- Create a safe profile for signups and invitations, including setups without an existing trigger.
create or replace function public.mpop_create_user_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, role, display_name)
  values (new.id, 'viewer', left(coalesce(new.raw_user_meta_data->>'display_name', ''), 100))
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists zzzz_mpop_create_user_profile on auth.users;
create trigger zzzz_mpop_create_user_profile
  after insert on auth.users for each row execute function public.mpop_create_user_profile();

create or replace function public.mpop_admin_set_user_role(target_user_id uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  old_role text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Deze functie is alleen beschikbaar voor de beveiligde server.';
  end if;
  if new_role is null or new_role not in ('viewer', 'editor', 'soundcreator', 'admin') then
    raise exception 'Ongeldige rol.';
  end if;
  -- Serialize changes so concurrent requests cannot remove the last admin.
  perform pg_advisory_xact_lock(620105004);
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'Gebruiker bestaat niet.';
  end if;
  select role into old_role from public.profiles where user_id = target_user_id for update;
  if old_role = 'admin' and new_role <> 'admin'
    and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'De laatste admin moet admin blijven.';
  end if;
  insert into public.profiles (user_id, role)
  values (target_user_id, new_role)
  on conflict (user_id) do update set role = excluded.role;
end $$;

revoke all on function public.mpop_admin_set_user_role(uuid, text) from public, anon, authenticated;
grant execute on function public.mpop_admin_set_user_role(uuid, text) to service_role;
revoke all on function public.mpop_protect_profile_role() from public, anon, authenticated;
revoke all on function public.mpop_create_user_profile() from public, anon, authenticated;

commit;
