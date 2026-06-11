-- Update daily check-in rewards from 10 coins to 20 coins.
-- Run this in Supabase SQL Editor if the base schema is already installed.

alter table public.daily_checkins
  alter column reward_amount set default 20;

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
