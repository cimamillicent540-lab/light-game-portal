import { useEffect, useMemo, useState } from 'react';
import {
  getEventCountdown,
  getMatchCountdown,
  getTodayWorldCupMatches,
  getWorldCupSummary,
  formatWorldCupDate,
  worldCupEventEnd,
  worldCupEventStart,
  type WorldCupMatch,
  type WorldCupSummary,
} from '../../lib/worldCup';

type WorldCupHomePageProps = {
  onPredictions: (marketSlug?: string) => void;
  onLeaderboard: () => void;
  onHistory: () => void;
  onMatches: () => void;
  onRules: () => void;
};

export function WorldCupHomePage({ onPredictions, onLeaderboard, onHistory, onMatches, onRules }: WorldCupHomePageProps) {
  const [summary, setSummary] = useState<WorldCupSummary | null>(null);
  const [matches, setMatches] = useState<WorldCupMatch[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    getWorldCupSummary()
      .then(setSummary)
      .catch((error: Error) => setErrorMessage(error.message));
    getTodayWorldCupMatches()
      .then(setMatches)
      .catch((error: Error) => setErrorMessage(error.message));
  }, []);

  const eventState = useMemo(() => {
    const now = new Date(nowTick);
    if (now < worldCupEventStart) {
      return { label: '距离活动开始', countdown: getEventCountdown(worldCupEventStart) };
    }
    if (now > worldCupEventEnd) {
      return { label: 'World Cup Event Finished', countdown: '活动已结束' };
    }
    return { label: '距离活动结束', countdown: getEventCountdown(worldCupEventEnd) };
  }, [nowTick]);

  return (
    <section className="world-cup-page">
      <div className="world-cup-hero">
        <div>
          <p className="eyebrow">World Cup Prediction Challenge 2026</p>
          <h1>世界杯预测挑战赛</h1>
          <p className="hero-copy">用平台金币参与娱乐竞猜，冲击世界杯专属排行榜。无现金奖励，无交易，无提现。</p>
          <div className="hero-actions">
            <button className="hero-button" type="button" onClick={() => onPredictions()}>
              进入预测大厅
            </button>
            <button className="hero-button secondary" type="button" onClick={onMatches}>
              今日赛程
            </button>
            <button className="hero-button secondary" type="button" onClick={onLeaderboard}>
              世界杯排行榜
            </button>
            <button className="hero-button secondary" type="button" onClick={onHistory}>
              我的记录
            </button>
            <button className="hero-button secondary" type="button" onClick={onRules}>
              活动规则
            </button>
          </div>
        </div>
        <div className="world-cup-countdown">
          <span>{eventState.label}</span>
          <strong>{eventState.countdown}</strong>
        </div>
      </div>

      {errorMessage ? <p className="form-message error">{errorMessage}</p> : null}

      <div className="wc-stats-grid">
        <div className="score-box">
          <span>总参与人数</span>
          <strong>{summary?.participants ?? 0}</strong>
        </div>
        <div className="score-box">
          <span>总竞猜次数</span>
          <strong>{summary?.prediction_count ?? 0}</strong>
        </div>
        <div className="score-box best">
          <span>总发放金币</span>
          <strong>{summary?.coins_paid ?? 0}</strong>
        </div>
      </div>

      <div className="leaderboard-panel">
        <div className="section-heading compact">
          <h2>当前热门竞猜</h2>
          <button className="text-button" type="button" onClick={() => onPredictions()}>
            查看全部
          </button>
        </div>
        <div className="market-grid">
          {(summary?.hot_markets ?? []).map((market) => (
            <article className="market-card" key={market.slug}>
              <span>{market.prediction_count} 次参与</span>
              <h3>{market.title}</h3>
              <p>{market.entry_cost} 金币参与，最高奖励 {market.reward_amount} 金币</p>
            </article>
          ))}
        </div>
      </div>

      <div className="leaderboard-panel">
        <div className="section-heading compact">
          <h2>Today's Matches</h2>
          <button className="text-button" type="button" onClick={onMatches}>
            查看赛程
          </button>
        </div>
        <div className="market-grid">
          {matches.length > 0 ? (
            matches.map((match) => (
              <article className="match-card" key={match.id}>
                <div className="market-card-topline">
                  <span>{match.group_name}</span>
                  <strong>{match.status}</strong>
                </div>
                <h3>
                  {match.team_home} vs {match.team_away}
                </h3>
                <p>
                  {formatWorldCupDate(match.kickoff_time)} · {getMatchCountdown(match.kickoff_time)}
                </p>
                <div className="inline-actions">
                  <button
                    className="primary-button compact-button"
                    disabled={!match.market_slug || match.market_status !== 'open'}
                    type="button"
                    onClick={() => onPredictions(match.market_slug ?? undefined)}
                  >
                    参与竞猜
                  </button>
                  <span className="meta-pill">{match.prediction_count} 次竞猜</span>
                </div>
              </article>
            ))
          ) : (
            <p className="empty-state">赛程导入后会显示最近 10 场比赛。</p>
          )}
        </div>
      </div>
    </section>
  );
}
