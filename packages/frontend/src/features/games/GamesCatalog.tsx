import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { Card, PageHeader, Tag } from '../../components/ui';
import styles from './GamesPage.module.css';

export interface GameCard {
  path: string;
  reloadDocument?: boolean;
  icon: string;
  name: string;
  category: string;
  description: string;
  features: [string, string, string];
  availability: string;
  availabilityTone: 'brand' | 'success';
  tone: 'violet' | 'green' | 'cyan' | 'orange' | 'rose' | 'blue';
}

export interface GamesCatalogProps {
  games: readonly GameCard[];
  title: string;
  subtitle: string;
  headingLevel?: 1 | 2;
}

export function GamesCatalog({
  games,
  title,
  subtitle,
  headingLevel = 1,
}: GamesCatalogProps): JSX.Element {
  return (
    <section aria-label="小游戏中心">
      <PageHeader
        title={title}
        subtitle={subtitle}
        headingLevel={headingLevel}
        actions={
          <div className={styles.gameCount} aria-label="已开放游戏数量">
            <strong>{games.length}</strong>
            <span>款已开放</span>
          </div>
        }
      />

      <div className={styles.introStrip}>
        <span aria-hidden="true">⌁</span>
        <p>
          动作游戏支持方向键、WASD 与屏幕按钮，切换窗口时会自动暂停；
          模拟游戏的进度与记录仅保存在当前浏览器，不会上传。
        </p>
      </div>

      <div className={styles.grid}>
        {games.map((game) => (
          <Link
            key={game.path}
            className={`${styles.gameLink} ${styles[game.tone]}`}
            to={game.path}
            reloadDocument={game.reloadDocument}
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
