-- Run after the letter-lessons migrations.
-- New letter lessons copy their start content from the first letter lesson
-- under the first word in the editor. Existing lessons remain unchanged.
begin;

create or replace function public.mpop_add_letter_lesson(parent_id text, letters text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  parent public.mpop_items%rowtype;
  created public.mpop_items%rowtype;
  next_position integer;
  template_plan jsonb;
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

  select lesson.lesson_plan into template_plan
    from public.mpop_items lesson
    where lesson.item_type = 'letter'
      and lesson.parent_item_id = (
        select id from public.mpop_items
        where item_type = 'word'
        order by sort_index asc nulls last, id asc limit 1
      )
    order by lesson.lesson_order asc, lesson.id asc limit 1;

  insert into public.mpop_items
    (code, title, status, version, sort_index, woord_groep, item_type, parent_item_id, letter, lesson_order, lesson_plan)
  values
    ('letter-' || gen_random_uuid()::text,
     coalesce(parent.title, parent.code) || ' - letter ' || btrim(letters),
     'draft', 1, parent.sort_index, parent.woord_groep, 'letter', parent.id, btrim(letters), next_position,
     coalesce(template_plan, jsonb_build_object('block', null, 'week', null, 'lesson', null, 'goal', '', 'sections', '{}'::jsonb)))
  returning * into created;
  return jsonb_build_object('id', created.id);
end $$;

revoke all on function public.mpop_add_letter_lesson(text, text) from public, anon;
grant execute on function public.mpop_add_letter_lesson(text, text) to authenticated;
notify pgrst, 'reload schema';
commit;
