-- World Cup auto data sync system.
-- Netlify scheduled functions fetch sports data server-side, then service_role writes here.

alter table public.wc_matches
  add column if not exists sports_provider text default 'api-football',
  add column if not exists provider_match_id text,
  add column if not exists raw_payload jsonb default '{}',
  add column if not exists updated_at timestamptz default now();

create unique index if not exists wc_matches_provider_match_unique_idx
  on public.wc_matches(sports_provider, provider_match_id)
  where provider_match_id is not null;

create index if not exists wc_matches_provider_status_idx
  on public.wc_matches(sports_provider, status, kickoff_time);

drop trigger if exists update_wc_matches_updated_at on public.wc_matches;
create trigger update_wc_matches_updated_at
before update on public.wc_matches
for each row execute function public.set_updated_at();

create table if not exists public.sports_provider (
  slug text primary key,
  name text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

insert into public.sports_provider (slug, name, is_active)
values ('api-football', 'API-Football', true)
on conflict (slug) do update
set
  name = excluded.name,
  is_active = excluded.is_active;

create table if not exists public.sports_provider_syncs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'api-football',
  sync_type text not null check (sync_type in ('matches', 'scores', 'settlement')),
  status text not null default 'success' check (status in ('success', 'failed')),
  last_synced_at timestamptz not null default now(),
  message text,
  records_processed integer default 0,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists sports_provider_syncs_lookup_idx
  on public.sports_provider_syncs(provider, sync_type, last_synced_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  created_at timestamptz default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

alter table public.sports_provider_syncs enable row level security;
alter table public.sports_provider enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "sports_provider_select_all" on public.sports_provider;
create policy "sports_provider_select_all"
on public.sports_provider for select
to anon, authenticated
using (true);

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
on public.notifications for select
to authenticated
using (auth.uid() = user_id);

grant select on public.sports_provider to anon, authenticated;
grant select on public.notifications to authenticated;

create or replace function public.wc_record_sync_status(
  p_provider text,
  p_sync_type text,
  p_status text,
  p_message text default null,
  p_records_processed integer default 0,
  p_metadata jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_id uuid;
begin
  insert into public.sports_provider_syncs (
    provider,
    sync_type,
    status,
    message,
    records_processed,
    metadata
  )
  values (
    coalesce(nullif(trim(p_provider), ''), 'api-football'),
    p_sync_type,
    p_status,
    p_message,
    coalesce(p_records_processed, 0),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.wc_get_admin_sync_status()
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  with latest as (
    select distinct on (sync_type)
      sync_type,
      provider,
      status,
      last_synced_at,
      message,
      records_processed
    from public.sports_provider_syncs
    order by sync_type, last_synced_at desc
  )
  select jsonb_build_object(
    'latest_syncs', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'sync_type', sync_type,
            'provider', provider,
            'status', status,
            'last_synced_at', last_synced_at,
            'message', message,
            'records_processed', records_processed
          )
          order by sync_type
        )
        from latest
      ),
      '[]'::jsonb
    ),
    'match_count', (select count(*) from public.wc_matches),
    'scheduled_count', (select count(*) from public.wc_matches where status = 'scheduled'),
    'live_count', (select count(*) from public.wc_matches where status = 'live'),
    'finished_count', (select count(*) from public.wc_matches where status = 'finished'),
    'market_count', (select count(*) from public.wc_markets where market_type = 'match'),
    'pending_settlement_count', (
      select count(*)
      from public.wc_matches m
      join public.wc_markets market on market.match_id = m.id and market.market_type = 'match'
      where m.status = 'finished'
        and m.winner is not null
        and market.status <> 'settled'
    ),
    'settled_market_count', (
      select count(*)
      from public.wc_markets
      where market_type = 'match'
        and status = 'settled'
    )
  )
$$;

