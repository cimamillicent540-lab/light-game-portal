-- Light Game Portal Supabase schema
-- Safe to copy into Supabase SQL Editor and run as one script.
-- Frontend must use only anon / publishable keys. Never expose service_role keys.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.generate_referral_code()
returns text
language plpgsql
set search_path = public, extensions
as $$
declare
  candidate text;
begin
  loop
    candidate := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10));
    exit when not exists (
      select 1
      from public.profiles
      where referral_code = candidate
    );
  end loop;

  return candidate;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text,
  avatar_url text,
  referral_code text unique,
  referred_by uuid references public.profiles(id),
  vip_level text default 'free',
  vip_expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists profiles_referral_code_idx on public.profiles(referral_code);
create index if not exists profiles_referred_by_idx on public.profiles(referred_by);
create index if not exists profiles_vip_expires_at_idx on public.profiles(vip_expires_at);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. wallets
-- ---------------------------------------------------------------------------

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance integer default 0 not null check (balance >= 0),
  total_earned integer default 0 not null check (total_earned >= 0),
  total_spent integer default 0 not null check (total_spent >= 0),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

drop trigger if exists set_wallets_updated_at on public.wallets;
create trigger set_wallets_updated_at
before update on public.wallets
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. coin_transactions
-- ---------------------------------------------------------------------------

create table if not exists public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  amount integer not null check (amount <> 0),
  balance_after integer,
  type text not null check (
    type in (
      'signup_bonus',
      'daily_checkin',
      'game_reward',
      'game_spend',
      'referral_bonus',
      'vip_purchase',
      'paypal_purchase',
      'admin_adjust'
    )
  ),
  description text,
  source text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists coin_transactions_user_created_idx
  on public.coin_transactions(user_id, created_at desc);
create index if not exists coin_transactions_type_idx on public.coin_transactions(type);

-- ---------------------------------------------------------------------------
-- 4. games
-- ---------------------------------------------------------------------------

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  category text,
  is_active boolean default true,
  reward_enabled boolean default false,
  max_daily_reward integer default 0 check (max_daily_reward >= 0),
  created_at timestamptz default now()
);

create index if not exists games_active_slug_idx on public.games(is_active, slug);

insert into public.games (slug, title, description, category, is_active, reward_enabled, max_daily_reward)
values
  ('2048', '2048', '滑动数字方块，合成更高分。', '益智', true, false, 0),
  ('reaction', '反应速度测试', '等按钮变色后立刻点击，看看你的手速。', '反应', true, false, 0),
  ('memory', '记忆翻牌', '记住牌面位置，翻出所有配对。', '记忆', true, false, 0)
on conflict (slug) do update
set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  is_active = excluded.is_active;

-- ---------------------------------------------------------------------------
-- 5. game_scores
-- ---------------------------------------------------------------------------

create table if not exists public.game_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  game_id uuid references public.games(id) on delete cascade,
  score integer not null,
  score_type text default 'points',
  duration_ms integer,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists game_scores_user_created_idx
  on public.game_scores(user_id, created_at desc);
create index if not exists game_scores_game_score_idx
  on public.game_scores(game_id, score desc, created_at asc);
create index if not exists game_scores_user_game_score_idx
  on public.game_scores(user_id, game_id, score desc);

-- ---------------------------------------------------------------------------
-- 7. daily_checkins
-- ---------------------------------------------------------------------------

create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  checkin_date date not null,
  reward_amount integer default 20,
  streak_count integer default 1,
  created_at timestamptz default now(),
  unique(user_id, checkin_date)
);

alter table public.daily_checkins
  alter column reward_amount set default 20;

create index if not exists daily_checkins_user_date_idx
  on public.daily_checkins(user_id, checkin_date desc);

-- ---------------------------------------------------------------------------
-- 8. referral_rewards
-- ---------------------------------------------------------------------------

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid references public.profiles(id) on delete cascade,
  referred_user_id uuid references public.profiles(id) on delete cascade,
  reward_amount integer default 100,
  status text default 'pending' check (status in ('pending', 'rewarded', 'cancelled')),
  created_at timestamptz default now(),
  rewarded_at timestamptz,
  unique(referrer_id, referred_user_id)
);

create index if not exists referral_rewards_referrer_idx
  on public.referral_rewards(referrer_id, created_at desc);
create index if not exists referral_rewards_referred_user_idx
  on public.referral_rewards(referred_user_id);

-- ---------------------------------------------------------------------------
-- 9. vip_plans
-- ---------------------------------------------------------------------------

