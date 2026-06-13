import { createClient } from '@supabase/supabase-js';

declare const Netlify: {
  env: {
    get(key: string): string | undefined;
  };
};

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
  reward_multiplier: number;
};

export type PaypalProduct =
  | {
      kind: 'coins';
      id: string;
      name: string;
      amount_usd: number;
      coins: number;
      description: string;
    }
  | {
      kind: 'vip';
      id: string;
      slug: string;
      name: string;
      amount_usd: number;
      coins: 0;
      description: string;
    };

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const getServiceClient = () => {
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

export const requireUser = async (request: Request) => {
  const supabase = getServiceClient();
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return { supabase, error: jsonResponse({ error: 'missing authorization token' }, 401) };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { supabase, error: jsonResponse({ error: 'invalid authorization token' }, 401) };
  }

  return { supabase, user };
};

export const getPaypalEnvironment = () => (Netlify.env.get('PAYPAL_ENV') ?? 'sandbox').toLowerCase();

export const isTestPaymentsEnabled = () => {
  const paypalEnvironment = getPaypalEnvironment();
  const nodeEnvironment = (Netlify.env.get('NODE_ENV') ?? '').toLowerCase();
  const explicitTestFlag = (Netlify.env.get('TEST_PAYMENTS_ENABLED') ?? '').toLowerCase() === 'true';

  return paypalEnvironment === 'sandbox' && (nodeEnvironment !== 'production' || explicitTestFlag);
};

export const requireAdminUser = async (request: Request) => {
  const { supabase, user, error } = await requireUser(request);
  if (error || !user) {
    return { supabase, user, error };
  }

  const allowlist = (Netlify.env.get('ADMIN_EMAILS') ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!allowlist.length) {
    return { supabase, user, error: jsonResponse({ error: 'ADMIN_EMAILS is not configured' }, 403) };
  }

  if (!allowlist.includes((user.email ?? '').toLowerCase())) {
    return { supabase, user, error: jsonResponse({ error: 'admin access denied' }, 403) };
  }

  return { supabase, user };
};

export const getPaypalBaseUrl = () => {
  return getPaypalEnvironment() === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
};

export const getPaypalAccessToken = async () => {
  const clientId = Netlify.env.get('PAYPAL_CLIENT_ID');
  const clientSecret = Netlify.env.get('PAYPAL_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('PayPal service environment is not configured');
  }

  const credentials = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch(`${getPaypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description ?? data.error ?? 'PayPal authentication failed');
  }

  return data.access_token as string;
};

export const formatUsd = (value: number | string) => Number(value).toFixed(2);

export const isUsdAmountMatch = (actual: string | number | undefined, expected: string | number) =>
  formatUsd(actual ?? 0) === formatUsd(expected);

export const getPaypalProduct = async (
  supabase: ReturnType<typeof getServiceClient>,
  input: { package_id?: string; vip_plan_slug?: string },
): Promise<PaypalProduct | null> => {
  if (input.vip_plan_slug) {
    const { data: vipPlan, error } = await supabase
      .from('vip_plans')
      .select('id, slug, name, price_usd, duration_days, reward_multiplier')
      .eq('slug', input.vip_plan_slug)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    if (!vipPlan) return null;

    const selectedPlan = vipPlan as VipPlan;
    return {
      kind: 'vip',
      id: selectedPlan.id,
      slug: selectedPlan.slug,
      name: selectedPlan.name,
      amount_usd: selectedPlan.price_usd,
      coins: 0,
      description: `${selectedPlan.name} VIP subscription - ${selectedPlan.duration_days} days`,
    };
  }

  if (input.package_id) {
    const { data: coinPackage, error } = await supabase
      .from('coin_packages')
      .select('id, name, price_usd, coins')
      .eq('id', input.package_id)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    if (!coinPackage) return null;

    const selectedPackage = coinPackage as CoinPackage;
    return {
      kind: 'coins',
      id: selectedPackage.id,
      name: selectedPackage.name,
      amount_usd: selectedPackage.price_usd,
      coins: selectedPackage.coins,
      description: `${selectedPackage.name} - ${selectedPackage.coins} coins`,
    };
  }

  return null;
};
