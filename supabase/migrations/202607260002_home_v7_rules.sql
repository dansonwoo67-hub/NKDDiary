-- Home V7: accurate partner activity, mood limits, notification ownership and durable history.
alter table public.notifications add column if not exists actor_id uuid references public.profiles(id) on delete restrict;
create index if not exists notifications_recipient_recent_idx on public.notifications(recipient_id, created_at desc);
alter table public.mood_entries add column if not exists source text not null default 'manual' check (source in ('manual','daily_quote'));

create or replace function public.create_home_mood(p_space_id uuid,p_body text,p_source text default 'manual') returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=auth.uid();v_id uuid;v_today date:=(now() at time zone 'Asia/Shanghai')::date;v_last timestamptz;v_count integer;
begin
 if v_actor is null or not public.is_active_space_member(p_space_id,v_actor) then raise exception 'mood access denied' using errcode='42501'; end if;
 if p_source not in ('manual','daily_quote') or char_length(btrim(coalesce(p_body,''))) not between 1 and 280 then raise exception 'invalid mood entry' using errcode='22023'; end if;
 if p_source='manual' and char_length(btrim(p_body))>15 then raise exception 'manual mood too long' using errcode='22023'; end if;
 select count(*),max(created_at) into v_count,v_last from public.mood_entries where space_id=p_space_id and author_id=v_actor and (created_at at time zone 'Asia/Shanghai')::date=v_today;
 if v_count>=10 then raise exception 'daily mood limit'; end if;
 if v_last is not null and v_last>now()-interval '1 minute' then raise exception 'one minute interval'; end if;
 if p_source='daily_quote' and exists(select 1 from public.mood_entries where space_id=p_space_id and author_id=v_actor and source='daily_quote' and body=btrim(p_body) and (created_at at time zone 'Asia/Shanghai')::date=v_today) then raise exception 'daily quote already shared'; end if;
 insert into public.mood_entries(space_id,author_id,body,emoji,source) values(p_space_id,v_actor,btrim(p_body),'',p_source) returning id into v_id;
 return v_id;
end;$$;
revoke execute on function public.create_home_mood(uuid,text,text) from public,anon;
grant execute on function public.create_home_mood(uuid,text,text) to authenticated;

create or replace function public.notify_partner_activity() returns trigger
language plpgsql security definer set search_path=''
as $$
declare v_recipient uuid;v_type public.notification_type;v_title text;v_body text;v_space uuid;v_actor uuid;
begin
 v_actor:=coalesce((to_jsonb(new)->>'creator_id')::uuid,(to_jsonb(new)->>'author_id')::uuid);
 v_space:=(to_jsonb(new)->>'space_id')::uuid;
 select member.user_id into v_recipient from public.space_members member where member.space_id=v_space and member.active and member.user_id<>v_actor limit 1;
 if v_recipient is null then return new; end if;
 if tg_table_name='memory_entries' then v_type='memory_created';v_title='新增回忆';v_body='对方新增了一条回忆';
 elsif tg_table_name='mood_entries' then v_type='mood_created';v_title='更新心情';v_body='对方更新了心情';
 else v_type='calendar_event';v_title='新增日历事件';v_body='对方新增了日历事件';end if;
 insert into public.notifications(recipient_id,actor_id,type,source_id,title,body) values(v_recipient,v_actor,v_type,new.id,v_title,v_body);
 return new;
end;$$;

drop trigger if exists memory_partner_activity on public.memory_entries;
create trigger memory_partner_activity after insert on public.memory_entries for each row execute function public.notify_partner_activity();
drop trigger if exists mood_partner_activity on public.mood_entries;
create trigger mood_partner_activity after insert on public.mood_entries for each row execute function public.notify_partner_activity();
drop trigger if exists calendar_partner_activity on public.calendar_events;
create trigger calendar_partner_activity after insert on public.calendar_events for each row execute function public.notify_partner_activity();

create or replace function public.notify_partner_journal() returns trigger
language plpgsql security definer set search_path=''
as $$
declare v_recipient uuid;
begin
 if new.entry_type<>'today' then return new; end if;
 select m.user_id into v_recipient from public.space_members m where m.space_id=new.space_id and m.active and m.user_id<>new.author_id limit 1;
 if v_recipient is not null then insert into public.notifications(recipient_id,actor_id,type,source_id,title,body) values(v_recipient,new.author_id,'journal_created',new.id,'对方寄来一封信','对方寄来一封信'); end if;
 return new;
end;$$;
drop trigger if exists journal_partner_activity on public.journal_entries;
create trigger journal_partner_activity after insert on public.journal_entries for each row execute function public.notify_partner_journal();

create or replace function public.notify_partner_profile_change(p_kind text) returns void
language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=auth.uid();v_space uuid;v_recipient uuid;v_body text;
begin
 v_space:=public.resolve_single_active_space(v_actor); if v_space is null then return; end if;
 select m.user_id into v_recipient from public.space_members m where m.space_id=v_space and m.active and m.user_id<>v_actor limit 1;
 if v_recipient is null then return; end if;
 v_body:=case p_kind when 'avatar' then '对方更换了头像' when 'name' then '对方更换了昵称' else '对方更新了资料' end;
 insert into public.notifications(recipient_id,actor_id,type,source_id,title,body) values(v_recipient,v_actor,'profile_updated',v_actor,'资料更新',v_body);
end;$$;
revoke execute on function public.notify_partner_profile_change(text) from public,anon;
grant execute on function public.notify_partner_profile_change(text) to authenticated;

-- Old ownerless notifications are not trustworthy for first-person inbox/activity views.
update public.notifications set is_read=true where actor_id is null;
update public.notifications set is_read=true where created_at<now()-interval '30 days';
