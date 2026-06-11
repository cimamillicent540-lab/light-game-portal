import { useEffect, useMemo, useState } from 'react';
import {
  formatWorldCupDate,
  getMatchCountdown,
  getWorldCupMatches,
  type WorldCupMatch,
} from '../../lib/worldCup';

type WorldCupMatchesPageProps = {
  onPredictions: (marketSlug?: string) => void;
};

const statusLabel: Record<WorldCupMatch['status'], string> = {
  scheduled: '未来比赛',
  live: '进行中',
  finished: '已结束',
};

export function WorldCupMatchesPage({ onPredictions }: WorldCupMatchesPageProps) {
  const [matches, setMatches] = useState<WorldCupMatch[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getWorldCupMatches()
      .then((rows) => {
        setMatches(rows);
        setIsLoading(false);
      })
      .catch((error: Error) => {
        setErrorMessage(error.message);
        setIsLoading(false);
      });
  }, []);

  const groupedMatches = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    return {
      today: matches.filter((match) => match.kickoff_time.slice(0, 10) === todayKey),
      future: matches.filter((match) => match.status !== 'finished' && match.kickoff_time.slice(0, 10) !== todayKey),
      finished: matches.filter((match) => match.status === 'finished'),
    };
  }, [matches]);

  const renderMatch = (match: WorldCupMatch) => (
    <article className="match-card" key={match.id}>
      <div className="market-card-topline">
        <span>{match.group_name}</span>
        <strong>{statusLabel[match.status]}</strong>
      </div>
      <h3>
        {match.team_home} vs {match.team_away}
      </h3>
      <p>
        {formatWorldCupDate(match.kickoff_time)} · {getMatchCountdown(match.kickoff_time)}
      </p>
      {match.status === 'finished' ? (
        <p>
          比分 {match.home_score} - {match.away_score} · 结果 {match.winner ?? '--'}
        </p>
      ) : (
        <p>锁盘时间：{match.locks_at ? formatWorldCupDate(match.locks_at) : '--'}</p>
      )}
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
  );

  return (
    <section className="world-cup-page">
      <div className="page-heading">
        <p className="eyebrow">World Cup Matches</p>
        <h1>世界杯赛程</h1>
        <p>CSV 导入比赛后，系统会自动为每场比赛生成胜平负竞猜市场。</p>
      </div>

      {isLoading ? <p className="form-message success">正在读取赛程...</p> : null}
      {errorMessage ? <p className="form-message error">{errorMessage}</p> : null}

      <section className="leaderboard-panel">
        <div className="section-heading compact">
          <h2>今日比赛</h2>
          <span>{groupedMatches.today.length} 场</span>
        </div>
        <div className="market-grid">
          {groupedMatches.today.length ? groupedMatches.today.map(renderMatch) : <p className="empty-state">今日暂无比赛。</p>}
        </div>
      </section>

      <section className="leaderboard-panel">
        <div className="section-heading compact">
          <h2>未来比赛</h2>
          <span>{groupedMatches.future.length} 场</span>
        </div>
        <div className="market-grid">
          {groupedMatches.future.length ? groupedMatches.future.map(renderMatch) : <p className="empty-state">暂无未来比赛。</p>}
        </div>
      </section>

      <section className="leaderboard-panel">
        <div className="section-heading compact">
          <h2>已结束比赛</h2>
          <span>{groupedMatches.finished.length} 场</span>
        </div>
        <div className="market-grid">
          {groupedMatches.finished.length ? groupedMatches.finished.map(renderMatch) : <p className="empty-state">暂无已结束比赛。</p>}
        </div>
      </section>
    </section>
  );
}
