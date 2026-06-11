import type { CSSProperties } from 'react';
import type { GameEntry } from '../types';

type GameCardProps = {
  game: GameEntry;
  onPlay: () => void;
  onLeaderboard: () => void;
};

const statusLabel = {
  ready: '可玩',
  new: '新上线',
  'coming-soon': '筹备中',
};

export function GameCard({ game, onPlay, onLeaderboard }: GameCardProps) {
  return (
    <article className="game-card" style={{ '--accent': game.accent } as CSSProperties}>
      <div className="game-card-visual" aria-hidden="true">
        <span />
      </div>
      <div className="game-card-body">
        <div className="game-card-topline">
          <span className="status-pill">{statusLabel[game.status]}</span>
          <span className="meta-pill">{game.category}</span>
        </div>
        <h3>{game.title}</h3>
        <p>{game.tagline}</p>
        <div className="game-meta">
          <span>{game.difficulty}</span>
          <span>{game.duration}</span>
        </div>
      </div>
      <div className="game-card-actions">
        <button className="primary-button" type="button" onClick={onPlay}>
          开始玩
        </button>
        <button className="ghost-button" type="button" onClick={onLeaderboard}>
          查看排行榜
        </button>
      </div>
    </article>
  );
}
