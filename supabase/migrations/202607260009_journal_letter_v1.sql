-- Journal letter V1: titleless rich letters, stationery, 24-hour actions,
-- soft-delete recycle bin, and 200-character comments.

-- Allow titleless letters to share the journal table without the legacy one-per-day rule.
alter table public.journal_entries drop constraint if exists journal_entries_check;
alter table public.journal_entries add constraint journal_entries_shape_check check (
  (
    entry_type = 'today' and locked_at is not null and sealed_at is null and open_at is null
    and (
      (recipient_id is null and entry_date is not null and opened_at is null and opened_by is null)
      or
      (recipient_id is not null and recipient_id <> author_id and entry_date is not null)
    )
  )
  or
  (
    entry_type = 'future' and recipient_id is not null and recipient_id <> author_id
    and entry_date is null and locked_at is not null and sealed_at is not null and open_at is not null
    and (opened_at is null) = (opened_by is null)
  )
) not valid;

drop index if exists public.one_today_diary_per_author_date;
create unique index one_today_diary_per_author_date
on public.journal_entries(space_id,author_id,entry_date)
where entry_type='today' and recipient_id is null;

alter table public.journal_entries
  add column if not exists rich_content jsonb,
  add column if not exists plain_text text,
  add column if not exists excerpt text,
  add column if not exists stationery_theme text not null default 'cream',
  add column if not exists withdrawn_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists purge_at timestamptz;

alter table public.journal_entries drop constraint if exists journal_entries_title_check;
alter table public.journal_entries drop constraint if exists journal_entries_content_check;
alter table public.journal_entries add constraint journal_entries_titleless_check
  check (title = '') not valid;
alter table public.journal_entries add constraint journal_entries_plain_text_limit_check
  check (plain_text is null or char_length(normalize(btrim(plain_text), NFC)) between 1 and 5000) not valid;
alter table public.journal_entries add constraint journal_entries_stationery_theme_check
  check (stationery_theme in ('cream','rose','moon','vintage','sakura','lined')) not valid;
alter table public.journal_entries add constraint journal_entries_delete_lifecycle_check
  check ((deleted_at is null and purge_at is null) or (deleted_at is not null and purge_at is not null)) not valid;

update public.journal_entries
set title = '',
    plain_text = coalesce(nullif(btrim(content), ''), '旧日记'),
    excerpt = left(coalesce(nullif(btrim(content), ''), '旧日记'), 88),
    rich_content = coalesce(rich_content, jsonb_build_object('type','doc','html',content,'text',coalesce(nullif(btrim(content), ''), '旧日记')))
where rich_content is null or plain_text is null or excerpt is null or title <> '';

create index if not exists journal_entries_recycle_bin_idx
on public.journal_entries(author_id, deleted_at desc)
where deleted_at is not null;

