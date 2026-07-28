-- Journal drafts table for letter editor auto-save
-- Each author can have at most one draft at a time

create table if not exists public.journal_drafts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete restrict,
  recipient_id uuid not null references auth.users(id) on delete restrict,
  rich_text_json jsonb,
  plain_text text,
  mood_emoji text,
  stationery_theme text not null default 'cream',
  salutation text,
  character_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique constraint: each author can have at most one draft
create unique index if not exists journal_drafts_author_id_unique_idx
on public.journal_drafts(author_id);

-- Index for space-based queries
create index if not exists journal_drafts_space_id_idx
on public.journal_drafts(space_id);

-- RLS: authors can read, update, delete their own drafts
alter table public.journal_drafts enable row level security;

create policy "authors can read their own drafts"
on public.journal_drafts for select to authenticated
using (author_id = auth.uid());

create policy "authors can update their own drafts"
on public.journal_drafts for update to authenticated
using (author_id = auth.uid());

create policy "authors can delete their own drafts"
on public.journal_drafts for delete to authenticated
using (author_id = auth.uid());

-- Trigger to update updated_at
create trigger journal_drafts_set_updated_at
before update on public.journal_drafts
for each row execute function public.set_updated_at();

-- Function to upsert draft (insert or update)
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
begin
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

-- Function to delete draft
create or replace function public.delete_journal_draft(p_author_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.journal_drafts
  where author_id = p_author_id;
end;
$$;

-- Grant permissions
revoke execute on function public.upsert_journal_draft(uuid,uuid,uuid,jsonb,text,text,text,text,integer) from public, anon;
revoke execute on function public.delete_journal_draft(uuid) from public, anon;
grant execute on function public.upsert_journal_draft(uuid,uuid,uuid,jsonb,text,text,text,text,integer) to authenticated;
grant execute on function public.delete_journal_draft(uuid) to authenticated;

-- Grant select on journal_drafts
grant select on public.journal_drafts to authenticated;
