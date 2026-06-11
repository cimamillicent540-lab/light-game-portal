import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
  formatWorldCupDate,
  getWorldCupShopItems,
  getWorldCupShopPurchases,
  purchaseWorldCupShopItem,
  type WorldCupShopItem,
  type WorldCupShopPurchase,
} from '../../lib/worldCup';

type WorldCupShopPageProps = {
  onLogin: () => void;
};

const categoryLabel: Record<WorldCupShopItem['category'], string> = {
  avatar_frame: '头像框',
  leaderboard_highlight: '排行榜高亮',
  ai_ticket: 'AI分析券',
  cosmetic: '装饰',
};

export function WorldCupShopPage({ onLogin }: WorldCupShopPageProps) {
  const { user, wallet, refreshAccountData } = useAuth();
  const [items, setItems] = useState<WorldCupShopItem[]>([]);
  const [purchases, setPurchases] = useState<WorldCupShopPurchase[]>([]);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingSlug, setPendingSlug] = useState('');

  const loadShop = async () => {
    const [nextItems, nextPurchases] = await Promise.all([
      getWorldCupShopItems(),
      user ? getWorldCupShopPurchases() : Promise.resolve([]),
    ]);
    setItems(nextItems);
    setPurchases(nextPurchases);
  };

  useEffect(() => {
    loadShop().catch((error: Error) => setErrorMessage(error.message));
  }, [user]);

  const handlePurchase = async (item: WorldCupShopItem) => {
    if (!user) {
      onLogin();
      return;
    }

    setPendingSlug(item.slug);
    setMessage('');
    setErrorMessage('');

    try {
      const result = await purchaseWorldCupShopItem(item.slug);
      await refreshAccountData();
      await loadShop();
      setMessage(`购买成功：${item.name}，消耗 ${result.price_paid} 金币。`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '购买失败');
    } finally {
      setPendingSlug('');
    }
  };

  return (
    <section className="world-cup-page">
      <div className="page-heading">
        <p className="eyebrow">World Cup Shop</p>
        <h1>世界杯商城</h1>
        <p>当前金币余额：{wallet?.balance ?? 0}。购买头像框、排行榜高亮和 AI 分析券，形成金币消耗闭环。</p>
      </div>

      {message ? <p className="form-message success">{message}</p> : null}
      {errorMessage ? <p className="form-message error">{errorMessage}</p> : null}

      <div className="market-grid">
        {items.map((item) => (
          <article className="market-card shop-card" key={item.slug}>
            <div className="market-card-topline">
              <span>{categoryLabel[item.category]}</span>
              {item.duration_days ? <strong>{item.duration_days}天</strong> : null}
            </div>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            <div className="market-economy">
              <span>{item.price} 金币</span>
            </div>
            <button
              className="primary-button compact-button"
              disabled={pendingSlug === item.slug}
              type="button"
              onClick={() => handlePurchase(item)}
            >
              {pendingSlug === item.slug ? '购买中...' : '购买'}
            </button>
          </article>
        ))}
      </div>

      <section className="leaderboard-panel">
        <div className="section-heading compact">
          <h2>购买记录</h2>
          <span>{purchases.length} 条</span>
        </div>
        {user ? (
          purchases.length ? (
            <div className="compact-score-list">
              {purchases.map((purchase) => (
                <div className="compact-score-row" key={purchase.id}>
                  <span>{purchase.shop_items?.name ?? '未知商品'}</span>
                  <strong>{purchase.price_paid} 金币</strong>
                  <small>{formatWorldCupDate(purchase.created_at)}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">暂无购买记录。</p>
          )
        ) : (
          <p className="empty-state">登录后可查看购买记录。</p>
        )}
      </section>
    </section>
  );
}
