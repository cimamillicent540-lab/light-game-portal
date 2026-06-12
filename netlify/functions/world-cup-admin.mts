import { createClient } from '@supabase/supabase-js';

declare const Netlify: {
  env: {
    get(key: string): string | undefined;
  };
};

type MatchInput = {
  id?: string;
  group_name?: string;
  team_home?: string;
  team_away?: string;
  kickoff_time?: string;
  status?: 'scheduled' | 'live' | 'finished';
  home_score?: number | null;
  away_score?: number | null;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const getAdminClient = () => {
  const supabaseUrl = Netlify.env.get('SUPABASE_URL') ?? Netlify.env.get('VITE_SUPABASE_URL');
  const serviceRoleKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service environment is not configured');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

const ensureAdmin = async (request: Request) => {
  const adminClient = getAdminClient();
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return { adminClient, error: jsonResponse({ error: 'missing authorization token' }, 401) };
  }

  const {
    data: { user },
    error,
  } = await adminClient.auth.getUser(token);

  if (error || !user) {
    return { adminClient, error: jsonResponse({ error: 'invalid authorization token' }, 401) };
  }

  const allowlist = (Netlify.env.get('ADMIN_EMAILS') ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length === 0) {
    return { adminClient, error: jsonResponse({ error: 'ADMIN_EMAILS is not configured' }, 403) };
  }

  if (!allowlist.includes((user.email ?? '').toLowerCase())) {
    return { adminClient, error: jsonResponse({ error: 'admin access denied' }, 403) };
  }

  return { adminClient, user };
};

const getDashboard = async () => {
  const adminClient = getAdminClient();

  const [matchesResult, marketsResult, predictionsResult, syncResult, leaderboardResult] = await Promise.all([
    adminClient
      .from('wc_matches')
      .select('id, group_name, team_home, team_away, kickoff_time, status, home_score, away_score, winner, created_at')
      .order('kickoff_time', { ascending: true }),
    adminClient
      .from('wc_markets')
      .select(
        'id, slug, title, market_type, options, entry_cost, reward_amount, status, locks_at, settles_at, correct_option, match_id, created_at',
      )
      .order('created_at', { ascending: false }),
    adminClient.from('wc_predictions').select('market_id, coins_spent, potential_reward, result, reward_paid'),
    adminClient.rpc('wc_get_admin_sync_status'),
    adminClient.rpc('wc_get_leaderboard', { p_period: 'all' }),
  ]);

  if (matchesResult.error) throw matchesResult.error;
  if (marketsResult.error) throw marketsResult.error;
  if (predictionsResult.error) throw predictionsResult.error;
  if (syncResult.error) throw syncResult.error;
  if (leaderboardResult.error) throw leaderboardResult.error;

  const predictions = predictionsResult.data ?? [];
  const marketStats = new Map<string, { prediction_count: number; coins_spent: number; potential_reward: number }>();

  predictions.forEach((prediction) => {
    if (!prediction.market_id) return;
    const current = marketStats.get(prediction.market_id) ?? {
      prediction_count: 0,
      coins_spent: 0,
      potential_reward: 0,
    };

    current.prediction_count += 1;
    current.coins_spent += prediction.coins_spent ?? 0;
    current.potential_reward += prediction.potential_reward ?? 0;
    marketStats.set(prediction.market_id, current);
  });

  const markets = (marketsResult.data ?? []).map((market) => ({
    ...market,
    prediction_count: marketStats.get(market.id)?.prediction_count ?? 0,
    coins_spent: marketStats.get(market.id)?.coins_spent ?? 0,
    potential_reward: marketStats.get(market.id)?.potential_reward ?? 0,
  }));

  return {
    matches: matchesResult.data ?? [],
    markets,
    sync_status: syncResult.data,
    leaderboard: leaderboardResult.data ?? [],
    stats: {
      total_matches: matchesResult.data?.length ?? 0,
      total_predictions: predictions.length,
      total_coins_spent: predictions.reduce((sum, prediction) => sum + (prediction.coins_spent ?? 0), 0),
      total_coins_rewarded: predictions.reduce(
        (sum, prediction) => sum + (prediction.result === 'won' && prediction.reward_paid ? prediction.potential_reward ?? 0 : 0),
        0,
      ),
    },
  };
};

const cleanMatchInput = (input: MatchInput) => ({
  ...(input.group_name !== undefined ? { group_name: input.group_name } : {}),
  ...(input.team_home !== undefined ? { team_home: input.team_home } : {}),
  ...(input.team_away !== undefined ? { team_away: input.team_away } : {}),
  ...(input.kickoff_time !== undefined ? { kickoff_time: input.kickoff_time } : {}),
  ...(input.status !== undefined ? { status: input.status } : {}),
  ...(input.home_score !== undefined ? { home_score: input.home_score } : {}),
  ...(input.away_score !== undefined ? { away_score: input.away_score } : {}),
});

const settleMatch = async (adminClient: ReturnType<typeof getAdminClient>, matchId: string) => {
  const { data: matchResult, error: matchError } = await adminClient.rpc('wc_settle_finished_match', {
    p_match_id: matchId,
  });
  if (matchError) throw matchError;

  const { data: sweepResult, error: sweepError } = await adminClient.rpc('settleWorldCupMarkets');
  if (sweepError) throw sweepError;

  return { match_result: matchResult, sweep_result: sweepResult };
};

export default async (request: Request) => {
  try {
    if (request.method === 'GET') {
      const { error } = await ensureAdmin(request);
      if (error) return error;
      return jsonResponse(await getDashboard());
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method not allowed' }, 405);
    }

    const { adminClient, error } = await ensureAdmin(request);
    if (error) return error;

    const body = await request.json();
    const action = body.action as string;
    const payload = body.payload ?? {};

    if (action === 'import_matches') {
      const rows = (payload.rows ?? []) as MatchInput[];
      const preparedRows = rows
        .map((row) => cleanMatchInput({ ...row, status: row.status ?? 'scheduled' }))
        .filter((row) => row.group_name && row.team_home && row.team_away && row.kickoff_time);

      if (preparedRows.length === 0) {
        return jsonResponse({ error: 'no valid match rows' }, 400);
      }

      const { data, error: upsertError } = await adminClient
        .from('wc_matches')
        .upsert(preparedRows, { onConflict: 'group_name,team_home,team_away,kickoff_time' })
        .select('id');

      if (upsertError) throw upsertError;
      return jsonResponse({ imported: data?.length ?? preparedRows.length });
    }

    if (action === 'create_match') {
      const row = cleanMatchInput({ ...payload, status: payload.status ?? 'scheduled' });
      const { data, error: insertError } = await adminClient.from('wc_matches').insert(row).select().single();
      if (insertError) throw insertError;
      return jsonResponse({ match: data });
    }

    if (action === 'update_match') {
      const { id, ...rest } = payload as MatchInput;
      if (!id) return jsonResponse({ error: 'missing match id' }, 400);

      const { data, error: updateError } = await adminClient
        .from('wc_matches')
        .update(cleanMatchInput(rest))
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;
      return jsonResponse({ match: data });
    }

    if (action === 'delete_match') {
      if (!payload.id) return jsonResponse({ error: 'missing match id' }, 400);
      const { error: deleteError } = await adminClient.from('wc_matches').delete().eq('id', payload.id);
      if (deleteError) throw deleteError;
      return jsonResponse({ deleted: true });
    }

    if (action === 'update_score') {
      if (!payload.id) return jsonResponse({ error: 'missing match id' }, 400);

      const { data, error: updateError } = await adminClient
        .from('wc_matches')
        .update({
          home_score: Number(payload.home_score),
          away_score: Number(payload.away_score),
        })
        .eq('id', payload.id)
        .select()
        .single();

      if (updateError) throw updateError;
      const settlement = await settleMatch(adminClient, payload.id);
      return jsonResponse({ match: data, settlement });
    }

    if (action === 'bulk_scores') {
      const rows = (payload.rows ?? []) as Array<{ id: string; home_score: number; away_score: number }>;
      let updated = 0;
      const settlements = [];

      for (const row of rows) {
        if (!row.id) continue;
        const { error: updateError } = await adminClient
          .from('wc_matches')
          .update({
            home_score: Number(row.home_score),
            away_score: Number(row.away_score),
          })
          .eq('id', row.id);

        if (updateError) throw updateError;
        settlements.push(await settleMatch(adminClient, row.id));
        updated += 1;
      }

      return jsonResponse({ updated, settlements });
    }

    if (action === 'settle_market') {
      const { data, error: settleError } = await adminClient.rpc('wc_settle_market', {
        p_market_slug: payload.slug,
        p_correct_option: payload.correct_option,
      });
      if (settleError) throw settleError;
      return jsonResponse(data);
    }

    if (action === 'cancel_market') {
      const { data, error: cancelError } = await adminClient.rpc('wc_cancel_market', {
        p_market_slug: payload.slug,
      });
      if (cancelError) throw cancelError;
      return jsonResponse(data);
    }

    if (action === 'settle_all') {
      const { data, error: settleError } = await adminClient.rpc('settleWorldCupMarkets');
      if (settleError) throw settleError;
      return jsonResponse(data);
    }

    return jsonResponse({ error: `unknown action: ${action}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'World Cup admin request failed';
    return jsonResponse({ error: message }, 500);
  }
};

export const config = {
  method: ['GET', 'POST'],
};
