import { ReactionGame } from '../games/reaction/ReactionGame';
import type { GameEntry } from '../types';

export const games: GameEntry[] = [
  {
    id: 'reaction',
    title: '反应速度测试',
    tagline: '等按钮变色后立刻点击，看看你的手速。',
    accent: '#ff6b35',
    status: 'new',
    component: ReactionGame,
  },
];

export const getGameById = (id: string) => games.find((game) => game.id === id);
