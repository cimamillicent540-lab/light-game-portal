import { useEffect, useMemo, useState } from 'react';
import { games } from '../data/games';
import { formatDateTime, formatScoreValue } from '../lib/scoreFormat';
import { supabase } from '../lib/supabase';

type LeaderboardRow = {
  rank: number;
  game_slug: string;
  game_title: string;
  username: string;
  score: number;
  score_type: string | null;
  created_at: string;
};

type LeaderboardPageProps = {
  selectedGameId?: string;
  onSelectGame: (gameId?: string) => void;
  onPlay: (gameId: string) => void;
};

export function LeaderboardPage({ selectedGameId, onSelectGame, onPlay }: LeaderboardPageProps) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const visibleGames = useMemo(
    () => (selectedGameId ? games.filter((game) => game.id === selectedGameId) : games),
    [selectedGameId],
  );

  useEffect(() => {
    const loadLeaderboard = async () => {
      if (!supabase) {
        setErrorMessage('Supabase 环境变量尚未配置。');
        return;
      }

      setIsLoading(true);
      setErrorMessage('');

      let query = supabase
        .from('leaderboards')
        .select('rank, game_slug, game_title, username, score, score_type, created_at')
        .lte('rank', 100)
        .order('game_slug', { ascending: true })
        .order('rank', { ascending: true });

      if (selectedGameId) {
        query = query.eq('game_slug', selectedGameId);
      }

      const { data, error } = await query;
      setIsLoading(false);

      if (error) {
        setRows([]);
        setErrorMessage(error.message);
        return;
      }

      setRows((data ?? []) as LeaderboardRow[]);
    };

    void loadLeaderboard();
  }, [selectedGameId]);

  return (
    <section className="leaderboard-page">
      <div className="page-heading">
        <p className="eyebrow">排行榜</p>
        <h1>高手榜</h1>
        <p>未登录也可以查看排行榜；登录后玩游戏会自动保存成绩。</p>
      </div>

      <div className="filter-bar" aria-label="排行榜筛选">
        <button
          className={`nav-button ${selectedGameId ? '' : 'strong'}`}
          type="button"
          onClick={() => onSelectGame()}
        >
          全部游戏
        </button>
        {games.map((game) => (
          <button
            className={`nav-button ${selectedGameId === game.id ? 'strong' : ''}`}
            key={game.id}
            type="button"
            onClick={() => onSelectGame(game.id)}
          >
            {game.title}
          </button>
        ))}
      </div>

      {isLoading ? <p className="form-message success">正在读取排行榜...</p> : null}
      {errorMessage ? <p className="form-message error">{errorMessage}</p> : null}

      <div className="leaderboard-list">
        {visibleGames.map((game) => {
          const gameRows = rows.filter((row) => row.game_slug === game.id).slice(0, 100);
          return (
            <section className="leaderboard-panel" key={game.id}>
              <div className="section-heading compact">
                <h2>{game.title}</h2>
                <button className="text-button" type="button" onClick={() => onPlay(game.id)}>
                  开始挑战
                </button>
              </div>

              {gameRows.length > 0 ? (
                <div className="leaderboard-table" role="table" aria-label={`${game.title} Top 100`}>
                  <div className="leaderboard-row leaderboard-head" role="row">
                    <span>排名</span>
                    <span>玩家</span>
                    <span>分数</span>
                    <span>提交时间</span>
                  </div>
                  {gameRows.map((row) => (
                    <div className="leaderboard-row" role="row" key={`${row.game_slug}-${row.rank}-${row.created_at}`}>
                      <span>#{row.rank}</span>
                      <strong>{row.username}</strong>
                      <span>{formatScoreValue(row.score, row.score_type)}</span>
                      <span>{formatDateTime(row.created_at)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">还没有成绩，来做第一个上榜玩家。</p>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
