begin;

do $$
declare
  v_actor uuid;
  v_space uuid;
  v_request public.couple_setting_requests;
  v_signature regprocedure := 'public.create_couple_setting_request(public.setting_request_type,text,text)'::regprocedure;
  v_return_type regtype;
  v_security_definer boolean;
  v_config text[];
begin
  select procedure.prorettype::regtype, procedure.prosecdef, procedure.proconfig
  into v_return_type, v_security_definer, v_config
  from pg_proc as procedure
  where procedure.oid = v_signature;

  if v_return_type <> 'public.couple_setting_requests'::regtype then
    raise exception 'ASSERT: RPC return type changed: %', v_return_type;
  end if;

  if not v_security_definer then
    raise exception 'ASSERT: RPC must remain SECURITY DEFINER';
  end if;

  if not ('search_path=""' = any(v_config)) then
    raise exception 'ASSERT: RPC search_path is not empty: %', v_config;
  end if;

  if has_function_privilege('anon', v_signature, 'execute') then
    raise exception 'ASSERT: anon must not execute create_couple_setting_request';
  end if;

  if not has_function_privilege('authenticated', v_signature, 'execute') then
    raise exception 'ASSERT: authenticated execute grant is missing';
  end if;

  if not has_function_privilege('service_role', v_signature, 'execute') then
    raise exception 'ASSERT: service_role execute grant is missing';
  end if;

  select member.user_id, member.space_id
  into v_actor, v_space
  from public.space_members as member
  join auth.users as account on account.id = member.user_id
  where member.active
    and account.raw_app_meta_data ->> 'e2e_fixture' = 'true'
  order by member.user_id
  limit 1;

  if v_actor is null or v_space is null then
    raise exception 'ASSERT: dedicated E2E member fixture is unavailable';
  end if;

  delete from public.couple_setting_requests
  where space_id = v_space
    and setting_type = 'space_name'
    and status = 'pending';

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_actor, 'role', 'authenticated')::text,
    true
  );

  v_request := public.create_couple_setting_request(
    'space_name',
    'e2e-current',
    'e2e-proposed'
  );

  if v_request.id is null
    or v_request.space_id <> v_space
    or v_request.requester_id <> v_actor
    or v_request.status <> 'pending' then
    raise exception 'ASSERT: authorized member did not receive the expected request row';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text,
    true
  );

  begin
    perform public.create_couple_setting_request(
      'theme',
      'e2e-current',
      'e2e-proposed'
    );
    raise exception 'ASSERT: non-member call unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'ASSERT: non-member call unexpectedly succeeded' then
      raise;
    end if;
    if sqlstate <> '42501' or position('not a space member' in sqlerrm) = 0 then
      raise exception 'ASSERT: non-member failure changed: [%] %', sqlstate, sqlerrm;
    end if;
  end;
end;
$$;

rollback;
