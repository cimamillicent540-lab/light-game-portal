-- World Cup Prediction Challenge 2026 V1
-- Entertainment-only coin prediction event. No fiat, crypto, withdrawal, or user-to-user trading.

alter table public.coin_transactions
  drop constraint if exists coin_transactions_type_check;

alter table public.coin_transactions
  add constraint coin_transactions_type_check
  check (
    type in (
      'signup_bonus',
      'daily_checkin',
      'game_reward',
      'game_spend',
      'referral_bonus',
      'vip_purchase',
      'paypal_purchase',
      'admin_adjust',
      'world_cup_prediction',
      'world_cup_reward',
      'world_cup_ai_analysis',
      'world_cup_cosmetic',
      'world_cup_task',
      'world_cup_referral'
    )
  );

create table if not exists public.event_config (
  event_key text primary key default 'world_cup_2026',
  event_enabled boolean default true,
  event_start timestamptz not null,
  event_end timestamptz not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.wc_markets (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  market_type text not null check (market_type in ('match', 'group', 'champion', 'golden_boot', 'special')),
  options jsonb not null default '[]'::jsonb,
  entry_cost integer not null check (entry_cost > 0),
  reward_amount integer not null check (reward_amount > 0),
  status text not null default 'open' check (status in ('open', 'locked', 'settled', 'cancelled')),
  opens_at timestamptz not null,
  locks_at timestamptz not null,
  settles_at timestamptz,
  correct_option text,
  created_at timestamptz default now()
);

create table if not exists public.wc_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  market_id uuid references public.wc_markets(id) on delete cascade,
  selected_option text not null,
  coins_spent integer not null check (coins_spent > 0),
  potential_reward integer not null check (potential_reward > 0),
  result text not null default 'pending' check (result in ('pending', 'won', 'lost', 'cancelled')),
  reward_paid boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.wc_user_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  total_predictions integer default 0,
  correct_predictions integer default 0,
  accuracy_rate numeric(6,2) default 0,
  coins_won integer default 0,
  coins_spent integer default 0,
  profit integer default 0,
  current_streak integer default 0,
  best_streak integer default 0,
  updated_at timestamptz default now()
);

create table if not exists public.wc_ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  usage_date date not null default current_date,
  market_id uuid references public.wc_markets(id) on delete set null,
  coins_spent integer default 0,
  created_at timestamptz default now(),
  unique(user_id, usage_date)
);

create table if not exists public.wc_daily_task_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  task_date date not null default current_date,
  prediction_count integer not null,
  reward_amount integer not null,
  created_at timestamptz default now(),
  unique(user_id, task_date, prediction_count)
);

create unique index if not exists wc_predictions_user_market_unique_idx
  on public.wc_predictions(user_id, market_id);
create index if not exists wc_predictions_user_created_idx
  on public.wc_predictions(user_id, created_at desc);
create index if not exists wc_predictions_market_idx
  on public.wc_predictions(market_id);
create index if not exists wc_markets_status_locks_idx
  on public.wc_markets(status, locks_at);
create index if not exists wc_user_stats_profit_idx
  on public.wc_user_stats(profit desc, accuracy_rate desc);

drop trigger if exists set_event_config_updated_at on public.event_config;
create trigger set_event_config_updated_at
before update on public.event_config
for each row execute function public.set_updated_at();

insert into public.event_config (event_key, event_enabled, event_start, event_end)
values ('world_cup_2026', true, '2026-06-11 00:00:00+00', '2026-07-22 23:59:59+00')
on conflict (event_key) do update
set
  event_enabled = excluded.event_enabled,
  event_start = excluded.event_start,
  event_end = excluded.event_end,
  updated_at = now();

