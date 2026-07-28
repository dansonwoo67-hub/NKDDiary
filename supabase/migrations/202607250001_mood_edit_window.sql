create or replace function public.update_mood_entry(p_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_content text := btrim(coalesce(p_body, ''));
begin
  if v_actor is null
     or char_length(v_content) not between 1 and 60 then
    raise exception 'invalid mood entry' using errcode = '22023';
  end if;

  update public.mood_entries as mood
  set body = v_content,
      emoji = ''
  where mood.id = p_id
    and mood.author_id = v_actor
    and mood.created_at > now() - interval '24 hours'
    and public.is_active_space_member(mood.space_id, v_actor);

  if not found then
    raise exception 'mood edit window closed' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.delete_mood_entry(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  delete from public.mood_entries as mood
  where mood.id = p_id
    and mood.author_id = v_actor
    and mood.created_at > now() - interval '24 hours'
    and public.is_active_space_member(mood.space_id, v_actor);

  if not found then
    raise exception 'mood delete window closed' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.update_mood_entry(uuid, text) from public, anon;
revoke execute on function public.delete_mood_entry(uuid) from public, anon;
grant execute on function public.update_mood_entry(uuid, text) to authenticated;
grant execute on function public.delete_mood_entry(uuid) to authenticated;
