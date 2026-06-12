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
