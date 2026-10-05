-- Run after the original letter-lessons migration.
-- Allow admins/editors to delete letter lessons; do not add word deletion rights.
begin;

grant delete on public.mpop_items to authenticated;
drop policy if exists mpop_letter_lessons_delete on public.mpop_items;
create policy mpop_letter_lessons_delete on public.mpop_items
  for delete to authenticated
  using (
    item_type = 'letter'
    and exists (
      select 1 from public.profiles
      where user_id = auth.uid() and role in ('admin', 'editor')
    )
  );

notify pgrst, 'reload schema';
commit;
