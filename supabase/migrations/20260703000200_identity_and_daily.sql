-- Draw & Order — Phases 5 & 6: anon→auth migration, leaderboard pagination,
-- handle hardening.
--
--   * claimed_anon_ids burns an anonId the moment an account claims it, so
--     the same id can never be replayed into a second account.
--   * claim_anon_rounds performs the whole one-time claim transactionally:
--     burn first, resolve daily-uniqueness conflicts by keeping the higher
--     score, then reassign the surviving rounds.
--   * daily_leaderboard gains an offset so the board can paginate.
--   * profiles.handle writes move behind the API (the profanity filter has to
--     run server-side to mean anything), so direct write grants are pulled.

-- ---------------------------------------------------------------------------
-- claimed_anon_ids — one row per burned anonymous id (service role only)
-- ---------------------------------------------------------------------------

create table public.claimed_anon_ids (
  anon_id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  claimed_at timestamptz not null default now()
);

comment on table public.claimed_anon_ids is
  'Burned anonymous ids: once claimed into an account, an anonId can never '
  'be claimed again (service role only).';

alter table public.claimed_anon_ids enable row level security;
-- No policies on purpose; the anon/authenticated roles get nothing at all.
revoke all on table public.claimed_anon_ids from anon, authenticated;

-- ---------------------------------------------------------------------------
-- claim_anon_rounds(anon_id, user_id) — the one-time migration (Phase 5).
--
-- Returns jsonb:
--   { status: 'claimed' | 'already_claimed' | 'burned',
--     claimed: <rounds moved>, dropped_drawings: [paths of deleted losers] }
--
-- Daily-uniqueness conflicts (both identities played the same date) keep the
-- higher score; ties keep the account's round. The losing round is deleted —
-- "resolved by keeping the higher score" means exactly one row survives per
-- (identity, daily_date), and a leftover scored anon round would haunt the
-- leaderboard as a duplicate "Unknown Detective" entry.
-- ---------------------------------------------------------------------------

create or replace function public.claim_anon_rounds(p_anon_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_claim public.claimed_anon_ids%rowtype;
  dropped_paths text[] := '{}';
  claimed_count integer := 0;
begin
  select * into prior_claim
  from public.claimed_anon_ids
  where anon_id = p_anon_id;

  if found then
    if prior_claim.user_id = p_user_id then
      -- A retry of a claim that already went through — idempotent success.
      return jsonb_build_object(
        'status', 'already_claimed', 'claimed', 0,
        'dropped_drawings', to_jsonb(dropped_paths));
    end if;
    return jsonb_build_object(
      'status', 'burned', 'claimed', 0,
      'dropped_drawings', to_jsonb(dropped_paths));
  end if;

  -- Burn first: concurrent claims race to this insert, and the loser of the
  -- race errors out of the transaction without touching any rounds.
  insert into public.claimed_anon_ids (anon_id, user_id)
  values (p_anon_id, p_user_id);

  with conflicts as (
    select
      a.id as anon_round,
      u.id as user_round,
      coalesce(a.final_score, -1) as anon_score,
      coalesce(u.final_score, -1) as user_score,
      a.drawing_path as anon_path,
      u.drawing_path as user_path
    from public.rounds a
    join public.rounds u
      on u.user_id = p_user_id
     and u.mode = 'daily'
     and u.daily_date = a.daily_date
    where a.anon_id = p_anon_id
      and a.mode = 'daily'
  ),
  losers as (
    select
      case when anon_score > user_score then user_round else anon_round end
        as round_id,
      case when anon_score > user_score then user_path else anon_path end
        as drawing_path
    from conflicts
  ),
  deleted as (
    delete from public.rounds r
    using losers l
    where r.id = l.round_id
    returning l.drawing_path
  )
  select coalesce(
           array_agg(d.drawing_path) filter (where d.drawing_path is not null),
           '{}')
    into dropped_paths
  from deleted d;

  update public.rounds
     set user_id = p_user_id,
         anon_id = null
   where anon_id = p_anon_id;
  get diagnostics claimed_count = row_count;

  return jsonb_build_object(
    'status', 'claimed',
    'claimed', claimed_count,
    'dropped_drawings', to_jsonb(dropped_paths));
end;
$$;

revoke all on function public.claim_anon_rounds(uuid, uuid) from public;
grant execute on function public.claim_anon_rounds(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- daily_leaderboard — add pagination (skip_n). Ranks are computed over the
-- whole board before the offset applies, so page 2 starts at rank 21.
-- ---------------------------------------------------------------------------

drop function public.daily_leaderboard(date, integer);

create function public.daily_leaderboard(
  for_date date,
  top_n integer default 20,
  skip_n integer default 0
)
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
  offset greatest(coalesce(skip_n, 0), 0)
  limit least(greatest(coalesce(top_n, 20), 1), 100);
$$;

revoke all on function public.daily_leaderboard(date, integer, integer) from public;
grant execute on function public.daily_leaderboard(date, integer, integer)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- profiles — handle edits now go through POST /api/profile so the profanity
-- filter is enforced server-side; direct client writes are closed off. The
-- length check is belt-and-suspenders under the app-level rules.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add constraint profiles_handle_length
  check (char_length(handle) between 3 and 32);

drop policy "profiles_insert_own" on public.profiles;
drop policy "profiles_update_own" on public.profiles;
revoke insert, update, delete on table public.profiles from anon, authenticated;