import { useEffect, useMemo, useState } from 'react';
import { formatWorldCupDate, getMyWorldCupPredictions, type WorldCupPrediction } from '../../lib/worldCup';

type FilterValue = 'all' | 'won' | 'lost' | 'pending';

const filterLabels: Record<FilterValue, string> = {
  all: '全部',
  won: '已中奖',
  lost: '未中奖',
  pending: '待开奖',
};

const resultLabels: Record<WorldCupPrediction['result'], string> = {
  pending: '待开奖',
  won: '已中奖',
  lost: '未中奖',
  cancelled: '已取消',
};

export function WorldCupHistoryPage() {
  const [rows, setRows] = useState<WorldCupPrediction[]>([]);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    getMyWorldCupPredictions()
      .then(setRows)
      .catch((error: Error) => setErrorMessage(error.message));
  }, []);

  const visibleRows = useMemo(
    () => (filter === 'all' ? rows : rows.filter((row) => row.result === filter)),
    [filter, rows],
  );

  return (
    <section className="world-cup-page">
      <div className="page-heading">
        <p className="eyebrow">My Predictions</p>
        <h1>我的预测记录</h1>
        <p>这里保留你的世界杯竞猜内容、金币消耗、开奖结果和奖励记录。</p>
      </div>

      <div className="filter-bar">
        {(Object.keys(filterLabels) as FilterValue[]).map((value) => (
          <button
            className={`nav-button ${filter === value ? 'strong' : ''}`}
            key={value}
            type="button"
            onClick={() => setFilter(value)}
          >
            {filterLabels[value]}
          </button>
        ))}
      </div>

      {errorMessage ? <p className="form-message error">{errorMessage}</p> : null}

      <div className="leaderboard-panel">
        {visibleRows.length > 0 ? (
          visibleRows.map((row) => (
            <article className="history-row" key={row.id}>
              <div>
                <span>{row.wc_markets?.title ?? '未知竞猜'}</span>
                <strong>{row.selected_option}</strong>
              </div>
              <div>
                <span>消耗</span>
                <strong>{row.coins_spent}</strong>
              </div>
              <div>
                <span>可得</span>
                <strong>{row.result === 'won' && row.reward_paid ? row.potential_reward : '--'}</strong>
              </div>
              <div>
                <span>状态</span>
                <strong>{resultLabels[row.result]}</strong>
              </div>
              <div>
                <span>时间</span>
                <strong>{formatWorldCupDate(row.created_at)}</strong>
              </div>
            </article>
          ))
        ) : (
          <p className="empty-state">暂无预测记录。</p>
        )}
      </div>
    </section>
  );
}
