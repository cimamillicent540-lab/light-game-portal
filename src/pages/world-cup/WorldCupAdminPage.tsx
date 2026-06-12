import { useEffect, useState } from 'react';
import { formatWorldCupDate, getWorldCupAdminSyncStatus, type WorldCupAdminSyncStatus } from '../../lib/worldCup';

const syncTypeLabel: Record<WorldCupAdminSyncStatus['latest_syncs'][number]['sync_type'], string> = {
  matches: '赛程同步',
  scores: '比分同步',
  settlement: '自动开奖',
};

export function WorldCupAdminPage() {
  const [status, setStatus] = useState<WorldCupAdminSyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    getWorldCupAdminSyncStatus()
      .then((data) => {
        setStatus(data);
        setIsLoading(false);
      })
      .catch((error: Error) => {
        setErrorMessage(error.message);
        setIsLoading(false);
      });
  }, []);

  return (
    <section className="world-cup-page">
      <div className="page-heading">
        <p className="eyebrow">World Cup Admin</p>
        <h1>世界杯自动运营面板</h1>
        <p>查看赛程同步、比分同步和自动开奖状态。所有同步与派奖只由 Netlify Scheduled Functions 在服务端执行。</p>
      </div>

      {isLoading ? <p className="form-message success">正在读取同步状态...</p> : null}
      {errorMessage ? <p className="form-message error">{errorMessage}</p> : null}

      {status ? (
        <>
          <section className="leaderboard-panel">
            <div className="section-heading compact">
              <h2>运营总览</h2>
              <span>API-Football</span>
            </div>
            <div className="stats-grid compact-profile-grid">
              <div className="stat-card">
                <span>比赛数量</span>
                <strong>{status.match_count}</strong>
              </div>
              <div className="stat-card">
                <span>未来比赛</span>
                <strong>{status.scheduled_count}</strong>
              </div>
              <div className="stat-card">
                <span>进行中</span>
                <strong>{status.live_count}</strong>
              </div>
              <div className="stat-card">
                <span>已结束</span>
                <strong>{status.finished_count}</strong>
              </div>
              <div className="stat-card">
                <span>竞猜市场</span>
                <strong>{status.market_count}</strong>
              </div>
              <div className="stat-card">
                <span>待开奖</span>
                <strong>{status.pending_settlement_count}</strong>
              </div>
              <div className="stat-card">
                <span>已开奖</span>
                <strong>{status.settled_market_count}</strong>
              </div>
            </div>
          </section>

          <section className="leaderboard-panel">
            <div className="section-heading compact">
              <h2>最近同步</h2>
              <span>{status.latest_syncs.length} 项</span>
            </div>
            <div className="history-list">
              {status.latest_syncs.length ? (
                status.latest_syncs.map((sync) => (
                  <article className="history-row" key={sync.sync_type}>
                    <div>
                      <span>{syncTypeLabel[sync.sync_type]}</span>
                      <small>
                        {sync.provider} · {formatWorldCupDate(sync.last_synced_at)}
                      </small>
                      {sync.message ? <small>{sync.message}</small> : null}
                    </div>
                    <strong className={sync.status === 'success' ? 'result-win' : 'result-lost'}>
                      {sync.status === 'success' ? '正常' : '异常'}
                    </strong>
                    <span>{sync.records_processed} 条</span>
                  </article>
                ))
              ) : (
                <p className="empty-state">还没有同步记录。部署 Scheduled Functions 后会自动产生记录。</p>
              )}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
