import type { JSX } from 'react';

import { GamesCatalog } from './GamesCatalog';
import { PUBLIC_GAME_CARDS } from './public-game-cards';

export function GamesPage(): JSX.Element {
  return (
    <GamesCatalog
      games={PUBLIC_GAME_CARDS}
      title="小游戏中心"
      subtitle="玩一局贪食蛇、俄罗斯方块或坦克大战，也可以在命格模拟中走完一世修行。"
    />
  );
}
