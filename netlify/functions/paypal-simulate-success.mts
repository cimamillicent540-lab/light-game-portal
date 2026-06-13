import { getPaypalProduct, isTestPaymentsEnabled, jsonResponse, requireAdminUser } from './_shared/paypal.mjs';

type SimulateRequest = {
  package_id?: string;
  vip_plan_slug?: string;
};

const simulatedPaypalOrderId = (paymentOrderId: string) => `SIM-${paymentOrderId}`;

export default async (request: Request) => {
  try {
    if (request.method === 'GET') {
      const { user, error } = await requireAdminUser(request);
      if (error) return error;

      return jsonResponse({
        enabled: isTestPaymentsEnabled(),
        admin: Boolean(user),
      });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method not allowed' }, 405);
    }

    const { supabase, user, error } = await requireAdminUser(request);
    if (error) return error;
    if (!user) return jsonResponse({ error: 'login required' }, 401);

    if (!isTestPaymentsEnabled()) {
      return jsonResponse({ error: 'test payments are disabled' }, 403);
    }

    const body = (await request.json()) as SimulateRequest;
    const product = await getPaypalProduct(supabase, body);

    if (!body.package_id && !body.vip_plan_slug) {
      return jsonResponse({ error: 'package_id or vip_plan_slug is required' }, 400);
    }

    if (!product) {
      return jsonResponse({ error: 'payment product not found' }, 404);
    }

    const { data: paymentOrder, error: orderError } = await supabase
      .from('payment_orders')
      .insert({
        user_id: user.id,
        provider: 'paypal',
        payment_kind: product.kind,
        package_id: product.kind === 'coins' ? product.id : null,
        vip_plan_id: product.kind === 'vip' ? product.id : null,
        amount_usd: product.amount_usd,
        coins: product.coins,
        currency: 'USD',
        status: 'pending',
        raw_response: {
          simulated: true,
          payment_kind: product.kind,
          product_id: product.id,
        },
        raw_payload: {
          simulated: true,
          payment_kind: product.kind,
          product_id: product.id,
        },
      })
      .select('id')
      .single();

    if (orderError) throw orderError;

    const paypalOrderId = simulatedPaypalOrderId(paymentOrder.id);
    const rawResponse = {
      simulated: true,
      id: paypalOrderId,
      status: 'COMPLETED',
      purchase_units: [
        {
          amount: {
            currency_code: 'USD',
            value: Number(product.amount_usd).toFixed(2),
          },
        },
      ],
    };

    const { error: providerOrderUpdateError } = await supabase
      .from('payment_orders')
      .update({
        provider_order_id: paypalOrderId,
      })
      .eq('id', paymentOrder.id);

    if (providerOrderUpdateError) throw providerOrderUpdateError;

    const { data: finalizeResult, error: finalizeError } = await supabase.rpc('finalize_paypal_order', {
      p_order_id: paymentOrder.id,
      p_provider_order_id: paypalOrderId,
      p_raw_response: rawResponse,
    });

    if (finalizeError) throw finalizeError;

    return jsonResponse({
      payment_order_id: paymentOrder.id,
      paypal_order_id: paypalOrderId,
      ...finalizeResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PayPal simulation failed';
    return jsonResponse({ error: message }, 500);
  }
};

export const config = {
  method: ['GET', 'POST'],
};
