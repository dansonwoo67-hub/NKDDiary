begin;

create type public.letter_kind as enum ('daily', 'time_capsule');
create type public.letter_status as enum ('draft', 'scheduled', 'published', 'withdrawn');

alter type public.notification_type add value if not exists 'letter_published';

alter table public.letters
  add column kind public.letter_kind,
  add column status public.letter_status,
  add column salutation text,
  add column body_json jsonb,
  add column body_text text,
  add column scheduled_for timestamptz,
  add column published_at timestamptz,
  add column withdrawn_at timestamptz,
  add column last_autosaved_at timestamptz,
  add column version integer not null default 1;

update public.letters
set
  kind = 'daily',
  status = 'published',
  salutation = '亲爱的',
  body_text = body,
  body_json = jsonb_build_object(
    'type', 'doc',
    'content', jsonb_build_array(
      jsonb_build_object(
        'type', 'paragraph',
        'content', jsonb_build_array(
          jsonb_build_object('type', 'text', 'text', body)
        )
      )
    )
  ),
  published_at = submitted_at;

alter table public.letters
  alter column kind set default 'daily',
  alter column kind set not null,
  alter column status set default 'draft',
  alter column status set not null,
  alter column body drop not null,
  alter column self_mood_value drop not null,
  alter column meal_value drop not null,
  alter column health_value drop not null,
  alter column seven_char_line drop not null,
  alter column submitted_at drop not null,
  alter column submitted_at drop default,
  alter column editable_until drop not null,
  alter column editable_until drop default;

alter table public.letters
  drop constraint if exists letters_body_check,
  drop constraint if exists letters_self_mood_value_check,
  drop constraint if exists letters_meal_value_check,
  drop constraint if exists letters_health_value_check,
  drop constraint if exists letters_seven_char_line_check,
  drop constraint if exists letters_author_id_letter_date_key,
  add constraint letters_version_positive check (version > 0),
  add constraint letters_salutation_max_seven_characters
    check (salutation is null or char_length(btrim(salutation)) <= 7),
  add constraint letters_final_line_max_seven_characters
    check (seven_char_line is null or char_length(btrim(seven_char_line)) <= 7);

create unique index letters_one_final_daily_per_author_date_idx
on public.letters (author_id, letter_date)
where kind = 'daily' and status in ('published', 'withdrawn');

create index letters_status_scheduled_for_idx
on public.letters (status, scheduled_for);

create index letters_author_status_updated_at_idx
on public.letters (author_id, status, updated_at desc);

create index letters_date_status_kind_idx
on public.letters (letter_date, status, kind);

drop trigger if exists letters_lock_window on public.letters;
drop function if exists public.lock_letter_window();

