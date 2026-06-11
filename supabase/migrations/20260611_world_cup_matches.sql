-- World Cup match schedule system.
-- Import schedule rows into wc_matches; triggers automatically create match_winner markets.

create table if not exists public.wc_matches (
  id uuid primary key default gen_random_uuid(),
  group_name text not null,
  team_home text not null,
  team_away text not null,
  kickoff_time timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'finished')),
  home_score integer,
  away_score integer,
  winner text,
  created_at timestamptz default now()
);

alter table public.wc_markets
  add column if not exists match_id uuid references public.wc_matches(id) on delete cascade;

create unique index if not exists wc_matches_unique_schedule_idx
  on public.wc_matches(group_name, team_home, team_away, kickoff_time);
create index if not exists wc_matches_kickoff_idx
  on public.wc_matches(kickoff_time);
create index if not exists wc_matches_status_idx
  on public.wc_matches(status, kickoff_time);
create unique index if not exists wc_markets_match_winner_unique_idx
  on public.wc_markets(match_id)
  where match_id is not null and market_type = 'match';

create or replace function public.wc_match_slug(
  p_team_home text,
  p_team_away text,
  p_kickoff_time timestamptz
)
returns text
language sql
immutable
as $$
  select lower(
    regexp_replace(
      regexp_replace(
        trim(p_team_home) || '-vs-' || trim(p_team_away) || '-' || to_char(p_kickoff_time at time zone 'UTC', 'YYYYMMDDHH24MI'),
        '[^a-zA-Z0-9]+',
        '-',
        'g'
      ),
      '(^-|-$)',
      '',
      'g'
    )
  )
$$;

create or replace function public.wc_calculate_match_winner(
  p_team_home text,
  p_team_away text,
  p_home_score integer,
  p_away_score integer
)
returns text
language sql
immutable
as $$
  select case
    when p_home_score is null or p_away_score is null then null
    when p_home_score > p_away_score then p_team_home || ' Win'
    when p_home_score < p_away_score then p_team_away || ' Win'
    else 'Draw'
  end
$$;

create or replace function public.wc_upsert_match_market()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  market_slug text;
begin
  market_slug := public.wc_match_slug(new.team_home, new.team_away, new.kickoff_time);

  insert into public.wc_markets (
    match_id,
    slug,
    title,
    description,
    market_type,
    options,
    entry_cost,
    reward_amount,
    status,
    opens_at,
    locks_at,
    settles_at
  )
  values (
    new.id,
    market_slug,
    new.team_home || ' vs ' || new.team_away,
    'Match winner prediction for ' || new.team_home || ' vs ' || new.team_away || '.',
    'match',
    jsonb_build_array(new.team_home || ' Win', 'Draw', new.team_away || ' Win'),
    10,
    30,
    case
      when new.status = 'finished' then 'locked'
      when now() >= new.kickoff_time - interval '1 hour' then 'locked'
      else 'open'
    end,
    least(now(), new.kickoff_time - interval '30 days'),
    new.kickoff_time - interval '1 hour',
    case when new.status = 'finished' then now() else null end
  )
  on conflict (match_id) where match_id is not null and market_type = 'match'
  do update
  set
    slug = excluded.slug,
    title = excluded.title,
    description = excluded.description,
    options = excluded.options,
    locks_at = excluded.locks_at,
    status = case
      when public.wc_markets.status = 'settled' then public.wc_markets.status
      when new.status = 'finished' then 'locked'
      when now() >= new.kickoff_time - interval '1 hour' then 'locked'
      else 'open'
    end;

  return new;
end;
$$;

drop trigger if exists wc_matches_upsert_market on public.wc_matches;
create trigger wc_matches_upsert_market
after insert or update of team_home, team_away, kickoff_time, status
on public.wc_matches
for each row execute function public.wc_upsert_match_market();

create or replace function public.wc_update_match_result()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.home_score is not null and new.away_score is not null then
    new.status := 'finished';
    new.winner := public.wc_calculate_match_winner(new.team_home, new.team_away, new.home_score, new.away_score);
  end if;

  return new;
