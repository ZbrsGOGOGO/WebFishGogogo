import type { GameCard } from './GamesCatalog';

export const PUBLIC_GAME_CARDS: readonly GameCard[] = [
  {
    path: '/games/tetris',
    icon: '块',
    name: '俄罗斯方块',
    category: '经典街机',
    description: '旋转与堆叠七种方块，消除完整横行并挑战更高速度。',
    features: ['七种方块', '消行升级', '支持硬降'],
    availability: '单机可玩',
    availabilityTone: 'success',
    tone: 'cyan',
  },
  {
    path: '/games/tank',
    icon: '坦',
    name: '坦克大战',
    category: '动作挑战',
    description: '穿梭障碍、躲避炮弹并击破敌方坦克，守住你的阵地。',
    features: ['键盘移动', '即时射击', '敌方追踪'],
    availability: '单机可玩',
    availabilityTone: 'success',
    tone: 'orange',
  },
];
