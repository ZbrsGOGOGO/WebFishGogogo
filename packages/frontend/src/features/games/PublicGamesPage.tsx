import type { JSX } from 'react';

import publicStyles from '../tools/PublicToolsPage.module.css';
import { GamesCatalog } from './GamesCatalog';
import { PUBLIC_GAME_CARDS } from './public-game-cards';

export function PublicGamesPage(): JSX.Element {
  return (
    <div aria-labelledby="public-games-title">
      <section className={publicStyles.hero}>
        <span className={publicStyles.eyebrow}>经典小游戏</span>
        <h1 id="public-games-title">随时开始，也能随时停下</h1>
        <p>
          无需登录就能开始。登录账号后，俄罗斯方块和坦克大战的个人最佳成绩会进入排行榜。
        </p>
        <div className={publicStyles.trustRow} aria-label="游戏特点">
          <span>即开即玩</span>
          <span>无付费</span>
          <span>全站排行</span>
        </div>
      </section>

      <div className={publicStyles.catalog}>
        <GamesCatalog
          games={PUBLIC_GAME_CARDS}
          title="2 款经典游戏"
          subtitle="先熟悉操作，再挑战排行榜上的更高分。"
          headingLevel={2}
        />
      </div>
    </div>
  );
}
