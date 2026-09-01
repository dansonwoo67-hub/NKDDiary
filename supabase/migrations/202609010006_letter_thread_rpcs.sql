create or replace function public.reply_to_letter(
  p_target_id uuid,
  p_rich_content jsonb,
  p_plain_text text,
  p_stationery_theme text,
  p_mood_emoji text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_target public.journal_entries;
  v_root public.journal_entries;
  v_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_text text := normalize(btrim(coalesce(p_plain_text, '')), NFC);
begin
  if v_actor is null then raise exception 'not authenticated' using errcode='28000'; end if;
  if char_length(v_text) not between 1 and 5000
    or jsonb_typeof(p_rich_content) <> 'object'
    or p_stationery_theme not in ('cream','rose','moon','vintage','sakura','lined')
    or (p_mood_emoji is not null and p_mood_emoji not in ('😊','💕','🥺','😤','😴','🤔','😌','😭'))
  then raise exception 'invalid letter' using errcode='22023'; end if;

  select * into v_target from public.journal_entries
  where id=p_target_id for update;
  if not found or v_target.recipient_id is distinct from v_actor
    or v_target.thread_id is null
    or not public.is_active_space_member(v_target.space_id,v_actor)
    or not public.is_active_space_member(v_target.space_id,v_target.author_id)
  then raise exception 'letter reply access denied' using errcode='42501'; end if;
  if v_target.withdrawn_at is not null then
    raise exception 'withdrawn letter cannot be replied to' using errcode='55000';
  end if;
  if v_target.entry_type='future' and v_target.opened_at is null then
    raise exception 'sealed capsule cannot be replied to' using errcode='55000';
  end if;

  select * into v_root from public.journal_entries
  where id=v_target.thread_id;
  if not found or v_root.thread_id is distinct from v_root.id
    or v_root.reply_to_id is not null or v_root.space_id is distinct from v_target.space_id
    or not (
      (v_root.author_id=v_target.author_id and v_root.recipient_id=v_target.recipient_id)
      or (v_root.author_id=v_target.recipient_id and v_root.recipient_id=v_target.author_id)
    )
  then raise exception 'invalid letter thread' using errcode='23514'; end if;

  if v_target.entry_type='today' then
    update public.journal_entries
    set opened_at=coalesce(opened_at,v_now), opened_by=coalesce(opened_by,v_actor)
    where id=v_target.id;
    update public.notifications
    set is_read=true
    where recipient_id=v_actor and source_id=v_target.id and is_active and not is_read;
  end if;

  insert into public.journal_entries(
    id,thread_id,reply_to_id,space_id,author_id,recipient_id,entry_type,
    title,content,rich_content,plain_text,excerpt,stationery_theme,mood_emoji,
    entry_date,created_local_date,published_at,locked_at
  ) values (
    v_id,v_target.thread_id,v_target.id,v_target.space_id,v_actor,v_target.author_id,'today',
    '',v_text,p_rich_content,v_text,left(v_text,88),p_stationery_theme,p_mood_emoji,
    (v_now at time zone 'Asia/Shanghai')::date,(v_now at time zone 'Asia/Shanghai')::date,
    v_now,v_now+interval '24 hours'
  );
  return v_id;
end;
$$;

create or replace function public.resend_withdrawn_letter(
  p_withdrawn_id uuid,
  p_rich_content jsonb,
  p_plain_text text,
  p_stationery_theme text,
  p_mood_emoji text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_target public.journal_entries;
  v_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_text text := normalize(btrim(coalesce(p_plain_text, '')), NFC);
begin
  if v_actor is null then raise exception 'not authenticated' using errcode='28000'; end if;
  if char_length(v_text) not between 1 and 5000
    or jsonb_typeof(p_rich_content) <> 'object'
    or p_stationery_theme not in ('cream','rose','moon','vintage','sakura','lined')
    or (p_mood_emoji is not null and p_mood_emoji not in ('😊','💕','🥺','😤','😴','🤔','😌','😭'))
  then raise exception 'invalid letter' using errcode='22023'; end if;

  select * into v_target from public.journal_entries
  where id=p_withdrawn_id for update;
  if not found or v_target.author_id is distinct from v_actor
    or v_target.entry_type <> 'today' or v_target.recipient_id is null
    or v_target.thread_id is null or v_target.withdrawn_at is null
    or not public.is_active_space_member(v_target.space_id,v_actor)
    or not public.is_active_space_member(v_target.space_id,v_target.recipient_id)
  then raise exception 'withdrawn resend access denied' using errcode='42501'; end if;
  if exists (
    select 1 from public.journal_entries
    where reply_to_id=v_target.id and author_id=v_actor
  ) then raise exception 'withdrawn letter already resent' using errcode='23505'; end if;

  insert into public.journal_entries(
    id,thread_id,reply_to_id,space_id,author_id,recipient_id,entry_type,
    title,content,rich_content,plain_text,excerpt,stationery_theme,mood_emoji,
    entry_date,created_local_date,published_at,locked_at
  ) values (
    v_id,v_target.thread_id,v_target.id,v_target.space_id,v_actor,v_target.recipient_id,'today',
    '',v_text,p_rich_content,v_text,left(v_text,88),p_stationery_theme,p_mood_emoji,
    (v_now at time zone 'Asia/Shanghai')::date,(v_now at time zone 'Asia/Shanghai')::date,
    v_now,v_now+interval '24 hours'
  );
  return v_id;
end;
$$;

create or replace function public.list_letter_threads(
  p_limit integer default 30,
  p_before_activity_at timestamptz default null,
  p_before_thread_id uuid default null
)
returns table(
  thread_id uuid,counterpart_id uuid,latest_activity_at timestamptz,
  latest_letter_id uuid,latest_preview text,letter_count bigint,
  origin_type public.journal_entry_type,root_open_at timestamptz,
  root_opened_at timestamptz,latest_withdrawn boolean,unread boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_space uuid;
begin
  if v_actor is null then raise exception 'not authenticated' using errcode='28000'; end if;
  v_space := public.resolve_single_active_space(v_actor);
  if v_space is null then raise exception 'active membership required' using errcode='42501'; end if;
  if p_limit not between 1 and 100 then raise exception 'invalid limit' using errcode='22023'; end if;

  return query
  with visible as (
    select e.*,greatest(e.published_at,coalesce(e.withdrawn_at,e.published_at)) as activity_at
    from public.journal_entries e
    where e.space_id=v_space and e.thread_id is not null and e.recipient_id is not null
      and (e.author_id=v_actor or e.recipient_id=v_actor)
  ), aggregates as (
    select v.thread_id,max(v.activity_at) as activity_at,count(*) as total
    from visible v group by v.thread_id
  ), latest as (
    select distinct on (v.thread_id) v.*
    from visible v order by v.thread_id,v.activity_at desc,v.id desc
  )
  select a.thread_id,
    case when r.author_id=v_actor then r.recipient_id else r.author_id end,
    a.activity_at,l.id,
    case
      when l.withdrawn_at is not null and l.recipient_id=v_actor then '对方撤回了一封信'
      when l.entry_type='future' and l.recipient_id=v_actor and l.opened_at is null then '胶囊信尚未开启'
      else coalesce(l.excerpt,l.plain_text,l.content,'')
    end,
    a.total,r.entry_type,r.open_at,r.opened_at,(l.withdrawn_at is not null),
    exists (
      select 1 from public.notifications n
      join public.journal_entries ne on ne.id=n.source_id
      where n.recipient_id=v_actor and not n.is_read and n.is_active
        and ne.thread_id=a.thread_id
    )
  from aggregates a
  join latest l on l.thread_id=a.thread_id
  join public.journal_entries r on r.id=a.thread_id and r.thread_id=r.id
  where p_before_activity_at is null
     or (a.activity_at,a.thread_id) < (p_before_activity_at,p_before_thread_id)
  order by a.activity_at desc,a.thread_id desc
  limit p_limit;
end;
$$;

create or replace function public.get_letter_thread_detail(p_thread_id uuid)
returns table(
  thread_id uuid,letter_id uuid,reply_to_id uuid,author_id uuid,recipient_id uuid,
  entry_type public.journal_entry_type,published_at timestamptz,open_at timestamptz,
  opened_at timestamptz,withdrawn_at timestamptz,body_visible boolean,title text,
  rich_content jsonb,plain_text text,excerpt text,stationery_theme text,
  mood_emoji text,image_path text,reply_allowed boolean,resend_allowed boolean,
  thread_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_root public.journal_entries;
  v_now timestamptz := clock_timestamp();
begin
  if v_actor is null then raise exception 'not authenticated' using errcode='28000'; end if;
  select root.* into v_root from public.journal_entries root
  where root.id=p_thread_id and root.thread_id=root.id and root.reply_to_id is null
    and root.recipient_id is not null and (root.author_id=v_actor or root.recipient_id=v_actor);
  if not found or not public.is_active_space_member(v_root.space_id,v_actor) then return; end if;

  perform 1 from public.journal_entries e
  where e.thread_id=p_thread_id and e.entry_type='today'
    and e.recipient_id=v_actor and e.withdrawn_at is null and e.opened_at is null
  order by e.id for update;

  update public.journal_entries e
  set opened_at=v_now,opened_by=v_actor
  where e.thread_id=p_thread_id and e.entry_type='today'
    and e.recipient_id=v_actor and e.withdrawn_at is null and e.opened_at is null;
  update public.notifications n
  set is_read=true
  where n.recipient_id=v_actor and n.is_active and not n.is_read
    and exists (
      select 1 from public.journal_entries e
      where e.id=n.source_id and e.thread_id=p_thread_id and e.entry_type='today'
    );

  return query
  select e.thread_id,e.id,e.reply_to_id,e.author_id,e.recipient_id,e.entry_type,
    e.published_at,e.open_at,e.opened_at,e.withdrawn_at,
    not ((e.withdrawn_at is not null and e.recipient_id=v_actor)
      or (e.entry_type='future' and e.recipient_id=v_actor and e.opened_at is null)),
    case when (e.withdrawn_at is not null and e.recipient_id=v_actor)
      or (e.entry_type='future' and e.recipient_id=v_actor and e.opened_at is null) then null else e.title end,
    case when (e.withdrawn_at is not null and e.recipient_id=v_actor)
      or (e.entry_type='future' and e.recipient_id=v_actor and e.opened_at is null) then null else e.rich_content end,
    case when (e.withdrawn_at is not null and e.recipient_id=v_actor)
      or (e.entry_type='future' and e.recipient_id=v_actor and e.opened_at is null) then null else e.plain_text end,
    case when (e.withdrawn_at is not null and e.recipient_id=v_actor)
      or (e.entry_type='future' and e.recipient_id=v_actor and e.opened_at is null) then null else e.excerpt end,
    case when (e.withdrawn_at is not null and e.recipient_id=v_actor)
      or (e.entry_type='future' and e.recipient_id=v_actor and e.opened_at is null) then null else e.stationery_theme end,
    case when (e.withdrawn_at is not null and e.recipient_id=v_actor)
      or (e.entry_type='future' and e.recipient_id=v_actor and e.opened_at is null) then null else e.mood_emoji end,
    case when (e.withdrawn_at is not null and e.recipient_id=v_actor)
      or (e.entry_type='future' and e.recipient_id=v_actor and e.opened_at is null) then null else e.image_path end,
    (e.recipient_id=v_actor and e.withdrawn_at is null
      and (e.entry_type='today' or (e.entry_type='future' and e.opened_at is not null))),
    (e.author_id=v_actor and e.entry_type='today' and e.withdrawn_at is not null
      and not exists (select 1 from public.journal_entries child where child.reply_to_id=e.id and child.author_id=v_actor)),
    count(*) over ()
  from public.journal_entries e
  where e.thread_id=p_thread_id
  order by e.published_at,e.id;
end;
$$;

create or replace function public.resolve_letter_notification_target(p_notification_id uuid)
returns table(thread_id uuid,letter_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(e.thread_id,e.id),e.id
  from public.notifications n
  join public.journal_entries e on e.id=n.source_id
  where n.id=p_notification_id and n.recipient_id=auth.uid() and n.is_active
    and public.is_active_space_member(e.space_id,auth.uid())
  limit 1;
$$;

revoke execute on function public.reply_to_letter(uuid,jsonb,text,text,text) from public,anon,service_role;
revoke execute on function public.resend_withdrawn_letter(uuid,jsonb,text,text,text) from public,anon,service_role;
revoke execute on function public.list_letter_threads(integer,timestamptz,uuid) from public,anon,service_role;
revoke execute on function public.get_letter_thread_detail(uuid) from public,anon,service_role;
revoke execute on function public.resolve_letter_notification_target(uuid) from public,anon,service_role;
grant execute on function public.reply_to_letter(uuid,jsonb,text,text,text) to authenticated;
grant execute on function public.resend_withdrawn_letter(uuid,jsonb,text,text,text) to authenticated;
grant execute on function public.list_letter_threads(integer,timestamptz,uuid) to authenticated;
grant execute on function public.get_letter_thread_detail(uuid) to authenticated;
grant execute on function public.resolve_letter_notification_target(uuid) to authenticated;
