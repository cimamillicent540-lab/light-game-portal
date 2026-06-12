import { isTestPaymentsEnabled, jsonResponse, requireAdminUser, type CoinPackage } from './_shared/paypal.mjs';

type SimulateRequest = {
  package_id?: string;
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
        raw_response: {
          simulated: true,
          package_id: selectedPackage.id,
        },
        raw_payload: {
          simulated: true,
          package_id: selectedPackage.id,
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
            value: Number(selectedPackage.price_usd).toFixed(2),
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

    const { data: finalizeResult, error: finalizeError } = await supabase.rpc('finalize_paypal_recharge', {
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
