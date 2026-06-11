# Supabase Database Notes

Run `supabase/schema.sql` in the Supabase SQL Editor, or apply it as a migration.

## Frontend-readable Data

The frontend can read:

- Own `profiles`
- Own `wallets`
- Own `coin_transactions`
- Active `games`
- Own `game_scores`
- Public `leaderboards` view
- Own `daily_checkins`
- Related `referral_rewards`
- Active `vip_plans`
- Own `vip_memberships`
- Own `payment_orders`

## Frontend-write Rules

Allowed directly from the frontend:

- Update own `profiles.username`
- Update own `profiles.avatar_url`
- Insert own `game_scores`, or preferably call `submit_game_score()`

Must not be written directly from the frontend:

- `wallets.balance`
- `coin_transactions`
- `daily_checkins`
- `referral_rewards`
- `vip_memberships`
- `payment_orders.status`
- VIP fields on `profiles`

Use database functions or trusted backend endpoints for those operations.

## Required Function Flow

- `daily_checkin()` gives the current authenticated user one daily reward.
- `submit_game_score()` records the current authenticated user's score.
- `add_coins()` and `spend_coins()` are for trusted service-role backend calls or internal DB functions.
- `grant_referral_reward()` is for trusted backend or post-signup reward processing.
- `activate_vip()` is for trusted backend calls after payment is captured.

## PayPal / Netlify Functions Plan

Future PayPal flow should run in Netlify Functions, not in the browser:

1. Browser requests a checkout session from a Netlify Function.
2. Netlify Function creates a `payment_orders` row with `status = 'created'`.
3. Browser completes PayPal approval.
4. PayPal webhook or capture Function verifies the payment server-side.
5. Function updates `payment_orders.status` to `paid`.
6. Function calls `add_coins()` for coin packages, or `activate_vip()` for VIP plans.
7. Function must be idempotent by checking `provider_order_id` and `payment_orders.status`.

## Environment Variables

Safe for Vite frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Never expose these to the frontend or commit them to GitHub:

- Supabase `service_role` key
- PayPal client secret
- PayPal webhook secret
- Netlify server-only secrets

Server-only variables should be configured in Netlify Functions environment variables without the `VITE_` prefix.
