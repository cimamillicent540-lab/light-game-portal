import { supabase } from './supabase';

export type CoinPackage = {
  id: string;
  name: string;
  price_usd: number;
  coins: number;
};

export type VipPlan = {
  id: string;
  slug: string;
  name: string;
  price_usd: number;
  duration_days: number;
  daily_bonus: number;
  reward_multiplier: number;
};

export type PaymentProductSelection =
  | {
      kind: 'coins';
      packageId: string;
    }
  | {
      kind: 'vip';
      vipPlanSlug: string;
    };

export type PaymentOrder = {
  id: string;
  package_id: string | null;
  vip_plan_id: string | null;
  payment_kind: 'coins' | 'vip';
  amount_usd: number;
  coins: number;
  currency: string;
  status: 'pending' | 'created' | 'approved' | 'paid' | 'cancelled' | 'failed' | 'refunded';
  created_at: string;
  paid_at: string | null;
};

export type CoinTransaction = {
  id: string;
  amount: number;
  balance_after: number | null;
  type: string;
  description: string | null;
  source: string | null;
  created_at: string;
};

export const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined;

const getAccessToken = async () => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('请先登录后充值。');
  }

  return session.access_token;
};

export const getCoinPackages = async () => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const { data, error } = await supabase
    .from('coin_packages')
    .select('id, name, price_usd, coins')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []) as CoinPackage[];
};

export const getVipPlans = async () => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const { data, error } = await supabase
    .from('vip_plans')
    .select('id, slug, name, price_usd, duration_days, daily_bonus, reward_multiplier')
    .eq('is_active', true)
    .order('price_usd', { ascending: true });

  if (error) throw error;
  return (data ?? []) as VipPlan[];
};

const selectionToBody = (selection: PaymentProductSelection) =>
  selection.kind === 'coins'
    ? { package_id: selection.packageId }
    : { vip_plan_slug: selection.vipPlanSlug };

export const createPayPalOrder = async (selection: PaymentProductSelection) => {
  const accessToken = await getAccessToken();
  const response = await fetch('/.netlify/functions/paypal-create-order', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(selectionToBody(selection)),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? 'PayPal order creation failed');
  }

  return data as { payment_order_id: string; paypal_order_id: string; payment_kind: 'coins' | 'vip' };
};

export const capturePayPalOrder = async (paypalOrderId: string) => {
  const accessToken = await getAccessToken();
  const response = await fetch('/.netlify/functions/paypal-capture-order', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paypal_order_id: paypalOrderId }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? 'PayPal capture failed');
  }

  return data as {
    already_processed: boolean;
    payment_kind: 'coins' | 'vip';
    balance: number;
    coins: number;
    vip?: {
      vip_level?: string;
      expires_at?: string;
      reward_multiplier?: number;
    };
  };
};

export const getPayPalSimulationStatus = async () => {
  const accessToken = await getAccessToken();
  const response = await fetch('/.netlify/functions/paypal-simulate-success', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 403 || response.status === 401) {
    return { enabled: false, admin: false };
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? 'PayPal simulation status failed');
  }

  return data as { enabled: boolean; admin: boolean };
};

export const simulatePayPalSuccess = async (selection: PaymentProductSelection) => {
  const accessToken = await getAccessToken();
  const response = await fetch('/.netlify/functions/paypal-simulate-success', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(selectionToBody(selection)),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? 'PayPal simulation failed');
  }

  return data as {
    already_processed: boolean;
    payment_kind: 'coins' | 'vip';
    balance: number;
    coins: number;
    vip?: {
      vip_level?: string;
      expires_at?: string;
      reward_multiplier?: number;
    };
  };
};

export const getMyPaymentOrders = async () => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const { data, error } = await supabase
    .from('payment_orders')
    .select('id, package_id, vip_plan_id, payment_kind, amount_usd, coins, currency, status, created_at, paid_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;
  return (data ?? []) as PaymentOrder[];
};

export const getMyCoinTransactions = async () => {
  if (!supabase) {
    throw new Error('Supabase 环境变量尚未配置。');
  }

  const { data, error } = await supabase
    .from('coin_transactions')
    .select('id, amount, balance_after, type, description, source, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;
  return (data ?? []) as CoinTransaction[];
};