create function public.enforce_letter_lifecycle()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  letters_owner name;
begin
  if new.salutation is not null then
    new.salutation = regexp_replace(new.salutation, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  end if;

  if new.seven_char_line is not null then
    new.seven_char_line = regexp_replace(new.seven_char_line, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  end if;

  if new.author_id is distinct from old.author_id then
    raise exception using
      errcode = '23514',
      message = 'letter author_id cannot be changed';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception using
      errcode = '23514',
      message = 'letter created_at cannot be changed';
  end if;

  if new.letter_date is distinct from old.letter_date then
    raise exception using
      errcode = '23514',
      message = 'letter letter_date cannot be changed';
  end if;

  if new.kind is distinct from old.kind
     and not (old.status = 'draft' and new.status = 'draft') then
    raise exception using
      errcode = '23514',
      message = 'letter kind can only be changed while remaining a draft';
  end if;

  if old.status = 'draft' and new.status = 'draft' then
    null;

  elsif old.status = 'draft' and new.status = 'scheduled' then
    if new.kind is distinct from 'time_capsule'::public.letter_kind then
      raise exception using
        errcode = '23514',
        message = 'only a time capsule draft can be scheduled';
    end if;

    if new.scheduled_for is null
       or new.scheduled_for <= now()
       or (new.scheduled_for at time zone 'Asia/Shanghai')::date
          <= (now() at time zone 'Asia/Shanghai')::date then
      raise exception using
        errcode = '23514',
        message = 'scheduled_for must be in the future';
    end if;

    if new.salutation is null or char_length(new.salutation) not between 1 and 7 then
      raise exception using
        errcode = '23514',
        message = 'scheduled letter salutation must contain 1 to 7 characters';
    end if;

    if new.body_text is null or new.body_text !~ '[^[:space:]]' or char_length(new.body_text) > 50000 then
      raise exception using
        errcode = '23514',
        message = 'scheduled letter body_text must contain 1 to 50000 characters';
    end if;

    if new.seven_char_line is null or char_length(new.seven_char_line) not between 1 and 7 then
      raise exception using
        errcode = '23514',
        message = 'scheduled letter final line must contain 1 to 7 characters';
    end if;

  elsif old.status = 'scheduled' and new.status = 'scheduled' then
    if new.kind is distinct from 'time_capsule'::public.letter_kind then
      raise exception using
        errcode = '23514',
        message = 'a scheduled letter must remain a time capsule';
    end if;

    if new.scheduled_for is null
       or new.scheduled_for <= now()
       or (new.scheduled_for at time zone 'Asia/Shanghai')::date
          <= (now() at time zone 'Asia/Shanghai')::date then
      raise exception using
        errcode = '23514',
        message = 'scheduled_for must remain in the future';
    end if;

    if new.salutation is null or char_length(new.salutation) not between 1 and 7 then
      raise exception using
        errcode = '23514',
        message = 'scheduled letter salutation must contain 1 to 7 characters';
    end if;

    if new.body_text is null or new.body_text !~ '[^[:space:]]' or char_length(new.body_text) > 50000 then
      raise exception using
        errcode = '23514',
        message = 'scheduled letter body_text must contain 1 to 50000 characters';
    end if;

    if new.seven_char_line is null or char_length(new.seven_char_line) not between 1 and 7 then
      raise exception using
        errcode = '23514',
        message = 'scheduled letter final line must contain 1 to 7 characters';
    end if;

  elsif old.status = 'scheduled' and new.status = 'draft' then
    null;

  elsif old.status = 'draft' and new.status = 'published' then
    if new.kind is distinct from 'daily'::public.letter_kind then
      raise exception using
        errcode = '23514',
        message = 'only a daily draft can be published directly';
    end if;

    if new.letter_date is distinct from (now() at time zone 'Asia/Shanghai')::date then
      raise exception using
        errcode = '23514',
        message = 'daily letter_date must be today in Asia/Shanghai';
    end if;

    if new.self_mood_value is null or new.self_mood_value not between 1 and 5
       or new.meal_value is null or new.meal_value not between 1 and 5
       or new.health_value is null or new.health_value not between 1 and 5 then
      raise exception using
        errcode = '23514',
        message = 'daily letter slider values must each be between 1 and 5';
    end if;

    if new.salutation is null or char_length(new.salutation) not between 1 and 7 then
      raise exception using
        errcode = '23514',
        message = 'published letter salutation must contain 1 to 7 characters';
    end if;

    if new.body_text is null or new.body_text !~ '[^[:space:]]' or char_length(new.body_text) > 50000 then
      raise exception using
        errcode = '23514',
        message = 'published letter body_text must contain 1 to 50000 characters';
    end if;

    if new.seven_char_line is null or char_length(new.seven_char_line) not between 1 and 7 then
      raise exception using
        errcode = '23514',
        message = 'published letter final line must contain 1 to 7 characters';
    end if;

    new.published_at = now();

  elsif old.status = 'scheduled' and new.status = 'published' then
    if new.kind is distinct from 'time_capsule'::public.letter_kind then
      raise exception using
        errcode = '23514',
        message = 'only a scheduled time capsule can be published by the scheduler';
    end if;

    if new.scheduled_for is distinct from old.scheduled_for
       or old.scheduled_for is null
       or old.scheduled_for > now() then
      raise exception using
        errcode = '23514',
        message = 'time capsule can only be published after its unchanged scheduled_for';
    end if;

    select pg_catalog.pg_get_userbyid(c.relowner)
    into letters_owner
    from pg_catalog.pg_class as c
    where c.oid = 'public.letters'::regclass;

    if current_user is distinct from letters_owner then
      raise exception using
        errcode = '23514',
        message = 'only the database owner may publish a scheduled time capsule';
    end if;

    new.published_at = now();

  elsif old.status = 'published' and new.status = 'withdrawn' then
    if current_user is distinct from 'authenticated'::name
       or old.author_id is distinct from auth.uid() then
      raise exception using
        errcode = '23514',
        message = 'only the authenticated author may withdraw a published letter';
    end if;

    if old.published_at is null or now() > old.published_at + interval '24 hours' then
      raise exception using
        errcode = '23514',
        message = 'published letters may only be withdrawn within 24 hours';
    end if;

    if new.body is distinct from old.body
       or new.body_json is distinct from old.body_json
       or new.body_text is distinct from old.body_text
       or new.salutation is distinct from old.salutation
       or new.self_mood_value is distinct from old.self_mood_value
       or new.meal_value is distinct from old.meal_value
       or new.health_value is distinct from old.health_value
       or new.seven_char_line is distinct from old.seven_char_line
       or new.scheduled_for is distinct from old.scheduled_for
       or new.published_at is distinct from old.published_at
       or new.withdrawn_at is distinct from old.withdrawn_at
       or new.last_autosaved_at is distinct from old.last_autosaved_at
       or new.latitude is distinct from old.latitude
       or new.longitude is distinct from old.longitude
       or new.location_recorded_at is distinct from old.location_recorded_at
       or new.submitted_at is distinct from old.submitted_at
       or new.editable_until is distinct from old.editable_until
       or new.updated_at is distinct from old.updated_at
       or new.version is distinct from old.version then
      raise exception using
        errcode = '23514',
        message = 'withdrawing a published letter cannot include other changes';
    end if;

    new.body = null;
    new.body_json = null;
    new.body_text = null;
    new.salutation = null;
    new.self_mood_value = null;
    new.meal_value = null;
    new.health_value = null;
    new.seven_char_line = null;
    new.withdrawn_at = now();

  elsif old.status = 'published' then
    raise exception using
      errcode = '23514',
      message = 'published letters are immutable and may only be withdrawn';

  elsif old.status = 'withdrawn' then
    raise exception using
      errcode = '23514',
      message = 'withdrawn letters are terminal and cannot be updated';

  else
    raise exception using
      errcode = '23514',
      message = format('letter transition from %s to %s is not allowed', old.status, new.status);
  end if;

  new.version = old.version + 1;
  return new;
end;
$$;

create trigger letters_enforce_lifecycle
before update on public.letters
for each row execute function public.enforce_letter_lifecycle();

drop policy if exists "couple members can read letters" on public.letters;
drop policy if exists "users can insert own letter" on public.letters;
drop policy if exists "users can edit own letter within 24 hours" on public.letters;

create policy "members can read visible letters"
on public.letters for select to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and (
    status in ('published', 'withdrawn')
    or (author_id = (select auth.uid()) and status in ('draft', 'scheduled'))
  )
);

create policy "authors can insert letter drafts"
on public.letters for insert to authenticated
with check (
  author_id = (select auth.uid())
  and status = 'draft'
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
);

create policy "authors can update their active letters"
on public.letters for update to authenticated
using (
  author_id = (select auth.uid())
  and status in ('draft', 'scheduled', 'published')
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
)
with check (
  author_id = (select auth.uid())
  and status in ('draft', 'scheduled', 'published', 'withdrawn')
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
);

drop policy if exists "couple members can read annotations" on public.annotations;
drop policy if exists "couple members can create own annotations" on public.annotations;
drop policy if exists "couple members can update own annotations" on public.annotations;

create policy "members can read visible letter annotations"
on public.annotations for select to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and exists (
    select 1
    from public.letters as parent_letter
    where parent_letter.id = annotations.letter_id
      and (
        parent_letter.status in ('published', 'withdrawn')
        or (
          parent_letter.status in ('draft', 'scheduled')
          and parent_letter.author_id = (select auth.uid())
        )
      )
  )
);

