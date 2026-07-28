-- Homepage activity stream and durable city-level location history.
alter type public.notification_type add value if not exists 'memory_created';
alter type public.notification_type add value if not exists 'mood_created';
alter type public.notification_type add value if not exists 'profile_updated';
alter type public.notification_type add value if not exists 'journal_created';

create table if not exists public.location_history (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  latitude double precision not null,
  longitude double precision not null,
  country text,
  region text,
  city text,
  source text not null default 'manual' check (source in ('manual', 'login_confirmed', 'stale_confirmed')),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists location_history_space_recorded_idx on public.location_history(space_id, recorded_at desc);
alter table public.location_history enable row level security;
drop policy if exists "active members read location history" on public.location_history;
create policy "active members read location history" on public.location_history for select to authenticated
using (public.is_active_space_member(space_id));
revoke all on table public.location_history from anon, authenticated;
grant select on table public.location_history to authenticated;

create or replace function public.record_location_history(
  p_space_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_country text,
  p_region text,
  p_city text,
  p_source text default 'manual'
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := auth.uid(); v_id uuid; v_recent uuid;
begin
  if v_actor is null or not public.is_active_space_member(p_space_id, v_actor) then
    raise exception 'location access denied' using errcode='42501';
  end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid coordinates' using errcode='22023';
  end if;
  select id into v_recent from public.location_history
  where user_id=v_actor and recorded_at > now()-interval '10 minutes'
    and coalesce(city,'')=coalesce(nullif(btrim(p_city),''),'')
  order by recorded_at desc limit 1;
  if v_recent is not null then
    update public.location_history set latitude=p_latitude, longitude=p_longitude,
      country=nullif(btrim(p_country),''), region=nullif(btrim(p_region),''), city=nullif(btrim(p_city),''),
      source=p_source, recorded_at=now() where id=v_recent returning id into v_id;
  else
    insert into public.location_history(space_id,user_id,latitude,longitude,country,region,city,source)
    values(p_space_id,v_actor,p_latitude,p_longitude,nullif(btrim(p_country),''),nullif(btrim(p_region),''),nullif(btrim(p_city),''),p_source)
    returning id into v_id;
  end if;
  update public.profiles set last_login_at=now(), last_login_latitude=p_latitude, last_login_longitude=p_longitude where id=v_actor;
  return v_id;
end; $$;
revoke execute on function public.record_location_history(uuid,double precision,double precision,text,text,text,text) from public,anon;
grant execute on function public.record_location_history(uuid,double precision,double precision,text,text,text,text) to authenticated;

create or replace function public.notify_partner_activity() returns trigger
language plpgsql security definer set search_path=''
as $$
declare v_recipient uuid; v_type public.notification_type; v_title text; v_body text; v_space uuid; v_actor uuid;
begin
  v_actor := coalesce((to_jsonb(new)->>'creator_id')::uuid, (to_jsonb(new)->>'author_id')::uuid);
  v_space := (to_jsonb(new)->>'space_id')::uuid;
  select member.user_id into v_recipient from public.space_members member
  where member.space_id=v_space and member.status='active' and member.user_id<>v_actor limit 1;
  if v_recipient is null then return new; end if;
  if tg_table_name='memory_entries' then v_type='memory_created'; v_title='新增回忆'; v_body='对方新增了一条回忆';
  elsif tg_table_name='mood_entries' then v_type='mood_created'; v_title='更新心情'; v_body='对方更新了心情';
  else v_type='calendar_event'; v_title='新增日历事件'; v_body='对方新增了日历事件'; end if;
  insert into public.notifications(recipient_id,type,source_id,title,body) values(v_recipient,v_type,new.id,v_title,v_body);
  return new;
end; $$;

drop trigger if exists memory_partner_activity on public.memory_entries;
create trigger memory_partner_activity after insert on public.memory_entries for each row execute function public.notify_partner_activity();
drop trigger if exists mood_partner_activity on public.mood_entries;
create trigger mood_partner_activity after insert on public.mood_entries for each row execute function public.notify_partner_activity();
drop trigger if exists calendar_partner_activity on public.calendar_events;
create trigger calendar_partner_activity after insert on public.calendar_events for each row execute function public.notify_partner_activity();
