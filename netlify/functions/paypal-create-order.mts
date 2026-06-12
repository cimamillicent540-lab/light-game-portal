import {
  formatUsd,
  getPaypalAccessToken,
  getPaypalBaseUrl,
  jsonResponse,
  requireUser,
  type CoinPackage,
} from './_shared/paypal.mjs';

type CreateOrderRequest = {
  package_id?: string;
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
    const packageId = body.package_id;

    if (!packageId) {
      return jsonResponse({ error: 'package_id is required' }, 400);
    }

    const { data: coinPackage, error: packageError } = await supabase
      .from('coin_packages')
      .select('id, name, price_usd, coins')
      .eq('id', packageId)
      .eq('is_active', true)
      .maybeSingle();

    if (packageError) throw packageError;
    if (!coinPackage) {
      return jsonResponse({ error: 'coin package not found' }, 404);
    }

    const selectedPackage = coinPackage as CoinPackage;
    const { data: paymentOrder, error: orderError } = await supabase
      .from('payment_orders')
      .insert({
        user_id: user.id,
        provider: 'paypal',
        package_id: selectedPackage.id,
        amount_usd: selectedPackage.price_usd,
        coins: selectedPackage.coins,
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
            description: `${selectedPackage.name} - ${selectedPackage.coins} coins`,
            amount: {
              currency_code: 'USD',
              value: formatUsd(selectedPackage.price_usd),
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PayPal order creation failed';
    return jsonResponse({ error: message }, 500);
  }
};

export const config = {
  method: ['POST'],
};
