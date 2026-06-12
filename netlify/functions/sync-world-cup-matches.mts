import { syncWorldCupMatches } from './_shared/worldCupSync.mjs';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export default async () => {
  try {
    const result = await syncWorldCupMatches();
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'World Cup match sync failed';
    return jsonResponse({ error: message }, 500);
  }
};

export const config = {
  schedule: '@daily',
};
