import { getServiceClient, jsonResponse } from './_shared/paypal.mjs';

type PaypalWebhookEvent = {
  id?: string;
  event_type?: string;
  [key: string]: unknown;
};

export default async (request: Request) => {
  try {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method not allowed' }, 405);
    }

    const payload = (await request.json()) as PaypalWebhookEvent;
    const supabase = getServiceClient();

    const { error } = await supabase.from('paypal_webhook_events').upsert(
      {
        paypal_event_id: payload.id ?? null,
        event_type: payload.event_type ?? null,
        raw_payload: payload,
      },
      {
        onConflict: 'paypal_event_id',
        ignoreDuplicates: true,
      },
    );

    if (error) throw error;

    return jsonResponse({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PayPal webhook failed';
    return jsonResponse({ error: message }, 500);
  }
};

export const config = {
  method: ['POST'],
};
