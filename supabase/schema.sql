-- =============================================================
--  AI Learning Share — Supabase schema
--  Run this ONCE in: Supabase project -> SQL Editor -> New query -> Run
-- =============================================================

create extension if not exists "pgcrypto";

create table if not exists public.registrations (
  id                  uuid primary key default gen_random_uuid(),
  ticket_code         text not null unique,
  name                text not null,
  email               text not null,
  phone               text not null,
  college             text default '',
  course              text default '',
  year                text default '',

  status              text not null default 'pending'
                        check (status in ('pending','paid','failed','refunded')),

  amount_paise        integer not null default 0,
  currency            text not null default 'INR',

  paid_at             timestamptz,
  attended            boolean not null default false,
  check_in_at         timestamptz,
  notes               text,
  source              text default 'website',

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Fast lookups used by the API
create index if not exists idx_reg_email       on public.registrations (lower(email));
create index if not exists idx_reg_phone       on public.registrations (phone);
create index if not exists idx_reg_status      on public.registrations (status);
create index if not exists idx_reg_created     on public.registrations (created_at desc);

-- Keep updated_at honest even if a row is edited from the Supabase table editor
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_touch on public.registrations;
create trigger trg_touch before update on public.registrations
for each row execute function public.touch_updated_at();

-- =============================================================
--  Security
--  The Node server connects with the SERVICE ROLE key, which
--  bypasses RLS. We still switch RLS on with no public policies,
--  so the anon/publishable key can never read attendee data.
-- =============================================================
alter table public.registrations enable row level security;

-- (Optional) If you later query from the browser with the anon key,
-- add a narrow policy instead of exposing everything, e.g.:
-- create policy "ticket self lookup" on public.registrations
--   for select using (ticket_code = current_setting('app.ticket_code', true));

-- =============================================================
--  Handy view for the dashboard
-- =============================================================
create or replace view public.registrations_summary as
select
  count(*)                                                    as total_registrations,
  count(*) filter (where status = 'paid')                     as paid_count,
  count(*) filter (where status = 'pending')                  as pending_count,
  count(*) filter (where status = 'failed')                   as failed_count,
  coalesce(sum(amount_paise) filter (where status = 'paid'), 0) as revenue_paise,
  count(*) filter (where attended)                            as checked_in
from public.registrations;

-- =============================================================
--  OPTIONAL: realtime so the admin dashboard updates live
--  Supabase -> Database -> Replication -> add `registrations`
-- =============================================================
-- alter publication supabase_realtime add table public.registrations;
