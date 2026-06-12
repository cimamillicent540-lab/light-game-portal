import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { UserWallet } from '../auth/AuthContext';
import {
  capturePayPalOrder,
  createPayPalOrder,
  getCoinPackages,
  getPayPalSimulationStatus,
  paypalClientId,
  simulatePayPalSuccess,
  type CoinPackage,
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
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
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

  useEffect(() => {
    getCoinPackages()
      .then((data) => {
        setPackages(data);
        setSelectedPackageId(data[0]?.id ?? '');
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
    if (!isPayPalReady || !window.paypal || !buttonsRef.current || !selectedPackageId) {
      return undefined;
    }

    buttonsRef.current.innerHTML = '';
    const buttons = window.paypal.Buttons({
      createOrder: async () => {
        setMessage('');
        setErrorMessage('');
        setIsProcessing(true);
        const order = await createPayPalOrder(selectedPackageId);
        return order.paypal_order_id;
      },
      onApprove: async (data) => {
        try {
          const result = await capturePayPalOrder(data.orderID);
          await onRefresh();
          setMessage(`Payment successful\n+${result.coins} coins`);
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
  }, [isPayPalReady, onRefresh, selectedPackageId]);

  const handleSimulatePayment = async () => {
    if (!selectedPackageId || isProcessing) {
      return;
    }

    setIsProcessing(true);
    setMessage('');
    setErrorMessage('');

    try {
      const result = await simulatePayPalSuccess(selectedPackageId);
      await onRefresh();
      setMessage(`Payment successful\n+${result.coins} coins`);
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
        <p>使用 PayPal Sandbox 完成支付。付款成功后金币由服务端自动到账，前端不会直接修改钱包余额。</p>
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
        <div className="market-grid">
          {packages.map((coinPackage) => (
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
          ))}
        </div>
      </section>

      <section className="leaderboard-panel">
        <div className="section-heading compact">
          <h2>PayPal Checkout</h2>
          <span>{selectedPackage ? `+${selectedPackage.coins} coins` : '请选择套餐'}</span>
        </div>
        {!paypalClientId ? <p className="form-message error">请先配置 VITE_PAYPAL_CLIENT_ID。</p> : null}
        {selectedPackage ? (
          <p className="profile-note">
            当前选择：{selectedPackage.name} · ${Number(selectedPackage.price_usd).toFixed(2)} · {selectedPackage.coins} 金币
          </p>
        ) : null}
        <div className={isProcessing ? 'paypal-buttons processing' : 'paypal-buttons'} ref={buttonsRef} />
        {canSimulatePayment ? (
          <button
            className="ghost-button compact-button simulate-payment-button"
            type="button"
            disabled={isProcessing || !selectedPackageId}
            onClick={handleSimulatePayment}
          >
            模拟支付成功
          </button>
        ) : null}
      </section>
    </section>
  );
}
