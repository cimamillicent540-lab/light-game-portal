import { createClient, type SupabaseClient } from '@supabase/supabase-js';

declare const Netlify: {
  env: {
    get(key: string): string | undefined;
  };
};

type ApiFootballFixture = {
  fixture: {
    id: number;
    date: string;
    status: {
      short: string;
    };
  };
  league: {
    round?: string;
  };
  teams: {
    home: {
      name: string;
    };
    away: {
      name: string;
    };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
};

type SyncResult = {
  provider: 'api-football';
  processed: number;
  updated: number;
  message: string;
};

const provider = 'api-football' as const;
const worldCupLeagueId = Netlify.env.get('SPORTS_API_FOOTBALL_LEAGUE_ID') ?? '1';
const worldCupSeason = Netlify.env.get('SPORTS_API_FOOTBALL_SEASON') ?? '2026';
const apiBaseUrl = Netlify.env.get('SPORTS_API_BASE_URL') ?? 'https://v3.football.api-sports.io';

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

const fetchApiFootballFixtures = async () => {
  const sportsApiKey = Netlify.env.get('SPORTS_API_KEY');
  if (!sportsApiKey) {
    throw new Error('SPORTS_API_KEY is not configured');
  }

  const url = new URL('/fixtures', apiBaseUrl);
  url.searchParams.set('league', worldCupLeagueId);
  url.searchParams.set('season', worldCupSeason);
  url.searchParams.set('timezone', 'UTC');

  const response = await fetch(url, {
    headers: {
      'x-apisports-key': sportsApiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football request failed with ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors && Object.keys(payload.errors).length > 0) {
    throw new Error(`API-Football returned errors: ${JSON.stringify(payload.errors)}`);
  }

  return (payload.response ?? []) as ApiFootballFixture[];
};

const mapFixtureStatus = (shortStatus: string): 'scheduled' | 'live' | 'finished' => {
  if (['FT', 'AET', 'PEN'].includes(shortStatus)) {
    return 'finished';
  }

  if (['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'].includes(shortStatus)) {
    return 'live';
  }

  return 'scheduled';
};

const getWinner = (fixture: ApiFootballFixture) => {
  const status = mapFixtureStatus(fixture.fixture.status.short);
  const homeScore = fixture.goals.home;
  const awayScore = fixture.goals.away;

  if (status !== 'finished' || homeScore === null || awayScore === null) {
    return null;
  }

  if (homeScore > awayScore) {
    return `${fixture.teams.home.name} Win`;
  }

  if (awayScore > homeScore) {
    return `${fixture.teams.away.name} Win`;
  }

  return 'Draw';
};

const toMatchRow = (fixture: ApiFootballFixture, includeScores: boolean) => {
  const status = mapFixtureStatus(fixture.fixture.status.short);
  const base = {
    sports_provider: provider,
    provider_match_id: String(fixture.fixture.id),
    group_name: fixture.league.round ?? 'World Cup',
    team_home: fixture.teams.home.name,
    team_away: fixture.teams.away.name,
    kickoff_time: fixture.fixture.date,
    status,
    raw_payload: fixture as unknown as Record<string, unknown>,
  };

  if (!includeScores) {
    return base;
  }

  return {
    ...base,
    home_score: fixture.goals.home,
    away_score: fixture.goals.away,
    winner: getWinner(fixture),
  };
};

const recordSyncStatus = async (
  supabase: SupabaseClient,
  syncType: 'matches' | 'scores' | 'settlement',
  status: 'success' | 'failed',
  message: string,
  recordsProcessed: number,
  metadata: Record<string, unknown> = {},
) => {
  await supabase.rpc('wc_record_sync_status', {
    p_provider: provider,
    p_sync_type: syncType,
    p_status: status,
    p_message: message,
    p_records_processed: recordsProcessed,
    p_metadata: metadata,
  });
};

export const syncWorldCupMatches = async (): Promise<SyncResult> => {
  const supabase = getAdminClient();

  try {
    const fixtures = await fetchApiFootballFixtures();
    const rows = fixtures.map((fixture) => toMatchRow(fixture, false));

    if (rows.length > 0) {
      const { error } = await supabase
        .from('wc_matches')
        .upsert(rows, { onConflict: 'sports_provider,provider_match_id' });

      if (error) {
        throw error;
      }
    }

    await recordSyncStatus(supabase, 'matches', 'success', 'World Cup matches synced.', rows.length, {
      league: worldCupLeagueId,
      season: worldCupSeason,
    });

    return {
      provider,
      processed: fixtures.length,
      updated: rows.length,
      message: 'World Cup matches synced.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error';
    await recordSyncStatus(supabase, 'matches', 'failed', message, 0);
    throw error;
  }
};

export const syncWorldCupScores = async (): Promise<SyncResult> => {
  const supabase = getAdminClient();

  try {
    const fixtures = await fetchApiFootballFixtures();
    const liveOrFinishedFixtures = fixtures.filter((fixture) =>
      ['live', 'finished'].includes(mapFixtureStatus(fixture.fixture.status.short)),
    );
    const rows = liveOrFinishedFixtures.map((fixture) => toMatchRow(fixture, true));

    if (rows.length > 0) {
      const { error } = await supabase
        .from('wc_matches')
        .upsert(rows, { onConflict: 'sports_provider,provider_match_id' });

      if (error) {
        throw error;
      }
    }

    await recordSyncStatus(supabase, 'scores', 'success', 'World Cup scores synced.', rows.length, {
      league: worldCupLeagueId,
      season: worldCupSeason,
    });

    return {
      provider,
      processed: fixtures.length,
      updated: rows.length,
      message: 'World Cup scores synced.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown score sync error';
    await recordSyncStatus(supabase, 'scores', 'failed', message, 0);
    throw error;
  }
};

export const settleWorldCupMarkets = async () => {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc('settleWorldCupMarkets');

  if (error) {
    await recordSyncStatus(supabase, 'settlement', 'failed', error.message, 0);
    throw error;
  }

  return data as { settled_matches: number; paid_coins: number };
};
