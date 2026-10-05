-- Run this entire file once in the Supabase SQL Editor before deploying the website.
begin;

alter table public.mpop_items
  add column item_type text not null default 'word',
  add column letter text,
  add column lesson_order integer,
  add column lesson_plan jsonb not null default '{}'::jsonb;

-- Use the actual type of the existing ID column (UUID or integer).
do $$
declare
  id_type text;
  id_sequence text;
begin
  select format_type(atttypid, atttypmod) into id_type
  from pg_attribute
  where attrelid = 'public.mpop_items'::regclass and attname = 'id';
  execute format('alter table public.mpop_items add column parent_item_id %s references public.mpop_items(id) on delete restrict', id_type);
  id_sequence := pg_get_serial_sequence('public.mpop_items', 'id');
  if id_sequence is not null then
    execute format('grant usage on sequence %s to authenticated', id_sequence);
  end if;
end $$;

alter table public.mpop_items
  add constraint mpop_items_lesson_shape check (
    (item_type = 'word' and parent_item_id is null and letter is null and lesson_order is null)
    or
    (item_type = 'letter' and parent_item_id is not null and letter is not null
      and char_length(btrim(letter)) between 1 and 20 and lesson_order is not null and lesson_order > 0)
  ),
  add constraint mpop_items_lesson_plan_object check (jsonb_typeof(lesson_plan) = 'object'),
  add constraint mpop_items_lesson_position unique (parent_item_id, lesson_order)
    deferrable initially deferred;

-- Retain existing read/update policies. Add creation for the editor/admin roles.
alter table public.mpop_items enable row level security;
grant insert on public.mpop_items to authenticated;
create policy mpop_letter_lessons_insert on public.mpop_items
  for insert to authenticated
  with check (
    item_type = 'letter'
    and exists (
      select 1 from public.profiles
      where user_id = auth.uid() and role in ('admin', 'editor')
    )
  );

-- Prevent lessons from becoming parents, including through direct table edits.
create function public.mpop_validate_lesson_parent()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.item_type = 'word' and new.item_type <> old.item_type then
    raise exception 'Een woord kan niet worden omgezet naar een letterles.';
  end if;
  if new.item_type = 'letter' then
    if not exists (select 1 from public.mpop_items where id = new.parent_item_id and item_type = 'word') then
      raise exception 'Een letterles moet onder een woord staan.';
    end if;
  end if;
  return new;
end $$;
create trigger mpop_validate_lesson_parent
  before insert or update of parent_item_id, item_type on public.mpop_items
  for each row execute function public.mpop_validate_lesson_parent();

create function public.mpop_add_letter_lesson(parent_id text, letters text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  parent public.mpop_items%rowtype;
  created public.mpop_items%rowtype;
  next_position integer;
begin
  if not exists (select 1 from public.profiles where user_id = auth.uid() and role in ('admin', 'editor')) then
    raise exception 'Alleen admins en editors mogen letterlessen toevoegen.';
  end if;
  if letters is null or char_length(btrim(letters)) not between 1 and 20
    or btrim(letters) !~ '^[[:alpha:]]+$' then
    raise exception 'Vul alleen letters in, bijvoorbeeld b of aa.';
  end if;
  select * into parent from public.mpop_items
    where id::text = parent_id and item_type = 'word' for update;
  if not found then raise exception 'Woord niet gevonden of niet toegankelijk.'; end if;
  select coalesce(max(lesson_order), 0) + 1 into next_position
    from public.mpop_items where parent_item_id = parent.id;

  insert into public.mpop_items
    (code, title, status, version, sort_index, woord_groep, item_type, parent_item_id, letter, lesson_order, lesson_plan)
  values
    ('letter-' || gen_random_uuid()::text,
     coalesce(parent.title, parent.code) || ' - letter ' || btrim(letters),
     'draft', 1, parent.sort_index, parent.woord_groep, 'letter', parent.id, btrim(letters), next_position,
     jsonb_build_object('block', null, 'week', null, 'lesson', null, 'goal', '', 'sections', '{}'::jsonb))
  returning * into created;
  return jsonb_build_object('id', created.id);
end $$;

-- A single transaction swaps neighbouring lessons. Lock the parent to serialize additions/moves.
create function public.mpop_move_letter_lesson(lesson_id text, direction integer)
returns void language plpgsql security invoker set search_path = public as $$
declare
  lesson public.mpop_items%rowtype;
  neighbour public.mpop_items%rowtype;
  affected integer;
begin
  if not exists (select 1 from public.profiles where user_id = auth.uid() and role in ('admin', 'editor')) then
    raise exception 'Alleen admins en editors mogen letterlessen verplaatsen.';
  end if;
  if direction is null or direction not in (-1, 1) then raise exception 'Ongeldige richting.'; end if;
  select * into lesson from public.mpop_items where id::text = lesson_id and item_type = 'letter';
  if not found then raise exception 'Letterles niet gevonden of niet toegankelijk.'; end if;
  perform 1 from public.mpop_items where id = lesson.parent_item_id for update;
  if not found then raise exception 'Woord niet toegankelijk.'; end if;
  select * into lesson from public.mpop_items where id::text = lesson_id and item_type = 'letter';
  select * into neighbour from public.mpop_items
    where parent_item_id = lesson.parent_item_id
      and ((direction = -1 and lesson_order < lesson.lesson_order)
        or (direction = 1 and lesson_order > lesson.lesson_order))
    order by case when direction = -1 then -lesson_order else lesson_order end limit 1;
  if not found then return; end if;
  update public.mpop_items
    set lesson_order = case when id = lesson.id then neighbour.lesson_order else lesson.lesson_order end
    where id in (lesson.id, neighbour.id);
  get diagnostics affected = row_count;
  if affected <> 2 then raise exception 'Geen toestemming om beide lessen te verplaatsen.'; end if;
end $$;

revoke all on function public.mpop_add_letter_lesson(text, text) from public, anon;
revoke all on function public.mpop_move_letter_lesson(text, integer) from public, anon;
grant execute on function public.mpop_add_letter_lesson(text, text) to authenticated;
grant execute on function public.mpop_move_letter_lesson(text, integer) to authenticated;

notify pgrst, 'reload schema';
commit;
