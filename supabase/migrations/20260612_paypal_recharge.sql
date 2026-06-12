-- PayPal coin recharge support.
-- Keeps existing payment_orders data intact and adds the fields required by
-- Netlify Functions to create/capture PayPal Orders safely.

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
      'world_cup_task'
    )
  );

create table if not exists public.coin_packages (
  id text primary key,
  name text not null,
  price_usd numeric(10,2) not null check (price_usd > 0),
  coins integer not null check (coins > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

insert into public.coin_packages (id, name, price_usd, coins, sort_order)
values
  ('starter', 'Starter Pack', 0.99, 200, 10),
  ('value', 'Value Pack', 4.99, 1200, 20),
  ('pro', 'Pro Pack', 9.99, 3000, 30),
  ('whale', 'Whale Pack', 19.99, 7000, 40)
on conflict (id) do update
set
  name = excluded.name,
  price_usd = excluded.price_usd,
  coins = excluded.coins,
  sort_order = excluded.sort_order,
  is_active = true;

alter table public.payment_orders
  add column if not exists package_id text references public.coin_packages(id),
  add column if not exists currency text not null default 'USD',
  add column if not exists raw_response jsonb default '{}'::jsonb;

alter table public.payment_orders
  drop constraint if exists payment_orders_status_check;

alter table public.payment_orders
  add constraint payment_orders_status_check
  check (status in ('pending', 'created', 'approved', 'paid', 'cancelled', 'failed', 'refunded'));

create index if not exists payment_orders_package_idx
  on public.payment_orders(package_id);

create table if not exists public.paypal_webhook_events (
  id uuid primary key default gen_random_uuid(),
  paypal_event_id text unique,
  event_type text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.coin_packages enable row level security;
alter table public.paypal_webhook_events enable row level security;

drop policy if exists "coin_packages_select_active" on public.coin_packages;
create policy "coin_packages_select_active"
on public.coin_packages for select
to anon, authenticated
using (is_active = true);

revoke all on public.coin_packages from anon, authenticated;
grant select on public.coin_packages to anon, authenticated;

revoke all on public.paypal_webhook_events from anon, authenticated;

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
    'world_cup_task'
  ) then
    raise exception 'invalid coin transaction type for add_coins: %', p_type;
  end if;

  insert into public.wallets (user_id, balance, total_earned, total_spent)
  values (p_user_id, 0, 0, 0)
  on conflict (user_id) do nothing;

  update public.wallets
  set
    balance = balance + p_amount,
    total_earned = total_earned + p_amount
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

revoke all on function public.add_coins(uuid, integer, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.add_coins(uuid, integer, text, text, text, jsonb) to service_role;

create or replace function public.finalize_paypal_recharge(
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
  new_balance integer;
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
      'already_processed', true,
      'balance', coalesce(new_balance, 0),
      'coins', order_record.coins
    );
  end if;

  if order_record.status not in ('pending', 'approved', 'created') then
    raise exception 'payment order status cannot be captured: %', order_record.status;
  end if;

  update public.payment_orders
  set
    status = 'paid',
    provider_order_id = coalesce(provider_order_id, p_provider_order_id),
    raw_response = coalesce(p_raw_response, '{}'::jsonb),
    raw_payload = coalesce(p_raw_response, raw_payload, '{}'::jsonb),
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
    'already_processed', false,
    'balance', new_balance,
    'coins', order_record.coins
  );
end;
$$;

revoke all on function public.finalize_paypal_recharge(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_paypal_recharge(uuid, text, jsonb) to service_role;
