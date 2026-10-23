-- =============================================================
-- Formly database setup
-- Paste ALL of this into Supabase → SQL Editor → New query → Run
-- (Safe to run more than once.)
-- =============================================================

-- One row per person who signs up.
-- We store ONLY: email, Telegram, plan and usage counts.
-- Profiles, documents and form answers stay on the user's computer.
create table if not exists public.users (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  telegram        text not null,
  token_hash      text not null unique,          -- their sign-in token, scrambled (never the real token)
  status          text not null default 'active'
                  check (status in ('active', 'pro', 'blocked')),
  forms_used      integer not null default 0,     -- free forms used so far
  wants_pro       boolean not null default false, -- clicked "Notify me" for Formly Pro
  consent_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  last_active_at  timestamptz
);
create unique index if not exists users_email_unique on public.users (lower(email));

-- One row every time someone uses Formly (for counting only).
-- page_key is a scrambled code of the form's web address: we can tell
-- "same form again" apart from "new form" without knowing which website it was.
create table if not exists public.events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.users (id) on delete cascade,
  kind        text not null check (kind in ('fill', 'learn', 'extract')),
  page_key    text,
  created_at  timestamptz not null default now()
);
create index if not exists events_user_time on public.events (user_id, created_at);
create index if not exists events_user_page on public.events (user_id, page_key);

-- Lock the tables: nobody can read them from the internet.
-- Only the Formly server (which has the secret key) and you (in the dashboard) can.
alter table public.users  enable row level security;
alter table public.events enable row level security;
revoke all on public.users  from anon, authenticated;
revoke all on public.events from anon, authenticated;

-- =============================================================
-- YOUR TRACTION NUMBERS (one row)
-- See it in: Table Editor → traction   (or run: select * from traction;)
-- =============================================================
create or replace view public.traction with (security_invoker = true) as
select
  (select count(*) from public.users)                                        as total_signups,
  (select count(distinct user_id) from public.events where kind = 'fill')    as users_who_filled_a_form,
  (select count(distinct user_id) from public.events
     where kind = 'fill' and created_at > now() - interval '7 days')         as active_last_7_days,
  (select count(distinct (user_id, page_key)) from public.events
     where kind = 'fill')                                                    as forms_filled,
  (select count(*) from public.users where status <> 'pro' and forms_used >= 3) as used_all_free_forms,
  (select count(*) from public.users where wants_pro)                        as want_pro;
revoke all on public.traction from anon, authenticated;

-- Sign-ups per week (for a growth chart)
create or replace view public.signups_per_week with (security_invoker = true) as
select date_trunc('week', created_at)::date as week_starting, count(*) as signups
from public.users
group by 1
order by 1;
revoke all on public.signups_per_week from anon, authenticated;
