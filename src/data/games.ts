import { Game2048 } from '../games/2048/Game2048';
import { MemoryGame } from '../games/memory/MemoryGame';
import { ReactionGame } from '../games/reaction/ReactionGame';
import type { GameEntry } from '../types';

export const games: GameEntry[] = [
  {
    id: '2048',
    title: '2048',
    tagline: '滑动数字方块，合成更高分。',
    description: '经典数字合成游戏，适合短局挑战，也方便后续接入排行榜。',
    category: '益智',
    difficulty: '中等',
    duration: '3-8 分钟',
    accent: '#2c6df6',
    status: 'new',
    component: Game2048,
  },
  {
    id: 'reaction',
    title: '反应速度测试',
    tagline: '等按钮变色后立刻点击，看看你的手速。',
    description: '随机等待后点击，记录本次最好成绩，适合作为轻竞技入口。',
    category: '反应',
    difficulty: '轻松',
    duration: '30 秒',
    accent: '#ff6b35',
    status: 'ready',
    component: ReactionGame,
  },
  {
    id: 'memory',
    title: '记忆翻牌',
    tagline: '记住牌面位置，翻出所有配对。',
    description: '轻量记忆力小游戏，包含步数和用时，适合手机端触控游玩。',
    category: '记忆',
    difficulty: '轻松',
    duration: '1-3 分钟',
    accent: '#0fb7af',
    status: 'new',
    component: MemoryGame,
  },
];

export const getGameById = (id: string) => games.find((game) => game.id === id);
