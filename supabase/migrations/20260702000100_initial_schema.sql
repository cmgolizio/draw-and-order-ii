-- Draw & Order — Phase 1: core schema, RLS, views, RPCs.
--
-- Security model (locked decisions):
--   * Clients never see suspects.image_path or non-live suspects: reads go
--     through the security-barrier view `suspects_public`.
--   * Anonymous rounds are written by server routes using the service role;
--     anon_id claims are never trusted client-side for reads.
--   * All writes to suspects / daily_suspects are pipeline / service-role only.

-- ---------------------------------------------------------------------------
-- suspects — the pre-generated pool (offline content pipeline, Phase 2)
-- ---------------------------------------------------------------------------

create table public.suspects (
  id uuid primary key default gen_random_uuid(),
  difficulty text not null
    check (difficulty in ('rookie', 'detective', 'cold_case')),
  statement text not null,
  statement_teaser text not null,
  traits jsonb not null default '{}'::jsonb,
  image_path text,
  silhouette_path text,
  status text not null default 'review'
    check (status in ('draft', 'review', 'live', 'retired')),
  model_info jsonb,
  created_at timestamptz not null default now()
);

comment on table public.suspects is
  'Pre-generated suspect pool. image_path must NEVER reach the client role.';
comment on column public.suspects.statement is
  'Witness statement players see; vagueness encodes difficulty.';
comment on column public.suspects.traits is
  'Canonical trait sheet used at generation time; source of truth for scoring.';
comment on column public.suspects.image_path is
  'PRIVATE bucket path. Served only via short-lived signed URL at reveal.';
comment on column public.suspects.silhouette_path is
  'Pre-rendered guide overlay; safe to serve to clients.';
comment on column public.suspects.model_info is
  'Prompt version, image model, generation params.';

create index suspects_status_difficulty_idx
  on public.suspects (status, difficulty);

-- ---------------------------------------------------------------------------
-- daily_suspects — one suspect per calendar date
-- ---------------------------------------------------------------------------

create table public.daily_suspects (
  date date primary key,
  suspect_id uuid not null unique references public.suspects (id)
);

comment on table public.daily_suspects is
  'Daily assignment; unique(suspect_id) means a suspect is daily at most once.';

-- ---------------------------------------------------------------------------
-- profiles — 1:1 with auth.users
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique,
  created_at timestamptz not null default now()
);

comment on column public.profiles.handle is
  'Generated detective-style handle, user-editable (profanity-filtered in app).';

-- ---------------------------------------------------------------------------
-- rounds — one play of one suspect
-- ---------------------------------------------------------------------------

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  anon_id uuid,
  suspect_id uuid not null references public.suspects (id),
  mode text not null check (mode in ('practice', 'daily')),
  daily_date date,
  drawing_path text,
  stroke_data jsonb,
  final_score numeric,
  score_breakdown jsonb,
  duration_seconds integer,
  revealed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint rounds_identity_present
    check (user_id is not null or anon_id is not null),
  constraint rounds_daily_date_matches_mode
    check ((mode = 'daily') = (daily_date is not null))
);

comment on column public.rounds.anon_id is
  'Client-generated uuid for pre-auth rounds; only ever honored server-side.';
comment on column public.rounds.drawing_path is 'Private bucket path.';
comment on column public.rounds.stroke_data is
  'Compressed stroke log for replay; size-capped in app (~200KB).';
comment on column public.rounds.score_breakdown is
  'Trait scores + judge feedback (includes used_guide flag).';

-- One daily round per identity per date.
create unique index rounds_one_daily_per_user_idx
  on public.rounds (user_id, daily_date)
  where mode = 'daily' and user_id is not null;

create unique index rounds_one_daily_per_anon_idx
  on public.rounds (anon_id, daily_date)
  where mode = 'daily' and anon_id is not null;

create index rounds_user_created_idx
  on public.rounds (user_id, created_at desc);

create index rounds_daily_leaderboard_idx
  on public.rounds (daily_date, final_score desc)
  where mode = 'daily';

