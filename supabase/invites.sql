-- PlateTrack: invite-only sign-up for testers.
-- Run once in the Supabase SQL editor (safe to re-run). After that, only emails listed in
-- public.tester_invites can create an account; everyone else gets "not invited" in the app.
-- Accounts that already exist keep working.
--
-- Invite someone:   insert into public.tester_invites (email, note) values ('name@example.com', 'Sam, BCA driver');
-- See the list:     select * from public.tester_invites order by invited_at;
-- Remove an invite: delete from public.tester_invites where email = 'name@example.com';
--                   (this stops a NEW sign-up; delete their account under Authentication -> Users to remove access)
-- Open sign-up to everyone again:  drop trigger if exists pt_require_invite on auth.users;

create table if not exists public.tester_invites (
  email text primary key,
  note text,
  invited_at timestamptz not null default now()
);

-- No policies: the app (and anyone with the public key) can't read or change the list.
alter table public.tester_invites enable row level security;

-- Runs as the table owner so it can read the list while Row Level Security keeps it closed.
create or replace function public.pt_require_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or not exists (
    select 1 from public.tester_invites where lower(email) = lower(trim(new.email))
  ) then
    raise exception 'PlateTrack is invite-only: % has not been invited', coalesce(new.email, '(no email)');
  end if;
  return new;
end $$;

drop trigger if exists pt_require_invite on auth.users;
create trigger pt_require_invite before insert on auth.users
  for each row execute function public.pt_require_invite();
