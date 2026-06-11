import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
  formatWorldCupDate,
  getVipWorldCupMultiplier,
  getWorldCupMarkets,
  placeWorldCupPrediction,
  useWorldCupAiAssistant,
  worldCupEventEnd,
  type WorldCupMarket,
} from '../../lib/worldCup';

type WorldCupPredictionsPageProps = {
  onLogin: () => void;
  onLeaderboard: () => void;
};

const marketTypeLabel: Record<WorldCupMarket['market_type'], string> = {
  match: '每日比赛',
  group: '小组预测',
  champion: '冠军预测',
  golden_boot: '金靴奖',
  special: '特别竞猜',
};

const buildAnalysis = (market: WorldCupMarket) => [
  `${market.title} 当前属于「${marketTypeLabel[market.market_type]}」类型，锁定时间为 ${formatWorldCupDate(market.locks_at)}。`,
  `基础奖励为 ${market.reward_amount} 金币，参与成本为 ${market.entry_cost} 金币。请注意奖励和风险并存。`,
  `可选项数量为 ${market.options.length}，选项越多，不确定性通常越高。`,
  '风险提示：该分析只提供概率和信息整理，不构成下注建议，也不保证结果。',
];

export function WorldCupPredictionsPage({ onLogin, onLeaderboard }: WorldCupPredictionsPageProps) {
  const { user, profile, wallet, refreshAccountData } = useAuth();
  const [markets, setMarkets] = useState<WorldCupMarket[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [analysis, setAnalysis] = useState<{ title: string; lines: string[]; cost: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingSlug, setPendingSlug] = useState('');

  const eventFinished = Date.now() > worldCupEventEnd.getTime();
  const multiplier = getVipWorldCupMultiplier(profile?.vip_level);

  useEffect(() => {
    getWorldCupMarkets()
      .then((rows) => {
        setMarkets(rows);
        setIsLoading(false);
      })
      .catch((error: Error) => {
        setErrorMessage(error.message);
        setIsLoading(false);
      });
  }, []);

  const groupedMarkets = useMemo(
    () =>
      markets.reduce<Record<string, WorldCupMarket[]>>((groups, market) => {
        groups[market.market_type] = [...(groups[market.market_type] ?? []), market];
        return groups;
      }, {}),
    [markets],
  );

  const handleSubmit = async (market: WorldCupMarket) => {
    if (!user) {
      onLogin();
      return;
    }

    const selectedOption = selectedOptions[market.slug];
    if (!selectedOption) {
      setErrorMessage('请先选择一个预测选项。');
      return;
    }

    setPendingSlug(market.slug);
    setMessage('');
    setErrorMessage('');

    try {
      const result = await placeWorldCupPrediction(market.slug, selectedOption);
      await refreshAccountData();
      setMessage(
        `预测已提交，消耗 ${result.coins_spent} 金币，潜在奖励 ${result.potential_reward} 金币。${
          result.daily_task_reward ? `每日任务额外奖励 ${result.daily_task_reward} 金币。` : ''
        }`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '提交失败');
    } finally {
      setPendingSlug('');
    }
  };

  const handleAiAnalysis = async (market: WorldCupMarket) => {
    if (!user) {
      onLogin();
      return;
    }

    setPendingSlug(`ai-${market.slug}`);
    setErrorMessage('');

    try {
      const usage = await useWorldCupAiAssistant(market.slug);
      await refreshAccountData();
      setAnalysis({
        title: market.title,
        lines: buildAnalysis(market),
        cost: usage.coins_spent,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'AI 分析生成失败');
    } finally {
      setPendingSlug('');
    }
  };

  return (
    <section className="world-cup-page">
      <div className="page-heading">
        <p className="eyebrow">Prediction Lobby</p>
        <h1>预测大厅</h1>
        <p>当前金币余额：{wallet?.balance ?? 0}。你的世界杯 VIP 奖励倍率：{multiplier}x。</p>
        {eventFinished ? <p className="form-message error">World Cup Event Finished：活动已结束，竞猜入口已关闭。</p> : null}
      </div>

      {isLoading ? <p className="form-message success">正在读取竞猜列表...</p> : null}
      {message ? <p className="form-message success">{message}</p> : null}
      {errorMessage ? <p className="form-message error">{errorMessage}</p> : null}

      {analysis ? (
        <div className="ai-panel">
          <div className="section-heading compact">
            <h2>AI Prediction Assistant</h2>
            <span>{analysis.cost ? `消耗 ${analysis.cost} 金币` : '本次免费'}</span>
          </div>
          <h3>{analysis.title}</h3>
          {analysis.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}

      {Object.entries(groupedMarkets).map(([type, typeMarkets]) => (
        <section className="leaderboard-panel" key={type}>
          <div className="section-heading compact">
            <h2>{marketTypeLabel[type as WorldCupMarket['market_type']]}</h2>
            <button className="text-button" type="button" onClick={onLeaderboard}>
              看世界杯榜
            </button>
          </div>
          <div className="market-grid">
            {typeMarkets.map((market) => {
              const isLocked = eventFinished || market.status !== 'open' || Date.now() >= new Date(market.locks_at).getTime();
              const boostedReward = Math.floor(market.reward_amount * multiplier);

              return (
                <article className="market-card" key={market.slug}>
                  <div className="market-card-topline">
                    <span>{marketTypeLabel[market.market_type]}</span>
                    <strong>{market.status}</strong>
                  </div>
                  <h3>{market.title}</h3>
                  <p>{market.description}</p>
                  <div className="market-economy">
                    <span>{market.entry_cost} 金币参与</span>
                    <span>奖励 {boostedReward} 金币</span>
                    <span>锁定 {formatWorldCupDate(market.locks_at)}</span>
                  </div>
                  <div className="option-grid">
                    {market.options.map((option) => (
                      <button
                        className={selectedOptions[market.slug] === option ? 'option-button selected' : 'option-button'}
                        disabled={isLocked}
                        key={option}
                        type="button"
                        onClick={() => setSelectedOptions((current) => ({ ...current, [market.slug]: option }))}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <div className="inline-actions">
                    <button
                      className="primary-button compact-button"
                      disabled={isLocked || pendingSlug === market.slug}
                      type="button"
                      onClick={() => handleSubmit(market)}
                    >
                      {isLocked ? '已锁定' : pendingSlug === market.slug ? '提交中...' : '提交预测'}
                    </button>
                    <button
                      className="ghost-button"
                      disabled={pendingSlug === `ai-${market.slug}`}
                      type="button"
                      onClick={() => handleAiAnalysis(market)}
                    >
                      AI 分析
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}
