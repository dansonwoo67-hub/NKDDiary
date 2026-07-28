-- Couple settings with mutual confirmation mechanism
-- 1. Add partner_nickname to profiles (love name for partner)
-- 2. Add theme to spaces (skin/theme)
-- 3. Create couple_setting_requests table for mutual confirmation
-- 4. Add new notification types

begin;

-- 1. Add partner_nickname field to profiles for love name
alter table if exists public.profiles
add column if not exists partner_nickname text check (char_length(partner_nickname) between 1 and 12);

-- 2. Add theme field to spaces
alter table if exists public.spaces
add column if not exists theme text not null default 'cream';

-- 3. Create setting request type enum
create type public.setting_request_type as enum ('space_name', 'relationship_started_on', 'theme');

-- 4. Create setting request status enum
create type public.setting_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

-- 5. Create couple_setting_requests table
create table if not exists public.couple_setting_requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  setting_type public.setting_request_type not null,
  current_value text not null,
  proposed_value text not null,
  status public.setting_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  responder_id uuid references public.profiles(id) on delete cascade,
  cancelled_at timestamptz
);

-- 6. Create unique constraint: only one pending request per space+type
create unique index if not exists couple_setting_requests_unique_pending
on public.couple_setting_requests(space_id, setting_type)
where status = 'pending';

-- 7. Add new notification types
alter type public.notification_type add value if not exists 'space_setting_request';
alter type public.notification_type add value if not exists 'space_setting_response';

-- 8. Enable RLS for the new table
alter table public.couple_setting_requests enable row level security;

-- 9. Create RLS policies
create policy "active members can read setting requests in their space"
on public.couple_setting_requests for select to authenticated
using (public.is_active_space_member(space_id));

create policy "active members can create setting requests"
on public.couple_setting_requests for insert to authenticated
with check (public.is_active_space_member(space_id) and requester_id = auth.uid());

create policy "requester can cancel their own request"
on public.couple_setting_requests for update to authenticated
using (requester_id = auth.uid() and status = 'pending')
with check (requester_id = auth.uid());

create policy "responder can approve/reject"
on public.couple_setting_requests for update to authenticated
using (
  status = 'pending'
  and requester_id <> auth.uid()
  and public.is_active_space_member(space_id)
);

-- 10. Grant permissions
revoke all privileges on table public.couple_setting_requests from anon, authenticated;
grant select on public.couple_setting_requests to authenticated;
grant insert on public.couple_setting_requests to authenticated;
grant update (status, responded_at, responder_id, cancelled_at) on public.couple_setting_requests to authenticated;

-- 11. Add partner_nickname to profiles update permissions
grant update (partner_nickname) on public.profiles to authenticated;

-- 12. Add theme to spaces update permissions
grant update (theme) on public.spaces to authenticated;

commit;
