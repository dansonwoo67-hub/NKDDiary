begin;

do $$
declare
  v_space uuid := '00000000-0000-4000-8000-000000000001';
  v_a uuid := 'b27e35b6-e84e-476a-9e15-5df05380734b';
  v_b uuid := '89f22432-b418-44a9-a603-3487c72963f9';
  v_root uuid;
  v_reply uuid;
  v_capsule uuid;
  v_sealed uuid := gen_random_uuid();
  v_resend uuid;
  v_withdrawn uuid := gen_random_uuid();
  v_legacy uuid := gen_random_uuid();
  v_notice uuid;
  v_count bigint;
  v_text text;
begin
  insert into public.journal_entries(
    id,space_id,author_id,recipient_id,entry_type,title,content,
    entry_date,created_local_date,locked_at,thread_id,reply_to_id
  ) values (
    v_legacy,v_space,v_a,null,'today','','legacy',(now() at time zone 'Asia/Shanghai')::date,
    (now() at time zone 'Asia/Shanghai')::date,now()+interval '24 hours',null,null
  );
  if exists(select 1 from public.journal_entries where id=v_legacy and (thread_id is not null or reply_to_id is not null)) then
    raise exception 'ASSERT legacy gained thread metadata';
  end if;

  perform set_config('request.jwt.claims',json_build_object('sub',v_a,'role','authenticated')::text,true);
  v_root := public.create_letter_diary(v_space,v_b,'{"type":"doc","html":"<p>root</p>","text":"root"}'::jsonb,'root','cream',null);
  if not exists(select 1 from public.journal_entries where id=v_root and thread_id=id and reply_to_id is null and entry_type='today') then
    raise exception 'ASSERT ordinary root contract failed';
  end if;

  v_capsule := (public.seal_future_diary(v_space,'','capsule-secret',v_b,now()+interval '1 day',
    'journal/capsule-secret.jpg')).id;
  if not exists(select 1 from public.journal_entries where id=v_capsule and thread_id=id and reply_to_id is null and entry_type='future') then
    raise exception 'ASSERT capsule root contract failed';
  end if;

  perform set_config('request.jwt.claims',json_build_object('sub',v_b,'role','authenticated')::text,true);
  begin
    perform public.reply_to_letter(v_capsule,'{"type":"doc"}'::jsonb,'blocked','cream',null);
    raise exception 'ASSERT unopened capsule reply succeeded';
  exception when sqlstate '55000' then null; end;

  v_reply := public.reply_to_letter(v_root,'{"type":"doc","html":"<p>reply</p>","text":"reply"}'::jsonb,'reply','cream',null);
  if not exists(select 1 from public.journal_entries where id=v_reply and entry_type='today' and thread_id=v_root and reply_to_id=v_root and recipient_id=v_a) then
    raise exception 'ASSERT ordinary reply contract failed';
  end if;
  if not exists(select 1 from public.journal_entries where id=v_root and opened_at is not null and opened_by=v_b) then
    raise exception 'ASSERT reply did not mark target opened';
  end if;

  update public.journal_entries set opened_at=now(),opened_by=v_b where id=v_capsule;
  v_reply := public.reply_to_letter(v_capsule,'{"type":"doc"}'::jsonb,'capsule reply','cream',null);
  if not exists(select 1 from public.journal_entries where id=v_reply and entry_type='today' and thread_id=v_capsule and reply_to_id=v_capsule) then
    raise exception 'ASSERT opened capsule reply contract failed';
  end if;

  perform set_config('request.jwt.claims',json_build_object('sub',v_a,'role','authenticated')::text,true);
  insert into public.journal_entries(
    id,thread_id,reply_to_id,space_id,author_id,recipient_id,entry_type,title,content,
    rich_content,plain_text,excerpt,stationery_theme,image_path,entry_date,created_local_date,
    published_at,locked_at,withdrawn_at
  ) values (
    v_withdrawn,v_withdrawn,null,v_space,v_a,v_b,'today','','withdrawn-secret',
    '{"html":"<p>withdrawn-secret-html</p>"}'::jsonb,'withdrawn-secret','withdrawn-secret','cream',
    'journal/withdrawn-secret.jpg',(now() at time zone 'Asia/Shanghai')::date,
    (now() at time zone 'Asia/Shanghai')::date,now(),now()+interval '24 hours',now()
  );
  begin
    perform set_config('request.jwt.claims',json_build_object('sub',v_b,'role','authenticated')::text,true);
    perform public.reply_to_letter(v_withdrawn,'{"type":"doc"}'::jsonb,'blocked','cream',null);
    raise exception 'ASSERT withdrawn direct reply succeeded';
  exception when sqlstate '55000' then null; end;

  perform set_config('request.jwt.claims',json_build_object('sub',v_a,'role','authenticated')::text,true);
  v_resend := public.resend_withdrawn_letter(v_withdrawn,'{"type":"doc"}'::jsonb,'resent','cream',null);
  if not exists(select 1 from public.journal_entries where id=v_resend and thread_id=v_withdrawn and reply_to_id=v_withdrawn and entry_type='today') then
    raise exception 'ASSERT resend contract failed';
  end if;
  if not exists(select 1 from public.journal_entries where id=v_withdrawn and content='withdrawn-secret' and withdrawn_at is not null) then
    raise exception 'ASSERT resend mutated original';
  end if;
  begin
    perform public.resend_withdrawn_letter(v_withdrawn,'{"type":"doc"}'::jsonb,'again','cream',null);
    raise exception 'ASSERT second resend succeeded';
  exception when unique_violation then null; end;

  select plain_text into v_text from public.get_letter_thread_detail(v_withdrawn) where letter_id=v_withdrawn;
  if v_text <> 'withdrawn-secret' then raise exception 'ASSERT sender cannot read withdrawn body'; end if;
  perform set_config('request.jwt.claims',json_build_object('sub',v_b,'role','authenticated')::text,true);
  if exists(select 1 from public.get_letter_thread_detail(v_withdrawn)
    where letter_id=v_withdrawn and (plain_text is not null or rich_content is not null or image_path is not null or body_visible)) then
    raise exception 'ASSERT recipient received withdrawn content';
  end if;

  insert into public.journal_entries(
    id,thread_id,reply_to_id,space_id,author_id,recipient_id,entry_type,title,content,image_path,
    created_local_date,published_at,locked_at,sealed_at,open_at,status,scheduled_created_at
  ) values (
    v_sealed,v_sealed,null,v_space,v_a,v_b,'future','','sealed-secret','journal/sealed-secret.jpg',
    ((now() at time zone 'Asia/Shanghai')::date-1),now(),now(),now(),now()+interval '2 days','scheduled',now()-interval '1 day'
  );
  if exists(select 1 from public.get_letter_thread_detail(v_sealed)
    where letter_id=v_sealed and (plain_text is not null or image_path is not null or body_visible)) then
    raise exception 'ASSERT recipient received sealed capsule content';
  end if;

  select count(*) into v_count from public.get_letter_thread_detail(v_withdrawn);
  if v_count <> 2 then raise exception 'ASSERT withdrawn thread count expected 2 got %',v_count; end if;
  if exists(
    select 1 from (
      select published_at,id,lag(published_at) over(order by published_at,id) prev
      from public.journal_entries where thread_id=v_withdrawn
    ) ordered where prev>published_at
  ) then raise exception 'ASSERT detail order unstable'; end if;

  select id into v_notice from public.notifications where source_id=v_resend and recipient_id=v_b limit 1;
  update public.notifications set is_read=true where id=v_notice;
  if not exists(select 1 from public.resolve_letter_notification_target(v_notice) where thread_id=v_withdrawn and letter_id=v_resend) then
    raise exception 'ASSERT read active notification not navigable';
  end if;
  update public.notifications set is_active=false where id=v_notice;
  if exists(select 1 from public.resolve_letter_notification_target(v_notice)) then
    raise exception 'ASSERT inactive notification navigable';
  end if;

  begin
    update public.journal_entries set thread_id=v_root where id=v_withdrawn;
    raise exception 'ASSERT thread metadata mutation succeeded';
  exception when check_violation then null; end;
  begin
    insert into public.journal_entries(
      id,thread_id,reply_to_id,space_id,author_id,recipient_id,entry_type,title,content,
      created_local_date,published_at,locked_at,sealed_at,open_at
    ) values (
      gen_random_uuid(),v_capsule,v_capsule,v_space,v_b,v_a,'future','','invalid future reply',
      (now() at time zone 'Asia/Shanghai')::date,now(),now(),now(),now()+interval '1 day'
    );
    raise exception 'ASSERT future reply shape succeeded';
  exception when check_violation then null; end;

  if has_function_privilege('service_role','public.reply_to_letter(uuid,jsonb,text,text,text)','EXECUTE') then
    raise exception 'ASSERT service_role can execute reply_to_letter';
  end if;
  if not has_function_privilege('authenticated','public.reply_to_letter(uuid,jsonb,text,text,text)','EXECUTE') then
    raise exception 'ASSERT authenticated cannot execute reply_to_letter';
  end if;
end;
$$;

rollback;