create policy "members can annotate published letters"
on public.annotations for insert to authenticated
with check (
  author_id = (select auth.uid())
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and exists (
    select 1
    from public.letters as parent_letter
    where parent_letter.id = annotations.letter_id
      and parent_letter.status = 'published'
  )
);

create policy "members can update own published letter annotations"
on public.annotations for update to authenticated
using (
  author_id = (select auth.uid())
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and exists (
    select 1
    from public.letters as parent_letter
    where parent_letter.id = annotations.letter_id
      and parent_letter.status = 'published'
  )
)
with check (
  author_id = (select auth.uid())
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and exists (
    select 1
    from public.letters as parent_letter
    where parent_letter.id = annotations.letter_id
      and parent_letter.status = 'published'
  )
);

drop policy if exists "couple members can read annotation replies" on public.annotation_replies;
drop policy if exists "couple members can create own annotation replies" on public.annotation_replies;

create policy "members can read visible letter annotation replies"
on public.annotation_replies for select to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and exists (
    select 1
    from public.annotations as parent_annotation
    join public.letters as parent_letter
      on parent_letter.id = parent_annotation.letter_id
    where parent_annotation.id = annotation_replies.annotation_id
      and (
        parent_letter.status in ('published', 'withdrawn')
        or (
          parent_letter.status in ('draft', 'scheduled')
          and parent_letter.author_id = (select auth.uid())
        )
      )
  )
);