create or replace function public.wc_settle_market(
  p_market_slug text,
  p_correct_option text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  market_record public.wc_markets%rowtype;
  prediction_record public.wc_predictions%rowtype;
  paid_count integer := 0;
  paid_coins integer := 0;
begin
  select *
  into market_record
  from public.wc_markets
  where slug = p_market_slug
  for update;

  if market_record.id is null then
    raise exception 'market not found';
  end if;

  if market_record.status = 'settled' then
    return jsonb_build_object('settled', false, 'reason', 'already_settled');
  end if;

  update public.wc_markets
  set
    status = 'settled',
    correct_option = p_correct_option,
    settles_at = coalesce(settles_at, now())
  where id = market_record.id;

  for prediction_record in
    select *
    from public.wc_predictions
    where market_id = market_record.id
      and result = 'pending'
    for update
  loop
    if prediction_record.selected_option = p_correct_option then
      update public.wc_predictions
      set result = 'won',
          reward_paid = true
      where id = prediction_record.id;

      perform public.add_coins(
        prediction_record.user_id,
        prediction_record.potential_reward,
        'world_cup_reward',
        'World Cup Prediction Reward',
        'world_cup',
        jsonb_build_object('market_slug', market_record.slug, 'prediction_id', prediction_record.id)
      );

      insert into public.notifications (user_id, title, message)
      values (
        prediction_record.user_id,
        '世界杯竞猜命中',
        '你在「' || market_record.title || '」中预测成功，获得 ' || prediction_record.potential_reward || ' 金币。'
      );

      paid_count := paid_count + 1;
      paid_coins := paid_coins + prediction_record.potential_reward;

      update public.wc_user_stats
      set
        correct_predictions = correct_predictions + 1,
        coins_won = coins_won + prediction_record.potential_reward,
        profit = profit + prediction_record.potential_reward,
        current_streak = current_streak + 1,
        best_streak = greatest(best_streak, current_streak + 1),
        accuracy_rate = case
          when total_predictions > 0
          then round(((correct_predictions + 1)::numeric / total_predictions) * 100, 2)
          else 0
        end,
        updated_at = now()
      where user_id = prediction_record.user_id;
    else
      update public.wc_predictions
      set result = 'lost',
          reward_paid = false
      where id = prediction_record.id;

      update public.wc_user_stats
      set
        current_streak = 0,
        accuracy_rate = case
          when total_predictions > 0
          then round((correct_predictions::numeric / total_predictions) * 100, 2)
          else 0
        end,
        updated_at = now()
      where user_id = prediction_record.user_id;
    end if;
  end loop;

  return jsonb_build_object(
    'settled',
    true,
    'market_slug',
    market_record.slug,
    'correct_option',
    p_correct_option,
    'paid_predictions',
    paid_count,
    'paid_coins',
    paid_coins
  );
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

  perform public.wc_record_sync_status(
    'internal',
    'settlement',
    'success',
    'Settlement sweep completed.',
    settled_count,
    jsonb_build_object('paid_coins', paid_coins)
  );

  return jsonb_build_object('settled_matches', settled_count, 'paid_coins', paid_coins);
end;
$$;

create or replace function public."settleWorldCupMarkets"()
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select public.settleworldcupmarkets()
$$;

create or replace function public."syncWorldCupMatches"()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.wc_record_sync_status(
    'api-football',
    'matches',
    'success',
    'Manual RPC marker created. Netlify sync-world-cup-matches performs provider API ingestion.',
    0,
    jsonb_build_object('source', 'rpc_marker')
  );

  return public.wc_get_admin_sync_status();
end;
$$;

create or replace function public."syncWorldCupScores"()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.wc_record_sync_status(
    'api-football',
    'scores',
    'success',
    'Manual RPC marker created. Netlify sync-world-cup-scores performs provider API ingestion.',
    0,
    jsonb_build_object('source', 'rpc_marker')
  );

  return public.wc_get_admin_sync_status();
end;
$$;

revoke all on table public.sports_provider_syncs from public, anon, authenticated;

revoke all on function public.wc_record_sync_status(text, text, text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.wc_record_sync_status(text, text, text, text, integer, jsonb) to service_role;

revoke all on function public.wc_get_admin_sync_status() from public;
grant execute on function public.wc_get_admin_sync_status() to anon, authenticated;

revoke all on function public.wc_settle_market(text, text) from public, anon, authenticated;
grant execute on function public.wc_settle_market(text, text) to service_role;

revoke all on function public.settleWorldCupMarkets() from public, anon, authenticated;
grant execute on function public.settleWorldCupMarkets() to service_role;

revoke all on function public."settleWorldCupMarkets"() from public, anon, authenticated;
grant execute on function public."settleWorldCupMarkets"() to service_role;

revoke all on function public."syncWorldCupMatches"() from public, anon, authenticated;
grant execute on function public."syncWorldCupMatches"() to service_role;

revoke all on function public."syncWorldCupScores"() from public, anon, authenticated;
grant execute on function public."syncWorldCupScores"() to service_role;
