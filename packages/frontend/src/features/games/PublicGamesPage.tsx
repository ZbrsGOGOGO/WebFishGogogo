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
          经典动作游戏与命格模拟都能无需登录直接开始。贪食蛇和命格模拟的记录保存在当前浏览器；
          登录账号后，俄罗斯方块和坦克大战的个人最佳成绩会进入排行榜。
        </p>
        <div className={publicStyles.trustRow} aria-label="游戏特点">
          <span>即开即玩</span>
          <span>无付费</span>
          <span>部分排行</span>
        </div>
      </section>

      <div className={publicStyles.catalog}>
        <GamesCatalog
          games={PUBLIC_GAME_CARDS}
          title={`${PUBLIC_GAME_CARDS.length} 款精选游戏`}
          subtitle="挑战反应与操作，或在命格模拟中走完一世修行。"
          headingLevel={2}
        />
      </div>
    </div>
  );
}