create or replace function public.create_letter_diary(
  p_space_id uuid,
  p_recipient_id uuid,
  p_rich_content jsonb,
  p_plain_text text,
  p_stationery_theme text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_text text := normalize(btrim(coalesce(p_plain_text, '')), NFC);
begin
  if v_actor is null
    or not public.is_active_space_member(p_space_id, v_actor)
    or p_recipient_id = v_actor
    or not public.is_active_space_member(p_space_id, p_recipient_id)
  then raise exception 'letter access denied' using errcode = '42501'; end if;
  if char_length(v_text) not between 1 and 5000
    or jsonb_typeof(p_rich_content) <> 'object'
    or p_stationery_theme not in ('cream','rose','moon','vintage','sakura','lined')
  then raise exception 'invalid letter' using errcode = '22023'; end if;

  insert into public.journal_entries(
    space_id, author_id, recipient_id, entry_type, title, content,
    rich_content, plain_text, excerpt, stationery_theme,
    entry_date, created_local_date, published_at, locked_at
  ) values (
    p_space_id, v_actor, p_recipient_id, 'today', '', v_text,
    p_rich_content, v_text, left(v_text, 88), p_stationery_theme,
    (clock_timestamp() at time zone 'Asia/Shanghai')::date,
    (clock_timestamp() at time zone 'Asia/Shanghai')::date,
    clock_timestamp(), clock_timestamp() + interval '24 hours'
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_letter_diary(
  p_entry_id uuid,
  p_rich_content jsonb,
  p_plain_text text,
  p_stationery_theme text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_text text := normalize(btrim(coalesce(p_plain_text, '')), NFC);
begin
  if char_length(v_text) not between 1 and 5000
    or jsonb_typeof(p_rich_content) <> 'object'
    or p_stationery_theme not in ('cream','rose','moon','vintage','sakura','lined')
  then raise exception 'invalid letter' using errcode = '22023'; end if;
  update public.journal_entries
  set content=v_text, rich_content=p_rich_content, plain_text=v_text,
      excerpt=left(v_text,88), stationery_theme=p_stationery_theme, updated_at=clock_timestamp()
  where id=p_entry_id and author_id=auth.uid() and deleted_at is null
    and withdrawn_at is null and clock_timestamp() <= locked_at;
  if not found then raise exception 'letter edit window closed' using errcode='42501'; end if;
end;
$$;

create or replace function public.withdraw_letter_diary(p_entry_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.journal_entries
  set withdrawn_at=clock_timestamp(), deleted_at=clock_timestamp(), purge_at=clock_timestamp()+interval '180 days'
  where id=p_entry_id and author_id=auth.uid() and deleted_at is null and clock_timestamp() <= locked_at;
  if not found then raise exception 'letter withdraw window closed' using errcode='42501'; end if;
end; $$;

create or replace function public.delete_letter_diary(p_entry_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.journal_entries
  set deleted_at=clock_timestamp(), purge_at=clock_timestamp()+interval '180 days'
  where id=p_entry_id and author_id=auth.uid() and deleted_at is null and clock_timestamp() <= locked_at;
  if not found then raise exception 'letter delete window closed' using errcode='42501'; end if;
end; $$;

create or replace function public.purge_letter_diary(p_entry_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  delete from public.journal_entries where id=p_entry_id and author_id=auth.uid() and deleted_at is not null;
  if not found then raise exception 'recycled letter not found' using errcode='P0002'; end if;
end; $$;

create or replace function public.empty_letter_recycle_bin()
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  delete from public.journal_entries where author_id=auth.uid() and deleted_at is not null;
  get diagnostics v_count = row_count; return v_count;
end; $$;

revoke execute on function public.create_letter_diary(uuid,uuid,jsonb,text,text) from public,anon;
revoke execute on function public.update_letter_diary(uuid,jsonb,text,text) from public,anon;
revoke execute on function public.withdraw_letter_diary(uuid) from public,anon;
revoke execute on function public.delete_letter_diary(uuid) from public,anon;
revoke execute on function public.purge_letter_diary(uuid) from public,anon;
revoke execute on function public.empty_letter_recycle_bin() from public,anon;
grant execute on function public.create_letter_diary(uuid,uuid,jsonb,text,text) to authenticated;
grant execute on function public.update_letter_diary(uuid,jsonb,text,text) to authenticated;
grant execute on function public.withdraw_letter_diary(uuid) to authenticated;
grant execute on function public.delete_letter_diary(uuid) to authenticated;
grant execute on function public.purge_letter_diary(uuid) to authenticated;
grant execute on function public.empty_letter_recycle_bin() to authenticated;

alter table public.journal_comments
  add column if not exists withdrawn_at timestamptz,
  add column if not exists deleted_at timestamptz;
alter table public.journal_comments drop constraint if exists journal_comments_body_check;
alter table public.journal_comments add constraint journal_comments_body_200_check
  check (char_length(normalize(btrim(body), NFC)) between 1 and 200) not valid;

create or replace function public.update_journal_comment(p_actor_id uuid,p_comment_id uuid,p_body text)
returns public.journal_comments language plpgsql security definer set search_path='' as $$
declare v_comment public.journal_comments;
begin
  if p_actor_id is distinct from auth.uid() or char_length(normalize(btrim(coalesce(p_body,'')),NFC)) not between 1 and 200
  then raise exception 'invalid comment' using errcode='22023'; end if;
  update public.journal_comments set body=btrim(p_body)
  where id=p_comment_id and author_id=p_actor_id and deleted_at is null and withdrawn_at is null
    and clock_timestamp() <= created_at + interval '24 hours'
  returning * into v_comment;
  if not found then raise exception 'comment not found or immutable' using errcode='P0002'; end if;
  return v_comment;
end; $$;

create or replace function public.delete_journal_comment(p_comment_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  update public.journal_comments set deleted_at=clock_timestamp()
  where id=p_comment_id and author_id=auth.uid() and deleted_at is null
    and clock_timestamp() <= created_at + interval '24 hours';
  if not found then raise exception 'comment not found or immutable' using errcode='P0002'; end if;
  return p_comment_id;
end; $$;

drop policy if exists "active members can read visible journal entries" on public.journal_entries;
create policy "active members can read visible journal entries"
on public.journal_entries for select to authenticated
using (
  public.is_active_space_member(space_id)
  and (
    (author_id = auth.uid())
    or (
      recipient_id = auth.uid()
      and deleted_at is null
      and withdrawn_at is null
      and (
        entry_type = 'today'
        or (entry_type = 'future' and opened_at is not null)
      )
    )
  )
);

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


create or replace function public.mark_letter_read(p_entry_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.journal_entries
  set opened_at=coalesce(opened_at,clock_timestamp()), opened_by=coalesce(opened_by,auth.uid())
  where id=p_entry_id and recipient_id=auth.uid() and deleted_at is null and withdrawn_at is null;
  if not found then raise exception 'letter not found' using errcode='P0002'; end if;
end; $$;
revoke execute on function public.mark_letter_read(uuid) from public,anon;
grant execute on function public.mark_letter_read(uuid) to authenticated;