create table if not exists public.vip_plans (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  price_usd numeric(10,2) not null,
  duration_days integer not null,
  daily_bonus integer default 0,
  reward_multiplier numeric(10,2) default 1.0,
  is_active boolean default true,
  created_at timestamptz default now()
);

create index if not exists vip_plans_active_slug_idx on public.vip_plans(is_active, slug);

insert into public.vip_plans (slug, name, price_usd, duration_days, daily_bonus, reward_multiplier, is_active)
values
  ('monthly_vip', '月卡', 9.99, 30, 0, 1.0, true),
  ('quarterly_vip', '季卡', 24.99, 90, 0, 1.0, true),
  ('yearly_vip', '年卡', 79.99, 365, 0, 1.0, true)
on conflict (slug) do update
set
  name = excluded.name,
  price_usd = excluded.price_usd,
  duration_days = excluded.duration_days,
  daily_bonus = excluded.daily_bonus,
  reward_multiplier = excluded.reward_multiplier,
  is_active = excluded.is_active;

-- ---------------------------------------------------------------------------
-- 11. payment_orders, PayPal reserved
-- ---------------------------------------------------------------------------

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  provider text default 'paypal',
  provider_order_id text unique,
  amount_usd numeric(10,2) not null,
  coins integer default 0,
  vip_plan_id uuid references public.vip_plans(id),
  status text default 'created' check (
    status in ('created', 'approved', 'paid', 'cancelled', 'failed', 'refunded')
  ),
  raw_payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  paid_at timestamptz
);

create index if not exists payment_orders_user_created_idx
  on public.payment_orders(user_id, created_at desc);
create index if not exists payment_orders_provider_order_idx
  on public.payment_orders(provider, provider_order_id);
create index if not exists payment_orders_status_idx on public.payment_orders(status);

-- ---------------------------------------------------------------------------
-- 10. vip_memberships
-- ---------------------------------------------------------------------------

create table if not exists public.vip_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  plan_id uuid references public.vip_plans(id),
  starts_at timestamptz default now(),
  expires_at timestamptz not null,
  status text default 'active' check (status in ('active', 'expired', 'cancelled')),
  payment_order_id uuid,
  created_at timestamptz default now()
);

create unique index if not exists vip_memberships_payment_order_unique_idx
  on public.vip_memberships(payment_order_id)
  where payment_order_id is not null;
create index if not exists vip_memberships_user_created_idx
  on public.vip_memberships(user_id, created_at desc);
create index if not exists vip_memberships_active_idx
  on public.vip_memberships(user_id, status, expires_at desc);

-- ---------------------------------------------------------------------------
-- 6. leaderboards view
-- One row per user per game, using each user's highest score.
-- Query with: select * from public.leaderboards where game_slug = '2048' and rank <= 100;
-- ---------------------------------------------------------------------------

drop view if exists public.leaderboards;
create view public.leaderboards
with (security_barrier = true)
as
with best_scores as (
  select distinct on (gs.user_id, gs.game_id)
    gs.user_id,
    gs.game_id,
    gs.score,
    gs.score_type,
    gs.duration_ms,
    gs.created_at
  from public.game_scores gs
  join public.games g on g.id = gs.game_id
  where g.is_active = true
  order by gs.user_id, gs.game_id, gs.score desc, gs.created_at asc
)
select
  row_number() over (partition by bs.game_id order by bs.score desc, bs.created_at asc) as rank,
  bs.game_id,
  g.slug as game_slug,
  g.title as game_title,
  bs.user_id,
  coalesce(p.username, split_part(coalesce(p.email, 'Player'), '@', 1), 'Player') as username,
  p.avatar_url,
  bs.score,
  bs.score_type,
  bs.duration_ms,
  bs.created_at
from best_scores bs
join public.games g on g.id = bs.game_id
join public.profiles p on p.id = bs.user_id;

-- ---------------------------------------------------------------------------
-- Auth trigger and business functions
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  input_referral_code text;
  referrer uuid;
