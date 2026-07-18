create extension if not exists pg_cron;

create or replace function private.publish_due_letters()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  due_letter record;
  recipient_id uuid;
  published_count integer := 0;
begin
  for due_letter in
    select letter.id, letter.author_id
    from public.letters as letter
    where letter.status = 'scheduled'::public.letter_status
      and letter.kind = 'time_capsule'::public.letter_kind
      and letter.scheduled_for <= pg_catalog.now()
      and letter.deletion_token is null
    order by letter.scheduled_for, letter.id
    for update skip locked
    limit 100
  loop
    select profile.id
    into strict recipient_id
    from public.profiles as profile
    where profile.id <> due_letter.author_id;

    update public.letters
    set
      status = 'published'::public.letter_status,
      published_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    where id = due_letter.id;

    insert into public.notifications (
      recipient_id,
      type,
      source_id,
      title,
      body
    )
    values (
      recipient_id,
      'letter_published'::public.notification_type,
      due_letter.id,
      '一封未来的信到了',
      '去看看写给你的时间胶囊'
    );

    published_count := published_count + 1;
  end loop;

  return published_count;
end;
$$;

revoke all on function private.publish_due_letters() from public, anon, authenticated;

revoke all on schema cron from public, anon, authenticated;
revoke all on all tables in schema cron from public, anon, authenticated;
revoke all on all sequences in schema cron from public, anon, authenticated;
revoke all on all functions in schema cron from public, anon, authenticated;

select cron.unschedule(job.jobid)
from cron.job as job
where job.jobname = 'publish-due-letters';

select cron.schedule(
  'publish-due-letters',
  '* * * * *',
  $cron$select private.publish_due_letters();$cron$
);
