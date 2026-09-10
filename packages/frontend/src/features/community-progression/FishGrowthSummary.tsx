import { useEffect, useState, type JSX } from 'react';
import { COMMUNITY_ACHIEVEMENTS, type FishProgressView } from '@stealth-reader/shared';
import { Link } from 'react-router-dom';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { FISH_EVENT, type FishEventDetail } from './useFishActivity';
import styles from './Progression.module.css';

export function FishGrowthSummary({ initial, compact = false }: { initial?: FishProgressView; compact?: boolean }): JSX.Element | null {
  const owner = useCommunityAuthStore(s => s.user?.publicId);
  const [live, setLive] = useState<{ owner: string; progress: FishProgressView } | null>(null);
  useEffect(() => {
    const listener = (event: Event): void => { const detail = (event as CustomEvent<FishEventDetail>).detail; if (detail?.owner === owner) setLive(detail); };
    window.addEventListener(FISH_EVENT, listener); return () => window.removeEventListener(FISH_EVENT, listener);
  }, [owner]);
  const current = live && live.owner === owner && (!initial || live.progress.experience >= initial.experience) ? live.progress : initial;
  if (!current) return null;
  if (compact) return <div><Link to="/achievements" className={styles.fishCompact}>成长指数 <strong>{current.experience.toLocaleString('zh-CN')}</strong> · 查看等级</Link><p>今日成长 +{current.todayExperience} / 360 点 · 有效停留 {Math.floor(current.activeSeconds / 60)} 分钟</p>{current.nextRank ? <progress className={styles.meter} aria-label="下一成长等级" max={current.nextRank.target} value={current.experience} /> : <p>已达最高等级</p>}</div>;
  return <section className={`${styles.card} ${styles.fishCard}`} aria-label="摸鱼指数">
    <div className={styles.status}><div><p className={styles.eyebrow}>工位水域 · 成长记录</p><h2>{current.rank.label}</h2></div><div><strong className={styles.fishScore}>{current.experience.toLocaleString('zh-CN')}</strong><span> 点摸鱼指数</span></div></div>
    <p>今日 +{current.todayExperience} / 360 点 · 累计有效停留 {Math.floor(current.activeSeconds / 60)} 分钟，其中游戏页面活跃 {Math.floor(current.gameSeconds / 60)} 分钟</p>
    {current.nextRank ? <><progress className={styles.meter} aria-label="下一摸鱼境界" max={current.nextRank.target} value={current.experience} /><p>距离「{current.nextRank.label}」还差 {current.nextRank.target - current.experience} 点</p></> : <p>已抵达最高境界，指数仍会继续积累。</p>}
    <ol className={styles.rankTrail}>{COMMUNITY_ACHIEVEMENTS.filter(item => item.metric === 'fishExperience').map(item => <li key={item.key} data-unlocked={current.experience >= item.target}><span>{item.title.label}</span><small>{item.target} 点</small></li>)}</ol>
    <details><summary>怎么算？</summary><p>登录后，前台有焦点且最近 3 分钟有操作时，每分钟 1 点；游戏页面活跃每分钟再加 1 点。每天最多计 240 分钟停留及 120 分钟游戏加成，按北京时间零点重置每日额度，总指数不清零。</p><p>隐藏、离线和长时间无操作不累计；多开页面或设备不叠加，切换可能有最多 75 秒交接。游戏项是页面活跃时长，不冒充已完成对局。只保留汇总时长，不记录按键或聊天内容；新功能上线前的时长不追溯。达到门槛后同步成就并主动佩戴，可在个人页和聊天后缀展示。</p></details>
  </section>;
}
