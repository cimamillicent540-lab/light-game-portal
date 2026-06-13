-- Settlement, leaderboard variants, and PayPal-backed VIP subscriptions.
-- Safe to run after the World Cup, economy, auto-sync, and PayPal recharge migrations.

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
      'paypal_recharge',
      'admin_adjust',
      'world_cup_prediction',
      'world_cup_reward',
      'world_cup_shop',
      'world_cup_ai',
      'world_cup_highlight',
      'world_cup_task',
      'world_cup_referral',
      'world_cup_ai_analysis',
      'world_cup_cosmetic'
    )
  );

alter table public.payment_orders
  add column if not exists payment_kind text not null default 'coins';

alter table public.payment_orders
  drop constraint if exists payment_orders_kind_check;

alter table public.payment_orders
  add constraint payment_orders_kind_check
  check (payment_kind in ('coins', 'vip'));

create index if not exists payment_orders_kind_status_idx
  on public.payment_orders(payment_kind, status, created_at desc);

update public.vip_plans
set reward_multiplier = case slug
  when 'monthly_vip' then 1.2
  when 'quarterly_vip' then 1.5
  when 'yearly_vip' then 2.0
  else reward_multiplier
end
where slug in ('monthly_vip', 'quarterly_vip', 'yearly_vip');

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
    'paypal_recharge',
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
    'world_cup_shop',
    'world_cup_ai',
    'world_cup_highlight',
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

create or replace function public.wc_refresh_user_stats(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  total_count integer := 0;
  correct_count integer := 0;
  won_coins integer := 0;
  spent_coins integer := 0;
  current_run integer := 0;
  best_run integer := 0;
  result_row record;
begin
  select
    count(*)::integer,
    count(*) filter (where result = 'won')::integer,
    coalesce(sum(potential_reward) filter (where result = 'won' and reward_paid), 0)::integer,
    coalesce(sum(coins_spent), 0)::integer
  into total_count, correct_count, won_coins, spent_coins
  from public.wc_predictions
  where user_id = p_user_id;

  for result_row in
    select result
    from public.wc_predictions
    where user_id = p_user_id
      and result in ('won', 'lost')
    order by created_at asc, id asc
  loop
    if result_row.result = 'won' then
      current_run := current_run + 1;
      best_run := greatest(best_run, current_run);
    else
      current_run := 0;
    end if;
  end loop;

  insert into public.wc_user_stats (
    user_id,
    total_predictions,
    correct_predictions,
    accuracy_rate,
    coins_won,
    coins_spent,
    profit,
    current_streak,
    best_streak,
    updated_at
  )
  values (
    p_user_id,
    total_count,
    correct_count,
    case when total_count > 0 then round((correct_count::numeric / total_count) * 100, 2) else 0 end,
    won_coins,
    spent_coins,
    won_coins - spent_coins,
    current_run,
    best_run,
    now()
  )
  on conflict (user_id) do update
  set
    total_predictions = excluded.total_predictions,
    correct_predictions = excluded.correct_predictions,
    accuracy_rate = excluded.accuracy_rate,
    coins_won = excluded.coins_won,
    coins_spent = excluded.coins_spent,
    profit = excluded.profit,
    current_streak = excluded.current_streak,
    best_streak = excluded.best_streak,
    updated_at = now();
end;
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
  lost_count integer := 0;
begin
  select *
  into market_record
  from public.wc_markets
  where slug = p_market_slug
  for update;

  if market_record.id is null then
    raise exception 'market not found: %', p_market_slug;
  end if;

  if market_record.status = 'settled' then
    return jsonb_build_object(
      'settled',
      false,
      'reason',
      'already_settled',
      'market_slug',
      market_record.slug,
      'correct_option',
      market_record.correct_option
    );
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
      set
        result = 'won',
        reward_paid = true
      where id = prediction_record.id
        and result = 'pending'
        and reward_paid is not true;

      if found then
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
      end if;
    else
      update public.wc_predictions
      set
        result = 'lost',
        reward_paid = false
      where id = prediction_record.id
        and result = 'pending';

      if found then
        lost_count := lost_count + 1;
      end if;
    end if;

    perform public.wc_refresh_user_stats(prediction_record.user_id);
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
    'lost_predictions',
    lost_count,
    'paid_coins',
    paid_coins
  );
end;
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
  multiplier numeric := 1.0;
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

  select case
    when vip_expires_at is not null and vip_expires_at > now()
    then public.wc_vip_multiplier(vip_level)
    else 1.0
  end
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

  perform public.wc_refresh_user_stats(current_user_id);

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

  select coalesce(vip_expires_at > now(), false) and lower(coalesce(vip_level, 'free')) <> 'free'
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

