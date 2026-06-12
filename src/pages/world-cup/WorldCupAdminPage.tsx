import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
  formatWorldCupDate,
  getWorldCupAdminDashboard,
  runWorldCupAdminAction,
  type WorldCupAdminDashboard,
  type WorldCupAdminMatch,
  type WorldCupAdminMarket,
  type WorldCupAdminSyncStatus,
} from '../../lib/worldCup';

type MatchFormState = {
  id?: string;
  group_name: string;
  team_home: string;
  team_away: string;
  kickoff_time: string;
  status: WorldCupAdminMatch['status'];
};

type ScoreDraft = {
  home_score: string;
  away_score: string;
};

const emptyMatchForm: MatchFormState = {
  group_name: '',
  team_home: '',
  team_away: '',
  kickoff_time: '',
  status: 'scheduled',
};

const syncTypeLabel: Record<WorldCupAdminSyncStatus['latest_syncs'][number]['sync_type'], string> = {
  matches: '赛程同步',
  scores: '比分同步',
  settlement: '自动开奖',
};

const statusLabel: Record<WorldCupAdminMatch['status'], string> = {
  scheduled: '未开赛',
  live: '进行中',
  finished: '已结束',
};

const marketStatusLabel: Record<WorldCupAdminMarket['status'], string> = {
  open: '开放',
  locked: '锁盘',
  settled: '已开奖',
  cancelled: '已取消',
};

const parseCsvLine = (line: string) => {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^"|"$/g, ''));
};

const parseMatchCsv = (csv: string) => {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const firstRow = parseCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const hasHeader = firstRow.includes('group_name') || firstRow.includes('team_home');
  const rows = hasHeader ? lines.slice(1) : lines;
  const header = hasHeader ? firstRow : ['group_name', 'team_home', 'team_away', 'kickoff_time'];

  return rows
    .map((line) => {
      const cells = parseCsvLine(line);
      const row = Object.fromEntries(header.map((key, index) => [key, cells[index] ?? '']));
      return {
        group_name: row.group_name,
        team_home: row.team_home,
        team_away: row.team_away,
        kickoff_time: row.kickoff_time ? new Date(row.kickoff_time).toISOString() : '',
        status: 'scheduled',
      };
    })
    .filter((row) => row.group_name && row.team_home && row.team_away && row.kickoff_time);
};

const parseScoreCsv = (csv: string) =>
  csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index) => index > 0 || !line.toLowerCase().includes('home_score'))
    .map((line) => {
      const [id, homeScore, awayScore] = parseCsvLine(line);
      return {
        id,
        home_score: Number(homeScore),
        away_score: Number(awayScore),
      };
    })
    .filter((row) => row.id && Number.isFinite(row.home_score) && Number.isFinite(row.away_score));

const toDatetimeLocal = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
};

const toIsoFromLocal = (value: string) => (value ? new Date(value).toISOString() : '');

