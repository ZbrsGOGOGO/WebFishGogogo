import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import styles from './GameBackLink.module.css';

/** 三款实时游戏共用的稳定返回入口。 */
export function GameBackLink(): JSX.Element {
  return (
    <Link className={styles.link} to="/games">
      <span aria-hidden="true">←</span>
      返回游戏中心
    </Link>
  );
}
