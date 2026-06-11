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

export const useWorldCupAiAssistant = async (marketSlug?: string) => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const { data, error } = await supabase.rpc('wc_use_ai_assistant', {
    p_market_slug: marketSlug ?? null,
  });

  if (error) {
    throw error;
  }

  return data as { coins_spent: number; vip_free: boolean };
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
