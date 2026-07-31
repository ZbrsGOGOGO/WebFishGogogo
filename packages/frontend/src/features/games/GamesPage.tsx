import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { Card, PageHeader, Tag } from '../../components/ui';
import styles from './GamesPage.module.css';

interface GameCard {
  path: string;
  icon: string;
  name: string;
  category: string;
  description: string;
  features: [string, string, string];
  availability: string;
  availabilityTone: 'brand' | 'success';
  tone: 'violet' | 'green' | 'cyan' | 'orange' | 'rose' | 'blue';
}

const GAMES: GameCard[] = [
  {
    path: '/games/arena',
    icon: '⚔',
    name: '午休斗技场',
    category: 'AI 单人对战',
    description: '达到全站 Lv.3 后，挑选三档 AI 对手并查看完整文字战报。',
    features: ['三档 AI', '消耗精力', '结算奖励'],
    availability: 'Lv.3 解锁',
    availabilityTone: 'brand',
    tone: 'violet',
  },
  {
    path: '/games/snake',
    icon: '🐍',
    name: '贪食蛇',
    category: '经典街机',
    description: '控制小蛇吃下能量点，在越来越长的身体之间寻找路线。',
    features: ['方向键控制', '实时计分', '支持暂停'],
    availability: '单机可玩',
    availabilityTone: 'success',
    tone: 'green',
  },
  {
    path: '/games/tetris',
    icon: '▦',
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
    icon: '▣',
    name: '坦克大战',
    category: '动作挑战',
    description: '穿梭障碍、躲避炮弹并击破敌方坦克，守住你的阵地。',
    features: ['键盘移动', '即时射击', '敌方追踪'],
    availability: '单机可玩',
    availabilityTone: 'success',
    tone: 'orange',
  },
  {
    path: '/games/high-low',
    icon: 'A⇅K',
    name: '比大小',
    category: '快速竞猜',
    description: '预测玩家与电脑谁会抽到更大的牌，挑战连续判断纪录。',
    features: ['1–13 点牌', '三种预测', '连胜统计'],
    availability: '单机可玩',
    availabilityTone: 'success',
    tone: 'rose',
  },
  {
    path: '/games/three-sum',
    icon: 'Σ',
    name: '三数之和',
    category: '心算挑战',
    description: '每轮随机出现三个 1–10 的数字，快速算出它们的总和。',
    features: ['1–10 随机数', '连续答题', '正确率统计'],
    availability: '单机可玩',
    availabilityTone: 'success',
    tone: 'blue',
  },
];

export function GamesPage(): JSX.Element {
  return (
    <section aria-label="小游戏中心">
      <PageHeader
        title="小游戏中心"
        subtitle="六款单人玩法，无需等待匹配；选择一款，准备好后再开始。"
        actions={
          <div className={styles.gameCount} aria-label="已开放游戏数量">
            <strong>{GAMES.length}</strong>
            <span>款已开放</span>
          </div>
        }
      />

      <div className={styles.introStrip}>
        <span aria-hidden="true">⌁</span>
        <p>
          实时游戏支持方向键、WASD 与屏幕按钮；切换窗口时会自动暂停，进度不会在后台悄悄丢失。
        </p>
      </div>

      <div className={styles.grid}>
        {GAMES.map((game) => (
          <Link
            key={game.path}
            className={`${styles.gameLink} ${styles[game.tone]}`}
            to={game.path}
          >
            <Card className={styles.gameCard}>
              <div className={styles.gameHeading}>
                <span className={styles.icon} aria-hidden="true">
                  {game.icon}
                </span>
                <div>
                  <Tag color={game.availabilityTone}>
                    {game.availability}
                  </Tag>
                  <h2>{game.name}</h2>
                </div>
              </div>
              <p>{game.description}</p>
              <div className={styles.featureList} aria-label="玩法特点">
                {game.features.map((feature) => (
                  <span key={feature}>{feature}</span>
                ))}
              </div>
              <div className={styles.cardFooter}>
                <span>{game.category}</span>
                <strong>开始游戏 →</strong>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
