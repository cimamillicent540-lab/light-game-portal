import {
  formatUsd,
  getPaypalAccessToken,
  getPaypalBaseUrl,
  getPaypalProduct,
  jsonResponse,
  requireUser,
} from './_shared/paypal.mjs';

type CreateOrderRequest = {
  package_id?: string;
  vip_plan_slug?: string;
};

export default async (request: Request) => {
  try {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method not allowed' }, 405);
    }

    const { supabase, user, error } = await requireUser(request);
    if (error) return error;
    if (!user) return jsonResponse({ error: 'login required' }, 401);

    const body = (await request.json()) as CreateOrderRequest;
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
      })
      .select('id')
      .single();

    if (orderError) throw orderError;

    const accessToken = await getPaypalAccessToken();
    const response = await fetch(`${getPaypalBaseUrl()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: paymentOrder.id,
            custom_id: paymentOrder.id,
            invoice_id: paymentOrder.id,
            description: product.description,
            amount: {
              currency_code: 'USD',
              value: formatUsd(product.amount_usd),
            },
          },
        ],
      }),
    });

    const paypalOrder = await response.json();
    if (!response.ok) {
      await supabase
        .from('payment_orders')
        .update({
          status: 'failed',
          raw_response: paypalOrder,
          raw_payload: paypalOrder,
        })
        .eq('id', paymentOrder.id);

      throw new Error(paypalOrder.message ?? paypalOrder.error_description ?? 'PayPal create order failed');
    }

    const { error: updateError } = await supabase
      .from('payment_orders')
      .update({
        provider_order_id: paypalOrder.id,
        raw_response: paypalOrder,
        raw_payload: paypalOrder,
      })
      .eq('id', paymentOrder.id);

    if (updateError) throw updateError;

    return jsonResponse({
      payment_order_id: paymentOrder.id,
      paypal_order_id: paypalOrder.id,
      payment_kind: product.kind,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PayPal order creation failed';
    return jsonResponse({ error: message }, 500);
  }
};

export const config = {
  method: ['POST'],
};
