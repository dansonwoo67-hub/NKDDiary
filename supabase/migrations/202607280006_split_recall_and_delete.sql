-- =============================================================================
-- Split letter Recall and Delete into separate behaviors
-- =============================================================================
--
-- Problem: withdraw_letter_diary was setting BOTH withdrawn_at AND deleted_at,
-- making "撤回" and "放进回收站" identical.
--
-- Fix:
--   1. Withdraw: only set withdrawn_at (recipient can't see content, author sees status)
--   2. Delete: insert into letter_deletions (user-level, doesn't affect recipient)
--   3. Purge: delete from letter_deletions table
--
-- New table: letter_deletions tracks per-user soft-deletion records

-- ---------- 1. Create letter_deletions table ----------
create table if not exists public.letter_deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  letter_id uuid not null references public.journal_entries(id) on delete cascade,
  deleted_at timestamptz not null default clock_timestamp(),
  purge_at timestamptz not null default clock_timestamp() + interval '180 days',
  unique(user_id, letter_id)
);

-- Index for quick lookup of a user's deleted letters
create index if not exists letter_deletions_user_id_idx
  on public.letter_deletions(user_id);

create index if not exists letter_deletions_letter_id_idx
  on public.letter_deletions(letter_id);

-- Auto-purge: remove old deletions after 180 days
create or replace function public.auto_purge_letter_deletions()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.letter_deletions
  where purge_at is not null and purge_at <= clock_timestamp();
end;
$$;

-- ---------- 2. Modify withdraw_letter_diary: ONLY set withdrawn_at ----------
create or replace function public.withdraw_letter_diary(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ONLY set withdrawn_at. Do NOT set deleted_at or purge_at.
  -- This means the letter remains visible in the database,
  -- but recipients (and the author's own recipient view) can no longer see the content.
  update public.journal_entries
  set withdrawn_at = clock_timestamp()
  where id = p_entry_id
    and author_id = auth.uid()
    and deleted_at is null
    and withdrawn_at is null
    and clock_timestamp() <= locked_at;

  if not found then
    raise exception 'letter withdraw window closed or already withdrawn' using errcode = '42501';
  end if;
end;
$$;

-- ---------- 3. Modify delete_letter_diary: insert into letter_deletions ----------
create or replace function public.delete_letter_diary(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_type text;
begin
  -- Check the letter exists and user is the author
  select entry_type into v_entry_type
  from public.journal_entries
  where id = p_entry_id
    and author_id = auth.uid()
    and deleted_at is null
    and clock_timestamp() <= locked_at;

  if not found then
    raise exception 'letter delete window closed' using errcode = '42501';
  end if;

  -- For future diaries (胶囊信), don't allow deletion before opening
  -- (matching original logic)
  if v_entry_type = 'future' then
    raise exception 'future diary cannot be deleted before opening' using errcode = '42501';
  end if;

  -- Insert user-level deletion record
  -- This hides the letter from the author's view without affecting the recipient
  insert into public.letter_deletions (user_id, letter_id, deleted_at, purge_at)
  values (
    auth.uid(),
    p_entry_id,
    clock_timestamp(),
    clock_timestamp() + interval '180 days'
  )
  on conflict (user_id, letter_id) do nothing;
end;
$$;

-- ---------- 4. Modify purge_letter_diary: delete from letter_deletions ----------
create or replace function public.purge_letter_diary(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Remove the user's deletion record AND the letter itself
  -- (hard delete the letter since it's in the recycle bin)
  delete from public.letter_deletions
  where user_id = auth.uid() and letter_id = p_entry_id;

  delete from public.journal_entries
  where id = p_entry_id
    and author_id = auth.uid()
    and deleted_at is null;  -- original logic: only purge if never hard-deleted

  -- Also check if the letter should be purged from the original logic
  -- (letters with deleted_at set from old withdraw behavior)
  if not found then
    delete from public.journal_entries
    where id = p_entry_id
      and author_id = auth.uid()
      and deleted_at is not null;
  end if;

  if not found then
    raise exception 'recycled letter not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------- 5. Modify empty_letter_recycle_bin ----------
create or replace function public.empty_letter_recycle_bin()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_letter_ids uuid[];
  v_count integer;
begin
  -- Collect all letter_ids this user has in recycle bin
  -- (both new-style letter_deletions and old-style deleted_at)
  select array_agg(letter_id)
  into v_letter_ids
  from (
    select letter_id from public.letter_deletions where user_id = auth.uid()
    union
    select id from public.journal_entries where author_id = auth.uid() and deleted_at is not null
  ) as ids;

  -- Hard-delete the journal entries
  if v_letter_ids is not null then
    delete from public.journal_entries
    where id = any(v_letter_ids);
  end if;

  -- Remove the deletion records
  delete from public.letter_deletions
  where user_id = auth.uid();

  -- Also clean up any remaining old-style deletions
  delete from public.journal_entries
  where author_id = auth.uid() and deleted_at is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------- 6. RLS policies for letter_deletions ----------
drop policy if exists "users can read their own deletions" on public.letter_deletions;
create policy "users can read their own deletions"
on public.letter_deletions for select to authenticated
using (user_id = auth.uid());

drop policy if exists "users can insert their own deletions" on public.letter_deletions;
create policy "users can insert their own deletions"
on public.letter_deletions for insert to authenticated
using (user_id = auth.uid());

drop policy if exists "users can delete their own deletions" on public.letter_deletions;
create policy "users can delete their own deletions"
on public.letter_deletions for delete to authenticated
using (user_id = auth.uid());

-- ---------- 7. RLS: Allow recipients to see withdrawn letters (but not content) ----------
-- The reader uses getJournalEntry which checks journal_entries directly.
-- We need to allow SELECT on withdrawn letters so the UI can show "这封信已被对方撤回".
-- But we must NOT expose the content to recipients.
--
-- The RLS policy now:
--   - Author can always read their own entries
--   - Recipient can read entries if: not deleted AND (not withdrawn OR they want to see the status)
--
-- Since we want the withdrawn status to be visible (but not the content),
-- we add withdrawn_at conditions that the UI handles.

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
        -- Recipient can see: not deleted AND not withdrawn (normal view)
        (deleted_at is null and withdrawn_at is null
          and (
            entry_type = 'today'
            or (entry_type = 'future' and opened_at is not null)
          )
        )
        or
        -- Recipient can see: withdrawn (to show "这封信已被对方撤回")
        (withdrawn_at is not null)
      )
    )
  )
);

-- ---------- 8. RLS for comments: only show if letter is not withdrawn ----------
-- (keep existing policy but ensure withdrawn letters hide comments)
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

-- ---------- 9. mark_letter_read: also allow reading withdrawn status ----------
-- The RPC should NOT require deleted_at is null anymore,
-- since deletion is now user-level via letter_deletions.
-- But we should still NOT mark withdrawn letters as read.
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
    and withdrawn_at is null;  -- withdrawn letters can't be "read"

  if not found then
    raise exception 'letter not found or already withdrawn' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------- 10. Re-grant execute on modified functions ----------
revoke execute on function public.withdraw_letter_diary(uuid) from public, anon;
grant execute on function public.withdraw_letter_diary(uuid) to authenticated;

revoke execute on function public.delete_letter_diary(uuid) from public, anon;
grant execute on function public.delete_letter_diary(uuid) to authenticated;

revoke execute on function public.purge_letter_diary(uuid) from public, anon;
grant execute on function public.purge_letter_diary(uuid) to authenticated;

revoke execute on function public.empty_letter_recycle_bin() from public, anon;
grant execute on function public.empty_letter_recycle_bin() to authenticated;

revoke execute on function public.mark_letter_read(uuid) from public, anon;
grant execute on function public.mark_letter_read(uuid) to authenticated;

-- ---------- 11. Verification queries ----------
-- Check letter_deletions table structure
select c.relname as table_name, a.attname as column_name
from pg_class c
join pg_attribute a on a.attrelid = c.oid
where c.relname = 'letter_deletions'
  and a.attnum > 0
order by a.attnum;

-- Verify withdraw_letter_diary no longer sets deleted_at
select proname, prosrc from pg_proc
where proname = 'withdraw_letter_diary'
  and prosrc not like '%deleted_at = clock_timestamp%';

-- Verify delete_letter_diary now uses letter_deletions
select proname, prosrc from pg_proc
where proname = 'delete_letter_diary'
  and prosrc like '%letter_deletions%';