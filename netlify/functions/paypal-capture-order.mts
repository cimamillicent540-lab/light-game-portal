import {
  formatUsd,
  getPaypalAccessToken,
  getPaypalBaseUrl,
  isUsdAmountMatch,
  jsonResponse,
  requireUser,
} from './_shared/paypal.mjs';

type CaptureOrderRequest = {
  paypal_order_id?: string;
};

type PaypalCaptureResponse = {
  id?: string;
  status?: string;
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{
        id?: string;
        status?: string;
        amount?: {
          currency_code?: string;
          value?: string;
        };
      }>;
    };
  }>;
  message?: string;
  error_description?: string;
};

const getCompletedCapture = (paypalCapture: PaypalCaptureResponse) =>
  paypalCapture.purchase_units?.flatMap((unit) => unit.payments?.captures ?? []).find((capture) => capture.status === 'COMPLETED');

export default async (request: Request) => {
  try {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method not allowed' }, 405);
    }

    const { supabase, user, error } = await requireUser(request);
    if (error) return error;
    if (!user) return jsonResponse({ error: 'login required' }, 401);

    const body = (await request.json()) as CaptureOrderRequest;
    const paypalOrderId = body.paypal_order_id;

    if (!paypalOrderId) {
      return jsonResponse({ error: 'paypal_order_id is required' }, 400);
    }

    const { data: paymentOrder, error: orderError } = await supabase
      .from('payment_orders')
      .select('id, user_id, provider_order_id, payment_kind, amount_usd, coins, currency, status')
      .eq('provider', 'paypal')
      .eq('provider_order_id', paypalOrderId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!paymentOrder) {
      return jsonResponse({ error: 'payment order not found' }, 404);
    }

    if (paymentOrder.status === 'paid') {
      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();

      return jsonResponse({
        already_processed: true,
        payment_kind: paymentOrder.payment_kind ?? 'coins',
        coins: paymentOrder.coins,
        balance: wallet?.balance ?? 0,
      });
    }

    const accessToken = await getPaypalAccessToken();
    const response = await fetch(`${getPaypalBaseUrl()}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
    });

    const paypalCapture = (await response.json()) as PaypalCaptureResponse;
    if (!response.ok) {
      await supabase
        .from('payment_orders')
        .update({
          status: 'failed',
          raw_response: paypalCapture,
          raw_payload: paypalCapture,
        })
        .eq('id', paymentOrder.id)
        .neq('status', 'paid');

      throw new Error(paypalCapture.message ?? paypalCapture.error_description ?? 'PayPal capture failed');
    }

    if (paypalCapture.status !== 'COMPLETED') {
      throw new Error(`PayPal order status is ${paypalCapture.status ?? 'unknown'}`);
    }

    const completedCapture = getCompletedCapture(paypalCapture);
    if (!completedCapture) {
      throw new Error('PayPal capture status is not COMPLETED');
    }

    if (completedCapture.amount?.currency_code !== 'USD' || paymentOrder.currency !== 'USD') {
      throw new Error('PayPal capture currency must be USD');
    }

    if (!isUsdAmountMatch(completedCapture.amount.value, paymentOrder.amount_usd)) {
      throw new Error(
        `PayPal capture amount mismatch: expected ${formatUsd(paymentOrder.amount_usd)}, got ${completedCapture.amount.value ?? 'unknown'}`,
      );
    }

    const { data: finalizeResult, error: finalizeError } = await supabase.rpc('finalize_paypal_order', {
      p_order_id: paymentOrder.id,
      p_provider_order_id: paypalOrderId,
      p_raw_response: paypalCapture,
    });

    if (finalizeError) throw finalizeError;

    return jsonResponse(finalizeResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PayPal capture failed';
    return jsonResponse({ error: message }, 500);
  }
};

export const config = {
  method: ['POST'],
};
