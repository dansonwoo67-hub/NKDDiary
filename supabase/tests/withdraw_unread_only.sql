begin;

do $$
declare
  v_author uuid;
  v_recipient uuid;
  v_space uuid;
  v_unread uuid := gen_random_uuid();
  v_read uuid := gen_random_uuid();
  v_capsule uuid := gen_random_uuid();
  v_today date := (now() at time zone 'Asia/Taipei')::date;
begin
  select member.user_id, member.space_id
  into v_author, v_space
  from public.space_members as member
  join auth.users as account on account.id = member.user_id
  where member.active
    and account.raw_app_meta_data ->> 'e2e_fixture' = 'true'
  order by member.user_id
  limit 1;

  select member.user_id
  into v_recipient
  from public.space_members as member
  join auth.users as account on account.id = member.user_id
  where member.space_id = v_space
    and member.active
    and member.user_id <> v_author
    and account.raw_app_meta_data ->> 'e2e_fixture' = 'true'
  limit 1;

  if v_author is null or v_recipient is null or v_space is null then
    raise exception 'ASSERT: dedicated E2E couple fixture is unavailable';
  end if;

  insert into public.journal_entries(
    id, space_id, author_id, recipient_id, entry_type, title, content,
    entry_date, created_local_date, locked_at, sealed_at, open_at, status
  ) values
    (v_unread, v_space, v_author, v_recipient, 'today', '',
     'e2e_withdraw_unread', v_today, v_today, now() + interval '24 hours', null, null, 'sent'),
    (v_read, v_space, v_author, v_recipient, 'today', '',
     'e2e_withdraw_read', v_today, v_today, now() + interval '24 hours', null, null, 'sent'),
    (v_capsule, v_space, v_author, v_recipient, 'future', '',
     'e2e_withdraw_capsule', null, v_today, now() + interval '24 hours', now(), now() + interval '1 day', 'sent');

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_author, 'role', 'authenticated')::text,
    true
  );
  perform public.withdraw_letter_diary(v_unread);

  if not exists (
    select 1 from public.journal_entries
    where id = v_unread and withdrawn_at is not null
  ) then
    raise exception 'ASSERT: unread ordinary letter was not withdrawn';
  end if;

  if exists (
    select 1 from public.notifications
    where source_id = v_unread and is_active
  ) then
    raise exception 'ASSERT: unread withdrawal left an active notification';
  end if;

  begin
    perform public.withdraw_letter_diary(v_unread);
    raise exception 'ASSERT: repeated withdrawal unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'ASSERT: repeated withdrawal unexpectedly succeeded' then
      raise;
    end if;
    if position('letter already withdrawn' in sqlerrm) = 0 then
      raise exception 'ASSERT: repeat result was not already-withdrawn: %', sqlerrm;
    end if;
  end;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_recipient, 'role', 'authenticated')::text,
    true
  );
  perform public.mark_letter_read(v_read);

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_author, 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.withdraw_letter_diary(v_read);
    raise exception 'ASSERT: read letter withdrawal unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'ASSERT: read letter withdrawal unexpectedly succeeded' then
      raise;
    end if;
    if position('letter already read' in sqlerrm) = 0 then
      raise exception 'ASSERT: read result was not already-read: %', sqlerrm;
    end if;
  end;

  if exists (
    select 1 from public.journal_entries
    where id = v_read and withdrawn_at is not null
  ) then
    raise exception 'ASSERT: read letter became withdrawn';
  end if;

  begin
    perform public.withdraw_letter_diary(v_capsule);
    raise exception 'ASSERT: capsule withdrawal unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'ASSERT: capsule withdrawal unexpectedly succeeded' then
      raise;
    end if;
    if position('capsule letters cannot be withdrawn' in sqlerrm) = 0 then
      raise exception 'ASSERT: capsule result changed: %', sqlerrm;
    end if;
  end;
end;
$$;

rollback;
