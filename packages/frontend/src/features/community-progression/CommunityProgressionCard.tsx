import { Link } from 'react-router-dom';
import type { JSX } from 'react';
import { useCommunityProgression } from './useCommunityProgression';
import { CommunityVipSummary } from './CommunityVipSummary';
import styles from './Progression.module.css';
import { FishGrowthSummary } from './FishGrowthSummary';

export function CommunityProgressionCard(): JSX.Element {
  const state = useCommunityProgression();
  return <section className={styles.card} aria-label="成长档案"><div className={styles.status}><h2>成长档案</h2><Link to="/achievements">成就与称号 →</Link></div>{state.loading ? <p role="status">正在读取成长记录…</p> : null}{state.error ? <p role="status">成长记录暂未同步，可进入档案重试。</p> : null}{state.catalog?.enabled === false ? <p>成长档案暂未开放。</p> : null}{state.overview && state.catalog ? <><FishGrowthSummary initial={state.overview.fish} compact /><p>已解锁 {state.overview.achievements.filter((item) => item.unlockedAt).length} 项成就。称号需主动选择佩戴，不会自动公开。</p><CommunityVipSummary vip={state.overview.vip} support={state.overview.support} serverNow={state.overview.serverNow} giftDays={state.catalog.membership.giftDays} compact /></> : null}</section>;
}
