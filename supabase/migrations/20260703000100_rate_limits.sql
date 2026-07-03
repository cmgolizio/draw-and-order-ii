-- Draw & Order — Phase 4: Postgres-based sliding-window rate limiting.
--
-- One row per allowed hit. The API layer (service role) calls rate_limit_hit
-- for every guarded action: round creation / submissions per IP and per
-- identity, plus the global judge-call budget (the per-day spend circuit
-- breaker). Clients never touch this table.

create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  key text not null,
  at timestamptz not null default now()
);

comment on table public.rate_limit_events is
  'Sliding-window rate limiting. Written only via rate_limit_hit (service role).';
comment on column public.rate_limit_events.bucket is
  'What is being limited, e.g. submit-ip, create-id, judge-global.';
comment on column public.rate_limit_events.key is
  'Who is being limited: an IP, a user/anon id, or "global".';

create index rate_limit_events_lookup_idx
  on public.rate_limit_events (bucket, key, at desc);

alter table public.rate_limit_events enable row level security;
-- No policies on purpose; the anon/authenticated roles get nothing at all.
revoke all on table public.rate_limit_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- rate_limit_hit(bucket, key, window_seconds, max_hits) -> allowed?
--
-- Counts hits inside the sliding window; records the hit only when allowed,
-- so blocked attempts never extend a lockout. Single round trip per check.
-- ---------------------------------------------------------------------------

create or replace function public.rate_limit_hit(
  p_bucket text,
  p_key text,
  p_window_seconds integer,
  p_max integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  hits integer;
begin
  select count(*) into hits
  from public.rate_limit_events
  where bucket = p_bucket
    and key = p_key
    and at > now() - make_interval(secs => p_window_seconds);

  if hits >= p_max then
    return false;
  end if;

  insert into public.rate_limit_events (bucket, key) values (p_bucket, p_key);
  return true;
end;
$$;

revoke all on function public.rate_limit_hit(text, text, integer, integer) from public;
grant execute on function public.rate_limit_hit(text, text, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- rate_limit_gc() — drop events past every window we use (the longest is the
-- 24h judge budget). Called opportunistically from the API layer; there is no
-- pg_cron dependency.
-- ---------------------------------------------------------------------------

create or replace function public.rate_limit_gc()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.rate_limit_events where at < now() - interval '48 hours';
$$;

revoke all on function public.rate_limit_gc() from public;
grant execute on function public.rate_limit_gc() to service_role;