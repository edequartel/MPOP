begin;

create or replace function public.mpop_move_word(source_id text, target_id text, place_after boolean)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  changes jsonb;
  expected_updates integer;
begin
  if not exists (select 1 from public.profiles where user_id = auth.uid() and role in ('admin', 'editor')) then
    raise exception 'Alleen admins en editors mogen woorden verplaatsen.';
  end if;
  if source_id is null or target_id is null or source_id = target_id or place_after is null then
    raise exception 'Ongeldige verplaatsing.';
  end if;

  -- Serialize reorders and capture the versions before changing the sort indices.
  perform item.id from public.mpop_items item where item.item_type = 'word' order by item.id for update;
  if (select count(*) from public.mpop_items where item_type = 'word' and id::text in (source_id, target_id)) <> 2 then
    raise exception 'Woord niet gevonden. Ververs de lijst en probeer opnieuw.';
  end if;

  with current_order as (
    select id, version, sort_index, row_number() over (order by sort_index asc nulls last, id) as position
    from public.mpop_items where item_type = 'word'
  ), target as (
    select position from current_order where id::text = target_id
  ), new_order as (
    select item.*, row_number() over (order by
      case when item.id::text = source_id then 2 * target.position + case when place_after then 1 else -1 end
        else 2 * item.position end
    ) as new_position
    from current_order item cross join target
  ), sort_indices as (
    -- Reuse existing values when they define a unique ordering. Normalize ties and nulls when needed.
    select count(distinct sort_index) = count(*) as reusable from current_order
  ), updates as (
    select item.id, item.version, case when sort_indices.reusable then slot.sort_index else item.new_position end as new_index
    from new_order item join current_order slot on slot.position = item.new_position
    cross join sort_indices
    where exists (select 1 from new_order where position <> new_position)
  ), changed as (
    update public.mpop_items item set sort_index = updates.new_index
    from updates
    where item.id = updates.id and item.sort_index is distinct from updates.new_index
    returning item.id::text as id, updates.version as previous_version, item.version, item.sort_index, item.updated_at
  )
  select coalesce((select jsonb_agg(to_jsonb(changed)) from changed), '[]'::jsonb),
    (select count(*) from updates join current_order item using (id) where item.sort_index is distinct from updates.new_index)
    into changes, expected_updates;

  if jsonb_array_length(changes) <> expected_updates then
    raise exception 'Geen toestemming om de volgorde van alle betrokken woorden te wijzigen.';
  end if;
  return changes;
end $$;

revoke all on function public.mpop_move_word(text, text, boolean) from public, anon;
grant execute on function public.mpop_move_word(text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
