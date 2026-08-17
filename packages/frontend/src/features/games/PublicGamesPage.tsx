import type { JSX } from 'react';

import publicStyles from '../tools/PublicToolsPage.module.css';
import { GamesCatalog } from './GamesCatalog';
import { PUBLIC_GAME_CARDS } from './public-game-cards';

export function PublicGamesPage(): JSX.Element {
  return (
    <div aria-labelledby="public-games-title">
      <section className={publicStyles.hero}>
        <span className={publicStyles.eyebrow}>浏览器单机游戏</span>
        <h1 id="public-games-title">随时开始，也能随时停下</h1>
        <p>
          无需注册或登录。游戏在当前浏览器内运行，不含充值、提现、
          概率付费或用户间交易。
        </p>
        <div className={publicStyles.trustRow} aria-label="游戏特点">
          <span>单机玩法</span>
          <span>无付费</span>
          <span>无用户互动</span>
        </div>
      </section>

      <div className={publicStyles.catalog}>
        <GamesCatalog
          games={PUBLIC_GAME_CARDS}
          title="4 款轻量游戏"
          subtitle="游戏运行与计分在当前浏览器内完成。"
          headingLevel={2}
        />
      </div>
    </div>
  );
}