create or replace function public.wc_auto_settle_finished_match()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.status = 'finished'
    and new.winner is not null
    and (
      tg_op = 'INSERT'
      or old.status is distinct from new.status
      or old.winner is distinct from new.winner
      or old.home_score is distinct from new.home_score
      or old.away_score is distinct from new.away_score
    )
  then
    perform public.wc_settle_finished_match(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists wc_matches_auto_settle_finished on public.wc_matches;
create trigger wc_matches_auto_settle_finished
after insert or update of status, winner, home_score, away_score
on public.wc_matches
for each row execute function public.wc_auto_settle_finished_match();

drop function if exists public.wc_get_leaderboard(text);
drop function if exists public.wc_get_leaderboard(text, text);
create or replace function public.wc_get_leaderboard(
  p_period text default 'all',
  p_metric text default 'profit'
)
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
  best_streak integer,
  is_highlighted boolean
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
      coalesce(s.best_streak, 0) as best_streak,
      coalesce(pr.leaderboard_highlight_expires_at > now(), false) as is_highlighted
    from aggregate_stats a
    join public.profiles pr on pr.id = a.user_id
    left join public.wc_user_stats s on s.user_id = a.user_id
  )
  select
    row_number() over (
      order by
        case when p_metric = 'coins' then coins_won end desc nulls last,
        case when p_metric = 'accuracy' then accuracy_rate end desc nulls last,
        case when p_metric = 'profit' then profit end desc nulls last,
        case when p_metric = 'coins' then profit end desc nulls last,
        case when p_metric = 'accuracy' then total_predictions end desc nulls last,
        profit desc,
        accuracy_rate desc,
        total_predictions desc
    ) as rank,
    ranked.*
  from ranked
  order by rank
  limit 100
$$;

create or replace function public.wc_get_my_economy_stats()
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  with ranks as (
    select
      user_id,
      row_number() over (order by profit desc, accuracy_rate desc, total_predictions desc) as profit_rank,
      row_number() over (order by coins_won desc, profit desc, total_predictions desc) as coins_rank,
      row_number() over (order by accuracy_rate desc, total_predictions desc, profit desc) as accuracy_rank
    from public.wc_user_stats
  )
  select jsonb_build_object(
    'total_predictions', coalesce(s.total_predictions, 0),
    'correct_predictions', coalesce(s.correct_predictions, 0),
    'accuracy_rate', coalesce(s.accuracy_rate, 0),
    'coins_won', coalesce(s.coins_won, 0),
    'coins_spent', coalesce(s.coins_spent, 0),
    'profit', coalesce(s.profit, 0),
    'current_rank', r.profit_rank,
    'profit_rank', r.profit_rank,
    'coins_rank', r.coins_rank,
    'accuracy_rank', r.accuracy_rank,
    'world_cup_avatar_frame', p.world_cup_avatar_frame,
    'leaderboard_highlight_expires_at', p.leaderboard_highlight_expires_at,
    'is_highlighted', coalesce(p.leaderboard_highlight_expires_at > now(), false)
  )
  from public.profiles p
  left join public.wc_user_stats s on s.user_id = p.id
  left join ranks r on r.user_id = p.id
  where p.id = auth.uid()
$$;

