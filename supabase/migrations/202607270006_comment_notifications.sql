-- Journal comment notifications with proper structure
-- 1. Add related_entry_id to notifications table
-- 2. Add journal_comment_created and journal_reply_created notification types
-- 3. Update create_journal_comment_v2 to create proper notifications
-- 4. Update withdraw/delete functions to invalidate notifications

begin;

-- 1. Add related_entry_id column to notifications
alter table if exists public.notifications
add column if not exists related_entry_id uuid references public.journal_entries(id) on delete cascade;

-- 2. Add new notification types
alter type public.notification_type add value if not exists 'journal_comment_created';
alter type public.notification_type add value if not exists 'journal_reply_created';

-- 3. Update create_journal_comment_v2 with proper notification logic
create or replace function public.create_journal_comment_v2(
  p_entry_id uuid,
  p_body text,
  p_parent_id uuid default null
)
returns public.journal_comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_space_id uuid;
  v_comment public.journal_comments;
  v_parent_depth int;
  v_journal_author_id uuid;
  v_journal_recipient_id uuid;
  v_notification_recipient_id uuid;
  v_notification_title text;
  v_notification_body text;
  v_notification_type public.notification_type;
  v_actor_name text;
  v_parent_author_id uuid;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Validate entry access and get author/recipient
  select journal.space_id, journal.author_id, journal.recipient_id
  into v_space_id, v_journal_author_id, v_journal_recipient_id
  from public.journal_entries as journal
  where journal.id = p_entry_id
    and public.is_active_space_member(journal.space_id, v_actor)
    and (
      journal.author_id = v_actor
      or (
        journal.recipient_id = v_actor
        and journal.deleted_at is null
        and journal.withdrawn_at is null
        and (
          journal.entry_type = 'today'
          or (journal.entry_type = 'future' and journal.opened_at is not null)
        )
      )
    );

  if not found then
    raise exception 'entry not found' using errcode = 'P0002';
  end if;

  -- Validate body length (200 chars max for comments/replies)
  if char_length(normalize(btrim(coalesce(p_body, '')), NFC)) not between 1 and 200 then
    raise exception 'invalid comment body (1-200 chars)' using errcode = '22023';
  end if;

  -- If replying, validate parent exists and is top-level (no nested replies)
  if p_parent_id is not null then
    select case when parent.parent_id is null then 0 else 1 end, parent.author_id
    into v_parent_depth, v_parent_author_id
    from public.journal_comments as parent
    where parent.id = p_parent_id
      and parent.entry_id = p_entry_id
      and parent.deleted_at is null;

    if not found then
      raise exception 'parent comment not found' using errcode = 'P0002';
    end if;

    -- Only allow one level of replies
    if v_parent_depth > 0 then
      raise exception 'cannot reply to a reply' using errcode = '22023';
    end if;
  end if;

  -- Insert comment
  insert into public.journal_comments(
    space_id, entry_id, author_id, parent_id, body
  ) values (
    v_space_id, p_entry_id, v_actor, p_parent_id, btrim(p_body)
  )
  returning * into v_comment;

  -- Create notification
  if p_parent_id is not null then
    -- Scenario B: Reply to a comment - notify the parent comment's author
    v_notification_recipient_id := v_parent_author_id;
    v_notification_type := 'journal_reply_created';
    v_notification_title := '回复了你的评论';
  else
    -- Scenario A: New comment on letter - notify the letter author
    v_notification_recipient_id := v_journal_author_id;
    v_notification_type := 'journal_comment_created';
    v_notification_title := '评论了你的信';
  end if;

  -- Don't notify self
  if v_notification_recipient_id <> v_actor then
    -- Get author display name
    select display_name into v_actor_name
    from public.profiles
    where id = v_actor;

    v_notification_title := v_actor_name || ' ' || v_notification_title;
    v_notification_body := left(btrim(p_body), 80);

    -- Insert notification with proper fields
    insert into public.notifications(
      recipient_id,
      actor_id,
      type,
      source_id,
      related_entry_id,
      title,
      body
    ) values (
      v_notification_recipient_id,
      v_actor,
      v_notification_type,
      v_comment.id,
      p_entry_id,
      v_notification_title,
      v_notification_body
    );
  end if;

  return v_comment;
end;
$$;

grant execute on function public.create_journal_comment_v2(uuid, text, uuid) to authenticated;

-- 4. Update withdraw_journal_comment to invalidate notifications
create or replace function public.withdraw_journal_comment(
  p_comment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_comment public.journal_comments;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Check if comment exists, is owned by actor, and is within 24 hours
  select * into v_comment
  from public.journal_comments
  where id = p_comment_id
    and author_id = v_actor
    and deleted_at is null
    and withdrawn_at is null
    and editable_until is not null
    and clock_timestamp() <= editable_until;

  if not found then
    raise exception 'comment not found or not editable' using errcode = 'P0002';
  end if;

  -- Withdraw the comment
  update public.journal_comments
  set withdrawn_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_comment_id;

  -- Delete corresponding unread notifications
  delete from public.notifications
  where source_id = p_comment_id
    and type in ('journal_comment_created', 'journal_reply_created')
    and is_read = false;
end;
$$;

grant execute on function public.withdraw_journal_comment(uuid) to authenticated;

-- 5. Update delete_journal_comment_v2 to invalidate notifications
create or replace function public.delete_journal_comment_v2(
  p_comment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_comment public.journal_comments;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Check if comment exists, is owned by actor, and is within 24 hours
  select * into v_comment
  from public.journal_comments
  where id = p_comment_id
    and author_id = v_actor
    and deleted_at is null
    and editable_until is not null
    and clock_timestamp() <= editable_until;

  if not found then
    raise exception 'comment not found or not editable' using errcode = 'P0002';
  end if;

  -- Delete the comment (soft delete)
  update public.journal_comments
  set deleted_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_comment_id;

  -- Delete corresponding unread notifications
  delete from public.notifications
  where source_id = p_comment_id
    and type in ('journal_comment_created', 'journal_reply_created')
    and is_read = false;
end;
$$;

grant execute on function public.delete_journal_comment_v2(uuid) to authenticated;

commit;
