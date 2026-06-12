import { syncWorldCupScores } from './_shared/worldCupSync.mjs';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export default async () => {
  try {
    const result = await syncWorldCupScores();
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'World Cup score sync failed';
    return jsonResponse({ error: message }, 500);
  }
};

export const config = {
  schedule: '*/5 * * * *',
};
