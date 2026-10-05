begin;

create or replace function public.mpop_admin_check_user_delete(target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Deze functie is alleen beschikbaar voor de beveiligde server.';
  end if;
  if exists (select 1 from public.profiles where user_id = target_user_id and role = 'admin')
    and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'De laatste admin moet blijven.';
  end if;
end $$;

-- Use the role-change lock inside the actual deletion transaction as well.
create or replace function public.mpop_protect_user_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(620105004);
  if exists (select 1 from public.profiles where user_id = old.id and role = 'admin')
    and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'De laatste admin moet blijven.';
  end if;
  return old;
end $$;

drop trigger if exists mpop_protect_user_delete on auth.users;
create trigger mpop_protect_user_delete
  before delete on auth.users
  for each row execute function public.mpop_protect_user_delete();

revoke all on function public.mpop_admin_check_user_delete(uuid) from public, anon, authenticated;
grant execute on function public.mpop_admin_check_user_delete(uuid) to service_role;
revoke all on function public.mpop_protect_user_delete() from public, anon, authenticated;

commit;
