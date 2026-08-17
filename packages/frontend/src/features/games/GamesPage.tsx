import type { JSX } from 'react';

import { GamesCatalog, type GameCard } from './GamesCatalog';
import { PUBLIC_GAME_CARDS } from './public-game-cards';

const ARENA_GAME_CARD: GameCard = {
  path: '/games/arena',
  icon: '⚔',
  name: '午休竞技场',
  category: 'AI 单人对战',
  description: '达到全站 Lv.3 后，选择三档 AI 对手并查看完整文字战报。',
  features: ['三档 AI', '消耗精力', '结算奖励'],
  availability: 'Lv.3 解锁',
  availabilityTone: 'brand',
  tone: 'violet',
};

const FULL_GAME_CARDS: readonly GameCard[] = [
  ARENA_GAME_CARD,
  ...PUBLIC_GAME_CARDS,
  {
    path: '/games/high-low',
    icon: 'A⇄K',
    name: '比大小',
    category: '快速竞猜',
    description: '预测玩家与电脑谁会抽到更大的牌，挑战连续判断纪录。',
    features: ['1—13 点牌', '三种预测', '连胜统计'],
    availability: '单机可玩',
    availabilityTone: 'success',
    tone: 'rose',
  },
];

export function GamesPage(): JSX.Element {
  return (
    <GamesCatalog
      games={FULL_GAME_CARDS}
      title="小游戏中心"
      subtitle="六款单人玩法，无需等待匹配；选择一款，准备好后再开始。"
    />
  );
}
