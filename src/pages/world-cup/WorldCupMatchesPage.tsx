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

const stageFilters = [
  '全部',
  'Group A',
  'Group B',
  'Group C',
  'Group D',
  'Group E',
  'Group F',
  'Group G',
  'Group H',
  'Group I',
  'Group J',
  'Group K',
  'Group L',
  'Round of 32',
  'Round of 16',
  'Quarter-finals',
  'Semi-finals',
  'Third Place Match',
  'Final',
];

const unitedStatesAliases = ['usa', 'us', 'u.s.', 'u.s', 'america'];

const normalizeSearchText = (value: string) =>
  value
    .toLowerCase()
    .replace(/\bu\.?s\.?a?\.?\b/g, ' united states ')
    .replace(/\bamerica\b/g, ' united states ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const teamAliases = (team: string) => (normalizeSearchText(team) === 'united states' ? unitedStatesAliases.join(' ') : '');

const searchTokens = (value: string) =>
  normalizeSearchText(value)
    .split(/\s+/)
    .filter((token) => token && token !== 'vs' && token !== 'v' && token !== 'versus');

const matchSearchText = (match: WorldCupMatch) =>
  normalizeSearchText(
    [
      match.group_name,
      match.team_home,
      match.team_away,
      `${match.team_home} vs ${match.team_away}`,
      teamAliases(match.team_home),
      teamAliases(match.team_away),
    ].join(' '),
  );

export function WorldCupMatchesPage({ onPredictions }: WorldCupMatchesPageProps) {
  const [matches, setMatches] = useState<WorldCupMatch[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('全部');
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

  const filteredMatches = useMemo(() => {
    const tokens = searchTokens(searchQuery);
    return matches
      .filter((match) => stageFilter === '全部' || match.group_name === stageFilter)
      .filter((match) => {
        if (!tokens.length) return true;
        const searchable = matchSearchText(match);
        return tokens.every((token) => searchable.includes(token));
      })
      .sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());
  }, [matches, searchQuery, stageFilter]);

  const groupedMatches = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    return {
      today: filteredMatches.filter((match) => match.kickoff_time.slice(0, 10) === todayKey),
      future: filteredMatches.filter((match) => match.status !== 'finished' && match.kickoff_time.slice(0, 10) !== todayKey),
      finished: filteredMatches.filter((match) => match.status === 'finished'),
    };
  }, [filteredMatches]);

  const clearSearchAndFilter = () => {
    setSearchQuery('');
    setStageFilter('全部');
  };

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
        <p>CSV 导入比赛后，系统会自动为每场比赛生成胜平负竞猜市场。当前显示 {filteredMatches.length} / {matches.length} 场。</p>
      </div>

      {isLoading ? <p className="form-message success">正在读取赛程...</p> : null}
      {errorMessage ? <p className="form-message error">{errorMessage}</p> : null}

      <section className="leaderboard-panel">
        <div className="section-heading compact">
          <h2>查找比赛</h2>
          <span>搜索和筛选同时生效</span>
        </div>
        <label className="admin-field">
          <span>搜索</span>
          <input
            placeholder="Group D / USA / Paraguay / USA vs Paraguay"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        <div className="filter-bar match-filter-bar">
          {stageFilters.map((stage) => (
            <button
              className={`nav-button ${stageFilter === stage ? 'strong' : ''}`}
              key={stage}
              type="button"
              onClick={() => setStageFilter(stage)}
            >
              {stage}
            </button>
          ))}
        </div>
        <button className="ghost-button compact-button" type="button" onClick={clearSearchAndFilter}>
          清除搜索和筛选
        </button>
      </section>

      {!isLoading && !filteredMatches.length ? (
        <section className="leaderboard-panel empty-search-panel">
          <h2>没有找到匹配比赛</h2>
          <p>当前搜索词：{searchQuery.trim() || '无'}</p>
          <p>当前筛选：{stageFilter}</p>
        </section>
      ) : null}

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