create index rounds_suspect_id_idx on public.rounds (suspect_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.suspects enable row level security;
alter table public.daily_suspects enable row level security;
alter table public.profiles enable row level security;
alter table public.rounds enable row level security;

-- Belt and suspenders: even a future accidental permissive policy on the base
-- tables must not expose them — pull the underlying grants entirely.
revoke all on table public.suspects from anon, authenticated;
revoke all on table public.daily_suspects from anon, authenticated;

-- profiles: users manage their own row (creation handled at signup, Phase 5).
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- rounds: authed users read/insert their own. No anon policies on purpose —
-- anonymous rounds go through server routes with the service role.
create policy "rounds_select_own"
  on public.rounds for select to authenticated
  using (user_id = (select auth.uid()));

create policy "rounds_insert_own"
  on public.rounds for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- suspects_public — the ONLY client-readable window into suspects.
-- Security-barrier view owned by postgres (bypasses the base-table denial by
-- design); exposes safe columns of live suspects only.
-- ---------------------------------------------------------------------------

create view public.suspects_public
  with (security_barrier = true) as
  select
    id,
    difficulty,
    statement,
    statement_teaser,
    silhouette_path
  from public.suspects
  where status = 'live';

comment on view public.suspects_public is
  'Client-safe projection of live suspects. Intentionally SECURITY DEFINER '
  '(owner-rights) so clients can read it while the base table stays sealed.';

grant select on public.suspects_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs (SECURITY DEFINER — never direct table access)
-- ---------------------------------------------------------------------------

-- Top N for a date, joined to handles; anon rounds shown as
-- "Unknown Detective #xxxx" from the tail of their anon_id.
create or replace function public.daily_leaderboard(for_date date, top_n integer default 20)
returns table (rank bigint, handle text, final_score numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    row_number() over (order by r.final_score desc, r.created_at asc) as rank,
    coalesce(
      p.handle,
      'Unknown Detective #' || upper(right(r.anon_id::text, 4))
    ) as handle,
    r.final_score
  from public.rounds r
  left join public.profiles p on p.id = r.user_id
  where r.mode = 'daily'
    and r.daily_date = for_date
    and r.final_score is not null
  order by r.final_score desc, r.created_at asc
  limit least(greatest(top_n, 1), 100);
$$;

revoke all on function public.daily_leaderboard(date, integer) from public;
grant execute on function public.daily_leaderboard(date, integer)
  to anon, authenticated, service_role;

-- Rounds played, avg/best score, current daily streak. Callers may only ask
-- about themselves; the streak counts consecutive scored dailies anchored at
-- today or yesterday.
create or replace function public.user_stats(for_user uuid)
returns table (
  rounds_played bigint,
  avg_score numeric,
  best_score numeric,
  daily_streak integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  streak integer := 0;
  anchor date;
begin
  if for_user is null or for_user is distinct from (select auth.uid()) then
    raise exception 'user_stats: callers may only request their own stats';
  end if;

  select max(r.daily_date) into anchor
  from public.rounds r
  where r.user_id = for_user
    and r.mode = 'daily'
    and r.final_score is not null;

  if anchor is not null and anchor >= (current_date - 1) then
    select count(*)::integer into streak
    from (
      select d.daily_date,
             row_number() over (order by d.daily_date desc) as rn
      from (
        select distinct r.daily_date
        from public.rounds r
        where r.user_id = for_user
          and r.mode = 'daily'
          and r.final_score is not null
      ) d
    ) seq
    -- Dates strictly decrease, so equality holds exactly until the first gap.
    where seq.daily_date = anchor - (seq.rn - 1)::integer;
  end if;

  return query
  select
    count(*)::bigint,
    round(avg(r.final_score), 1),
    max(r.final_score),
    streak
  from public.rounds r
  where r.user_id = for_user
    and r.final_score is not null;
end;
$$;

revoke all on function public.user_stats(uuid) from public;
grant execute on function public.user_stats(uuid) to authenticated, service_role;