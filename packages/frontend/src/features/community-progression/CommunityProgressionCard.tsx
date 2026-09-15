import { Link } from 'react-router-dom';
import type { JSX } from 'react';
import { useCommunityProgression } from './useCommunityProgression';
import { CommunityVipSummary } from './CommunityVipSummary';
import styles from './Progression.module.css';
import { FishGrowthSummary } from './FishGrowthSummary';
import { CommunityTitleBadge } from './CommunityTitleBadge';

export function CommunityProgressionCard(): JSX.Element {
  const state = useCommunityProgression();
  const overview = state.overview;
  const knownAchievements = (state.catalog?.achievements ?? []).map(item => overview?.achievements.find(progress => progress.key === item.key));
  return <section className={`${styles.card} ${styles.profileProgression}`} aria-label="成长档案"><div className={styles.status}><div><span className={styles.eyebrow}>属于你的日常记录</span><h2>成长档案</h2></div><Link to="/achievements">成就与称号 →</Link></div>{state.loading ? <p role="status">正在读取成长记录…</p> : null}{state.error ? <p role="status">成长记录暂未同步，可进入档案重试。</p> : null}{state.catalog?.enabled === false || overview?.enabled === false ? <p>成长档案暂未开放。</p> : null}{overview?.enabled && state.catalog?.enabled ? <><div className={styles.profileMilestones}><div><span>成就收藏</span><strong>{knownAchievements.filter(item => item?.unlockedAt).length}<small> / {knownAchievements.length} 项</small></strong></div><div><span>当前公开佩戴</span><div>{overview.presentation.equippedTitle ? <CommunityTitleBadge title={overview.presentation.equippedTitle} /> : <strong className={styles.noTitle}>未佩戴</strong>}</div></div></div>{knownAchievements.some(item => !item?.unlockedAt && item?.eligible) ? <p className={styles.syncHint}>有达标成就待同步，可进入成长档案一次解锁。</p> : null}<FishGrowthSummary initial={overview.fish} compact /><div className={styles.profileMembership}><CommunityVipSummary vip={overview.vip} support={overview.support} serverNow={overview.serverNow} giftDays={state.catalog.membership.giftDays} compact /></div><p className={styles.syncHint}>称号由你主动佩戴，不会自动公开。</p></> : null}</section>;
}