begin
  input_referral_code := nullif(new.raw_user_meta_data ->> 'referral_code', '');

  if input_referral_code is not null then
    select id
    into referrer
    from public.profiles
    where referral_code = upper(input_referral_code)
      and id <> new.id
    limit 1;
  end if;

  insert into public.profiles (
    id,
    email,
    referral_code,
    referred_by
  )
  values (
    new.id,
    new.email,
    public.generate_referral_code(),
    referrer
  )
  on conflict (id) do update
  set email = excluded.email;

  insert into public.wallets (user_id, balance, total_earned, total_spent)
  values (new.id, 0, 0, 0)
  on conflict (user_id) do nothing;

  if referrer is not null then
    insert into public.referral_rewards (referrer_id, referred_user_id, reward_amount, status)
    values (referrer, new.id, 100, 'pending')
    on conflict (referrer_id, referred_user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill profiles and wallets for users that existed before this migration.
insert into public.profiles (
  id,
  email,
  referral_code,
  referred_by
)
select
  u.id,
  u.email,
  public.generate_referral_code(),
  ref.id
from auth.users u
left join public.profiles ref
  on ref.referral_code = upper(nullif(u.raw_user_meta_data ->> 'referral_code', ''))
where not exists (
  select 1
  from public.profiles p
  where p.id = u.id
);

insert into public.wallets (user_id, balance, total_earned, total_spent)
select p.id, 0, 0, 0
from public.profiles p
where not exists (
  select 1
  from public.wallets w
  where w.user_id = p.id
);

insert into public.referral_rewards (referrer_id, referred_user_id, reward_amount, status)
select p.referred_by, p.id, 100, 'pending'
from public.profiles p
where p.referred_by is not null
on conflict (referrer_id, referred_user_id) do nothing;

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
    'admin_adjust'
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

  if p_type not in ('game_spend', 'vip_purchase', 'admin_adjust') then
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

create or replace function public.daily_checkin()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  today date := current_date;
  previous_streak integer := 0;
  next_streak integer := 1;
  reward integer := 20;
  new_balance integer;
begin
  if current_user_id is null then
    raise exception 'login required';
  end if;

  select streak_count
  into previous_streak
  from public.daily_checkins
  where user_id = current_user_id
    and checkin_date = today - 1
  limit 1;

  if previous_streak is not null then
    next_streak := previous_streak + 1;
  end if;

  insert into public.daily_checkins (
    user_id,
    checkin_date,
    reward_amount,
    streak_count
  )
  values (
    current_user_id,
    today,
    reward,
    next_streak
  );

  new_balance := public.add_coins(
    current_user_id,
    reward,
    'daily_checkin',
    '每日签到奖励',
    'daily_checkin',
    jsonb_build_object('checkin_date', today, 'streak_count', next_streak)
  );

  return jsonb_build_object(
    'checkin_date', today,
    'reward_amount', reward,
    'streak_count', next_streak,
    'balance', new_balance
  );
exception
  when unique_violation then
    raise exception 'already checked in today';
end;
$$;

create or replace function public.grant_referral_reward(p_referred_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  referrer uuid;
  reward integer := 100;
  reward_row public.referral_rewards%rowtype;
  new_balance integer;
begin
  select referred_by
  into referrer
  from public.profiles
  where id = p_referred_user_id;

  if referrer is null then
    return jsonb_build_object('rewarded', false, 'reason', 'no_referrer');
  end if;

  insert into public.referral_rewards (
    referrer_id,
    referred_user_id,
    reward_amount,
    status
  )
  values (
    referrer,
    p_referred_user_id,
    reward,
    'pending'
  )
  on conflict (referrer_id, referred_user_id) do nothing;

  select *
  into reward_row
  from public.referral_rewards
  where referrer_id = referrer
    and referred_user_id = p_referred_user_id
  for update;

  if reward_row.status = 'rewarded' then
    return jsonb_build_object('rewarded', false, 'reason', 'already_rewarded');
  end if;

  new_balance := public.add_coins(
    referrer,
    reward_row.reward_amount,
    'referral_bonus',
    '邀请奖励',
    'referral',
    jsonb_build_object('referred_user_id', p_referred_user_id)
  );

  update public.referral_rewards
  set
    status = 'rewarded',
    rewarded_at = now()
  where id = reward_row.id;

  return jsonb_build_object(
    'rewarded', true,
    'referrer_id', referrer,
    'referred_user_id', p_referred_user_id,
    'reward_amount', reward_row.reward_amount,
    'balance', new_balance
  );
end;
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
  current_expiry timestamptz;
  starts timestamptz;
  expires timestamptz;
  membership_id uuid;
begin
  if p_payment_order_id is not null and exists (
    select 1
    from public.vip_memberships
    where payment_order_id = p_payment_order_id
  ) then
    raise exception 'vip already activated for this payment order';
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
      and user_id = p_user_id
      and status <> 'paid';
  end if;

  return jsonb_build_object(
    'membership_id', membership_id,
    'vip_level', plan_record.slug,
    'starts_at', starts,
    'expires_at', expires
  );
end;
$$;

create or replace function public.submit_game_score(
  p_game_slug text,
  p_score integer,
  p_score_type text default 'points',
  p_duration_ms integer default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.game_scores
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  target_game_id uuid;
  inserted_score public.game_scores%rowtype;
begin
  if current_user_id is null then
    raise exception 'login required';
  end if;

  select id
  into target_game_id
  from public.games
  where slug = p_game_slug
    and is_active = true;

  if target_game_id is null then
    raise exception 'active game not found: %', p_game_slug;
  end if;

  insert into public.game_scores (
    user_id,
    game_id,
    score,
    score_type,
    duration_ms,
    metadata
  )
  values (
    current_user_id,
    target_game_id,
    p_score,
    coalesce(p_score_type, 'points'),
    p_duration_ms,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into inserted_score;

  return inserted_score;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.coin_transactions enable row level security;
alter table public.games enable row level security;
alter table public.game_scores enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.referral_rewards enable row level security;
alter table public.vip_plans enable row level security;
alter table public.vip_memberships enable row level security;
alter table public.payment_orders enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_update_own_public_fields" on public.profiles;
create policy "profiles_update_own_public_fields"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "wallets_select_own" on public.wallets;
create policy "wallets_select_own"
on public.wallets for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "coin_transactions_select_own" on public.coin_transactions;
create policy "coin_transactions_select_own"
on public.coin_transactions for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "games_select_active" on public.games;
create policy "games_select_active"
on public.games for select
to anon, authenticated
using (is_active = true);

drop policy if exists "game_scores_select_own" on public.game_scores;
create policy "game_scores_select_own"
on public.game_scores for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "game_scores_insert_own" on public.game_scores;
create policy "game_scores_insert_own"
on public.game_scores for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "daily_checkins_select_own" on public.daily_checkins;
create policy "daily_checkins_select_own"
on public.daily_checkins for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "referral_rewards_select_related" on public.referral_rewards;
create policy "referral_rewards_select_related"
on public.referral_rewards for select
to authenticated
using (referrer_id = auth.uid() or referred_user_id = auth.uid());

drop policy if exists "vip_plans_select_active" on public.vip_plans;
create policy "vip_plans_select_active"
on public.vip_plans for select
to anon, authenticated
using (is_active = true);

drop policy if exists "vip_memberships_select_own" on public.vip_memberships;
create policy "vip_memberships_select_own"
on public.vip_memberships for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "payment_orders_select_own" on public.payment_orders;
create policy "payment_orders_select_own"
on public.payment_orders for select
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants
-- RLS decides row access. Column grants prevent profile privilege escalation.
-- Wallet, coin, VIP, and payment writes are intentionally not granted to users.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (username, avatar_url) on public.profiles to authenticated;

revoke all on public.wallets from anon, authenticated;
grant select on public.wallets to authenticated;

revoke all on public.coin_transactions from anon, authenticated;
grant select on public.coin_transactions to authenticated;

revoke all on public.games from anon, authenticated;
grant select on public.games to anon, authenticated;

revoke all on public.game_scores from anon, authenticated;
grant select, insert on public.game_scores to authenticated;

revoke all on public.daily_checkins from anon, authenticated;
grant select on public.daily_checkins to authenticated;

revoke all on public.referral_rewards from anon, authenticated;
grant select on public.referral_rewards to authenticated;

revoke all on public.vip_plans from anon, authenticated;
grant select on public.vip_plans to anon, authenticated;

revoke all on public.vip_memberships from anon, authenticated;
grant select on public.vip_memberships to authenticated;

revoke all on public.payment_orders from anon, authenticated;
grant select on public.payment_orders to authenticated;

grant select on public.leaderboards to anon, authenticated;

revoke all on function public.add_coins(uuid, integer, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.spend_coins(uuid, integer, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.grant_referral_reward(uuid) from public, anon, authenticated;
revoke all on function public.activate_vip(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.generate_referral_code() from public, anon, authenticated;

grant execute on function public.add_coins(uuid, integer, text, text, text, jsonb) to service_role;
grant execute on function public.spend_coins(uuid, integer, text, text, text, jsonb) to service_role;
grant execute on function public.grant_referral_reward(uuid) to service_role;
grant execute on function public.activate_vip(uuid, text, uuid) to service_role;

revoke all on function public.daily_checkin() from public, anon;
grant execute on function public.daily_checkin() to authenticated;

revoke all on function public.submit_game_score(text, integer, text, integer, jsonb) from public, anon;
grant execute on function public.submit_game_score(text, integer, text, integer, jsonb) to authenticated;

commit;
