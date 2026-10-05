begin;

-- Keep history and material when the associated login is removed.
alter table public.audit_log drop constraint audit_log_actor_user_id_fkey;
alter table public.audit_log add constraint audit_log_actor_user_id_fkey
  foreign key (actor_user_id) references auth.users(id) on delete set null;
alter table public.mpop_items drop constraint mpop_items_created_by_fkey;
alter table public.mpop_items add constraint mpop_items_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
alter table public.mpop_items drop constraint mpop_items_updated_by_fkey;
alter table public.mpop_items add constraint mpop_items_updated_by_fkey
  foreign key (updated_by) references auth.users(id) on delete set null;

create or replace function public.mpop_touch()
returns trigger language plpgsql as $$
begin
  -- Clearing account references is not a content edit.
  if session_user = 'supabase_auth_admin' and auth.uid() is null
    and (to_jsonb(new) - 'created_by' - 'updated_by')
      = (to_jsonb(old) - 'created_by' - 'updated_by') then
    return new;
  end if;
  new.updated_at = now();
  new.updated_by = auth.uid();
  new.version = old.version + 1;
  return new;
end;
$$;

create or replace function public.audit_mpop_items()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
begin
  if session_user = 'supabase_auth_admin' and auth.uid() is null
    and (to_jsonb(new) - 'created_by' - 'updated_by')
      = (to_jsonb(old) - 'created_by' - 'updated_by') then
    return new;
  end if;
  insert into public.audit_log(table_name, record_id, actor_user_id, action)
  values ('mpop_items', new.id, v_actor, 'update');
  return new;
end;
$$;

commit;
