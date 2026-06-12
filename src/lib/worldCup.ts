import { supabase } from './supabase';

export type WorldCupMarket = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  market_type: 'match' | 'group' | 'champion' | 'golden_boot' | 'special';
  options: string[];
  entry_cost: number;
  reward_amount: number;
  status: 'open' | 'locked' | 'settled' | 'cancelled';
  opens_at: string;
  locks_at: string;
  settles_at: string | null;
  correct_option: string | null;
  created_at: string;
};

export type WorldCupSummary = {
  event_enabled: boolean;
  event_start: string;
  event_end: string;
  is_active: boolean;
  participants: number;
  prediction_count: number;
  coins_paid: number;
  hot_markets: Array<{
    slug: string;
    title: string;
    entry_cost: number;
    reward_amount: number;
    prediction_count: number;
  }>;
};

export type WorldCupPrediction = {
  id: string;
  selected_option: string;
  coins_spent: number;
  potential_reward: number;
  result: 'pending' | 'won' | 'lost' | 'cancelled';
  reward_paid: boolean;
  created_at: string;
  wc_markets: {
    slug: string;
    title: string;
    market_type: string;
  } | null;
};

export type WorldCupLeaderboardRow = {
  rank: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  vip_level: string | null;
  total_predictions: number;
  correct_predictions: number;
  accuracy_rate: number;
  coins_won: number;
  coins_spent: number;
  profit: number;
  current_streak: number;
  best_streak: number;
  is_highlighted: boolean;
};

export type WorldCupMatch = {
  id: string;
  group_name: string;
  team_home: string;
  team_away: string;
  kickoff_time: string;
  status: 'scheduled' | 'live' | 'finished';
  home_score: number | null;
  away_score: number | null;
  winner: string | null;
  market_slug: string | null;
  market_status: string | null;
  locks_at: string | null;
  prediction_count: number;
};

export type WorldCupShopItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: 'avatar_frame' | 'leaderboard_highlight' | 'ai_ticket' | 'cosmetic';
  price: number;
  duration_days: number | null;
  metadata: Record<string, unknown>;
};

export type WorldCupShopPurchase = {
  id: string;
  price_paid: number;
  created_at: string;
  shop_items: {
    slug: string;
    name: string;
    category: string;
  } | null;
};

export type WorldCupEconomyStats = {
  total_predictions: number;
  correct_predictions: number;
  accuracy_rate: number;
  coins_won: number;
  coins_spent: number;
  profit: number;
  current_rank: number | null;
  world_cup_avatar_frame: string | null;
  leaderboard_highlight_expires_at: string | null;
  is_highlighted: boolean;
};

export type WorldCupAdminSyncStatus = {
  latest_syncs: Array<{
    sync_type: 'matches' | 'scores' | 'settlement';
    provider: string;
    status: 'success' | 'failed';
    last_synced_at: string;
    message: string | null;
    records_processed: number;
  }>;
  match_count: number;
  scheduled_count: number;
  live_count: number;
  finished_count: number;
  market_count: number;
  pending_settlement_count: number;
  settled_market_count: number;
};

export const worldCupEventStart = new Date('2026-06-11T00:00:00Z');
export const worldCupEventEnd = new Date('2026-07-22T23:59:59Z');

export const getVipWorldCupMultiplier = (vipLevel?: string | null) => {
  const level = vipLevel?.toLowerCase() ?? 'free';
  if (level === 'vip3' || level === 'yearly_vip') {
    return 2;
  }
  if (level === 'vip2' || level === 'quarterly_vip') {
    return 1.5;
  }
  if (level === 'vip1' || level === 'monthly_vip') {
    return 1.2;
  }
  return 1;
};

export const getWorldCupSummary = async () => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const { data, error } = await supabase.rpc('wc_get_event_summary');
  if (error) {
    throw error;
  }

  return data as WorldCupSummary;
};

