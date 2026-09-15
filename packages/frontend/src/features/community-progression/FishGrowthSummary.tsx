import { useEffect, useState, type JSX } from 'react';
import { COMMUNITY_ACHIEVEMENTS, FISH_RULES, type FishProgressView } from '@stealth-reader/shared';
import { Link } from 'react-router-dom';
import { getCommunitySessionGeneration } from '../../api/community-http';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { FISH_EVENT, type FishEventDetail } from './useFishActivity';
import styles from './GrowthSummary.module.css';

const ranks = COMMUNITY_ACHIEVEMENTS.filter(item => item.metric === 'fishExperience');
const dailyMaximum = (FISH_RULES.activeSecondsPerDay + FISH_RULES.gameBonusSecondsPerDay) / 60;

export function FishGrowthSummary({ initial, compact = false }: { initial?: FishProgressView; compact?: boolean }): JSX.Element | null {
  const owner = useCommunityAuthStore(state => state.user?.publicId);
  const generation = getCommunitySessionGeneration();
  const [live, setLive] = useState<{ owner: string; generation: number; progress: FishProgressView; initial: FishProgressView | undefined } | null>(null);
  useEffect(() => {
    const listener = (event: Event): void => {
      const detail = (event as CustomEvent<FishEventDetail>).detail;
      const auth = useCommunityAuthStore.getState();
      if (detail?.owner === owner && detail.generation === generation && auth.phase === 'active' && auth.user?.publicId === owner && getCommunitySessionGeneration() === generation) setLive({ ...detail, initial });
    };
    window.addEventListener(FISH_EVENT, listener);
    return () => window.removeEventListener(FISH_EVENT, listener);
  }, [owner, generation, initial]);
  const current = live && live.owner === owner && live.generation === generation && live.initial === initial && (!initial || live.progress.experience >= initial.experience) ? live.progress : initial;
  if (!current) return null; // An older API without fish data must not invent an index.
  const currentDefinition = ranks.find(item => item.title.key === current.rank.key);
  const floor = currentDefinition && current.experience >= currentDefinition.target ? currentDefinition.target : 0;
  const intervalMaximum = current.nextRank ? Math.max(1, current.nextRank.target - floor) : 1;
  const intervalValue = current.nextRank ? Math.max(0, Math.min(intervalMaximum, current.experience - floor)) : 1;
  const remaining = current.nextRank ? Math.max(0, current.nextRank.target - current.experience) : 0;
  if (compact) return <div className={styles.compactGrowth}>
    <Link to="/achievements"><span>成长指数</span><strong>{current.experience.toLocaleString('zh-CN')}</strong><span aria-hidden="true">↗</span></Link>
    <p>{current.rank.label} · 今日 +{current.todayExperience} / {dailyMaximum} 点</p>
    {current.nextRank ? <progress className={styles.meter} aria-label="下一成长等级" max={intervalMaximum} value={intervalValue} /> : <small>已达最高等级</small>}
  </div>;
  return <section className={`${styles.card} ${styles.fishCard}`} aria-label="摸鱼指数">
    <div className={styles.heading}><div><span className={styles.eyebrow}>成长记录 / FISH INDEX</span><h2>{current.rank.label}</h2><p>日常留下的成长，不是办公币或战力。</p></div><span className={styles.rankStamp} aria-hidden="true">{String(Math.max(1, ranks.findIndex(item => item.title.key === current.rank.key) + 1)).padStart(2, '0')}<small>/ 06</small></span></div>
    <div className={styles.growthMetrics}>
      <div><span className={styles.metricLabel}>累计摸鱼指数</span><strong className={styles.largeNumber}>{current.experience.toLocaleString('zh-CN')}<small>点</small></strong></div>
      <div><span className={styles.metricLabel}>今日新增</span><strong className={styles.mediumNumber}>+{current.todayExperience}<small>/ {dailyMaximum} 点</small></strong><span className={styles.metadata}>北京时间零点重置每日额度</span></div>
    </div>
    <div className={styles.nextRank}>
      <div><span>{current.nextRank ? <>下一境界 · <strong>{current.nextRank.label}</strong></> : '已抵达最高境界'}</span><small>{current.nextRank ? <>还差 <b>{remaining.toLocaleString('zh-CN')}</b> 点</> : '总指数仍可继续积累'}</small></div>
      <progress className={styles.meter} aria-label="下一摸鱼境界" aria-valuetext={current.nextRank ? `距离${current.nextRank.label}还差${remaining}点` : '已抵达最高境界'} max={intervalMaximum} value={intervalValue} />
    </div>
    <ol className={styles.rankTrail} aria-label="六级成长路径">{ranks.map((item, index) => <li key={item.key} data-unlocked={current.experience >= item.target} aria-current={item.title.key === current.rank.key ? 'step' : undefined}><span className={styles.rankNode} aria-hidden="true">{current.experience >= item.target ? '✓' : index + 1}</span><span>{item.title.label}</span><small>{item.target.toLocaleString('zh-CN')} 点</small></li>)}</ol>
    <div className={styles.activityTotals}><span>累计有效停留 <strong>{Math.floor(current.activeSeconds / 60).toLocaleString('zh-CN')}</strong> 分钟</span><span>其中游戏页面活跃 <strong>{Math.floor(current.gameSeconds / 60).toLocaleString('zh-CN')}</strong> 分钟</span></div>
    <details className={styles.rules}><summary>指数计算与隐私说明</summary><p>登录后，前台有焦点且最近 3 分钟有操作时，每分钟 1 点；游戏页面活跃每分钟再加 1 点。每天最多计 240 分钟停留及 120 分钟游戏加成，按北京时间零点重置每日额度，总指数不清零。</p><p>隐藏、离线和长时间无操作不累计；多开页面或设备不叠加，切换可能有最多 75 秒交接。游戏项是页面活跃时长，不冒充已完成对局。只保留汇总时长，不记录按键或聊天内容；新功能上线前的时长不追溯。达到门槛后同步成就并主动佩戴，可在个人页和聊天后缀展示。</p></details>
  </section>;
}