create or replace function public.activate_vip(
  p_user_id uuid,
  p_plan_slug text,
  p_payment_order_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  plan_record public.vip_plans%rowtype;
  existing_membership public.vip_memberships%rowtype;
  current_expiry timestamptz;
  starts timestamptz;
  expires timestamptz;
  membership_id uuid;
begin
  if p_payment_order_id is not null then
    select *
    into existing_membership
    from public.vip_memberships
    where payment_order_id = p_payment_order_id;

    if existing_membership.id is not null then
      return jsonb_build_object(
        'already_processed',
        true,
        'membership_id',
        existing_membership.id,
        'starts_at',
        existing_membership.starts_at,
        'expires_at',
        existing_membership.expires_at
      );
    end if;
  end if;

  select *
  into plan_record
  from public.vip_plans
  where slug = p_plan_slug
    and is_active = true;

  if plan_record.id is null then
    raise exception 'active vip plan not found: %', p_plan_slug;
  end if;

  select vip_expires_at
  into current_expiry
  from public.profiles
  where id = p_user_id
  for update;

  starts := greatest(now(), coalesce(current_expiry, now()));
  expires := starts + make_interval(days => plan_record.duration_days);

  insert into public.vip_memberships (
    user_id,
    plan_id,
    starts_at,
    expires_at,
    status,
    payment_order_id
  )
  values (
    p_user_id,
    plan_record.id,
    starts,
    expires,
    'active',
    p_payment_order_id
  )
  returning id into membership_id;

  update public.profiles
  set
    vip_level = plan_record.slug,
    vip_expires_at = expires,
    updated_at = now()
  where id = p_user_id;

  if p_payment_order_id is not null then
    update public.payment_orders
    set
      status = 'paid',
      paid_at = coalesce(paid_at, now()),
      vip_plan_id = coalesce(vip_plan_id, plan_record.id)
    where id = p_payment_order_id
      and user_id = p_user_id;
  end if;

  return jsonb_build_object(
    'already_processed',
    false,
    'membership_id',
    membership_id,
    'vip_level',
    plan_record.slug,
    'starts_at',
    starts,
    'expires_at',
    expires,
    'reward_multiplier',
    plan_record.reward_multiplier
  );
end;
$$;

create or replace function public.finalize_paypal_order(
  p_order_id uuid,
  p_provider_order_id text,
  p_raw_response jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  order_record public.payment_orders%rowtype;
  plan_record public.vip_plans%rowtype;
  new_balance integer;
  vip_result jsonb;
begin
  select *
  into order_record
  from public.payment_orders
  where id = p_order_id
  for update;

  if order_record.id is null then
    raise exception 'payment order not found';
  end if;

  if order_record.status = 'paid' then
    select balance into new_balance
    from public.wallets
    where user_id = order_record.user_id;

    return jsonb_build_object(
      'already_processed',
      true,
      'payment_kind',
      coalesce(order_record.payment_kind, case when order_record.vip_plan_id is null then 'coins' else 'vip' end),
      'balance',
      coalesce(new_balance, 0),
      'coins',
      coalesce(order_record.coins, 0)
    );
  end if;

  if order_record.status not in ('pending', 'approved', 'created') then
    raise exception 'payment order status cannot be captured: %', order_record.status;
  end if;

  update public.payment_orders
  set
    provider_order_id = coalesce(provider_order_id, p_provider_order_id),
    raw_response = coalesce(p_raw_response, '{}'::jsonb),
    raw_payload = coalesce(p_raw_response, raw_payload, '{}'::jsonb)
  where id = order_record.id;

  if order_record.payment_kind = 'vip' or order_record.vip_plan_id is not null then
    select *
    into plan_record
    from public.vip_plans
    where id = order_record.vip_plan_id
      and is_active = true;

    if plan_record.id is null then
      raise exception 'vip plan not found for payment order';
    end if;

    vip_result := public.activate_vip(order_record.user_id, plan_record.slug, order_record.id);

    return jsonb_build_object(
      'already_processed',
      coalesce((vip_result ->> 'already_processed')::boolean, false),
      'payment_kind',
      'vip',
      'coins',
      0,
      'balance',
      coalesce((select balance from public.wallets where user_id = order_record.user_id), 0),
      'vip',
      vip_result
    );
  end if;

  update public.payment_orders
  set
    status = 'paid',
    paid_at = now()
  where id = order_record.id;

  new_balance := public.add_coins(
    order_record.user_id,
    order_record.coins,
    'paypal_recharge',
    'PayPal coin recharge',
    'paypal',
    jsonb_build_object(
      'payment_order_id', order_record.id,
      'paypal_order_id', p_provider_order_id,
      'package_id', order_record.package_id,
      'amount_usd', order_record.amount_usd
    )
  );

  return jsonb_build_object(
    'already_processed',
    false,
    'payment_kind',
    'coins',
    'balance',
    new_balance,
    'coins',
    order_record.coins
  );
end;
$$;

create or replace function public.finalize_paypal_recharge(
  p_order_id uuid,
  p_provider_order_id text,
  p_raw_response jsonb default '{}'::jsonb
)
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select public.finalize_paypal_order(p_order_id, p_provider_order_id, p_raw_response)
$$;

revoke all on function public.add_coins(uuid, integer, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.spend_coins(uuid, integer, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.wc_refresh_user_stats(uuid) from public, anon, authenticated;
revoke all on function public.wc_settle_market(text, text) from public, anon, authenticated;
revoke all on function public.wc_place_prediction(text, text) from public, anon;
revoke all on function public.wc_use_ai_assistant(text) from public, anon;
revoke all on function public.wc_auto_settle_finished_match() from public, anon, authenticated;
revoke all on function public.wc_get_leaderboard(text, text) from public;
revoke all on function public.wc_get_my_economy_stats() from public, anon;
revoke all on function public.activate_vip(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.finalize_paypal_order(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.finalize_paypal_recharge(uuid, text, jsonb) from public, anon, authenticated;

grant execute on function public.add_coins(uuid, integer, text, text, text, jsonb) to service_role;
grant execute on function public.spend_coins(uuid, integer, text, text, text, jsonb) to service_role;
grant execute on function public.wc_refresh_user_stats(uuid) to service_role;
grant execute on function public.wc_settle_market(text, text) to service_role;
grant execute on function public.wc_place_prediction(text, text) to authenticated;
grant execute on function public.wc_use_ai_assistant(text) to authenticated;
grant execute on function public.wc_auto_settle_finished_match() to service_role;
grant execute on function public.wc_get_leaderboard(text, text) to anon, authenticated;
grant execute on function public.wc_get_my_economy_stats() to authenticated;
grant execute on function public.activate_vip(uuid, text, uuid) to service_role;
grant execute on function public.finalize_paypal_order(uuid, text, jsonb) to service_role;
grant execute on function public.finalize_paypal_recharge(uuid, text, jsonb) to service_role;

grant select on public.vip_plans to anon, authenticated;
grant select on public.vip_memberships to authenticated;
