-- World Cup Economy System
-- Adds shop items, purchases, leaderboard highlight, AI analysis charging, and profile economy stats.

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
      'world_cup_shop',
      'world_cup_ai',
      'world_cup_highlight',
      'world_cup_task',
      'world_cup_referral',
      'world_cup_ai_analysis',
      'world_cup_cosmetic'
    )
  );

alter table public.profiles
  add column if not exists world_cup_avatar_frame text,
  add column if not exists world_cup_nickname_color text,
  add column if not exists leaderboard_highlight_expires_at timestamptz;

create table if not exists public.shop_items (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  category text not null check (category in ('avatar_frame', 'leaderboard_highlight', 'ai_ticket', 'cosmetic')),
  price integer not null check (price > 0),
  duration_days integer,
  metadata jsonb default '{}'::jsonb,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.shop_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  item_id uuid references public.shop_items(id),
  price_paid integer not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists shop_items_active_idx on public.shop_items(is_active, category);
create index if not exists shop_purchases_user_created_idx on public.shop_purchases(user_id, created_at desc);

insert into public.shop_items (slug, name, description, category, price, duration_days, metadata)
values
  (
    'world_cup_gold_frame',
    'World Cup Gold Frame',
    '世界杯金色头像框。',
    'avatar_frame',
    100,
    null,
    '{"frame":"gold"}'::jsonb
  ),
  (
    'world_cup_premium_frame',
    'World Cup Premium Frame',
    '世界杯高级头像框。',
    'avatar_frame',
    300,
    null,
    '{"frame":"premium"}'::jsonb
  ),
  (
    'world_cup_leaderboard_highlight',
    '排行榜高亮',
    '世界杯排行榜 HOT 标识，持续 7 天。',
    'leaderboard_highlight',
    50,
    7,
    '{"badge":"HOT"}'::jsonb
  ),
  (
    'world_cup_ai_ticket',
    'AI分析券',
    '普通用户可用 20 金币购买一次高级 AI 分析。',
    'ai_ticket',
    20,
    null,
    '{"uses":1}'::jsonb
  )
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  price = excluded.price,
  duration_days = excluded.duration_days,
  metadata = excluded.metadata,
  is_active = true;

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

  if not is_vip then
    cost := 20;
    perform public.spend_coins(
      current_user_id,
      cost,
      'world_cup_ai',
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

create or replace function public.wc_purchase_shop_item(p_item_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  item_record public.shop_items%rowtype;
  purchase_id uuid;
  transaction_type text := 'world_cup_shop';
  new_balance integer;
  highlight_expires timestamptz;
begin
  if current_user_id is null then
    raise exception 'login required';
  end if;

  select *
  into item_record
  from public.shop_items
  where slug = p_item_slug
    and is_active = true;

  if item_record.id is null then
    raise exception 'shop item not found: %', p_item_slug;
  end if;

  if item_record.category = 'leaderboard_highlight' then
    transaction_type := 'world_cup_highlight';
  end if;

  new_balance := public.spend_coins(
    current_user_id,
    item_record.price,
    transaction_type,
    'World Cup Shop Purchase',
    'world_cup_shop',
    jsonb_build_object('item_slug', item_record.slug, 'category', item_record.category)
  );

  insert into public.shop_purchases (user_id, item_id, price_paid, metadata)
  values (
    current_user_id,
    item_record.id,
    item_record.price,
    jsonb_build_object('item_slug', item_record.slug, 'category', item_record.category)
  )
  returning id into purchase_id;

  if item_record.category = 'avatar_frame' then
    update public.profiles
    set
      world_cup_avatar_frame = item_record.slug,
      updated_at = now()
    where id = current_user_id;
  elsif item_record.category = 'leaderboard_highlight' then
    highlight_expires := greatest(now(), coalesce((
      select leaderboard_highlight_expires_at
      from public.profiles
      where id = current_user_id
    ), now())) + make_interval(days => coalesce(item_record.duration_days, 7));

    update public.profiles
    set
      leaderboard_highlight_expires_at = highlight_expires,
      updated_at = now()
    where id = current_user_id;
  end if;

  return jsonb_build_object(
    'purchase_id', purchase_id,
    'item_slug', item_record.slug,
    'price_paid', item_record.price,
    'balance', new_balance,
    'highlight_expires_at', highlight_expires
  );
end;
$$;

drop function if exists public.wc_get_leaderboard(text);
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
    row_number() over (order by profit desc, accuracy_rate desc, total_predictions desc) as rank,
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
  with ranked as (
    select
      user_id,
      row_number() over (order by profit desc, accuracy_rate desc, total_predictions desc) as rank
    from public.wc_user_stats
  )
  select jsonb_build_object(
    'total_predictions', coalesce(s.total_predictions, 0),
    'correct_predictions', coalesce(s.correct_predictions, 0),
    'accuracy_rate', coalesce(s.accuracy_rate, 0),
    'coins_won', coalesce(s.coins_won, 0),
    'coins_spent', coalesce(s.coins_spent, 0),
    'profit', coalesce(s.profit, 0),
    'current_rank', r.rank,
    'world_cup_avatar_frame', p.world_cup_avatar_frame,
    'leaderboard_highlight_expires_at', p.leaderboard_highlight_expires_at,
    'is_highlighted', coalesce(p.leaderboard_highlight_expires_at > now(), false)
  )
  from public.profiles p
  left join public.wc_user_stats s on s.user_id = p.id
  left join ranked r on r.user_id = p.id
  where p.id = auth.uid()
$$;

alter table public.shop_items enable row level security;
alter table public.shop_purchases enable row level security;

drop policy if exists "shop_items_select_active" on public.shop_items;
create policy "shop_items_select_active"
on public.shop_items for select
to anon, authenticated
using (is_active = true);

drop policy if exists "shop_purchases_select_own" on public.shop_purchases;
create policy "shop_purchases_select_own"
on public.shop_purchases for select
to authenticated
using (user_id = auth.uid());

grant select on public.shop_items to anon, authenticated;
grant select on public.shop_purchases to authenticated;

grant select (world_cup_avatar_frame, world_cup_nickname_color, leaderboard_highlight_expires_at)
on table public.profiles to authenticated;

revoke all on function public.wc_purchase_shop_item(text) from public, anon;
grant execute on function public.wc_purchase_shop_item(text) to authenticated;

revoke all on function public.wc_get_my_economy_stats() from public, anon;
grant execute on function public.wc_get_my_economy_stats() to authenticated;

revoke all on function public.wc_get_leaderboard(text) from public;
grant execute on function public.wc_get_leaderboard(text) to anon, authenticated;
