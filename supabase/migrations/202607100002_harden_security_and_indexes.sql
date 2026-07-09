create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.lock_letter_window()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    new.submitted_at = now();
    new.editable_until = new.submitted_at + interval '24 hours';
  elsif tg_op = 'UPDATE' then
    new.author_id = old.author_id;
    new.letter_date = old.letter_date;
    new.submitted_at = old.submitted_at;
    new.editable_until = old.editable_until;
  end if;
  return new;
end;
$$;

create index if not exists letters_author_id_idx on public.letters(author_id);
create index if not exists letter_open_responses_letter_id_idx on public.letter_open_responses(letter_id);
create index if not exists letter_open_responses_reader_id_idx on public.letter_open_responses(reader_id);
create index if not exists annotations_letter_id_idx on public.annotations(letter_id);
create index if not exists annotations_author_id_idx on public.annotations(author_id);
create index if not exists annotation_replies_annotation_id_idx on public.annotation_replies(annotation_id);
create index if not exists annotation_replies_author_id_idx on public.annotation_replies(author_id);
create index if not exists calendar_events_creator_id_idx on public.calendar_events(creator_id);
create index if not exists notifications_recipient_id_idx on public.notifications(recipient_id);
