import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { UserWallet } from '../auth/AuthContext';
import {
  capturePayPalOrder,
  createPayPalOrder,
  getCoinPackages,
  getPayPalSimulationStatus,
  getVipPlans,
  paypalClientId,
  simulatePayPalSuccess,
  type CoinPackage,
  type PaymentProductSelection,
  type VipPlan,
} from '../lib/recharge';

declare global {
  interface Window {
    paypal?: {
      Buttons: (options: {
        createOrder: () => Promise<string>;
        onApprove: (data: { orderID: string }) => Promise<void>;
        onError: (error: unknown) => void;
        onCancel: () => void;
      }) => {
        render: (selector: string | HTMLElement) => Promise<void>;
        close?: () => Promise<void>;
      };
    };
  }
}

type RechargePageProps = {
  user: User;
  wallet: UserWallet | null;
  onRefresh: () => Promise<void>;
};

const sdkScriptId = 'paypal-js-sdk';

const loadPayPalSdk = () =>
  new Promise<void>((resolve, reject) => {
    if (window.paypal) {
      resolve();
      return;
    }

    if (!paypalClientId) {
      reject(new Error('VITE_PAYPAL_CLIENT_ID 尚未配置。'));
      return;
    }

    const existingScript = document.getElementById(sdkScriptId) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('PayPal SDK 加载失败')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = sdkScriptId;
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(paypalClientId)}&currency=USD&intent=capture`;
    script.async = true;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('PayPal SDK 加载失败')), { once: true });
    document.head.appendChild(script);
  });

export function RechargePage({ user, wallet, onRefresh }: RechargePageProps) {
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [vipPlans, setVipPlans] = useState<VipPlan[]>([]);
  const [selectedMode, setSelectedMode] = useState<'coins' | 'vip'>('coins');
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [selectedVipPlanSlug, setSelectedVipPlanSlug] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isPayPalReady, setIsPayPalReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [canSimulatePayment, setCanSimulatePayment] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const buttonsRef = useRef<HTMLDivElement | null>(null);
  const selectedPackage = useMemo(
    () => packages.find((coinPackage) => coinPackage.id === selectedPackageId) ?? null,
    [packages, selectedPackageId],
  );
  const selectedVipPlan = useMemo(
    () => vipPlans.find((plan) => plan.slug === selectedVipPlanSlug) ?? null,
    [selectedVipPlanSlug, vipPlans],
  );
  const selectedPayment = useMemo<PaymentProductSelection | null>(() => {
    if (selectedMode === 'vip') {
      return selectedVipPlanSlug ? { kind: 'vip', vipPlanSlug: selectedVipPlanSlug } : null;
    }

    return selectedPackageId ? { kind: 'coins', packageId: selectedPackageId } : null;
  }, [selectedMode, selectedPackageId, selectedVipPlanSlug]);
  const selectedLabel =
    selectedMode === 'vip' && selectedVipPlan
      ? `${selectedVipPlan.name} · ${selectedVipPlan.duration_days} 天 · ${selectedVipPlan.reward_multiplier}x 奖励`
      : selectedPackage
        ? `${selectedPackage.name} · ${selectedPackage.coins} 金币`
        : '请选择套餐';
  const selectedPrice =
    selectedMode === 'vip' && selectedVipPlan
      ? Number(selectedVipPlan.price_usd)
      : selectedPackage
        ? Number(selectedPackage.price_usd)
        : 0;

  useEffect(() => {
    Promise.all([getCoinPackages(), getVipPlans()])
      .then(([coinPackages, plans]) => {
        setPackages(coinPackages);
        setVipPlans(plans);
        setSelectedPackageId(coinPackages[0]?.id ?? '');
        setSelectedVipPlanSlug(plans[0]?.slug ?? '');
        setIsLoading(false);
      })
      .catch((error: Error) => {
        setErrorMessage(error.message);
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    loadPayPalSdk()
      .then(() => setIsPayPalReady(true))
      .catch((error: Error) => setErrorMessage(error.message));
  }, []);

  useEffect(() => {
    getPayPalSimulationStatus()
      .then((status) => setCanSimulatePayment(status.enabled && status.admin))
      .catch(() => setCanSimulatePayment(false));
  }, []);

  useEffect(() => {
    if (!isPayPalReady || !window.paypal || !buttonsRef.current || !selectedPayment) {
      return undefined;
    }

    buttonsRef.current.innerHTML = '';
    const buttons = window.paypal.Buttons({
      createOrder: async () => {
        setMessage('');
        setErrorMessage('');
        setIsProcessing(true);
        const order = await createPayPalOrder(selectedPayment);
        return order.paypal_order_id;
      },
      onApprove: async (data) => {
        try {
          const result = await capturePayPalOrder(data.orderID);
          await onRefresh();
          setMessage(
            result.payment_kind === 'vip'
              ? `Payment successful\nVIP activated${result.vip?.expires_at ? ` until ${new Date(result.vip.expires_at).toLocaleDateString()}` : ''}`
              : `Payment successful\n+${result.coins} coins`,
          );
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : 'PayPal capture failed');
        } finally {
          setIsProcessing(false);
        }
      },
      onError: (error) => {
        setErrorMessage(error instanceof Error ? error.message : 'PayPal payment failed');
        setIsProcessing(false);
      },
      onCancel: () => {
        setMessage('Payment cancelled');
        setIsProcessing(false);
      },
    });

    void buttons.render(buttonsRef.current);

    return () => {
      buttonsRef.current?.replaceChildren();
      void buttons.close?.();
    };
  }, [isPayPalReady, onRefresh, selectedPayment]);

  const handleSimulatePayment = async () => {
    if (!selectedPayment || isProcessing) {
      return;
    }

    setIsProcessing(true);
    setMessage('');
    setErrorMessage('');

    try {
      const result = await simulatePayPalSuccess(selectedPayment);
      await onRefresh();
      setMessage(
        result.payment_kind === 'vip'
          ? `Payment successful\nVIP activated${result.vip?.expires_at ? ` until ${new Date(result.vip.expires_at).toLocaleDateString()}` : ''}`
          : `Payment successful\n+${result.coins} coins`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'PayPal simulation failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section className="recharge-page">
      <div className="page-heading">
        <p className="eyebrow">Recharge</p>
        <h1>金币充值</h1>
        <p>使用 PayPal Sandbox 完成金币充值或 VIP 订阅。付款成功后由服务端发放金币或开通会员。</p>
      </div>

      <section className="leaderboard-panel recharge-panel">
        <div className="section-heading compact">
          <h2>当前钱包</h2>
          <span>{user.email}</span>
        </div>
        <div className="profile-field balance recharge-balance">
          <span>金币余额</span>
          <strong>{wallet?.balance ?? 0}</strong>
        </div>
      </section>

      {isLoading ? <p className="form-message success">正在读取充值套餐...</p> : null}
      {message ? <p className="form-message success">{message}</p> : null}
      {errorMessage ? <p className="form-message error">{errorMessage}</p> : null}

      <section className="leaderboard-panel">
        <div className="section-heading compact">
          <h2>选择套餐</h2>
          <span>USD · PayPal</span>
        </div>
        <div className="filter-bar compact-filter">
          <button
            className={`nav-button ${selectedMode === 'coins' ? 'strong' : ''}`}
            type="button"
            onClick={() => setSelectedMode('coins')}
          >
            金币充值
          </button>
          <button
            className={`nav-button ${selectedMode === 'vip' ? 'strong' : ''}`}
            type="button"
            onClick={() => setSelectedMode('vip')}
          >
            VIP订阅
          </button>
        </div>
        <div className="market-grid">
          {selectedMode === 'coins'
            ? packages.map((coinPackage) => (
                <button
                  className={`recharge-package ${selectedPackageId === coinPackage.id ? 'selected' : ''}`}
                  key={coinPackage.id}
                  type="button"
                  onClick={() => setSelectedPackageId(coinPackage.id)}
                >
                  <span>{coinPackage.name}</span>
                  <strong>{coinPackage.coins} coins</strong>
                  <small>${Number(coinPackage.price_usd).toFixed(2)}</small>
                </button>
              ))
            : vipPlans.map((plan) => (
                <button
                  className={`recharge-package vip-package ${selectedVipPlanSlug === plan.slug ? 'selected' : ''}`}
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedVipPlanSlug(plan.slug)}
                >
                  <span>{plan.name}</span>
                  <strong>{plan.duration_days} days</strong>
                  <small>
                    ${Number(plan.price_usd).toFixed(2)} · {plan.reward_multiplier}x rewards
                  </small>
                </button>
              ))}
        </div>
      </section>

      <section className="leaderboard-panel">
        <div className="section-heading compact">
          <h2>PayPal Checkout</h2>
          <span>{selectedMode === 'vip' ? 'VIP Subscription' : selectedPackage ? `+${selectedPackage.coins} coins` : '请选择套餐'}</span>
        </div>
        {!paypalClientId ? <p className="form-message error">请先配置 VITE_PAYPAL_CLIENT_ID。</p> : null}
        {selectedPayment ? (
          <p className="profile-note">
            当前选择：{selectedLabel} · ${selectedPrice.toFixed(2)}
          </p>
        ) : null}
        <div className={isProcessing ? 'paypal-buttons processing' : 'paypal-buttons'} ref={buttonsRef} />
        {canSimulatePayment ? (
          <button
            className="ghost-button compact-button simulate-payment-button"
            type="button"
            disabled={isProcessing || !selectedPayment}
            onClick={handleSimulatePayment}
          >
            模拟支付成功
          </button>
        ) : null}
      </section>
    </section>
  );
}
