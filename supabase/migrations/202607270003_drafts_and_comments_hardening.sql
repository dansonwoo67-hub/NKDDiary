-- Hardening: journal drafts author validation + comment replies + 24h edit window

-- ============================================================
-- 1. Draft security: ensure upsert validates author_id = auth.uid()
-- ============================================================

create or replace function public.upsert_journal_draft(
  p_space_id uuid,
  p_author_id uuid,
  p_recipient_id uuid,
  p_rich_text_json jsonb,
  p_plain_text text,
  p_mood_emoji text,
  p_stationery_theme text,
  p_salutation text,
  p_character_count integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  -- Strict author validation: caller must be the author
  if v_actor is null or v_actor <> p_author_id then
    raise exception 'draft access denied' using errcode = '42501';
  end if;

  -- Validate space membership
  if not public.is_active_space_member(p_space_id, v_actor)
     or not public.is_active_space_member(p_space_id, p_recipient_id) then
    raise exception 'draft access denied' using errcode = '42501';
  end if;

  -- Validate stationery theme
  if p_stationery_theme not in ('cream','rose','moon','vintage','sakura','lined') then
    raise exception 'invalid stationery theme' using errcode = '22023';
  end if;
  
  -- Validate mood emoji
  if p_mood_emoji is not null and p_mood_emoji not in ('😊','💕','🥺','😤','😴','🤔','😌','😭') then
    raise exception 'invalid mood emoji' using errcode = '22023';
  end if;
  
  -- Upsert: update existing or insert new
  update public.journal_drafts
  set
    recipient_id = p_recipient_id,
    rich_text_json = p_rich_text_json,
    plain_text = p_plain_text,
    mood_emoji = p_mood_emoji,
    stationery_theme = p_stationery_theme,
    salutation = p_salutation,
    character_count = p_character_count,
    updated_at = clock_timestamp()
  where author_id = p_author_id;
  
  if not found then
    insert into public.journal_drafts (
      space_id,
      author_id,
      recipient_id,
      rich_text_json,
      plain_text,
      mood_emoji,
      stationery_theme,
      salutation,
      character_count
    ) values (
      p_space_id,
      p_author_id,
      p_recipient_id,
      p_rich_text_json,
      p_plain_text,
      p_mood_emoji,
      p_stationery_theme,
      p_salutation,
      p_character_count
    );
  end if;
end;
$$;

create or replace function public.delete_journal_draft(p_author_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or v_actor <> p_author_id then
    raise exception 'draft access denied' using errcode = '42501';
  end if;
  delete from public.journal_drafts
  where author_id = p_author_id;
end;
$$;

-- Re-grant (revoke first to be safe)
revoke execute on function public.upsert_journal_draft(uuid,uuid,uuid,jsonb,text,text,text,text,integer) from public, anon;
revoke execute on function public.delete_journal_draft(uuid) from public, anon;
grant execute on function public.upsert_journal_draft(uuid,uuid,uuid,jsonb,text,text,text,text,integer) to authenticated;
grant execute on function public.delete_journal_draft(uuid) to authenticated;

-- ============================================================
-- 2. Comments: add parent_id, editable_until, withdrawn_at, deleted_at
-- ============================================================

alter table public.journal_comments
  add column if not exists parent_id uuid references public.journal_comments(id) on delete cascade,
  add column if not exists editable_until timestamptz,
  add column if not exists withdrawn_at timestamptz,
  add column if not exists deleted_at timestamptz;

-- Index for parent_id lookups (replies)
create index if not exists journal_comments_parent_id_idx
on public.journal_comments(parent_id)
where parent_id is not null and deleted_at is null;

-- Index for entry + active comments
create index if not exists journal_comments_entry_active_idx
on public.journal_comments(entry_id, created_at desc)
where deleted_at is null;

-- Trigger: set editable_until = created_at + 24h on insert
create or replace function public.journal_comments_set_editable_until()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.editable_until := new.created_at + interval '24 hours';
  return new;
end;
$$;

drop trigger if exists journal_comments_set_editable_until_trg on public.journal_comments;
create trigger journal_comments_set_editable_until_trg
before insert on public.journal_comments
for each row execute function public.journal_comments_set_editable_until();

-- Backfill editable_until for existing comments
update public.journal_comments
set editable_until = created_at + interval '24 hours'
where editable_until is null;

-- ============================================================
-- 3. Comment CRUD functions with reply support and 24h window
-- ============================================================

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
  v_parent_depth integer := 0;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Validate entry access
  select journal.space_id into v_space_id
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
    select case when parent.parent_id is null then 0 else 1 end into v_parent_depth
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

  insert into public.journal_comments(
    space_id, entry_id, author_id, parent_id, body
  ) values (
    v_space_id, p_entry_id, v_actor, p_parent_id, btrim(p_body)
  )
  returning * into v_comment;

  return v_comment;
end;
$$;

create or replace function public.update_journal_comment_v2(
  p_comment_id uuid,
  p_body text
)
returns public.journal_comments
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

  if char_length(normalize(btrim(coalesce(p_body, '')), NFC)) not between 1 and 200 then
    raise exception 'invalid comment body (1-200 chars)' using errcode = '22023';
  end if;

  update public.journal_comments
  set body = btrim(p_body),
      updated_at = clock_timestamp()
  where id = p_comment_id
    and author_id = v_actor
    and deleted_at is null
    and withdrawn_at is null
    and clock_timestamp() <= editable_until
  returning * into v_comment;

  if not found then
    raise exception 'comment not found or edit window closed' using errcode = '42501';
  end if;

  return v_comment;
end;
$$;

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
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.journal_comments
  set withdrawn_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_comment_id
    and author_id = v_actor
    and deleted_at is null
    and withdrawn_at is null
    and clock_timestamp() <= editable_until;

  if not found then
    raise exception 'comment not found or edit window closed' using errcode = '42501';
  end if;
end;
$$;

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
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.journal_comments
  set deleted_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_comment_id
    and author_id = v_actor
    and deleted_at is null
    and clock_timestamp() <= editable_until;

  if not found then
    raise exception 'comment not found or edit window closed' using errcode = '42501';
  end if;
end;
$$;

-- Grant new functions
grant execute on function public.create_journal_comment_v2(uuid,text,uuid) to authenticated;
grant execute on function public.update_journal_comment_v2(uuid,text) to authenticated;
grant execute on function public.withdraw_journal_comment(uuid) to authenticated;
grant execute on function public.delete_journal_comment_v2(uuid) to authenticated;

-- Update RLS: hide deleted comments from regular select
drop policy if exists "members can read eligible journal comments" on public.journal_comments;

create policy "members can read eligible journal comments"
on public.journal_comments for select to authenticated
using (
  public.can_interact_with_journal(entry_id)
  and deleted_at is null
  and exists (
    select 1 from public.journal_entries as journal
    where journal.id = journal_comments.entry_id
      and journal.space_id = journal_comments.space_id
  )
);

-- ============================================================
-- 4. Comment count helper for letter listings
-- ============================================================

create or replace function public.get_journal_comment_count(p_entry_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.journal_comments
  where entry_id = p_entry_id
    and deleted_at is null;
$$;

grant execute on function public.get_journal_comment_count(uuid) to authenticated;
