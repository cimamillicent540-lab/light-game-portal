declare const Netlify: {
  env: {
    get(key: string): string | undefined;
  };
};

type AnalysisRequest = {
  marketSlug?: string;
  marketTitle?: string;
  marketType?: string;
  options?: string[];
  locksAt?: string;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const callSupabaseRpc = async (token: string, body: AnalysisRequest) => {
  const supabaseUrl = Netlify.env.get('SUPABASE_URL') ?? Netlify.env.get('VITE_SUPABASE_URL');
  const supabaseAnonKey = Netlify.env.get('SUPABASE_ANON_KEY') ?? Netlify.env.get('VITE_SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment is not configured');
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/wc_use_ai_assistant`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_market_slug: body.marketSlug ?? null,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || 'AI usage charge failed');
  }

  return (await response.json()) as { coins_spent: number; vip_free: boolean };
};

const callOpenAI = async (body: AnalysisRequest) => {
  const apiKey = Netlify.env.get('OPENAI_API_KEY');
  const model = Netlify.env.get('OPENAI_MODEL') ?? 'gpt-4.1-mini';

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const prompt = [
    '你是 World Cup Prediction Challenge 的 AI Prediction Assistant。',
    '重要规则：禁止直接给下注建议，禁止使用“应该买/下注/押注”等措辞。',
    '只输出球队状态分析、胜率区间分析、历史交锋分析和风险提示。',
    `竞猜标题：${body.marketTitle ?? 'Unknown market'}`,
    `竞猜类型：${body.marketType ?? 'unknown'}`,
    `选项：${(body.options ?? []).join(', ') || 'unknown'}`,
    `锁定时间：${body.locksAt ?? 'unknown'}`,
    '请用中文输出，结构清晰，最多 180 字。',
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: 320,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || 'OpenAI request failed');
  }

  const data = await response.json();
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const text = data.output
    ?.flatMap((item: { content?: Array<{ text?: string }> }) => item.content ?? [])
    .map((content: { text?: string }) => content.text)
    .filter(Boolean)
    .join('\n');

  return text || '暂无可用分析。请结合球队状态、赛程和不确定性谨慎娱乐参与。';
};

export default async (request: Request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed' }, 405);
  }

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return jsonResponse({ error: 'missing authorization token' }, 401);
  }

  try {
    const body = (await request.json()) as AnalysisRequest;
    const openAiKey = Netlify.env.get('OPENAI_API_KEY');
    if (!openAiKey) {
      return jsonResponse({ error: 'OPENAI_API_KEY is not configured' }, 500);
    }

    const usage = await callSupabaseRpc(token, body);
    const analysis = await callOpenAI(body);

    return jsonResponse({
      analysis,
      coins_spent: usage.coins_spent,
      vip_free: usage.vip_free,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'AI analysis failed' }, 400);
  }
};