export const getWorldCupMarkets = async () => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const { data, error } = await supabase
    .from('wc_markets')
    .select('id, slug, title, description, market_type, options, entry_cost, reward_amount, status, opens_at, locks_at, settles_at, correct_option, created_at')
    .order('locks_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((market) => ({
    ...market,
    options: Array.isArray(market.options) ? market.options : [],
  })) as WorldCupMarket[];
};

export const getWorldCupMatches = async () => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const { data, error } = await supabase.rpc('wc_get_recent_matches', {
    p_limit: 50,
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as WorldCupMatch[];
};

export const getTodayWorldCupMatches = async () => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const { data, error } = await supabase.rpc('wc_get_recent_matches', {
    p_limit: 10,
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as WorldCupMatch[];
};

export const placeWorldCupPrediction = async (marketSlug: string, selectedOption: string) => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const { data, error } = await supabase.rpc('wc_place_prediction', {
    p_market_slug: marketSlug,
    p_selected_option: selectedOption,
  });

  if (error) {
    throw error;
  }

  return data as {
    prediction_id: string;
    coins_spent: number;
    potential_reward: number;
    daily_task_reward: number;
  };
};

export const useWorldCupAiAssistant = async (market: {
  slug?: string;
  title?: string;
  marketType?: string;
  options?: string[];
  locksAt?: string;
}) => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('login required');
  }

  const response = await fetch('/.netlify/functions/world-cup-ai-analysis', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      marketSlug: market.slug,
      marketTitle: market.title,
      marketType: market.marketType,
      options: market.options,
      locksAt: market.locksAt,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? 'AI 分析生成失败');
  }

  return data as { analysis: string; coins_spent: number; vip_free: boolean };
};

export const getWorldCupLeaderboard = async (period: 'today' | 'week' | 'all') => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const { data, error } = await supabase.rpc('wc_get_leaderboard', {
    p_period: period,
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as WorldCupLeaderboardRow[];
};

export const getMyWorldCupPredictions = async () => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const { data, error } = await supabase
    .from('wc_predictions')
    .select('id, selected_option, coins_spent, potential_reward, result, reward_paid, created_at, wc_markets(slug, title, market_type)')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as WorldCupPrediction[];
};

export const getWorldCupShopItems = async () => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const { data, error } = await supabase
    .from('shop_items')
    .select('id, slug, name, description, category, price, duration_days, metadata')
    .eq('is_active', true)
    .order('price', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as WorldCupShopItem[];
};

export const getWorldCupShopPurchases = async () => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const { data, error } = await supabase
    .from('shop_purchases')
    .select('id, price_paid, created_at, shop_items(slug, name, category)')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as WorldCupShopPurchase[];
};

export const purchaseWorldCupShopItem = async (itemSlug: string) => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const { data, error } = await supabase.rpc('wc_purchase_shop_item', {
    p_item_slug: itemSlug,
  });

  if (error) {
    throw error;
  }

  return data as { purchase_id: string; item_slug: string; price_paid: number; balance: number };
};

export const getMyWorldCupEconomyStats = async () => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const { data, error } = await supabase.rpc('wc_get_my_economy_stats');

  if (error) {
    throw error;
  }

  return data as WorldCupEconomyStats;
};

export const getWorldCupAdminSyncStatus = async () => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const { data, error } = await supabase.rpc('wc_get_admin_sync_status');

  if (error) {
    throw error;
  }

  return data as WorldCupAdminSyncStatus;
};

export const formatWorldCupDate = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

export const getEventCountdown = (target: Date) => {
  const diff = Math.max(0, target.getTime() - Date.now());
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return `${days}天 ${hours}小时 ${minutes}分`;
};

export const getMatchCountdown = (kickoffTime: string) => {
  const kickoff = new Date(kickoffTime).getTime();
  const diff = kickoff - Date.now();

  if (diff <= 0) {
    return '已开赛';
  }

  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return hours >= 24 ? `${Math.floor(hours / 24)}天 ${hours % 24}小时` : `${hours}小时 ${minutes}分`;
};