create policy "members can reply to published letter annotations"
on public.annotation_replies for insert to authenticated
with check (
  author_id = (select auth.uid())
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and exists (
    select 1
    from public.annotations as parent_annotation
    join public.letters as parent_letter
      on parent_letter.id = parent_annotation.letter_id
    where parent_annotation.id = annotation_replies.annotation_id
      and parent_letter.status = 'published'
  )
);

revoke all on public.letters from anon;
revoke insert, update, delete on public.letters from authenticated;
revoke update (
  id,
  author_id,
  letter_date,
  kind,
  status,
  salutation,
  body,
  body_json,
  body_text,
  scheduled_for,
  published_at,
  withdrawn_at,
  last_autosaved_at,
  version,
  self_mood_value,
  meal_value,
  health_value,
  seven_char_line,
  latitude,
  longitude,
  location_recorded_at,
  submitted_at,
  editable_until,
  created_at,
  updated_at
) on public.letters from authenticated;

grant select on public.letters to authenticated;
grant insert (
  author_id,
  letter_date,
  kind,
  status,
  salutation,
  body,
  body_json,
  body_text,
  scheduled_for,
  last_autosaved_at,
  self_mood_value,
  meal_value,
  health_value,
  seven_char_line,
  latitude,
  longitude,
  location_recorded_at
) on public.letters to authenticated;
grant update (
  kind,
  status,
  salutation,
  body,
  body_json,
  body_text,
  scheduled_for,
  last_autosaved_at,
  self_mood_value,
  meal_value,
  health_value,
  seven_char_line,
  latitude,
  longitude,
  location_recorded_at
) on public.letters to authenticated;
revoke usage on type public.letter_kind, public.letter_status from public, anon;
grant usage on type public.letter_kind, public.letter_status to authenticated;

revoke execute on function public.enforce_letter_lifecycle() from public;

commit;
