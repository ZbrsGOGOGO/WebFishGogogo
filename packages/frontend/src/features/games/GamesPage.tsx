import type { JSX } from 'react';

import { GamesCatalog } from './GamesCatalog';
import { PUBLIC_GAME_CARDS } from './public-game-cards';

export function GamesPage(): JSX.Element {
  return (
    <GamesCatalog
      games={PUBLIC_GAME_CARDS}
      title="小游戏中心"
      subtitle="俄罗斯方块与坦克大战，登录后可以挑战全站排行榜。"
    />
  );
}
