import type { ComponentType } from 'react';

export type GameStatus = 'ready' | 'new' | 'coming-soon';

export type GameComponentProps = {
  onLeaderboard: (gameId?: string) => void;
  onLogin: () => void;
};

export type GameEntry = {
  id: string;
  title: string;
  tagline: string;
  description: string;
  category: string;
  difficulty: '轻松' | '中等';
  duration: string;
  accent: string;
  status: GameStatus;
  component: ComponentType<GameComponentProps>;
};