end;
$$;

drop trigger if exists wc_matches_calculate_result on public.wc_matches;
create trigger wc_matches_calculate_result
before insert or update of home_score, away_score
on public.wc_matches
for each row execute function public.wc_update_match_result();

create or replace function public.wc_settle_finished_match(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  match_record public.wc_matches%rowtype;
  market_record public.wc_markets%rowtype;
begin
  select *
  into match_record
  from public.wc_matches
  where id = p_match_id
  for update;

  if match_record.id is null then
    raise exception 'match not found';
  end if;

  if match_record.status <> 'finished' or match_record.winner is null then
    return jsonb_build_object('settled', false, 'reason', 'match_not_finished');
  end if;

  select *
  into market_record
  from public.wc_markets
  where match_id = match_record.id
    and market_type = 'match'
  for update;

  if market_record.id is null then
    return jsonb_build_object('settled', false, 'reason', 'market_not_found');
  end if;

  if market_record.status = 'settled' then
    return jsonb_build_object('settled', false, 'reason', 'already_settled');
  end if;

  return public.wc_settle_market(market_record.slug, match_record.winner);
end;
$$;

create or replace function public.settleWorldCupMarkets()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  match_record public.wc_matches%rowtype;
  result jsonb;
  settled_count integer := 0;
  paid_coins integer := 0;
begin
  update public.wc_markets
  set status = 'locked'
  where status = 'open'
    and locks_at <= now();

  for match_record in
    select m.*
    from public.wc_matches m
    join public.wc_markets market on market.match_id = m.id and market.market_type = 'match'
    where m.status = 'finished'
      and m.winner is not null
      and market.status <> 'settled'
    order by m.kickoff_time asc
  loop
    result := public.wc_settle_finished_match(match_record.id);
    if coalesce((result ->> 'settled')::boolean, false) then
      settled_count := settled_count + 1;
      paid_coins := paid_coins + coalesce((result ->> 'paid_coins')::integer, 0);
    end if;
  end loop;

  return jsonb_build_object('settled_matches', settled_count, 'paid_coins', paid_coins);
end;
$$;

create or replace function public.wc_get_recent_matches(p_limit integer default 10)
returns table (
  id uuid,
  group_name text,
  team_home text,
  team_away text,
  kickoff_time timestamptz,
  status text,
  home_score integer,
  away_score integer,
  winner text,
  market_slug text,
  market_status text,
  locks_at timestamptz,
  prediction_count bigint
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    m.id,
    m.group_name,
    m.team_home,
    m.team_away,
    m.kickoff_time,
    m.status,
    m.home_score,
    m.away_score,
    m.winner,
    market.slug as market_slug,
    market.status as market_status,
    market.locks_at,
    count(p.id) as prediction_count
  from public.wc_matches m
  left join public.wc_markets market on market.match_id = m.id and market.market_type = 'match'
  left join public.wc_predictions p on p.market_id = market.id
  group by m.id, market.id
  order by
    case
      when m.kickoff_time >= now() then 0
      else 1
    end,
    abs(extract(epoch from (m.kickoff_time - now()))) asc
  limit greatest(1, least(coalesce(p_limit, 10), 50))
$$;

alter table public.wc_matches enable row level security;

drop policy if exists "wc_matches_select_all" on public.wc_matches;
create policy "wc_matches_select_all"
on public.wc_matches for select
to anon, authenticated
using (true);

grant select on public.wc_matches to anon, authenticated;

revoke all on function public.wc_settle_finished_match(uuid) from public, anon, authenticated;
grant execute on function public.wc_settle_finished_match(uuid) to service_role;

revoke all on function public.settleWorldCupMarkets() from public, anon, authenticated;
grant execute on function public.settleWorldCupMarkets() to service_role;

revoke all on function public.wc_get_recent_matches(integer) from public;
grant execute on function public.wc_get_recent_matches(integer) to anon, authenticated;
