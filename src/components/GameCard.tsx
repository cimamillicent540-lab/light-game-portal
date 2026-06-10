import type { CSSProperties } from 'react';
import type { GameEntry } from '../types';

type GameCardProps = {
  game: GameEntry;
  onPlay: () => void;
};

const statusLabel = {
  ready: '可玩',
  new: '新上线',
  'coming-soon': '筹备中',
};

export function GameCard({ game, onPlay }: GameCardProps) {
  const isPlayable = Boolean(game.component);

  return (
    <article className="game-card" style={{ '--accent': game.accent } as CSSProperties}>
      <div className="game-card-visual" aria-hidden="true">
        <span />
      </div>
      <div className="game-card-body">
        <div className="game-card-topline">
          <span className="status-pill">{statusLabel[game.status]}</span>
        </div>
        <h3>{game.title}</h3>
        <p>{game.tagline}</p>
      </div>
      <button className="primary-button" type="button" onClick={onPlay} disabled={!isPlayable}>
        开始玩
      </button>
    </article>
  );
}
