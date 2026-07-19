insert into public.spaces (id, name, timezone)
values ('00000000-0000-4000-8000-000000000001', 'Couple Diary', 'Asia/Shanghai')
on conflict (id) do update
set name = excluded.name,
    timezone = excluded.timezone;

select 'Run npm run seed:couple-users to add the two Auth users to the seeded space.' as seed_instruction;
