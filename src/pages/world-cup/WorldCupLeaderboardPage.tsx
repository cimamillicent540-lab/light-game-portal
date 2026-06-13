import { useEffect, useState } from 'react';
import { getWorldCupLeaderboard, type WorldCupLeaderboardRow } from '../../lib/worldCup';

type Period = 'today' | 'week' | 'all';
type Metric = 'profit' | 'coins' | 'accuracy';

const periodLabels: Record<Period, string> = {
  today: '今日榜',
  week: '周榜',
  all: '总榜',
};

const metricLabels: Record<Metric, string> = {
  profit: '收益榜',
  coins: '金币榜',
  accuracy: '正确率榜',
};

export function WorldCupLeaderboardPage() {
  const [period, setPeriod] = useState<Period>('all');
  const [metric, setMetric] = useState<Metric>('profit');
  const [rows, setRows] = useState<WorldCupLeaderboardRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    setErrorMessage('');
    getWorldCupLeaderboard(period, metric)
      .then((data) => {
        setRows(data);
        setIsLoading(false);
      })
      .catch((error: Error) => {
        setErrorMessage(error.message);
        setRows([]);
        setIsLoading(false);
      });
  }, [metric, period]);

  return (
    <section className="world-cup-page">
      <div className="page-heading">
        <p className="eyebrow">World Cup Leaderboard</p>
        <h1>世界杯排行榜</h1>
        <p>支持金币榜、竞猜正确率榜和收益榜。活动结束后榜单会继续保留。</p>
      </div>

      <div className="filter-bar">
        {(Object.keys(periodLabels) as Period[]).map((value) => (
          <button
            className={`nav-button ${period === value ? 'strong' : ''}`}
            key={value}
            type="button"
            onClick={() => setPeriod(value)}
          >
            {periodLabels[value]}
          </button>
        ))}
      </div>

      <div className="filter-bar compact-filter">
        {(Object.keys(metricLabels) as Metric[]).map((value) => (
          <button
            className={`nav-button ${metric === value ? 'strong' : ''}`}
            key={value}
            type="button"
            onClick={() => setMetric(value)}
          >
            {metricLabels[value]}
          </button>
        ))}
      </div>

      {isLoading ? <p className="form-message success">正在读取世界杯排行榜...</p> : null}
      {errorMessage ? <p className="form-message error">{errorMessage}</p> : null}

      <div className="leaderboard-panel">
        <div className="wc-leaderboard-row wc-leaderboard-head">
          <span>排名</span>
          <span>玩家</span>
          <span>VIP</span>
          <span>正确率</span>
          <span>连续命中</span>
          <span>{metric === 'coins' ? '金币' : metric === 'accuracy' ? '收益' : '收益'}</span>
          <span>竞猜</span>
        </div>
        {rows.length > 0 ? (
          rows.map((row) => (
            <div className="wc-leaderboard-row" key={row.user_id}>
              <strong>#{row.rank}</strong>
              <span>
                {row.username} {row.is_highlighted ? '🔥 HOT' : ''}
              </span>
              <span>{row.vip_level ?? 'free'}</span>
              <span>{row.accuracy_rate}%</span>
              <span>{row.current_streak}</span>
              <span>{metric === 'coins' ? row.coins_won : row.profit}</span>
              <span>{row.total_predictions}</span>
            </div>
          ))
        ) : (
          <p className="empty-state">暂无世界杯榜单数据。</p>
        )}
      </div>
    </section>
  );
}