export function WorldCupAdminPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [dashboard, setDashboard] = useState<WorldCupAdminDashboard | null>(null);
  const [matchForm, setMatchForm] = useState<MatchFormState>(emptyMatchForm);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, ScoreDraft>>({});
  const [csvText, setCsvText] = useState('group_name,team_home,team_away,kickoff_time\nGroup A,Brazil,Morocco,2026-06-12T20:00:00Z');
  const [scoreCsvText, setScoreCsvText] = useState('id,home_score,away_score');
  const [settleOptions, setSettleOptions] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadDashboard = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const data = await getWorldCupAdminDashboard();
      setDashboard(data);
      setScoreDrafts(
        Object.fromEntries(
          data.matches.map((match) => [
            match.id,
            {
              home_score: match.home_score === null ? '' : String(match.home_score),
              away_score: match.away_score === null ? '' : String(match.away_score),
            },
          ]),
        ),
      );
      setSettleOptions(
        Object.fromEntries(
          data.markets.map((market) => [market.slug, market.correct_option ?? market.options[0] ?? '']),
        ),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '运营面板读取失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthLoading) {
      void loadDashboard();
    }
  }, [isAuthLoading, user]);

  const recentSyncs = dashboard?.sync_status.latest_syncs ?? [];
  const topMarkets = useMemo(
    () => [...(dashboard?.markets ?? [])].sort((a, b) => b.prediction_count - a.prediction_count).slice(0, 12),
    [dashboard?.markets],
  );

  const runAction = async (successText: string, action: Parameters<typeof runWorldCupAdminAction>[0], payload: Record<string, unknown>) => {
    setIsWorking(true);
    setMessage('');
    setErrorMessage('');

    try {
      await runWorldCupAdminAction(action, payload);
      setMessage(successText);
      await loadDashboard();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '操作失败');
    } finally {
      setIsWorking(false);
    }
  };

  const handleMatchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      ...matchForm,
      kickoff_time: toIsoFromLocal(matchForm.kickoff_time),
    };
    const action = matchForm.id ? 'update_match' : 'create_match';
    await runAction(matchForm.id ? '比赛已更新。' : '比赛已新增，并会自动生成 match_winner 市场。', action, payload);
    setMatchForm(emptyMatchForm);
  };

  const handleCsvFile = async (file?: File) => {
    if (!file) return;
    setCsvText(await file.text());
  };

  const startEditMatch = (match: WorldCupAdminMatch) => {
    setMatchForm({
      id: match.id,
      group_name: match.group_name,
      team_home: match.team_home,
      team_away: match.team_away,
      kickoff_time: toDatetimeLocal(match.kickoff_time),
      status: match.status,
    });
  };

  const saveScore = async (match: WorldCupAdminMatch) => {
    const draft = scoreDrafts[match.id];
    if (!draft || draft.home_score === '' || draft.away_score === '') {
      setErrorMessage('请先填写主队和客队比分。');
      return;
    }

    await runAction('比分已保存，winner 已自动计算，并已触发自动开奖。', 'update_score', {
      id: match.id,
      home_score: Number(draft.home_score),
      away_score: Number(draft.away_score),
    });
  };

  if (!isAuthLoading && !user) {
    return (
      <section className="world-cup-page">
        <div className="page-heading">
          <p className="eyebrow">World Cup Admin</p>
          <h1>世界杯运营中心</h1>
          <p>请先登录管理员账号，再进入赛程、比分和市场管理。</p>
        </div>
        <p className="form-message error">未登录，无法访问运营中心。</p>
      </section>
    );
  }

  return (
    <section className="world-cup-page admin-worldcup-page">
      <div className="page-heading">
        <p className="eyebrow">World Cup Admin</p>
        <h1>世界杯运营中心</h1>
        <p>当前 MVP 使用 CSV 导入赛程和手动录入比分运行。API-Football 自动同步入口保留，未来可继续升级。</p>
        <div className="inline-actions">
          <button className="ghost-button compact-button" type="button" onClick={loadDashboard} disabled={isWorking || isLoading}>
            刷新数据
          </button>
          <button
            className="primary-button compact-button"
            type="button"
            onClick={() => runAction('已触发全量自动开奖。', 'settle_all', {})}
            disabled={isWorking}
          >
            执行自动开奖
          </button>
        </div>
      </div>

      {isLoading ? <p className="form-message success">正在读取运营数据...</p> : null}
      {message ? <p className="form-message success">{message}</p> : null}
      {errorMessage ? <p className="form-message error">{errorMessage}</p> : null}

      {dashboard ? (
        <>
          <section className="leaderboard-panel">
            <div className="section-heading compact">
              <h2>数据统计</h2>
              <span>Manual MVP</span>
            </div>
            <div className="stats-grid compact-profile-grid">
              <div className="stat-card">
                <span>总比赛数</span>
                <strong>{dashboard.stats.total_matches}</strong>
              </div>
              <div className="stat-card">
                <span>总预测数</span>
                <strong>{dashboard.stats.total_predictions}</strong>
              </div>
              <div className="stat-card">
                <span>总金币消耗</span>
                <strong>{dashboard.stats.total_coins_spent}</strong>
              </div>
              <div className="stat-card">
                <span>总金币奖励</span>
                <strong>{dashboard.stats.total_coins_rewarded}</strong>
              </div>
              <div className="stat-card">
                <span>待开奖市场</span>
                <strong>{dashboard.sync_status.pending_settlement_count}</strong>
              </div>
              <div className="stat-card">
                <span>已开奖市场</span>
                <strong>{dashboard.sync_status.settled_market_count}</strong>
              </div>
            </div>
          </section>

          <section className="admin-grid">
            <article className="leaderboard-panel">
              <div className="section-heading compact">
                <h2>CSV 导入比赛</h2>
                <span>{dashboard.matches.length} 场</span>
              </div>
              <label className="admin-field">
                <span>CSV 文件</span>
                <input type="file" accept=".csv,text/csv" onChange={(event) => handleCsvFile(event.target.files?.[0])} />
              </label>
              <label className="admin-field">
                <span>CSV 内容</span>
                <textarea value={csvText} onChange={(event) => setCsvText(event.target.value)} rows={7} />
              </label>
              <button
                className="primary-button compact-button"
                type="button"
                disabled={isWorking}
                onClick={() => {
                  const rows = parseMatchCsv(csvText);
                  void runAction(`已导入 ${rows.length} 场比赛。`, 'import_matches', { rows });
                }}
              >
                批量导入世界杯赛程
              </button>
              <p className="admin-hint">字段：group_name, team_home, team_away, kickoff_time。导入后数据库 trigger 会自动生成 match_winner 市场。</p>
            </article>

            <article className="leaderboard-panel">
              <div className="section-heading compact">
                <h2>{matchForm.id ? '编辑比赛' : '新增比赛'}</h2>
                <span>{matchForm.status}</span>
              </div>
              <form className="admin-form" onSubmit={handleMatchSubmit}>
                <label className="admin-field">
                  <span>分组</span>
                  <input value={matchForm.group_name} onChange={(event) => setMatchForm({ ...matchForm, group_name: event.target.value })} required />
                </label>
                <label className="admin-field">
                  <span>主队</span>
                  <input value={matchForm.team_home} onChange={(event) => setMatchForm({ ...matchForm, team_home: event.target.value })} required />
                </label>
                <label className="admin-field">
                  <span>客队</span>
                  <input value={matchForm.team_away} onChange={(event) => setMatchForm({ ...matchForm, team_away: event.target.value })} required />
                </label>
                <label className="admin-field">
                  <span>开赛时间</span>
                  <input
                    type="datetime-local"
                    value={matchForm.kickoff_time}
                    onChange={(event) => setMatchForm({ ...matchForm, kickoff_time: event.target.value })}
                    required
                  />
                </label>
                <label className="admin-field">
                  <span>状态</span>
                  <select
                    value={matchForm.status}
                    onChange={(event) => setMatchForm({ ...matchForm, status: event.target.value as WorldCupAdminMatch['status'] })}
                  >
                    <option value="scheduled">scheduled</option>
                    <option value="live">live</option>
                    <option value="finished">finished</option>
                  </select>
                </label>
                <div className="inline-actions">
                  <button className="primary-button compact-button" type="submit" disabled={isWorking}>
                    {matchForm.id ? '保存比赛' : '新增比赛'}
                  </button>
                  {matchForm.id ? (
                    <button className="ghost-button compact-button" type="button" onClick={() => setMatchForm(emptyMatchForm)}>
                      取消编辑
                    </button>
                  ) : null}
                </div>
              </form>
            </article>
          </section>

          <section className="leaderboard-panel">
            <div className="section-heading compact">
              <h2>赛程与比分管理</h2>
              <span>保存比分后自动计算 winner 并开奖</span>
            </div>
            <div className="admin-table match-admin-table">
              <div className="admin-table-row admin-table-head">
                <span>比赛</span>
                <span>时间</span>
                <span>状态</span>
                <span>比分</span>
                <span>操作</span>
              </div>
              {dashboard.matches.map((match) => (
                <div className="admin-table-row" key={match.id}>
                  <div>
                    <strong>{match.team_home} vs {match.team_away}</strong>
                    <small>{match.group_name} · winner: {match.winner ?? '未计算'}</small>
                    <small className="admin-row-id">{match.id}</small>
                  </div>
                  <span>{formatWorldCupDate(match.kickoff_time)}</span>
                  <span>{statusLabel[match.status]}</span>
                  <div className="score-inputs">
                    <input
                      aria-label={`${match.team_home} score`}
                      type="number"
                      value={scoreDrafts[match.id]?.home_score ?? ''}
                      onChange={(event) =>
                        setScoreDrafts({
                          ...scoreDrafts,
                          [match.id]: { ...scoreDrafts[match.id], home_score: event.target.value },
                        })
                      }
                    />
                    <span>:</span>
                    <input
                      aria-label={`${match.team_away} score`}
                      type="number"
                      value={scoreDrafts[match.id]?.away_score ?? ''}
                      onChange={(event) =>
                        setScoreDrafts({
                          ...scoreDrafts,
                          [match.id]: { ...scoreDrafts[match.id], away_score: event.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="inline-actions">
                    <button className="primary-button compact-button" type="button" onClick={() => saveScore(match)} disabled={isWorking}>
                      保存比分
                    </button>
                    <button className="ghost-button compact-button" type="button" onClick={() => startEditMatch(match)}>
                      编辑
                    </button>
                    <button
                      className="ghost-button compact-button danger-button"
                      type="button"
                      onClick={() => runAction('比赛已删除。', 'delete_match', { id: match.id })}
                      disabled={isWorking}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="leaderboard-panel">
            <div className="section-heading compact">
              <h2>批量录入比分</h2>
              <span>id, home_score, away_score</span>
            </div>
            <label className="admin-field">
              <span>比分 CSV</span>
              <textarea value={scoreCsvText} onChange={(event) => setScoreCsvText(event.target.value)} rows={5} />
            </label>
            <button
              className="primary-button compact-button"
              type="button"
              disabled={isWorking}
              onClick={() => {
                const rows = parseScoreCsv(scoreCsvText);
                void runAction(`已批量保存 ${rows.length} 场比分。`, 'bulk_scores', { rows });
              }}
            >
              批量保存比分并开奖
            </button>
          </section>

          <section className="leaderboard-panel">
            <div className="section-heading compact">
              <h2>市场管理</h2>
              <span>{dashboard.markets.length} 个市场</span>
            </div>
            <div className="market-grid">
              {topMarkets.map((market) => (
                <article className="market-card admin-market-card" key={market.slug}>
                  <div className="market-card-topline">
                    <span>{marketStatusLabel[market.status]}</span>
                    <span>{market.market_type}</span>
                    <strong>{market.prediction_count} 人</strong>
                  </div>
                  <h3>{market.title}</h3>
                  <p>奖池金币：{market.coins_spent} · 潜在派奖：{market.potential_reward} · 单次消耗：{market.entry_cost}</p>
                  <p>开奖答案：{market.correct_option ?? '未开奖'}</p>
                  <label className="admin-field">
                    <span>手动开奖选项</span>
                    <select
                      value={settleOptions[market.slug] ?? ''}
                      onChange={(event) => setSettleOptions({ ...settleOptions, [market.slug]: event.target.value })}
                    >
                      {market.options.map((option) => (
                        <option value={option} key={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="inline-actions">
                    <button
                      className="primary-button compact-button"
                      type="button"
                      disabled={isWorking || market.status === 'settled' || !settleOptions[market.slug]}
                      onClick={() =>
                        runAction('市场已手动开奖。', 'settle_market', {
                          slug: market.slug,
                          correct_option: settleOptions[market.slug],
                        })
                      }
                    >
                      手动开奖
                    </button>
                    <button
                      className="ghost-button compact-button danger-button"
                      type="button"
                      disabled={isWorking || market.status === 'cancelled'}
                      onClick={() => runAction('市场已取消，相关预测会按数据库规则处理。', 'cancel_market', { slug: market.slug })}
                    >
                      取消市场
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="admin-grid">
            <article className="leaderboard-panel">
              <div className="section-heading compact">
                <h2>最近同步</h2>
                <span>保留 API-Football 入口</span>
              </div>
              <div className="history-list">
                {recentSyncs.length ? (
                  recentSyncs.map((sync) => (
                    <article className="history-row admin-sync-row" key={sync.sync_type}>
                      <div>
                        <span>{syncTypeLabel[sync.sync_type]}</span>
                        <small>
                          {sync.provider} · {formatWorldCupDate(sync.last_synced_at)}
                        </small>
                        {sync.message ? <small>{sync.message}</small> : null}
                      </div>
                      <strong className={sync.status === 'success' ? 'result-win' : 'result-lost'}>{sync.status === 'success' ? '正常' : '异常'}</strong>
                      <span>{sync.records_processed} 条</span>
                    </article>
                  ))
                ) : (
                  <p className="empty-state">还没有同步记录。当前可以先用 CSV 和手动比分运营。</p>
                )}
              </div>
            </article>

            <article className="leaderboard-panel">
              <div className="section-heading compact">
                <h2>用户排行榜</h2>
                <span>Top {Math.min(dashboard.leaderboard.length, 10)}</span>
              </div>
              <div className="admin-rank-list">
                {dashboard.leaderboard.slice(0, 10).map((row) => (
                  <div className="admin-rank-row" key={row.user_id}>
                    <strong>#{row.rank}</strong>
                    <span>{row.username}</span>
                    <span>{row.profit} 金币</span>
                    <span>{row.accuracy_rate}%</span>
                  </div>
                ))}
                {!dashboard.leaderboard.length ? <p className="empty-state">暂无排行榜数据。</p> : null}
              </div>
            </article>
          </section>
        </>
      ) : null}
    </section>
  );
}
