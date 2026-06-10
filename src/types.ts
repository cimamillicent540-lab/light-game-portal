import type { ComponentType } from 'react';

export type GameStatus = 'ready' | 'new' | 'coming-soon';

export type GameEntry = {
  id: string;
  title: string;
  tagline: string;
  accent: string;
  status: GameStatus;
  component?: ComponentType;
};
