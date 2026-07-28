-- =============================================================================
-- Simplify letter system: remove delete, keep only withdraw
-- Fix notification system: is_active + is_read + real content
-- =============================================================================

-- ---------- 1. Add is_active to notifications ----------
alter table public.notifications add column if not exists is_active boolean not null default true;
update public.notifications set is_active = true where is_active is null;

-- ---------- 2. RLS: only show active notifications ----------
drop policy if exists "users can read own notifications" on public.notifications;
create policy "users can read own notifications"
on public.notifications for select to authenticated
using (
  recipient_id = (select auth.uid())
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and is_active = true
);

-- ---------- 3. withdraw_letter_diary: only set withdrawn_at + deactivate notification ----------
create or replace function public.withdraw_letter_diary(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.journal_entries
  set withdrawn_at = clock_timestamp()
  where id = p_entry_id
    and author_id = auth.uid()
    and withdrawn_at is null
    and clock_timestamp() <= locked_at;

  if not found then
    raise exception 'letter withdraw window closed or already withdrawn' using errcode = '42501';
  end if;

  -- Deactivate + mark as read the recipient's notification
  update public.notifications
  set is_active = false, is_read = true
  where source_id = p_entry_id
    and recipient_id <> auth.uid()
    and is_active = true;
end;
$$;

revoke execute on function public.withdraw_letter_diary(uuid) from public, anon;
grant execute on function public.withdraw_letter_diary(uuid) to authenticated;

-- ---------- 4. mark_letter_read: also mark notification as read ----------
create or replace function public.mark_letter_read(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.journal_entries
  set opened_at = coalesce(opened_at, clock_timestamp()),
      opened_by = coalesce(opened_by, auth.uid())
  where id = p_entry_id
    and recipient_id = auth.uid()
    and withdrawn_at is null;

  if not found then
    raise exception 'letter not found or already withdrawn' using errcode = 'P0002';
  end if;

  -- Mark the recipient's notification as read
  update public.notifications
  set is_read = true
  where source_id = p_entry_id
    and recipient_id = auth.uid()
    and is_read = false;
end;
$$;

revoke execute on function public.mark_letter_read(uuid) from public, anon;
grant execute on function public.mark_letter_read(uuid) to authenticated;

-- ---------- 5. RLS: allow recipients to see withdrawn letters (to show message) ----------
drop policy if exists "active members can read visible journal entries" on public.journal_entries;
create policy "active members can read visible journal entries"
on public.journal_entries for select to authenticated
using (
  public.is_active_space_member(space_id)
  and (
    (author_id = auth.uid())
    or (
      recipient_id = auth.uid()
      and (
        (deleted_at is null and withdrawn_at is null
          and (entry_type = 'today' or (entry_type = 'future' and opened_at is not null))
        )
        or (withdrawn_at is not null)
      )
    )
  )
);

-- ---------- 6. RLS for comments: hide comments on withdrawn letters ----------
drop policy if exists "members can read eligible journal comments" on public.journal_comments;
create policy "members can read eligible journal comments"
on public.journal_comments for select to authenticated
using (
  deleted_at is null
  and public.can_interact_with_journal(entry_id)
  and exists (
    select 1 from public.journal_entries as journal
    where journal.id = journal_comments.entry_id
      and journal.space_id = journal_comments.space_id
      and journal.deleted_at is null
      and journal.withdrawn_at is null
  )
);

-- ---------- 7. Fix notify_partner_journal: use real content ----------
create or replace function public.notify_partner_journal() returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_recipient uuid;
  v_title text;
  v_body text;
begin
  if new.entry_type <> 'today' then return new; end if;
  select m.user_id into v_recipient from public.space_members m
  where m.space_id = new.space_id and m.active and m.user_id <> new.author_id limit 1;
  if v_recipient is not null then
    v_title := '寄来一封信';
    v_body := coalesce(new.excerpt, left(coalesce(new.plain_text, ''), 80));
    if v_body = '' then v_body := '一封新的信'; end if;
    insert into public.notifications(recipient_id, actor_id, type, source_id, title, body)
    values(v_recipient, new.author_id, 'journal_created', new.id, v_title, v_body);
  end if;
  return new;
end;
$$;

-- ---------- 8. Fix notify_partner_activity: real content for memories & moods ----------
create or replace function public.notify_partner_activity() returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_recipient uuid;
  v_type public.notification_type;
  v_title text;
  v_body text;
  v_space uuid;
  v_actor uuid;
begin
  v_actor := coalesce((to_jsonb(new)->>'creator_id')::uuid, (to_jsonb(new)->>'author_id')::uuid);
  v_space := (to_jsonb(new)->>'space_id')::uuid;
  select member.user_id into v_recipient from public.space_members member
  where member.space_id = v_space and member.active and member.user_id <> v_actor limit 1;
  if v_recipient is null then return new; end if;

  if tg_table_name = 'memory_entries' then
    v_type := 'memory_created';
    v_title := '新增了一段回忆';
    v_body := coalesce(new.title, left(coalesce(new.body, ''), 60));
    if v_body = '' then v_body := ''; end if;
  elsif tg_table_name = 'mood_entries' then
    v_type := 'mood_created';
    v_title := '更新了心情';
    v_body := coalesce(new.body, '');
  else
    return new;
  end if;

  insert into public.notifications(recipient_id, actor_id, type, source_id, title, body)
  values(v_recipient, v_actor, v_type, new.id, v_title, v_body);
  return new;
end;
$$;

-- ---------- 9. Fix notify_partner_profile_change: real content ----------
create or replace function public.notify_partner_profile_change(p_kind text) returns void
language plpgsql security definer set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_space uuid;
  v_recipient uuid;
  v_type public.notification_type;
  v_title text;
  v_body text;
  v_display_name text;
begin
  v_space := public.resolve_single_active_space(v_actor);
  if v_space is null then return; end if;

  select m.user_id into v_recipient
  from public.space_members m
  where m.space_id = v_space and m.active and m.user_id <> v_actor
  limit 1;
  if v_recipient is null then return; end if;

  select p.display_name into v_display_name
  from public.profiles p where p.id = v_actor;

  case p_kind
    when 'avatar' then
      v_type := 'profile_avatar_updated';
      v_title := '更换了头像';
      v_body := '';
    when 'name' then
      v_type := 'profile_nickname_updated';
      v_title := '更新了昵称';
      v_body := coalesce(v_display_name, '');
    else
      v_type := 'profile_updated';
      v_title := '更新了资料';
      v_body := '';
  end case;

  insert into public.notifications(recipient_id, actor_id, type, source_id, title, body)
  values(v_recipient, v_actor, v_type, v_actor, v_title, v_body);
end;
$$;

revoke execute on function public.notify_partner_profile_change(text) from public, anon;
grant execute on function public.notify_partner_profile_change(text) to authenticated;

-- ---------- 10. Update calendar event notification: use "Ta" prefix ----------
create or replace function public.create_calendar_event_notification(
  p_event_id uuid,
  p_actor_id uuid,
  p_is_update boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_space_id uuid;
  v_recipient_id uuid;
  v_event record;
  v_notification_type public.notification_type;
  v_title text;
  v_body text;
begin
  if p_actor_id is null then
    raise exception 'active membership required' using errcode = '42501';
  end if;

  v_space_id := public.resolve_single_active_space(p_actor_id);

  select event.id, event.name, event.creator_id, event.space_id,
         event.event_date, event.end_date, event.recurrence,
         event.event_type, event.description
  into v_event
  from public.calendar_events as event
  where event.id = p_event_id and event.space_id = v_space_id;

  if not found then
    raise exception 'calendar event not found' using errcode = '404';
  end if;

  v_notification_type := case when p_is_update then 'calendar_event_updated' else 'calendar_event_created' end;

  case v_event.event_type
    when 'anniversary' then
      v_title := case when p_is_update then '修改了纪念日' else '创建了纪念日' end;
    when 'birthday' then
      v_title := case when p_is_update then '更新了生日' else '新增了生日' end;
    when 'date' then
      v_title := case when p_is_update then '更新了约会' else '创建了约会' end;
    when 'travel' then
      v_title := case when p_is_update then '调整了旅行计划' else '新增了一次旅行' end;
    when 'todo' then
      v_title := case when p_is_update then '更新了待办' else '新增了一个待办' end;
    else
      v_title := case when p_is_update then '修改了事件' else '新增了一项事件' end;
  end case;

  v_body := v_event.name;
  if v_event.event_date is not null then
    v_body := v_body || ' · ' || to_char(v_event.event_date, 'FMMonth FMDD日');
  end if;

  select m.user_id into v_recipient_id
  from public.space_members m
  where m.space_id = v_space_id and m.active and m.user_id <> p_actor_id
  limit 1;

  if v_recipient_id is not null then
    insert into public.notifications(recipient_id, actor_id, type, source_id, title, body)
    values (v_recipient_id, p_actor_id, v_notification_type, v_event.id, v_title, v_body);
  end if;
end;
$$;

revoke execute on function public.create_calendar_event_notification(uuid, uuid, boolean) from public, anon;
grant execute on function public.create_calendar_event_notification(uuid, uuid, boolean) to authenticated;
