alter table public.notifications
  add column if not exists occurrence_date date;

drop policy if exists "couple members can create notifications" on public.notifications;
drop policy if exists "couple members can create non-scheduled notifications" on public.notifications;

create policy "couple members can create non-scheduled notifications"
on public.notifications for insert to authenticated
with check (
  ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and type <> 'calendar_event'::public.notification_type
  and type in (
    'annotation'::public.notification_type,
    'annotation_reply'::public.notification_type,
    'letter_opened'::public.notification_type
  )
  and occurrence_date is null
);

revoke insert on public.notifications from authenticated;
grant insert (recipient_id, type, source_id, title, body) on public.notifications to authenticated;

create unique index if not exists notifications_calendar_occurrence_unique_idx
on public.notifications (recipient_id, type, source_id, occurrence_date)
where type = 'calendar_event'::public.notification_type
  and occurrence_date is not null;

create or replace function private.enqueue_due_event_notifications(
  p_target_date date default ((pg_catalog.now() at time zone 'Asia/Shanghai')::date)
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  inserted_count integer := 0;
begin
  if p_target_date is null then
    raise exception using message = 'target date is required';
  end if;

  -- Serializes retries for the same Shanghai calendar day. The unique index is
  -- a second guard, so a manual run and the cron job cannot duplicate reminders.
  perform pg_catalog.pg_advisory_xact_lock(
    20260713,
    p_target_date - date '2000-01-01'
  );

  with due_events as (
    select event.id, event.name
    from public.calendar_events as event
    where
      (
        event.recurrence = 'none'::public.recurrence_type
        and event.event_date = p_target_date
      )
      or (
        event.recurrence = 'monthly'::public.recurrence_type
        and event.event_date <= p_target_date
        and p_target_date = pg_catalog.make_date(
          pg_catalog.date_part('year', p_target_date)::integer,
          pg_catalog.date_part('month', p_target_date)::integer,
          least(
            pg_catalog.date_part('day', event.event_date)::integer,
            pg_catalog.date_part(
              'day', (
                pg_catalog.date_trunc('month', p_target_date::timestamp)
                + interval '1 month - 1 day'
              )
            )::integer
          )
        )
      )
      or (
        event.recurrence = 'yearly'::public.recurrence_type
        and event.event_date <= p_target_date
        and pg_catalog.date_part('month', event.event_date) = pg_catalog.date_part('month', p_target_date)
        and p_target_date = pg_catalog.make_date(
          pg_catalog.date_part('year', p_target_date)::integer,
          pg_catalog.date_part('month', p_target_date)::integer,
          least(
            pg_catalog.date_part('day', event.event_date)::integer,
            pg_catalog.date_part(
              'day', (
                pg_catalog.date_trunc('month', p_target_date::timestamp)
                + interval '1 month - 1 day'
              )
            )::integer
          )
        )
      )
  ), inserted as (
    insert into public.notifications (
      recipient_id,
      type,
      source_id,
      title,
      body,
      occurrence_date
    )
    select
      profile.id,
      'calendar_event'::public.notification_type,
      event.id,
      '今日提醒',
      event.name,
      p_target_date
    from due_events as event
    cross join public.profiles as profile
    where not exists (
      select 1
      from public.notifications as existing
      where existing.recipient_id = profile.id
        and existing.type = 'calendar_event'::public.notification_type
        and existing.source_id = event.id
        and existing.occurrence_date = p_target_date
    )
    on conflict (recipient_id, type, source_id, occurrence_date)
      where type = 'calendar_event'::public.notification_type
        and occurrence_date is not null
      do nothing
    returning 1
  )
  select pg_catalog.count(*)::integer
  into inserted_count
  from inserted;

  return inserted_count;
end;
$$;

revoke all on function private.enqueue_due_event_notifications(date) from public, anon, authenticated;

select cron.unschedule(job.jobid)
from cron.job as job
where job.jobname = 'enqueue-due-event-notifications';

select cron.schedule(
  'enqueue-due-event-notifications',
  '*/5 * * * *',
  $cron$select private.enqueue_due_event_notifications();$cron$
);