insert into public.wc_markets (
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
values
  (
    'opening-match-winner',
    'Opening Match Winner',
    'Pick the result of the 2026 World Cup opening match.',
    'match',
    '["Home Win", "Draw", "Away Win"]'::jsonb,
    10,
    30,
    'open',
    '2026-06-11 00:00:00+00',
    '2026-06-11 23:00:00+00',
    '2026-06-12 04:00:00+00'
  ),
  (
    'group-a-winner',
    'Group A Winner',
    'Pick which team finishes first in Group A.',
    'group',
    '["Mexico", "South Africa", "South Korea", "Other"]'::jsonb,
    20,
    120,
    'open',
    '2026-06-11 00:00:00+00',
    '2026-06-24 23:00:00+00',
    '2026-06-25 04:00:00+00'
  ),
  (
    'world-cup-2026-champion',
    'Who will win World Cup 2026?',
    'Pick the tournament champion.',
    'champion',
    '["Brazil", "France", "Argentina", "Spain", "Germany"]'::jsonb,
    50,
    500,
    'open',
    '2026-06-11 00:00:00+00',
    '2026-06-30 23:59:59+00',
    '2026-07-20 04:00:00+00'
  ),
  (
    'world-cup-2026-golden-boot',
    'Golden Boot Winner',
    'Pick the top goal scorer of the tournament.',
    'golden_boot',
    '["Kylian Mbappe", "Harry Kane", "Erling Haaland", "Vinicius Junior", "Other"]'::jsonb,
    50,
    600,
    'open',
    '2026-06-11 00:00:00+00',
    '2026-06-30 23:59:59+00',
    '2026-07-20 04:00:00+00'
  )
on conflict (slug) do update
set
  title = excluded.title,
  description = excluded.description,
  market_type = excluded.market_type,
  options = excluded.options,
  entry_cost = excluded.entry_cost,
  reward_amount = excluded.reward_amount,
  opens_at = excluded.opens_at,
  locks_at = excluded.locks_at,
  settles_at = excluded.settles_at;

create or replace function public.add_coins(
  p_user_id uuid,
  p_amount integer,
  p_type text,
  p_description text default null,
  p_source text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'coin amount must be greater than zero';
  end if;

  if p_type not in (
    'signup_bonus',
    'daily_checkin',
    'game_reward',
    'referral_bonus',
    'paypal_purchase',
    'admin_adjust',
    'world_cup_reward',
    'world_cup_task',
    'world_cup_referral'
  ) then
    raise exception 'invalid coin transaction type for add_coins: %', p_type;
  end if;

  insert into public.wallets (user_id, balance, total_earned, total_spent)
  values (p_user_id, 0, 0, 0)
  on conflict (user_id) do nothing;

  update public.wallets
  set
    balance = balance + p_amount,
    total_earned = total_earned + p_amount,
    updated_at = now()
  where user_id = p_user_id
  returning balance into new_balance;

  if new_balance is null then
    raise exception 'wallet not found for user %', p_user_id;
  end if;

  insert into public.coin_transactions (
    user_id,
    amount,
    balance_after,
    type,
    description,
    source,
    metadata
  )
  values (
    p_user_id,
    p_amount,
    new_balance,
    p_type,
    p_description,
    p_source,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return new_balance;
end;
$$;

create or replace function public.spend_coins(
  p_user_id uuid,
  p_amount integer,
  p_type text,
  p_description text default null,
  p_source text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_balance integer;
  new_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'coin amount must be greater than zero';
  end if;

  if p_type not in (
    'game_spend',
    'vip_purchase',
    'admin_adjust',
    'world_cup_prediction',
    'world_cup_ai_analysis',
    'world_cup_cosmetic'
  ) then
    raise exception 'invalid coin transaction type for spend_coins: %', p_type;
  end if;

  select balance
  into current_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if current_balance is null then
    raise exception 'wallet not found for user %', p_user_id;
  end if;

  if current_balance < p_amount then
    raise exception 'insufficient coin balance';
  end if;

  update public.wallets
  set
    balance = balance - p_amount,
    total_spent = total_spent + p_amount,
    updated_at = now()
  where user_id = p_user_id
  returning balance into new_balance;

  insert into public.coin_transactions (
    user_id,
    amount,
    balance_after,
    type,
    description,
    source,
    metadata
  )
  values (
    p_user_id,
    -p_amount,
    new_balance,
    p_type,
    p_description,
    p_source,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return new_balance;
end;
$$;

create or replace function public.wc_event_is_active()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(event_enabled, false)
    and now() >= event_start
    and now() <= event_end
  from public.event_config
  where event_key = 'world_cup_2026'
$$;

create or replace function public.wc_vip_multiplier(p_vip_level text)
returns numeric
language sql
immutable
as $$
  select case
    when lower(coalesce(p_vip_level, 'free')) in ('vip3', 'yearly_vip') then 2.0
    when lower(coalesce(p_vip_level, 'free')) in ('vip2', 'quarterly_vip') then 1.5
    when lower(coalesce(p_vip_level, 'free')) in ('vip1', 'monthly_vip') then 1.2
    else 1.0
  end
$$;

create or replace function public.wc_place_prediction(
  p_market_slug text,
  p_selected_option text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  market_record public.wc_markets%rowtype;
  multiplier numeric;
  reward integer;
  prediction_id uuid;
  new_balance integer;
  today_count integer;
  task_reward integer := 0;
begin
  if current_user_id is null then
    raise exception 'login required';
  end if;

  if not public.wc_event_is_active() then
    raise exception 'world cup event is not active';
  end if;

  select *
  into market_record
  from public.wc_markets
  where slug = p_market_slug
  for update;

  if market_record.id is null then
    raise exception 'market not found: %', p_market_slug;
  end if;

  if market_record.status <> 'open' or now() < market_record.opens_at or now() >= market_record.locks_at then
    raise exception 'market is not open';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements_text(market_record.options) as option_value(value)
    where option_value.value = p_selected_option
  ) then
    raise exception 'invalid selected option';
  end if;

  select public.wc_vip_multiplier(vip_level)
  into multiplier
  from public.profiles
  where id = current_user_id;

  reward := floor(market_record.reward_amount * coalesce(multiplier, 1.0))::integer;

  new_balance := public.spend_coins(
    current_user_id,
    market_record.entry_cost,
    'world_cup_prediction',
    'World Cup Prediction Entry',
    'world_cup',
    jsonb_build_object('market_slug', market_record.slug, 'selected_option', p_selected_option)
  );

  insert into public.wc_predictions (
    user_id,
    market_id,
    selected_option,
    coins_spent,
    potential_reward
  )
  values (
    current_user_id,
    market_record.id,
    p_selected_option,
    market_record.entry_cost,
    reward
  )
  returning id into prediction_id;

  insert into public.wc_user_stats (user_id, total_predictions, coins_spent, profit)
  values (current_user_id, 1, market_record.entry_cost, -market_record.entry_cost)
  on conflict (user_id) do update
  set
    total_predictions = public.wc_user_stats.total_predictions + 1,
    coins_spent = public.wc_user_stats.coins_spent + excluded.coins_spent,
    profit = public.wc_user_stats.profit - excluded.coins_spent,
    accuracy_rate = case
      when public.wc_user_stats.total_predictions + 1 > 0
      then round((public.wc_user_stats.correct_predictions::numeric / (public.wc_user_stats.total_predictions + 1)) * 100, 2)
      else 0
    end,
    updated_at = now();

  select count(*)
  into today_count
  from public.wc_predictions
  where user_id = current_user_id
    and created_at::date = current_date;

  if today_count in (1, 3, 5) then
    task_reward := case today_count
      when 1 then 20
      when 3 then 50
      when 5 then 100
      else 0
    end;

    insert into public.wc_daily_task_claims (user_id, task_date, prediction_count, reward_amount)
    values (current_user_id, current_date, today_count, task_reward)
    on conflict (user_id, task_date, prediction_count) do nothing;

    if found then
      perform public.add_coins(
        current_user_id,
        task_reward,
        'world_cup_task',
        'World Cup Daily Task Reward',
        'world_cup',
        jsonb_build_object('prediction_count', today_count)
      );
    else
      task_reward := 0;
    end if;
  end if;

  return jsonb_build_object(
    'prediction_id', prediction_id,
    'market_slug', market_record.slug,
    'selected_option', p_selected_option,
    'coins_spent', market_record.entry_cost,
    'potential_reward', reward,
    'balance_after_entry', new_balance,
    'daily_task_reward', task_reward
  );
exception
  when unique_violation then
    raise exception 'prediction already submitted for this market';
end;
$$;

create or replace function public.wc_use_ai_assistant(p_market_slug text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  market_id uuid;
  is_vip boolean := false;
  has_free_usage boolean := false;
  cost integer := 0;
begin
  if current_user_id is null then
    raise exception 'login required';
  end if;

  select lower(coalesce(vip_level, 'free')) <> 'free'
  into is_vip
  from public.profiles
  where id = current_user_id;

  if p_market_slug is not null then
    select id into market_id from public.wc_markets where slug = p_market_slug;
  end if;

  select exists (
    select 1
    from public.wc_ai_usage
    where user_id = current_user_id
      and usage_date = current_date
  )
  into has_free_usage;

  if not is_vip and has_free_usage then
    cost := 20;
    perform public.spend_coins(
      current_user_id,
      cost,
      'world_cup_ai_analysis',
      'World Cup AI Analysis',
      'world_cup',
      jsonb_build_object('market_slug', p_market_slug)
    );
  end if;

  insert into public.wc_ai_usage (user_id, usage_date, market_id, coins_spent)
  values (current_user_id, current_date, market_id, cost)
  on conflict (user_id, usage_date) do update
  set
    market_id = coalesce(excluded.market_id, public.wc_ai_usage.market_id),
    coins_spent = public.wc_ai_usage.coins_spent + excluded.coins_spent,
    created_at = now();

  return jsonb_build_object('coins_spent', cost, 'vip_free', is_vip);
end;
$$;

create or replace function public.wc_get_event_summary()
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'event_enabled', ec.event_enabled,
    'event_start', ec.event_start,
    'event_end', ec.event_end,
    'is_active', (ec.event_enabled and now() >= ec.event_start and now() <= ec.event_end),
    'participants', coalesce((select count(distinct user_id) from public.wc_predictions), 0),
    'prediction_count', coalesce((select count(*) from public.wc_predictions), 0),
    'coins_paid', coalesce((select sum(potential_reward) from public.wc_predictions where result = 'won' and reward_paid), 0),
    'hot_markets', coalesce((
      select jsonb_agg(row_to_json(hot))
      from (
        select m.slug, m.title, m.entry_cost, m.reward_amount, count(p.id) as prediction_count
        from public.wc_markets m
        left join public.wc_predictions p on p.market_id = m.id
        where m.status = 'open'
        group by m.id
        order by count(p.id) desc, m.created_at desc
        limit 4
      ) hot
    ), '[]'::jsonb)
  )
  from public.event_config ec
  where ec.event_key = 'world_cup_2026'
$$;

create or replace function public.wc_get_leaderboard(p_period text default 'all')
returns table (
  rank bigint,
  user_id uuid,
  username text,
  avatar_url text,
  vip_level text,
  total_predictions integer,
  correct_predictions integer,
  accuracy_rate numeric,
  coins_won integer,
  coins_spent integer,
  profit integer,
  current_streak integer,
  best_streak integer
)
language sql
security definer
set search_path = public, extensions
as $$
  with period_predictions as (
    select p.*
    from public.wc_predictions p
    where case
      when p_period = 'today' then p.created_at::date = current_date
      when p_period = 'week' then p.created_at >= now() - interval '7 days'
      else true
    end
  ),
  aggregate_stats as (
    select
      p.user_id,
      count(*)::integer as total_predictions,
      count(*) filter (where p.result = 'won')::integer as correct_predictions,
      coalesce(sum(p.potential_reward) filter (where p.result = 'won' and p.reward_paid), 0)::integer as coins_won,
      coalesce(sum(p.coins_spent), 0)::integer as coins_spent
    from period_predictions p
    group by p.user_id
  ),
  ranked as (
    select
      a.user_id,
      coalesce(pr.username, split_part(coalesce(pr.email, 'Player'), '@', 1), 'Player') as username,
      pr.avatar_url,
      pr.vip_level,
      a.total_predictions,
      a.correct_predictions,
      case
        when a.total_predictions > 0 then round((a.correct_predictions::numeric / a.total_predictions) * 100, 2)
        else 0
      end as accuracy_rate,
      a.coins_won,
      a.coins_spent,
      (a.coins_won - a.coins_spent) as profit,
      coalesce(s.current_streak, 0) as current_streak,
      coalesce(s.best_streak, 0) as best_streak
    from aggregate_stats a
    join public.profiles pr on pr.id = a.user_id
    left join public.wc_user_stats s on s.user_id = a.user_id
  )
  select
    row_number() over (order by profit desc, accuracy_rate desc, total_predictions desc) as rank,
    ranked.*
  from ranked
  order by rank
  limit 100
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
  winners integer := 0;
  paid_coins integer := 0;
begin
  select *
  into market_record
  from public.wc_markets
  where slug = p_market_slug
  for update;

  if market_record.id is null then
    raise exception 'market not found: %', p_market_slug;
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
      perform public.add_coins(
        prediction_record.user_id,
        prediction_record.potential_reward,
        'world_cup_reward',
        'World Cup Prediction Reward',
        'world_cup',
        jsonb_build_object('market_slug', p_market_slug, 'prediction_id', prediction_record.id)
      );

      update public.wc_predictions
      set result = 'won', reward_paid = true
      where id = prediction_record.id;

      insert into public.wc_user_stats (user_id, correct_predictions, coins_won, profit, current_streak, best_streak)
      values (
        prediction_record.user_id,
        1,
        prediction_record.potential_reward,
        prediction_record.potential_reward,
        1,
        1
      )
      on conflict (user_id) do update
      set
        correct_predictions = public.wc_user_stats.correct_predictions + 1,
        coins_won = public.wc_user_stats.coins_won + excluded.coins_won,
        profit = public.wc_user_stats.profit + excluded.profit,
        current_streak = public.wc_user_stats.current_streak + 1,
        best_streak = greatest(public.wc_user_stats.best_streak, public.wc_user_stats.current_streak + 1),
        accuracy_rate = case
          when public.wc_user_stats.total_predictions > 0
          then round(((public.wc_user_stats.correct_predictions + 1)::numeric / public.wc_user_stats.total_predictions) * 100, 2)
          else 0
        end,
        updated_at = now();

      winners := winners + 1;
      paid_coins := paid_coins + prediction_record.potential_reward;
    else
      update public.wc_predictions
      set result = 'lost'
      where id = prediction_record.id;

      update public.wc_user_stats
      set
        current_streak = 0,
        accuracy_rate = case
          when total_predictions > 0 then round((correct_predictions::numeric / total_predictions) * 100, 2)
          else 0
        end,
        updated_at = now()
      where user_id = prediction_record.user_id;
    end if;
  end loop;

  return jsonb_build_object('settled', true, 'winners', winners, 'paid_coins', paid_coins);
end;
$$;

create or replace function public.wc_cancel_market(p_market_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  market_record public.wc_markets%rowtype;
  prediction_record public.wc_predictions%rowtype;
  refunded_coins integer := 0;
begin
  select *
  into market_record
  from public.wc_markets
  where slug = p_market_slug
  for update;

  if market_record.id is null then
    raise exception 'market not found: %', p_market_slug;
  end if;

  update public.wc_markets
  set status = 'cancelled'
  where id = market_record.id;

  for prediction_record in
    select *
    from public.wc_predictions
    where market_id = market_record.id
      and result = 'pending'
    for update
  loop
    perform public.add_coins(
      prediction_record.user_id,
      prediction_record.coins_spent,
      'world_cup_reward',
      'World Cup Prediction Refund',
      'world_cup',
      jsonb_build_object('market_slug', p_market_slug, 'prediction_id', prediction_record.id)
    );

    update public.wc_predictions
    set result = 'cancelled', reward_paid = true
    where id = prediction_record.id;

    refunded_coins := refunded_coins + prediction_record.coins_spent;
  end loop;

  return jsonb_build_object('cancelled', true, 'refunded_coins', refunded_coins);
end;
$$;

alter table public.event_config enable row level security;
alter table public.wc_markets enable row level security;
alter table public.wc_predictions enable row level security;
alter table public.wc_user_stats enable row level security;
alter table public.wc_ai_usage enable row level security;
alter table public.wc_daily_task_claims enable row level security;

drop policy if exists "event_config_select_all" on public.event_config;
create policy "event_config_select_all"
on public.event_config for select
to anon, authenticated
using (true);

drop policy if exists "wc_markets_select_all" on public.wc_markets;
create policy "wc_markets_select_all"
on public.wc_markets for select
to anon, authenticated
using (true);

drop policy if exists "wc_predictions_select_own" on public.wc_predictions;
create policy "wc_predictions_select_own"
on public.wc_predictions for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "wc_user_stats_select_all" on public.wc_user_stats;
create policy "wc_user_stats_select_all"
on public.wc_user_stats for select
to anon, authenticated
using (true);

drop policy if exists "wc_ai_usage_select_own" on public.wc_ai_usage;
create policy "wc_ai_usage_select_own"
on public.wc_ai_usage for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "wc_daily_task_claims_select_own" on public.wc_daily_task_claims;
create policy "wc_daily_task_claims_select_own"
on public.wc_daily_task_claims for select
to authenticated
using (user_id = auth.uid());

grant select on public.event_config to anon, authenticated;
grant select on public.wc_markets to anon, authenticated;
grant select on public.wc_user_stats to anon, authenticated;
grant select on public.wc_predictions to authenticated;
grant select on public.wc_ai_usage to authenticated;
grant select on public.wc_daily_task_claims to authenticated;

revoke all on function public.wc_place_prediction(text, text) from public, anon;
grant execute on function public.wc_place_prediction(text, text) to authenticated;

revoke all on function public.wc_use_ai_assistant(text) from public, anon;
grant execute on function public.wc_use_ai_assistant(text) to authenticated;

revoke all on function public.wc_get_event_summary() from public;
grant execute on function public.wc_get_event_summary() to anon, authenticated;

revoke all on function public.wc_get_leaderboard(text) from public;
grant execute on function public.wc_get_leaderboard(text) to anon, authenticated;

revoke all on function public.wc_settle_market(text, text) from public, anon, authenticated;
grant execute on function public.wc_settle_market(text, text) to service_role;

revoke all on function public.wc_cancel_market(text) from public, anon, authenticated;
grant execute on function public.wc_cancel_market(text) to service_role;
